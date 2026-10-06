import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {pool,db,setting,config} from './lib/store';
import {onchainStep} from './lib/onchain';
import {GET as data} from './api/data';
import {GET as holdings} from './api/holdings';
const key=process.env.INDEXER_API_KEY||'';
if(key.length<32||!process.env.DATABASE_URL||!process.env.MONAD_RPC_URL)throw new Error('DATABASE_URL, MONAD_RPC_URL and INDEXER_API_KEY (32+ characters) are required.');
await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
function authorized(value:string){const a=Buffer.from(value),b=Buffer.from('Bearer '+key);return a.length===b.length&&timingSafeEqual(a,b);}
let stopping=false,lastSuccess=0;
async function saveProfiles(profiles:any[]){
 if(!Array.isArray(profiles)||profiles.length>100)throw new Error('Expected up to 100 profiles.');
 for(const p of profiles)if(typeof p.id!=='string'||!/^[0-9a-fA-F-]{36}$/.test(p.id)||!/^0x[0-9a-fA-F]{40}$/.test(p.wallet)||typeof p.name!=='string'||typeof p.handle!=='string')throw new Error('Invalid profile.');
 const statements=[db().prepare('UPDATE profiles SET active=0')];
 for(const p of profiles)statements.push(db().prepare('INSERT INTO profiles(id,name,handle,wallet,avatar,note,active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,handle=excluded.handle,avatar=excluded.avatar,note=excluded.note,active=excluded.active WHERE profiles.wallet=excluded.wallet').bind(p.id,p.name.slice(0,80),p.handle.slice(0,15),p.wallet.toLowerCase(),String(p.avatar||'').slice(0,1000),String(p.note||'').slice(0,500),p.active===false||p.active===0?0:1));
 await db().batch(statements);
}
if(process.env.INITIAL_PROFILES&&!(await pool.query('SELECT id FROM profiles LIMIT 1')).rowCount)await saveProfiles(JSON.parse(process.env.INITIAL_PROFILES));
const server=createServer(async(req,res)=>{
 try{
 const url=new URL(req.url||'/', 'http://indexer.local');
 if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:!stopping,worker:'nadscan',lastSuccess:lastSuccess||null}));return;}
 if(!authorized(req.headers.authorization||'')){res.writeHead(401);res.end('Unauthorized');return;}
 let response:Response;
 if(req.method==='GET'&&url.pathname==='/api/data')response=await data(new Request(url));
 else if(req.method==='GET'&&url.pathname==='/api/holdings')response=await holdings(new Request(url));
 else if(req.method==='POST'&&url.pathname==='/api/profiles'){
 let raw='';for await(const part of req){raw+=part.toString();if(Buffer.byteLength(raw)>262144)throw new Error('Request too large');}
 await saveProfiles(JSON.parse(raw).profiles);response=Response.json({ok:true});
 }else if(req.method==='GET'&&url.pathname==='/api/status'){
 const c=await config();response=Response.json({connected:!c.liveError&&Number(c.liveLastRun)>Date.now()/1000-90,chainId:143,block:Number(c.liveObservedHead)||null,background:true,lastRun:Number(c.liveLastRun)||null});
 }else{res.writeHead(404);res.end('Not found');return;}
 res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(await response.text());
 }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Indexer request failed. Please retry.'}));}
});
server.listen(Number(process.env.PORT)||10000,'0.0.0.0');
const loop=(async()=>{while(!stopping){let delay=1000;try{
 const active=await pool.query('SELECT id FROM profiles WHERE active=1 LIMIT 1');
 if(active.rowCount){const result=await onchainStep('auto');if('head' in result){lastSuccess=Math.floor(Date.now()/1000);console.log(JSON.stringify({event:'scan',...result}));}}else delay=10000;
 }catch(e){delay=20000;console.error(JSON.stringify({event:'scan_failed',message:String(e instanceof Error?e.message:'Provider failure').replace(/https?:\/\/\S+/g,'[provider]')}));}
 await sleep(delay);
}})();
async function shutdown(){if(stopping)return;stopping=true;server.close();await loop;await pool.end();}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
