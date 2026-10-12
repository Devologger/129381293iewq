"use client";
import { useState } from "react";
type Note = { name: string; updated: number; links: string[] };
export function VaultBrowser() {
  const [notes, setNotes] = useState<Note[]>([]), [note, setNote] = useState<{ name: string; text: string; uri: string } | null>(null);
  const [memory, setMemory] = useState(""), [message, setMessage] = useState("Unlock Connections, then load your private research notes."), [busy, setBusy] = useState(false);
  async function request(name?: string, payload?: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/terminal/vault" + (name ? "?name=" + encodeURIComponent(name) : ""), payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {});
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (data.notes) { setNotes(data.notes); setMessage(`${data.notes.length} private notes loaded.`); }
      else if (data.text !== undefined) { setNote(data); if (data.name === "Agent Memory.md") setMemory(data.text); }
      else setMessage(data.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vault unavailable"); } finally { setBusy(false); }
  }
  return <section className="ot-panel penguin-vault-browser"><div className="ot-panel-title"><h3>Obsidian memory &amp; linked evidence</h3><button className="ot-secondary" disabled={busy} onClick={() => void request()}>Load notes</button></div><p role="status">{message}</p><div className="penguin-vault-layout"><nav aria-label="Research notes">{notes.map(n => <button className="ot-secondary" key={n.name} disabled={busy} onClick={() => void request(n.name)}>{n.name}<small>{n.links.length} links</small></button>)}</nav><article>{note ? <><h4>{note.name}</h4><a className="ot-text-button" href={note.uri}>Open in Obsidian on this laptop ↗</a><pre>{note.text}</pre><div>{notes.find(n => n.name === note.name)?.links.map((link, i) => { const target = notes.find(n => n.name === link + ".md"); return target ? <button className="ot-secondary" key={i} onClick={() => void request(target.name)}>[[{link}]]</button> : <span key={i}> [[{link}]] </span>; })}</div></> : <p>Select a note to read the evidence and follow its links.</p>}</article></div><label className="ot-team-question">Curated agent memory · up to 5000 characters<textarea aria-label="Curated agent memory" maxLength={5000} value={memory} onChange={e => setMemory(e.target.value)} placeholder="Record hypotheses, rejected ideas, and constraints for the research council…" /></label><div className="ot-desk-actions"><button className="ot-primary" disabled={busy} onClick={() => void request(undefined, { action: "memory", text: memory })}>Save agent memory</button><button className="ot-secondary" disabled={busy} onClick={() => void request(undefined, { action: "generate" })}>Generate Obsidian Canvas &amp; Base</button></div><p className="ot-methodology">Memory improves the council’s context; it does not train model weights. Canvas and Bases organize your actual workspace notes. The Obsidian link requires this vault to exist on your laptop; a cloud server path won’t open a local file.</p></section>;
}
