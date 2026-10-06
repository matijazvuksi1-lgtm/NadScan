export function scanRange(c:Record<string,string>){
 const requested=Number(c.chunk||100),limit=Number(c.rpcMaxLogRange);
 const size=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,5000000):100;
 return Number.isSafeInteger(limit)&&limit>0?Math.min(size,limit):size;
}
export function recentPageFinished(swaps:any[],page:number,total:number,since:number){
 return page*20>=total || swaps.some(s=>Number(s.swap_info?.created_at)<=since);
}
export function validateRpcResult(method:string,result:any){
 if(result===undefined)throw new Error('Monad provider returned no result. Scan progress was not advanced.');
 if(['eth_chainId','eth_blockNumber','eth_getBalance'].includes(method)&&!(typeof result==='string'&&/^0x[0-9a-f]+$/i.test(result)))throw new Error('Monad provider returned an invalid quantity.');
 if(method==='eth_getLogs'&&!Array.isArray(result))throw new Error('Monad provider returned an invalid log list.');
 return result;
}
