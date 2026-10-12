import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, generateKeyPairSync, sign } from "node:crypto";
import { createWorkspace, updateWorkspace, readWorkspace, db, saveCredential, credential, createLink, linkDiscord, discordWorkspace } from "../lib/server/store.ts";
import { workspaceSession, verifyToken, sameOrigin } from "../lib/server/session.ts";
import { tickWorkspace } from "../lib/server/worker.ts";
import { discordInteraction } from "../lib/server/discord.ts";
import { verifyBinanceDemo } from "../lib/server/binance-demo.ts";

const folder = mkdtempSync(join(tmpdir(), "obsidian-ledger-test-"));
process.env.TERMINAL_DATA_DIR = folder;
process.env.TERMINAL_VAULT_DIR = join(folder, "vault");
const id = () => randomBytes(24).toString("hex");
after(() => { db().close(); rmSync(folder, { recursive: true, force: true }); delete process.env.TERMINAL_DATA_DIR; delete process.env.TERMINAL_VAULT_DIR; });
const context = { exchange: "binance", market: "spot", symbol: "BTC", timeframe: "15m", source: "exchange" };
const report = { model: "controlled worker fixture", as_of: 400, studies: [], active_tolerance: .05, candidate: .05, decision: "review_paper_candidate", methodology: "Fixture, not market evidence", snapshot: { display_levels: [{ price: 100, label: "0.618", confirmed: true }] } };
const feed = (time=400, close=101) => ({ ...context, candles: [{time:time-1,open:99,high:100,low:98,close:99,volume:2},{time,open:99,high:Math.max(102,close),low:98,close,volume:2}], fetchedAt: Date.now() });

test("ledger persists isolated workspaces and rolls back failed transactions", () => {
  const a=id(), b=id(); createWorkspace(a); createWorkspace(b);
  updateWorkspace(a, ws=>({...ws,portfolio:{...ws.portfolio,cash:9000}}));
  assert.equal(readWorkspace(a).portfolio.cash,9000); assert.equal(readWorkspace(b).portfolio.cash,10000);
  assert.throws(()=>updateWorkspace(a,()=>{throw new Error("abort")}));
  assert.equal(readWorkspace(a).portfolio.cash,9000);
});
test("credentials are authenticated encrypted records and environment bindings are preserved",()=>{
  saveCredential("TRADE_AI_KEY","unit-test-key-not-a-real-credential");
  assert.equal(credential("TRADE_AI_KEY"),"unit-test-key-not-a-real-credential");
  const row=db().prepare("SELECT encrypted FROM credentials WHERE name='TRADE_AI_KEY'").get();
  assert.ok(!row.encrypted.includes("unit-test-key"));
  process.env.TRADE_AI_KEY="unit-environment-binding";
  assert.throws(()=>saveCredential("TRADE_AI_KEY","replacement"),/environment/);
  assert.equal(credential("TRADE_AI_KEY"),"unit-environment-binding"); delete process.env.TRADE_AI_KEY;
  assert.throws(()=>saveCredential("DISCORD_PUBLIC_KEY","invalid"),/hexadecimal/);
});
test("workspace cookies are signed and mutations require same-origin requests",()=>{
  const request=new Request("http://localhost/api/terminal/workspace");
  const session=workspaceSession(request,true);
  const token=session.cookie.split(";")[0].split("=")[1];
  assert.equal(verifyToken(token),session.id);
  assert.equal(verifyToken(token.slice(0,-1)+(token.at(-1)==="a"?"b":"a")),null);
  assert.throws(()=>sameOrigin(new Request("http://localhost/api/terminal/workspace",{headers:{origin:"https://attacker.invalid"}})),/same-origin/);
  sameOrigin(new Request("http://localhost/api/terminal/workspace",{headers:{origin:"http://localhost"}}));
  sameOrigin(new Request("http://localhost:3000/api/terminal/workspace",{headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000"}}));
});
test("server worker applies bounded learning, enters once per bar, and protects positions while entries are paused",async()=>{
  const workspaceId=id(); createWorkspace(workspaceId);
  updateWorkspace(workspaceId,ws=>({...ws,portfolio:{...ws.portfolio,paused:false},bots:[{...context,key:"binance:spot:BTC:15m:exchange",enabled:true,learning:true,lastBar:399,tolerance:.08,research:report,error:null,updatedAt:null}]}));
  let calls=0;
  const research=async(c,t,apply)=>{assert.equal(apply,true);calls++;return report;};
  await tickWorkspace(workspaceId,async()=>feed(),research);
  let ws=readWorkspace(workspaceId);
  assert.equal(ws.portfolio.positions.length,1); assert.equal(ws.bots[0].tolerance,.05);
  await tickWorkspace(workspaceId,async()=>feed(),research);
  assert.equal(readWorkspace(workspaceId).portfolio.positions.length,1); assert.equal(calls,1);
  updateWorkspace(workspaceId,ws=>({...ws,portfolio:{...ws.portfolio,paused:true}}));
  await tickWorkspace(workspaceId,async()=>feed(401,106),research);
  ws=readWorkspace(workspaceId); assert.equal(ws.portfolio.positions.length,0); assert.equal(ws.portfolio.fills.length,1); assert.ok(ws.portfolio.fills[0].pnl>0); assert.ok(ws.lastWorkerAt);
});
test("Discord links once and signed commands operate the matching persistent account",async()=>{
  const workspaceId=id();createWorkspace(workspaceId);const code=createLink(workspaceId);
  linkDiscord("123456789",code); assert.equal(discordWorkspace("123456789"),workspaceId);
  assert.throws(()=>linkDiscord("987654321",code),/expired/);
  const {publicKey,privateKey}=generateKeyPairSync("ed25519");
  const old=process.env.DISCORD_PUBLIC_KEY;
  process.env.DISCORD_PUBLIC_KEY=publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
  try{
    const body=JSON.stringify({type:2,data:{name:"obsidian",options:[{name:"resume"}]},user:{id:"123456789"}});
    const timestamp=String(Math.floor(Date.now()/1000));const signature=sign(null,Buffer.from(timestamp+body),privateKey).toString("hex");
    const response=await discordInteraction(new Request("http://localhost/api/terminal/discord",{method:"POST",body,headers:{"x-signature-timestamp":timestamp,"x-signature-ed25519":signature}}));
    assert.equal(response.status,200);assert.equal(readWorkspace(workspaceId).portfolio.paused,false);
    assert.equal((await response.json()).data.flags,64);
  }finally{if(old)process.env.DISCORD_PUBLIC_KEY=old;else delete process.env.DISCORD_PUBLIC_KEY;}
});
test("Binance demo adapter signs read-only account verification against the demo host",async()=>{
  saveCredential("BINANCE_DEMO_API_KEY","unit-demo-key");saveCredential("BINANCE_DEMO_API_SECRET","unit-demo-secret");
  let calls=0;
  const fakeFetch=async(url,options)=>{calls++;const parsed=new URL(url);assert.equal(parsed.hostname,"demo-fapi.binance.com");assert.ok(!options.method || options.method==="GET");if(parsed.pathname.endsWith("/time"))return Response.json({serverTime:Date.now()});assert.match(parsed.searchParams.get("signature"),/^[a-f0-9]{64}$/);assert.equal(options.headers["X-MBX-APIKEY"],"unit-demo-key");return Response.json([{asset:"USDT",availableBalance:"1234.56"}]);};
  const result=await verifyBinanceDemo(fakeFetch);assert.equal(result.availableUsdt,1234.56);assert.equal(result.ordersPlaced,0);assert.equal(calls,2);
});
