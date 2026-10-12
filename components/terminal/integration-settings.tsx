"use client";
import { useCallback, useEffect, useState } from "react";

type Setting = { name: string; configured: boolean; managedByEnvironment: boolean };
type Settings = { adminConfigured: boolean; unlocked: boolean; credentials: Setting[] };
const LABELS: Record<string, string> = { TEAM_REMOTE_KEY: "Free-tier AI provider API key", TRADE_AI_KEY: "OpenAI key · optional paid mode", DISCORD_PUBLIC_KEY: "Discord application Public Key", BINANCE_DEMO_API_KEY: "Binance demo API key", BINANCE_DEMO_API_SECRET: "Binance demo API secret" };
export function IntegrationSettings({ onNotice, onDiscordConfigured }: { onNotice: (message: string) => void; onDiscordConfigured: (configured: boolean) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState("DISCORD_PUBLIC_KEY");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkCode, setLinkCode] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/terminal/settings");
    if (!response.ok) throw new Error("Integration settings unavailable");
    const data: Settings = await response.json();
    setSettings(data); onDiscordConfigured(Boolean(data.credentials.find(c => c.name === "DISCORD_PUBLIC_KEY")?.configured));
  }, [onDiscordConfigured]);
  useEffect(() => { const timer = setTimeout(() => { void refresh().catch(() => {}); }, 0); return () => clearTimeout(timer); }, [refresh]);
  async function save(action: "login" | "save" | "logout") {
    setBusy(true);
    try {
      const response = await fetch("/api/terminal/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "login" ? { action, password } : action === "save" ? { action, name: selected, value } : { action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPassword(""); setValue(""); await refresh();
      onNotice(action === "save" ? "Integration value encrypted and saved. It was not returned to the browser." : action === "login" ? "Private settings unlocked for one hour." : "Private settings locked.");
    } catch (error) { onNotice(error instanceof Error ? error.message : "Settings action failed"); }
    finally { setBusy(false); }
  }
  async function generateLink() {
    try {
      const response = await fetch("/api/terminal/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setLinkCode(data.code); onNotice("One-time Discord link code created. It expires in ten minutes.");
    } catch (error) { onNotice(error instanceof Error ? error.message : "Could not create link code"); }
  }
  async function verifyDemo() {
    setBusy(true);
    try {
      const response = await fetch("/api/terminal/binance-demo"); const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onNotice(`Binance demo account verified. Available demo USDT: ${Number(data.availableUsdt).toFixed(2)}. No order was placed.`);
    } catch (error) { onNotice(error instanceof Error ? error.message : "Demo verification failed"); }
    finally { setBusy(false); }
  }
  const environmentManaged = settings?.credentials.find(c => c.name === selected)?.managedByEnvironment;
  return <section className="ot-panel ot-private-settings" id="connections"><div className="ot-panel-title"><h2>Connect when you’re ready.</h2><span className="ot-pill gold">ALL KEYS OPTIONAL</span></div><p>The standalone paper engine and strategy research work without credentials. Add integrations here later; values are stored encrypted on this app’s server. Environment-managed values stay managed there.</p><div className="ot-settings-status">{settings?.credentials.map(c => <div key={c.name}><span>{LABELS[c.name]}</span><strong className={c.configured ? "ot-positive" : "ot-muted"}>{c.configured ? "Configured" : "Add later"}</strong></div>)}</div><div className="ot-settings-columns"><div><h3>Private integration settings</h3>{!settings?.adminConfigured ? <p>When you’re ready, set a settings password of at least 16 characters using <code>TERMINAL_ADMIN_PASSWORD</code> in your private environment settings or <code>.env.local</code>, then restart this app. Nothing needs to be entered in chat.</p> : !settings.unlocked ? <form onSubmit={e => { e.preventDefault(); void save("login"); }}><label htmlFor="settings-password">Your settings password</label><input id="settings-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /><button className="ot-primary" disabled={busy || !password}>Unlock private settings</button></form> : <form onSubmit={e => { e.preventDefault(); void save("save"); }}><label htmlFor="credential-type">Integration</label><select id="credential-type" value={selected} onChange={e => { setSelected(e.target.value); setValue(""); }}>{Object.entries(LABELS).map(([name, label]) => <option key={name} value={name}>{label}</option>)}</select><label htmlFor="credential-value">{LABELS[selected]}</label><input id="credential-value" type="password" autoComplete="off" disabled={environmentManaged} value={value} onChange={e => setValue(e.target.value)} placeholder={environmentManaged ? "Managed by environment settings" : "Enter privately when ready"} /><div className="ot-settings-buttons"><button className="ot-primary" disabled={busy || !value || environmentManaged}>Encrypt & save</button><button type="button" className="ot-secondary" onClick={() => void save("logout")}>Lock settings</button></div></form>}<button className="ot-secondary" disabled={busy || !settings?.unlocked || !settings.credentials.find(c => c.name === "BINANCE_DEMO_API_KEY")?.configured || !settings.credentials.find(c => c.name === "BINANCE_DEMO_API_SECRET")?.configured} onClick={verifyDemo}>Verify Binance demo account</button><small>Demo verification reads account balances only. Use the Binance demo desk for exchange orders and demo automation; the paper ledger remains separate.</small></div><div><h3>Link your Discord workspace</h3><p>The Discord key is the application’s <strong>Public Key</strong>, found under General Information in Discord Developer Portal. It verifies slash commands. It is not the bot token.</p><button className="ot-secondary" onClick={generateLink}>Generate one-time link code</button>{linkCode && <div className="ot-discord-link-code"><code>/obsidian link code:{linkCode}</code><small>Use privately in Discord within ten minutes. Generating a new code expires the old one.</small></div>}<small>After the Discord application is configured, linked status, positions, pause, and resume commands use the same persistent paper ledger as this dashboard.</small></div></div></section>;
}
