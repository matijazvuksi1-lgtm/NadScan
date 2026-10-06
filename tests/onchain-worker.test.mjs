import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import ts from 'typescript';
function fixture(failLogs=false){
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE profiles(id TEXT PRIMARY KEY,wallet TEXT,active INTEGER,head INTEGER,updated INTEGER,error TEXT);CREATE TABLE transfers(id TEXT PRIMARY KEY,wallet TEXT,token TEXT,direction TEXT,quantity TEXT,block INTEGER,tx TEXT);CREATE TABLE chain_jobs(id TEXT PRIMARY KEY,wallet TEXT,tx TEXT,block INTEGER,status TEXT DEFAULT 'pending',message TEXT,updated INTEGER DEFAULT 0);INSERT INTO profiles VALUES('p','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,0,0,'');INSERT INTO settings VALUES('chunk','10');`);
 const wrap=(query,values=[])=>({bind(...v){return wrap(query,v);},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},async run(){return sql.prepare(query).run(...values);}});
 const db=()=>({prepare:query=>wrap(query),batch:async statements=>Promise.all(statements.map(s=>s.run()))});const config=async()=>Object.fromEntries(sql.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]));const setting=async(k,v)=>sql.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v);
 const calls=[];const rpc=async(method,params)=>{calls.push({method,params});if(method==='eth_chainId')return '0x8f';if(method==='eth_blockNumber')return '0x6e';if(method==='eth_getLogs'){if(failLogs)throw new Error('Provider failure');return [];}throw new Error('Unexpected RPC '+method);};
 const modules={'./store':{db,config,setting},'./indexer':{rpc},'./scan-policy':{scanRange:c=>Number(c.chunk)},'./onchain-decode':{TRANSFER:'transfer',WMON:'wmon',topic:x=>x},'./chain-token':{ensureChainToken:()=>{throw new Error('Unexpected metadata read');}},'./chain-events':{protocolQuote:()=>null}};
 const compiled=ts.transpileModule(fs.readFileSync(new URL('../lib/onchain.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('require','exports',compiled)(name=>{if(!modules[name])throw new Error(name);return modules[name];},exports);
 return {step:exports.onchainStep,config,calls,sql};
}
test('tip scan and reverse backfill join without a gap and never call nad.fun',async()=>{
 const f=fixture();await f.step('live');let c=await f.config();assert.equal(c['tipStart:p'],'1');assert.equal(c['tipCursor:p'],'101');assert.equal(c['historyNext:p'],'0');
 await f.step('history');c=await f.config();assert.equal(c['historyNext:p'],'-1');assert.equal(c['tipCursor:p'],'101');assert.equal(c.syncLock,'0');
 const ranges=f.calls.filter(x=>x.method==='eth_getLogs').map(x=>x.params[0]);assert(ranges.some(x=>x.fromBlock==='0x0'&&x.toBlock==='0x0'));f.sql.close();
});
test('failed provider request retains the exact next unscanned block and releases lock',async()=>{
 const f=fixture(true);await assert.rejects(f.step('live'),/Provider failure/);const c=await f.config();assert.equal(c['tipCursor:p'],'1');assert.equal(c['historyNext:p'],'0');assert.equal(c.syncLock,'0');assert.equal(c.liveError,'Provider failure');f.sql.close();
});

test('automatic mode catches current blocks before historical work',async()=>{
 const f=fixture();await f.step('auto');let c=await f.config();assert.equal(c['tipCursor:p'],'101');assert.equal(c['historyNext:p'],'0');
 await f.step('auto');c=await f.config();assert.equal(c['historyNext:p'],'-1');assert.equal(c['tipCursor:p'],'101');f.sql.close();
});
