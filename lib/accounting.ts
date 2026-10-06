export type Trade={id:string;wallet:string;token:string;side:string;quantity:string;native:string;gas:string;time:number;block:number;tx:string;quality:string};
export function periodStart(period:string,now=Date.now()){if(period==='all')return 0;if(period==='30d')return Math.floor(now/1000)-30*86400;const d=new Date(now);d.setUTCHours(0,0,0,0);if(period==='week')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));if(period==='month')d.setUTCDate(1);return Math.floor(d.getTime()/1000);}
// Integer arithmetic in native base units; a win is a fully closed position cycle.
export function performance(trades:Trade[],transfers:any[],since:number){
 let realised=0n,volume=0n,wins=0,closed=0,excluded=0,matchedSells=0;const positions=new Map<string,any>();const saleResults:Record<string,{pnl:number|null;basis:number|null;roi:number|null}>={};
 const sorted=[...trades].sort((a,b)=>a.block-b.block||a.time-b.time||a.id.localeCompare(b.id));
 const tradeTx=new Set(trades.map(t=>t.tx+':'+t.token));
 const extra=transfers.filter(t=>!tradeTx.has(t.tx+':'+t.token));
 const events=[...sorted.map(t=>({...t,kind:'trade'})),...extra.map(t=>({...t,kind:'transfer',time:0}))].sort((a,b)=>a.block-b.block||((a.id||'').localeCompare(b.id||'')));
 const blockTransactions=new Map<string,Set<string>>();for(const e of events){const key=e.token+':'+e.block;const txs=blockTransactions.get(key)||new Set<string>();txs.add(e.tx);blockTransactions.set(key,txs);}
 for(const t of events){let p=positions.get(t.token);if(!p){p={quantity:0n,cost:0n,pnl:0n,known:true};positions.set(t.token,p);}if((blockTransactions.get(t.token+':'+t.block)?.size||0)>1)p.known=false;const qty=BigInt(t.quantity);if(qty<=0n)continue;
 if(t.kind==='transfer'){if(t.direction==='in')p.quantity+=qty;else p.quantity=p.quantity>qty?p.quantity-qty:0n;p.known=false;if(!p.quantity){p.cost=0n;p.pnl=0n;p.known=true;}continue;}
 const native=BigInt(t.native),gas=BigInt(t.gas);if(t.time>=since)volume+=native;
 if(t.side==='BUY'){p.quantity+=qty;p.cost+=native+gas;}
 else {saleResults[t.id]={pnl:null,basis:null,roi:null};if(qty>p.quantity||!p.known){if(t.time>=since)excluded++;p.known=false;}else{const basis=p.cost*qty/p.quantity;const pnl=native-gas-basis;saleResults[t.id]={pnl:formatNative(pnl),basis:formatNative(basis),roi:basis>0n?Number(pnl*10000n/basis)/100:null};p.cost-=basis;p.pnl+=pnl;if(t.time>=since){realised+=pnl;matchedSells++;}}
 p.quantity=p.quantity>qty?p.quantity-qty:0n;
 if(!p.quantity){if(p.known&&t.time>=since){closed++;if(p.pnl>0n)wins++;}p.cost=0n;p.pnl=0n;p.known=true;}}
 }
 return {saleResults,losses:closed-wins,matchedSells,realised:formatNative(realised),volume:formatNative(volume),wins,closed,winRate:closed?wins/closed*100:null,excluded,positions:[...positions.entries()].filter(([,p])=>p.quantity>0n).map(([token,p])=>({token,quantity:p.quantity.toString(),known:p.known,cost:formatNative(p.cost)}))};
}
export function formatNative(n:bigint){return Number(n/10000000000n)/100000000;}
