import {vaultDirectory} from "./account-context.ts";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { vaultReport, type Feed, type Research, type Portfolio } from "../terminal-engine.ts";
import { saveStrategyEvidence } from "./strategy-memory.ts";
function workspaceFolder(id: string) {
  if (!/^[a-f\d]{48}$/.test(id)) throw new Error("Invalid workspace ID");
  const vault = resolve(/* turbopackIgnore: true */ vaultDirectory());
  mkdirSync(vault, { recursive: true, mode: 0o700 });
  const root = realpathSync(vault), directory = join(root, "Research", id);
  mkdirSync(join(root, "Research"), { recursive: true, mode: 0o700 });
  if (realpathSync(join(root, "Research")) !== join(root, "Research")) throw new Error("Vault research directory must not be a symlink");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory) throw new Error("Vault workspace must not be a symlink");
  return { root, directory };
}
function safeNote(directory: string, name: string) {
  if (basename(name) !== name || !name.endsWith(".md")) throw new Error("Invalid note name");
  const file = join(directory, name);
  if (lstatSync(file).isSymbolicLink() || !realpathSync(file).startsWith(directory + sep) || statSync(file).size > 65536) throw new Error("Unsafe or oversized note");
  return file;
}
export function vaultNotes(id: string) {
  const { directory } = workspaceFolder(id);
  return readdirSync(/* turbopackIgnore: true */ directory).filter(n => n.endsWith(".md")).slice(0, 100).flatMap(name => {
    try { const path = safeNote(directory, name), text = readFileSync(/* turbopackIgnore: true */ path, "utf8"); return [{ name, updated: statSync(path).mtimeMs, links: [...text.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)].map(m => m[1]) }]; } catch { return []; }
  }).sort((a, b) => b.updated - a.updated);
}
export function vaultNote(id: string, name: string) {
  const { directory } = workspaceFolder(id), path = safeNote(directory, name);
  return { name, text: readFileSync(/* turbopackIgnore: true */ path, "utf8"), uri: "obsidian://open?path=" + encodeURIComponent(path) };
}
function generatedWrite(directory: string, name: string, text: string) {
  const path = join(directory, name), temp = path + ".tmp";
  try { if (lstatSync(path).isSymbolicLink()) throw new Error("Generated file must not be a symlink"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  writeFileSync(temp, text, { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}
export function saveAgentMemory(id: string, text: string) {
  if (typeof text !== "string" || text.length > 5000) throw new Error("Use at most 5000 characters for curated memory");
  const { directory } = workspaceFolder(id);
  generatedWrite(directory, "Agent Memory.md", text);
  return { message: "Curated memory saved. The next uncached council run reads it as research context." };
}
export function generateVaultViews(id: string) {
  const { directory } = workspaceFolder(id), notes = vaultNotes(id).slice(0, 40);
  const nodes = notes.map((n, i) => ({ id: `note-${i}`, type: "file", file: `Research/${id}/${n.name}`, x: (i % 4) * 420, y: Math.floor(i / 4) * 300, width: 380, height: 240 }));
  const edges = notes.flatMap((n, i) => n.links.flatMap((link, j) => { const to = notes.findIndex(candidate => candidate.name.replace(/\.md$/, "") === link); return to >= 0 && to !== i ? [{ id: `edge-${i}-${j}`, fromNode: `note-${i}`, toNode: `note-${to}` }] : []; }));
  generatedWrite(directory, "Penguin Generated Map.canvas", JSON.stringify({ nodes, edges }, null, 2));
  generatedWrite(directory, "Penguin Research.base", `filters:\n  and:\n    - 'file.inFolder("Research/${id}")'\n    - 'file.ext == "md"'\nviews:\n  - type: table\n    name: Penguin research notes\n    order:\n      - file.name\n      - file.mtime\n`);
  return { message: `Generated Obsidian Canvas and Base for ${notes.length} notes. Open Research/${id} in your local Obsidian vault.` };
}

export function saveVaultNote(workspaceId: string, feed: Feed, report: Research, portfolio: Portfolio) {
  if (!/^[a-f\d]{48}$/.test(workspaceId) || !/^[A-Z0-9]{2,12}$/.test(feed.symbol)) throw new Error("Invalid vault note context");
  const { directory } = workspaceFolder(workspaceId);
  const name = `${feed.exchange}-${feed.market}-${feed.symbol}-${feed.timeframe}-${report.as_of}.md`;
  const file = join(directory, name); const temporary = `${file}.tmp`;
  writeFileSync(temporary, vaultReport(feed, report, portfolio), { mode: 0o600 }); renameSync(temporary, file);
  if (report.strategy_lab) saveStrategyEvidence(workspaceId, `${feed.exchange}:${feed.market}:${feed.symbol}:${feed.timeframe}:${feed.source}`, report.strategy_lab, feed.source);
  return name;
}

export async function knowledgeActivity(id:string){
 const {db,readWorkspace}=await import('./store.ts');
 const {teamRuns,teamSettings,TEAM_ROLES}=await import('./agent-team.ts');
 const {tradeFeedback}=await import('./trade-feedback.ts');
 const workspace=readWorkspace(id),runs=teamRuns(id),feedback=tradeFeedback(id);
 const studies=(db().prepare('SELECT state,context_key FROM strategy_runs WHERE workspace_id=? ORDER BY created DESC LIMIT 6').all(id) as {state:string;context_key:string}[]).map(row=>{const value=JSON.parse(row.state);return {context:row.context_key,created:value.created,note:value.note,source:value.source,decision:value.report.decision,selected:value.report.training_selected?.strategy,coverageDays:value.report.coverage_days};});
 const evidence=(db().prepare('SELECT COUNT(*) AS count FROM strategy_runs WHERE workspace_id=?').get(id) as {count:number}).count;
 return {evidence,completedReviews:runs.filter(r=>r.status==='COMPLETE').length,reviewWindow:runs.length,appliedChanges:0,workerAt:workspace.lastWorkerAt,schedule:teamSettings(id),outcomes:{paper:feedback.paper,automaticExchangePaper:feedback.automaticExchangePaper},studies,
  roles:TEAM_ROLES.map(role=>{const run=runs.find(r=>r.messages.some(m=>m.role===role.id));const message=run?.messages.find(m=>m.role===role.id);return {id:role.id,name:role.name,text:message?.text||null,created:run?.created||null,model:message?.model||null,status:run?.status||'WAITING'};}),
  limits:['Notes are retrieved as context; model weights are not trained.','Agent proposals cannot change strategies or submit orders.','Demo realized fills and fees are not yet imported into the outcome dataset.'],
  recent:runs.map(r=>({id:r.id,created:r.created,status:r.status,context:r.contextKey,note:r.note||null,error:r.error||null}))};
}
