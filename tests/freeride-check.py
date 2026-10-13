"""Exercise the installed FreeRide engine with synthetic upstream HTTP responses."""
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from freeride.core.types import Model
from freeride.core import model_health

os.environ['PENGUIN_GATEWAY_TOKEN'] = 'a' * 64
os.environ['PENGUIN_GATEWAY_STATE'] = tempfile.mkdtemp(prefix='penguin-gateway-test-')
os.environ['OPENROUTER_API_KEY'] = 'synthetic-no-real-key'
os.environ['FREERIDE_EVENTS'] = '0'
spec = importlib.util.spec_from_file_location('gateway', Path(__file__).resolve().parents[1] / 'scripts/freeride_gateway.py')
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class GatewayTests(unittest.TestCase):
    def test_strict_prices(self):
        def m(prices, name='test:free'):
            return Model(name, 'openrouter', 32768, raw={'pricing': prices})
        self.assertTrue(gateway.zero_price(m({'prompt': '0', 'completion': '0'})))
        for prices in ({'prompt': '0', 'completion': '.1'}, {'prompt': '0'}, {'prompt': '0', 'completion': 'NaN'}, {'prompt': '0', 'completion': '0', 'request': '1'}):
            self.assertFalse(gateway.zero_price(m(prices)))
        self.assertFalse(gateway.zero_price(m({'prompt':'0','completion':'0'}, 'paid/model')))

    def test_known_reasoning_exclusion_and_optional_reasoning_eligibility(self):
        plain=Model('llama/chat:free','openrouter',32768)
        apodex=Model('apodex/apodex-1.1-mini:free','openrouter',32768)
        advertised=Model('ordinary-name:free','openrouter',32768,supported_parameters=('reasoning',))
        self.assertTrue(gateway.research_model(plain))
        self.assertFalse(gateway.research_model(apodex))
        self.assertTrue(gateway.research_model(advertised))
        with patch.dict(os.environ, {'PENGUIN_ALLOW_REASONING':'1'}):
            self.assertTrue(gateway.research_model(advertised))
            self.assertTrue(gateway.research_model(apodex))

    def test_actual_router(self):
        original = httpx.AsyncClient
        original_sync = httpx.Client
        calls = []
        mode = ['ok']
        def upstream(request):
            if request.url.path.endswith('/models'):
                return httpx.Response(200, json={'data': [
                    {'id':'test:free','supported_parameters':['reasoning'],'context_length':32768,'architecture':{'output_modalities':['text']},'pricing':{'prompt':'0','completion':'0'}},
                    {'id':'apodex/apodex-1.1-mini:free','context_length':999999,'architecture':{'output_modalities':['text']},'pricing':{'prompt':'0','completion':'0'},'supported_parameters':['reasoning']},
                    {'id':'priced:free','context_length':999999,'architecture':{'output_modalities':['text']},'pricing':{'prompt':'0','completion':'1'}}]})
            if request.url.path.endswith('/chat/completions'):
                body = json.loads(request.content); calls.append(body)
                self.assertEqual(body['model'], 'test:free')
                self.assertEqual(body['reasoning'], {'enabled':False})
                self.assertEqual(body['max_tokens'],2000)
                if mode[0] == 'privacy':
                    return httpx.Response(403, json={'error':{'message':'No endpoints match data policy synthetic-private-secret'}})
                if mode[0] == 'uncertain':
                    return httpx.Response(503, json={'error':{'message':'unknown upstream outcome'}})
                return httpx.Response(200, json={'id':'synthetic','object':'chat.completion','created':1,'model':body['model'],'choices':[{'index':0,'message':{'role':'assistant','content':'Reviewed synthetic evidence.'},'finish_reason':'stop'}],'usage':{'prompt_tokens':20,'completion_tokens':10,'total_tokens':30,'cost':0}})
            return httpx.Response(200, json={})
        def client(*args, **kwargs):
            kwargs['transport'] = httpx.MockTransport(upstream)
            return original(*args, **kwargs)
        def sync_client(*args, **kwargs):
            kwargs['transport'] = httpx.MockTransport(upstream)
            return original_sync(*args, **kwargs)
        with patch('httpx.Client', side_effect=sync_client), patch('httpx.AsyncClient', side_effect=client):
            with TestClient(gateway.build_app()) as c:
                h={'Authorization':'Bearer '+'a'*64}
                self.assertEqual(c.get('/health').status_code, 401)
                self.assertEqual(c.get('/penguin/capabilities',headers=h).json()['paidFallback'], False)
                self.assertEqual(c.get('/penguin/capabilities',headers=h).json()['maxOutputTokens'],4000)
                self.assertEqual(c.get('/penguin/capabilities',headers=h).json()['routingPolicy'],'concise-chat')
                request={'model':'auto','stream':False,'max_tokens':2000,'messages':[{'role':'user','content':'Synthetic evidence only'}]}
                self.assertEqual(c.post('/v1/chat/completions',headers=h,json={**request,'model':'priced:free'}).status_code,400)
                self.assertEqual(c.post('/v1/chat/completions',headers=h,json={**request,'stream':True}).status_code,400)
                self.assertEqual(c.post('/v1/chat/completions',headers=h,json={**request,'max_tokens':4001}).status_code,400)
                r=c.post('/v1/chat/completions',headers=h,json=request)
                self.assertEqual(r.status_code,200,r.text)
                self.assertEqual(r.json()['_freeride_provider'],'openrouter')
                self.assertEqual(r.json()['usage']['prompt_tokens'],20)
                self.assertEqual(len(calls),1)
                mode[0]='uncertain'
                r=c.post('/v1/chat/completions',headers=h,json=request)
                self.assertEqual(r.status_code,503,r.text)
                self.assertEqual(len(calls),2,'Uncertain inference must not retry')
                mode[0]='privacy'
                r=c.post('/v1/chat/completions',headers=h,json=request)
                self.assertEqual(r.status_code,403,r.text)
                self.assertEqual(r.json()['error']['type'],'privacy_policy')
                self.assertNotIn('synthetic-private-secret',r.text)

    def test_actual_engine_fallback_and_uncertain_stop(self):
        import asyncio
        from freeride.core.chat_schema import ChatRequest
        from freeride.core.failover import try_call_with_failover, FailoverContext
        from freeride.core.cooldown import KeyCooldown
        original = httpx.AsyncClient
        calls = []
        mode = ['reject']
        def upstream(request):
            calls.append(request.url.host)
            if request.url.host == 'openrouter.ai':
                return httpx.Response(429 if mode[0] == 'reject' else 503, json={'error':{'message':'synthetic failure'}})
            self.assertEqual(json.loads(request.content)['model'], 'llama-3.3-70b-versatile')
            return httpx.Response(200, json={'id':'synthetic','object':'chat.completion','created':1,'model':'llama-3.3-70b-versatile','choices':[{'index':0,'message':{'role':'assistant','content':'Reviewed.'},'finish_reason':'stop'}],'usage':{'prompt_tokens':10,'completion_tokens':5,'total_tokens':15}})
        def client(*args, **kwargs):
            kwargs['transport'] = httpx.MockTransport(upstream)
            return original(*args, **kwargs)
        router, groq = gateway.StrictOpenRouter(), gateway.FreeGroq()
        router.list_free_models = lambda key: [Model('test:free','openrouter',32768)]
        groq.list_free_models = lambda key: [Model('llama-3.3-70b-versatile','groq',32768)]
        async def run():
            handle = gateway.attempts.set({'calls':0})
            try:
                request = ChatRequest(model='test:free',messages=[{'role':'user','content':'Synthetic'}],max_tokens=100)
                return await try_call_with_failover([(router,['synthetic1']),(groq,['synthetic2'])],KeyCooldown(Path(tempfile.mkdtemp())/'cooldown.json'),FailoverContext(request_id='test'),call=lambda p,k:p.forward_chat(request,request.model,k),model=request.model)
            finally:
                gateway.attempts.reset(handle)
        with patch('httpx.AsyncClient', side_effect=client):
            provider, answer = asyncio.run(run())
            self.assertEqual(provider.name,'groq')
            self.assertEqual(answer.model,'llama-3.3-70b-versatile')
            self.assertEqual(calls,['openrouter.ai','api.groq.com'])
            calls.clear(); mode[0]='uncertain'
            provider, answer = asyncio.run(run())
            self.assertIsNone(provider)
            self.assertEqual(calls,['openrouter.ai'])

    def test_readiness_distinguishes_cooldown_empty_catalog_and_rejected_key(self):
        h = {'Authorization': 'Bearer ' + 'a' * 64}
        request = {'model':'auto','stream':False,'max_tokens':2000,'messages':[{'role':'user','content':'Synthetic'}]}
        with patch.object(gateway.KeyCooldown, 'cooldown_remaining', return_value=45), patch.object(gateway.StrictOpenRouter, 'list_free_models') as catalog:
            with TestClient(gateway.build_app()) as client:
                status = client.get('/penguin/readiness', headers=h).json()
                self.assertFalse(status['ready'])
                self.assertEqual(status['providers'][0]['status'], 'cooldown')
                self.assertEqual(status['providers'][0]['retryAfterSeconds'], 45)
                self.assertEqual(client.post('/v1/chat/completions', headers=h, json=request).status_code, 409)
                catalog.assert_not_called()
        with patch.object(gateway.KeyCooldown, 'cooldown_remaining', return_value=None), patch.object(gateway.StrictOpenRouter, 'list_free_models', return_value=[]):
            with TestClient(gateway.build_app()) as client:
                self.assertEqual(client.get('/penguin/readiness', headers=h).json()['providers'][0]['status'], 'no_eligible_models')
                response = client.post('/v1/chat/completions', headers=h, json=request)
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()['error']['type'], 'gateway_not_ready')
        error = httpx.HTTPStatusError('synthetic-private-secret', request=httpx.Request('GET','https://openrouter.ai/api/v1/models'), response=httpx.Response(403))
        with patch.object(gateway.KeyCooldown, 'cooldown_remaining', return_value=None), patch.object(gateway.StrictOpenRouter, 'list_free_models', side_effect=error):
            with TestClient(gateway.build_app()) as client:
                response = client.get('/penguin/readiness', headers=h)
                self.assertEqual(response.json()['providers'][0]['status'], 'key_rejected')
                self.assertNotIn('synthetic-private-secret', response.text)

    def test_bounded_attempts(self):
        import asyncio
        from freeride.core.chat_schema import ChatRequest
        from freeride.providers.openrouter import OpenRouterProvider
        count={'calls':2}
        handle=gateway.attempts.set(count)
        try:
            with patch.object(OpenRouterProvider,'forward_chat') as forward:
                with self.assertRaises(RuntimeError):
                    asyncio.run(gateway.StrictOpenRouter().forward_chat(ChatRequest(model='auto',messages=[]),'auto','fake'))
                forward.assert_not_called()
        finally:
            gateway.attempts.reset(handle)

if __name__ == '__main__':
    unittest.main()
