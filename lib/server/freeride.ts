import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./store.ts";
export const FREERIDE_URL = "http://127.0.0.1:11343/v1";
export function freerideToken() {
  mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
  const path = join(dataDirectory(), "freeride-gateway.token");
  try { writeFileSync(path, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const token = readFileSync(/* turbopackIgnore: true */ path, "utf8");
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid private FreeRide gateway token");
  return token;
}
// Report categories, never copy arbitrary provider response text into logs or notes.
export async function providerFailure(response: Response) {
  let evidence = "";
  try { const body = await response.json(); evidence = JSON.stringify(body).slice(0, 16000).toLowerCase(); } catch {}
  if (/region|country|geograph/.test(evidence)) return "Provider region restriction: check account availability in your country; routing does not bypass restrictions.";
  if (/privacy|data policy|data-policy|data_policy|data collection/.test(evidence)) return "Model blocked by provider privacy settings. Review OpenRouter Settings > Privacy and choose an allowed free model; only enable data sharing if acceptable to you.";
  if (response.status === 401 || /invalid.*key|unauthoriz|authentication/.test(evidence)) return "Provider rejected authentication. Update the provider API key privately in Connections and restart FreeRide if running.";
  if (response.status === 403) return "Provider denied access (403). Check key permissions, account restrictions and model access in the provider console. No paid fallback was made.";
  if (/upstream_uncertain/.test(evidence)) return "Provider inference timed out, returned 5xx, or could not be read. No automatic resend was made; retry later after checking provider status.";
  if (/request_rejected/.test(evidence)) return "Provider rejected the request format or model parameters (400). Update Penguin and restart FreeRide; no paid fallback was made.";
  if (/model_unavailable/.test(evidence)) return "The selected free model is unavailable (404). Wait for the catalog cache to refresh or select another eligible free model.";
  if (/gateway_not_ready/.test(evidence)) return "FreeRide is reachable but no eligible provider is ready. Click Check AI connection for model counts, key access or cooldown details. No inference request was made.";
  if (/no_usable_keys|no_model_available/.test(evidence)) return "FreeRide has no usable free model/key. Check gateway startup, provider quotas and configured keys.";
  if (/rate_limit|quota_exhausted/.test(evidence) || response.status === 429) return "Free provider quota or rate limit reached. Wait for reset or configure another eligible free provider.";
  return `AI provider returned HTTP ${response.status}; check provider availability and gateway startup.`;
}
