"""Private, bounded adapter for the actual FreeRideV3 routing engine.

Remote inference only. No upstream CLI plugins, global config or local models.
"""
import contextvars
import hmac
import math
import os
from pathlib import Path

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
from freeride.core import telemetry
from freeride.core.cooldown import KeyCooldown
from freeride.core.errors import ErrorKind
from freeride.providers.openrouter import OpenRouterProvider
from freeride.providers.groq import GroqProvider
from freeride.server.app import create_app

attempts = contextvars.ContextVar('penguin_attempts')


def zero_price(model):
    prices = model.raw.get('pricing', {})
    try:
        return (model.api_id.endswith(':free') and model.context_length >= 16384
                and 'text' in model.output_modalities and 'prompt' in prices and 'completion' in prices
                and all(v is not None and str(v).strip() and math.isfinite(float(v)) and float(v) == 0 for v in prices.values()))
    except (ValueError, TypeError):
        return False


class BoundedProvider:
    async def forward_chat(self, request, model_id, key):
        count = attempts.get()
        if count['calls'] >= 2:
            raise RuntimeError('Penguin upstream attempt limit reached')
        # FreeRide passes one provider's model ID to other providers on failover.
        # Resolve against this provider's own verified free catalog before sending.
        models = self.list_free_models(key)
        selected = next((m for m in models if m.api_id == model_id), None)
        if selected is None:
            selected = next((m for m in models if m.context_length >= 16384 and 'text' in m.output_modalities), None)
        if selected is None:
            raise RuntimeError('No eligible free model')
        count['calls'] += 1
        count.pop('failure', None)
        try:
            return await super().forward_chat(request, selected.api_id, key)
        except httpx.HTTPError as error:
            response = getattr(error, 'response', None)
            status = getattr(response, 'status_code', None)
            if status == 403:
                evidence = response.text[:16000].lower()
                if any(word in evidence for word in ('privacy', 'data policy', 'data_policy')):
                    count['failure'] = 'privacy_policy'
                elif any(word in evidence for word in ('region', 'country', 'geograph')):
                    count['failure'] = 'region_restriction'
                else:
                    count['failure'] = 'access_denied'
            if status is None or status >= 500:
                count['calls'] = 2  # FreeRide's engine can cascade UNKNOWN; stop outbound calls explicitly.
            raise
        except Exception:
            count['calls'] = 2
            count.pop('failure', None)
            raise RuntimeError('Provider outcome uncertain') from None

    def classify_error(self, value):
        response = value.response if isinstance(value, httpx.HTTPStatusError) else value
        status = getattr(response, 'status_code', None)
        # Only explicit rejections may cascade. Uncertain outcomes never resend.
        if isinstance(value, httpx.RequestError) or (status and status >= 500):
            return ErrorKind.UNKNOWN
        if status == 403:
            return ErrorKind.AUTH
        return super().classify_error(value)


class StrictOpenRouter(BoundedProvider, OpenRouterProvider):
    def list_free_models(self, key):
        return [m for m in super().list_free_models(key) if zero_price(m)]


class FreeGroq(BoundedProvider, GroqProvider):
    def list_free_models(self, key):
        # Exclude compound agents with server-side tools and tool billing.
        return [m for m in super().list_free_models(key) if not m.api_id.startswith('groq/compound')]



def build_app():
    token = os.environ.get('PENGUIN_GATEWAY_TOKEN', '')
    if len(token) != 64:
        raise RuntimeError('Missing private gateway authentication')
    state = Path(os.environ['PENGUIN_GATEWAY_STATE'])
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Isolate upstream state and disable its optional outbound telemetry.
    telemetry.CONFIG_DIR = state
    telemetry.CONFIG_FILE = state / 'config.json'
    telemetry.INSTALLATION_FILE = state / 'installation_id'
    telemetry.STATS_FILE = state / 'stats.json'
    telemetry.set_enabled(False)
    KeyCooldown.shared.__func__.__defaults__ = (state / 'cooldown.json',)
    KeyCooldown.shared()
    from freeride.core import model_health, smart_routing
    model_health.CACHE_PATH = state / 'model_health.json'
    smart_routing._CACHE_PATH = state / 'leaderboard.json'
    providers = []
    if os.environ.get('OPENROUTER_API_KEY'):
        providers.append(StrictOpenRouter())
    if os.environ.get('GROQ_API_KEY') and os.environ.get('PENGUIN_GROQ_FREE_CONFIRMED') == '1':
        providers.append(FreeGroq())
    app = create_app(providers=providers, verbose=False)

    @app.middleware('http')
    async def guard(request: Request, call_next):
        if not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
            return JSONResponse({'error': {'message': 'Private gateway authentication required'}}, status_code=401)
        if request.url.path == '/penguin/capabilities' and request.method == 'GET':
            return JSONResponse({'gateway': 'penguin-freeride', 'providers': [p.name for p in providers], 'localModels': False, 'paidFallback': False, 'maxUpstreamAttempts': 2})
        if request.method == 'GET' and request.url.path in ('/health', '/v1/models'):
            return await call_next(request)
        if request.method != 'POST' or request.url.path != '/v1/chat/completions':
            return JSONResponse({'error': {'message': 'Route disabled in managed gateway'}}, status_code=404)
        body = await request.body()
        if len(body) > 100000:
            return JSONResponse({'error': {'message': 'Payload too large'}}, status_code=413)
        try:
            import json
            data = json.loads(body)
            if data.get('model') != 'auto' or data.get('stream') is not False or not isinstance(data.get('max_tokens'), int) or not 1 <= data['max_tokens'] <= 1000:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            return JSONResponse({'error': {'message': 'Use auto, non-streaming and max_tokens <= 1000'}}, status_code=400)
        counter = {'calls': 0}
        handle = attempts.set(counter)
        try:
            response = await call_next(request)
            if response.status_code >= 400 and counter.get('failure'):
                return JSONResponse({'error': {'type': counter['failure'], 'message': 'Provider explicitly denied access.'}}, status_code=403)
            return response
        finally:
            attempts.reset(handle)
    return app


if __name__ == '__main__':
    import uvicorn
    print('Penguin FreeRide: private loopback gateway, remote inference, telemetry disabled.', flush=True)
    uvicorn.run(build_app(), host='127.0.0.1', port=11343, access_log=False, log_level='warning')
