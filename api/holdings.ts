import {db,config,setting,failure} from '../lib/store';import {rpc} from '../lib/indexer';import {ensureChainToken,tokenBalance} from '../lib/chain-token';
export async function GET(r:Request){try{
 const id=new URL(r.url).searchParams.get('id');const p=await db().prepare('SELECT wallet FROM profiles WHERE id=? AND active=1').bind(id).first<any>();if(!p)throw new Error('Trader not found.');
 const c=await config(),key='chainPortfolio:'+p.wallet,now=Math.floor(Date.now()/1000);const cached=c[key]?JSON.parse(c[key]):null;
 if(cached&&now-cached.updated<60)return Response.json(cached,{headers:{'Cache-Control':'no-store'}});
 const lease=String(now+120);const lock=await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(settings.value AS INTEGER)<? RETURNING value').bind('portfolioLock:'+p.wallet,lease,now).first();
 if(!lock)return Response.json(cached?{...cached,stale:true}:{holdings:[],loading:true});
 try{
 const block=await rpc('eth_blockNumber',[],c);const mon=Number(BigInt(await rpc('eth_getBalance',[p.wallet,block],c)))/1e18;
 const tokens=await db().prepare('SELECT token FROM wallet_tokens WHERE wallet=? UNION SELECT token FROM trades WHERE wallet=? UNION SELECT token FROM transfers WHERE wallet=? ORDER BY token').bind(p.wallet,p.wallet,p.wallet).all<any>();
 const offset=Number(c['balanceOffset:'+p.wallet]||0)%Math.max(tokens.results.length,1),selected=tokens.results.slice(offset,offset+6),entries=new Map<string,any>((cached?.holdings||[]).map((h:any)=>[h.token,h]));
 let checked=0;for(const {token} of selected){const info=await ensureChainToken(token,c);checked++;if(!info)continue;const balance=await tokenBalance(token,p.wallet,info.decimals,c,block);const meta=await db().prepare('SELECT image FROM tokens WHERE address=?').bind(token).first<any>();if(balance.raw==='0')entries.delete(token);else entries.set(token,{token,...info,...balance,image:meta?.image||'',updated:now,block:parseInt(block,16),priceUsd:null});}
 const holdings=[...entries.values()];const next=offset+checked>=tokens.results.length?0:offset+checked;await setting('balanceOffset:'+p.wallet,String(next));
 const snapshot={holdings,mon,totalTokens:holdings.length,discoveredTokens:tokens.results.length,checkedThisStep:checked,partial:true,refreshPending:next!==0,valueUsd:null,updated:now,source:'Monad balanceOf / eth_getBalance',stale:false};
 await setting(key,JSON.stringify(snapshot));return Response.json(snapshot,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json(cached?{...cached,stale:true,error:e instanceof Error?e.message:'Balance refresh failed'}:{holdings:[],unavailable:true,error:e instanceof Error?e.message:'Balances unavailable'});}
 finally{await db().prepare("UPDATE settings SET value='0' WHERE key=? AND value=?").bind('portfolioLock:'+p.wallet,lease).run();}
 }catch(e){return failure(e);}}
