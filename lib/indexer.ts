import {db,setting} from './store';
import {validateRpcResult} from './scan-policy';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const WMON='0x3bd359c1119da7da1d913d1c4d2b7c461115433a';
const word=(s:string)=>'0x'+s.slice(2).toLowerCase().padStart(64,'0');
export async function rpc(method:string,params:any[],c:Record<string,string>){
 const now=Date.now();
 const cooldown=await db().prepare("SELECT value FROM settings WHERE key='rpcRetryAt'").first<{value:string}>();
 if(Number(cooldown?.value)>now)throw new Error('Alchemy throughput limit: cooling down before retry. Saved scan progress is retained.');
 // One shared queue for live scans, history, balances and status, including other tabs.
 const slot=await db().prepare("INSERT INTO settings(key,value) VALUES('rpcNextSlot',?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(settings.value AS INTEGER),?)+600 AS TEXT) WHERE CAST(settings.value AS INTEGER)<? RETURNING value").bind(String(now+600),now,now+6000).first<{value:string}>();
 if(!slot)throw new Error('Alchemy request queue is busy. Retrying on the next scan.');
 const delay=Math.max(0,Number(slot.value)-600-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
 const response=await fetch(c.rpcUrl||'https://rpc.monad.xyz',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)}).catch(()=>{throw new Error('Monad provider could not be reached or timed out. Please retry.');});const r:any=await response.json().catch(()=>null);if(response.status===429||r?.error?.code===429||/compute units per second|throughput|capacity/i.test(String(r?.error?.message||''))){await setting('rpcRetryAt',String(Date.now()+15000));throw new Error('Alchemy throughput limit: retrying after a 15-second cooldown. Saved scan progress is retained.');}if(!r)throw new Error(`Monad provider returned HTTP ${response.status}.`);if(r.error)throw new Error(`Monad RPC: ${String(r.error.message).replace(/https?:\/\/[^\s]+/g,'[provider]').replace(/alch_[A-Za-z0-9_-]+/g,'[redacted]').slice(0,200)}`);if(!response.ok)throw new Error(`Monad provider returned HTTP ${response.status}.`);return validateRpcResult(method,r.result);}
