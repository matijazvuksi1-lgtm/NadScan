import {discoverTransfers} from './transfer-history';
import {db,config,setting} from './store';
import {rpc} from './indexer';
import {scanRange} from './scan-policy';
import {TRANSFER,V2_SWAP,V3_SWAP,WMON,topic,tokenFlows,poolQuote,curveQuote} from './onchain-decode';
import {ensureChainToken} from './chain-token';
import {protocolQuote} from './chain-events';
const hex=(n:number)=>'0x'+n.toString(16);
async function processReceipt(job:any,c:Record<string,string>,safeHead:number){
 const receipt=await rpc('eth_getTransactionReceipt',[job.tx],c);if(!receipt)throw new Error('Receipt unavailable');if(receipt.status!=='0x1')return {status:'ignored',message:'Transaction failed onchain.'};if(parseInt(receipt.blockNumber,16)>safeHead)throw new Error('Waiting for confirmation');
 const transferStatements=[];
 for(const l of receipt.logs||[]){if(l.topics?.[0]!==TRANSFER||l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data))continue;
 const source='0x'+l.topics[1].slice(-40).toLowerCase(),dest='0x'+l.topics[2].slice(-40).toLowerCase();if(source===dest||source!==job.wallet&&dest!==job.wallet||l.address.toLowerCase()===WMON)continue;
 transferStatements.push(db().prepare('INSERT OR IGNORE INTO transfers(id,wallet,token,direction,quantity,block,tx) VALUES(?,?,?,?,?,?,?)').bind(job.wallet+':'+job.tx+':'+l.logIndex,job.wallet,l.address.toLowerCase(),dest===job.wallet?'in':'out',BigInt(l.data).toString(),parseInt(receipt.blockNumber,16),job.tx));
 }
 if(transferStatements.length)await db().batch(transferStatements);
 const already=await db().prepare('SELECT id FROM trades WHERE wallet=? AND tx=? LIMIT 1').bind(job.wallet,job.tx).first();if(already)return {status:'imported',message:'Receipt already indexed.',existing:true};
 const flows=tokenFlows(receipt.logs,job.wallet);const assets=[...flows.entries()].filter(([a,n])=>a!==WMON&&n!==0n);
 if(assets.length!==1)return {status:'review',message:'Multiple or no token flows; not classified as a simple swap.'};
 const [token,net]=assets[0];const known=await ensureChainToken(token,c);
 if(!known)return {status:'ignored',message:'Not registered by the supported nad.fun contracts.'};
 await db().prepare('INSERT OR IGNORE INTO wallet_tokens(id,wallet,token) VALUES(?,?,?)').bind(job.wallet+':'+token,job.wallet,token).run();
 if(known.quote!==WMON)return {status:'review',message:'Non-MON quote token; excluded from MON P&L.'};
 const quotes:any[]=[];
 for(const log of receipt.logs){const curve=protocolQuote(log,token,job.wallet,net);if(curve){quotes.push(curve);continue;}if(![V2_SWAP,V3_SWAP].includes(log.topics?.[0]))continue;
  const pool=log.address.toLowerCase();let pair=c['pair:'+pool]?JSON.parse(c['pair:'+pool]):null;
  if(!pair){const results=await Promise.all([rpc('eth_call',[{to:pool,data:'0x0dfe1681'},'latest'],c),rpc('eth_call',[{to:pool,data:'0xd21220a7'},'latest'],c)]);if(results.some(x=>typeof x!=='string'||x.length!==66))continue;pair=results.map(x=>'0x'+x.slice(-40).toLowerCase());c['pair:'+pool]=JSON.stringify(pair);await setting('pair:'+pool,c['pair:'+pool]);}
  const q=poolQuote(log,token,pair[0],pair[1],net);if(q)quotes.push(q);
 }
 if(quotes.length===0&&!receipt.logs.some((l:any)=>[V2_SWAP,V3_SWAP].includes(l.topics?.[0])||['0xa7283d07812a02afb7c09b60f8896bcea3f90ace','0x9f3832732923252a21044f21ee6bd87f09514ae4'].includes(l.address?.toLowerCase())))return {status:'transfer',message:'Token transfer; not a buy or sell.'};
 if(quotes.length!==1)return {status:'review',message:'Unsupported or ambiguous swap route; excluded from P&L.'};
 const q=quotes[0];const [block,tx]=await Promise.all([rpc('eth_getBlockByNumber',[receipt.blockNumber,false],c),rpc('eth_getTransactionByHash',[job.tx],c)]);if(!block?.timestamp||!tx)throw new Error('Block or transaction unavailable');
 const gas=tx.from?.toLowerCase()===job.wallet?BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice||'0x0'):0n;
 const id=job.wallet+':'+token+':'+job.tx+':'+q.side;
 await db().prepare('INSERT OR IGNORE INTO trades(id,wallet,token,side,quantity,native,gas,time,block,tx,quality) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,job.wallet,token,q.side,(net<0n?-net:net).toString(),q.native.toString(),gas.toString(),parseInt(block.timestamp,16),parseInt(receipt.blockNumber,16),job.tx,'onchain-pool-quote').run();
 await db().prepare('INSERT OR IGNORE INTO wallet_tokens(id,wallet,token) VALUES(?,?,?)').bind(job.wallet+':'+token,job.wallet,token).run();return {status:'imported',message:'Confirmed receipt; pool quote before external routing fees.'};
}
// Cursors describe contiguous ranges. The fast tip and reverse history meet without skipping gaps.
export async function onchainStep(mode:'live'|'history'|'auto'='auto'){
 const started=Date.now(),now=Math.floor(started/1000),lease=String(now+180),c=await config();
 const lock=await db().prepare("INSERT INTO settings(key,value) VALUES('syncLock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<? RETURNING value").bind(lease,now).first();if(!lock)return {message:'A scan is already running.'};
 let imported=0,ranges=0,processed=0;
 try{
 if(parseInt(await rpc('eth_chainId',[],c),16)!==143)throw new Error('Monad mainnet required');
 const head=Math.max(0,parseInt(await rpc('eth_blockNumber',[],c),16)-10);
 await setting('liveObservedHead',String(head));await setting('liveHeadCheckedAt',String(now));
 // Existing discovered transfers can now be decoded without waiting for an external history API.
 await db().prepare("INSERT OR IGNORE INTO chain_jobs(id,wallet,tx,block) SELECT t.wallet||':'||t.tx,t.wallet,t.tx,MIN(t.block) FROM transfers t JOIN profiles p ON p.wallet=t.wallet WHERE p.active=1 AND NOT EXISTS(SELECT 1 FROM chain_jobs j WHERE j.id=t.wallet||':'||t.tx) GROUP BY t.wallet,t.tx LIMIT 20").run();
 const drain=async(deadline:number)=>{
 const jobs=await db().prepare("SELECT j.* FROM chain_jobs j JOIN profiles p ON p.wallet=j.wallet WHERE p.active=1 AND j.status='pending' ORDER BY j.updated,j.block DESC LIMIT 6").all<any>();
 for(const job of jobs.results){if(Date.now()-started>deadline)break;try{const result=await processReceipt(job,c,head);await db().prepare('UPDATE chain_jobs SET status=?,message=?,updated=? WHERE id=?').bind(result.status,result.message,now,job.id).run();processed++;if(result.status==='imported'&&!('existing' in result))imported++;}catch(e){await db().prepare('UPDATE chain_jobs SET message=?,updated=? WHERE id=?').bind(e instanceof Error?e.message:'Receipt import failed',now,job.id).run();throw e;}}
 };
 const discoveryProfiles=await db().prepare("SELECT id,wallet FROM profiles WHERE active=1 ORDER BY COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='discoveryVisited:'||profiles.id),0),id").all<any>();
 for(const p of discoveryProfiles.results){if(Date.now()-started>5000)break;await setting('discoveryVisited:'+p.id,String(Date.now()));await discoverTransfers(p,head,c);}
 await drain(10000);
 const profiles=await db().prepare("SELECT id,wallet FROM profiles WHERE active=1 ORDER BY COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='liveVisited:'||profiles.id),0),id").all<any>();
 for(const p of profiles.results){if(Date.now()-started>18000)break;await setting('liveVisited:'+p.id,String(Date.now()));
 const tipKey='tipCursor:'+p.id,historyKey='historyNext:'+p.id;
 if(c[tipKey]===undefined){const start=Math.max(0,head-99);c[tipKey]=String(start);c[historyKey]=String(start-1);await db().batch([db().prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind(tipKey,c[tipKey]),db().prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind(historyKey,c[historyKey]),db().prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind('tipStart:'+p.id,String(start))]);}
 let reverse=mode==='history'||(mode==='auto'&&Number(c[tipKey])>head),key=reverse?historyKey:tipKey;let cursor=Number(c[key]);if(!Number.isSafeInteger(cursor))throw new Error('Invalid saved scan cursor.');
 for(let batch=0;batch<Math.max(1,Math.floor(20/profiles.results.length))&&Date.now()-started<18000;batch++){
 if(!reverse&&cursor>head&&mode==='auto'){reverse=true;key=historyKey;cursor=Number(c[key]);if(!Number.isSafeInteger(cursor))throw new Error('Invalid saved history cursor.');}
 if(reverse?cursor<0:cursor>head)break;
 const size=scanRange(c),from=reverse?Math.max(0,cursor-size+1):cursor,to=reverse?cursor:Math.min(head,cursor+size-1);
 let logs:any[];try{const filter={fromBlock:hex(from),toBlock:hex(to)};const lists=await Promise.all([rpc('eth_getLogs',[{...filter,topics:[TRANSFER,null,topic(p.wallet)]}],c),rpc('eth_getLogs',[{...filter,topics:[TRANSFER,topic(p.wallet)]}],c)]);logs=lists.flat();}catch(e){const m=e instanceof Error?e.message:String(e);const limit=m.match(/up to (?:a )?(\d+) block range/i);if(limit)await setting('rpcMaxLogRange',limit[1]);throw e;}
 const unique=new Map<string,any>();for(const l of logs)if(!l.removed&&l.topics?.length===3)unique.set(l.transactionHash+':'+l.logIndex,l);
 const statements=[];
 for(const [id,l] of unique){const token=l.address.toLowerCase();if(token===WMON)continue;const source='0x'+l.topics[1].slice(-40).toLowerCase(),dest='0x'+l.topics[2].slice(-40).toLowerCase();if(source===dest)continue;
 statements.push(db().prepare('INSERT OR IGNORE INTO transfers(id,wallet,token,direction,quantity,block,tx) VALUES(?,?,?,?,?,?,?)').bind(p.wallet+':'+id,p.wallet,token,dest===p.wallet?'in':'out',BigInt(l.data).toString(),parseInt(l.blockNumber,16),l.transactionHash));
 statements.push(db().prepare('INSERT OR IGNORE INTO chain_jobs(id,wallet,tx,block) VALUES(?,?,?,?)').bind(p.wallet+':'+l.transactionHash,p.wallet,l.transactionHash,parseInt(l.blockNumber,16)));
 }
 for(let i=0;i<statements.length;i+=80)await db().batch(statements.slice(i,i+80));
 cursor=reverse?from-1:to+1;await setting(key,String(cursor));ranges++;
 }
 await setting('liveHead:'+p.id,String(head));await db().prepare('UPDATE profiles SET head=?,updated=?,error=? WHERE id=?').bind(head,now,'',p.id).run();
 }
 await drain(24000);await setting('lastSync',String(now));await setting('liveLastRun',String(now));await setting('liveError','');await setting('syncError','');
 return {ranges,imported,processed,head,message:`Onchain ${mode}: ${ranges} ranges, ${processed} receipts checked, ${imported} new trades. No nad.fun API key needed.`};
 }catch(e){const message=e instanceof Error?e.message:'Onchain scan failed';await setting('liveError',message);await setting('syncError',message);throw e;}
 finally{await db().prepare("UPDATE settings SET value='0' WHERE key='syncLock' AND value=?").bind(lease).run();}
}
