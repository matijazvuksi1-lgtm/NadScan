import {db,setting} from './store';
import {rpc} from './indexer';
const hex=(n:number)=>'0x'+n.toString(16);
// Provider results discover transaction hashes only. Receipt verification classifies trades.
export async function discoverTransfers(profile:{id:string,wallet:string},head:number,c:Record<string,string>){
 if(!/\.g\.alchemy\.com\//.test(c.rpcUrl||''))return;
 const prefix='alchemyDiscovery:'+profile.id+':';
 const pending=await db().prepare("SELECT COUNT(*) AS n FROM chain_jobs WHERE wallet=? AND status='pending'").bind(profile.wallet).first<any>();
 if(Number(pending?.n)>30)return;
 const initial=c[prefix+'initialized']!=='1';
 const kind=initial?'history':'recent';
 const targetKey=prefix+kind+':target';
 const target=c[targetKey]?Number(c[targetKey]):head;
 const from=initial?0:Number(c[prefix+'recentNext']||head+1);
 if(!initial&&from>head)return;
 if(!c[targetKey])await setting(targetKey,String(target));
 let finished=true;
 for(const direction of ['fromAddress','toAddress']){
 const key=prefix+kind+':'+direction;
 const page=c[key]||'';if(page==='done')continue;
 const result=await rpc('alchemy_getAssetTransfers',[{fromBlock:hex(from),toBlock:hex(target),[direction]:profile.wallet,category:['erc20'],excludeZeroValue:true,order:'desc',maxCount:'0x64',...(page?{pageKey:page}:{})}],c);
 if(!result||!Array.isArray(result.transfers)||result.pageKey!==undefined&&typeof result.pageKey!=='string')throw new Error('Invalid Alchemy transfer history response. Progress retained.');
 const jobs=new Map<string,number>();
 for(const t of result.transfers){const block=Number.parseInt(t.blockNum,16);if(!/^0x[0-9a-f]{64}$/i.test(t.hash)||!Number.isSafeInteger(block)||block<from||block>target)throw new Error('Invalid transfer history transaction. Progress retained.');jobs.set(t.hash,block);}
 await db().batch([...jobs].map(([tx,block])=>db().prepare('INSERT OR IGNORE INTO chain_jobs(id,wallet,tx,block) VALUES(?,?,?,?)').bind(profile.wallet+':'+tx,profile.wallet,tx,block)));
 await setting(key,result.pageKey||'done');
 if(result.pageKey)finished=false;
 }
 if(finished){
 await setting(prefix+'recentNext',String(target+1));
 if(initial)await setting(prefix+'initialized','1');
 await setting(targetKey,'');
 for(const direction of ['fromAddress','toAddress'])await setting(prefix+kind+':'+direction,'');
 }
}
