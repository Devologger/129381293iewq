import test,{after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
import {configureScan,scannerStatus} from '../lib/server/scanner.ts';import {tickWorkspace} from '../lib/server/worker.ts';import {db,createWorkspace,readWorkspace,updateWorkspace} from '../lib/server/store.ts';import {demoCandles} from '../lib/terminal-engine.ts';
const folder=mkdtempSync(join(tmpdir(),'penguin-scanner-'));process.env.TERMINAL_DATA_DIR=folder;process.env.TERMINAL_VAULT_DIR=join(folder,'vault');after(()=>{db().close();rmSync(folder,{recursive:true,force:true});});
const id=randomBytes(24).toString('hex');createWorkspace(id);const context={exchange:'bybit',market:'spot',symbol:'BTC',timeframe:'15m',source:'exchange'};
test('watchlist scan configures markets without enabling paper orders and still scans while entries are paused',async()=>{
 updateWorkspace(id,ws=>({...ws,portfolio:{...ws.portfolio,paused:true}}));assert.throws(()=>configureScan(id,{...context,source:'demo'},true),/sample data is static/);
 configureScan(id,context,true);assert.equal(scannerStatus(id).markets.length,4);assert.ok(readWorkspace(id).bots.every(b=>b.scanning&&!b.enabled&&!b.learning));let calls=0;
 const feed=async c=>({...c,candles:demoCandles(c.symbol,c.timeframe),fetchedAt:Date.now()});const research=async candles=>{calls++;return {as_of:candles.at(-1).time,model:'test',decision:'insufficient_edge_evidence',active_tolerance:.08,candidate:null,studies:[],snapshot:{reason:'Test only',display_levels:[]}};};
 await tickWorkspace(id,feed,research);assert.equal(calls,4);await tickWorkspace(id,feed,research);assert.equal(calls,4);assert.equal(readWorkspace(id).portfolio.positions.length,0);assert.ok(scannerStatus(id).lastCycle);
 configureScan(id,context,false);assert.equal(scannerStatus(id).enabled,false);await tickWorkspace(id,feed,research);assert.equal(calls,4);
});
