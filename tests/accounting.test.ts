import test from 'node:test';import assert from 'node:assert/strict';import {performance,periodStart,type Trade} from '../lib/accounting.ts';
const unit=10n**18n;let seq=0;
function t(side:string,q:number,n:number,time=100,gas=0):Trade{seq++;return {id:String(seq).padStart(6,'0'),wallet:'w',token:'t',side,quantity:(BigInt(q)*unit).toString(),native:(BigInt(n)*unit).toString(),gas:(BigInt(gas)*unit).toString(),time,block:seq,tx:'tx'+seq,quality:'test'};}
test('partial sells realise cost proportionally; win counts only closed cycle',()=>{const a=[t('BUY',10,100),t('SELL',5,70)];let p=performance(a,[],0);assert.equal(p.realised,20);assert.equal(p.closed,0);p=performance([...a,t('SELL',5,20)],[],0);assert.equal(p.realised,-10);assert.equal(p.wins,0);assert.equal(p.closed,1);assert.equal(p.winRate,0);});
test('buys before period remain in basis; fees affect win',()=>{const p=performance([t('BUY',10,100,10,1),t('SELL',10,110,100,1)],[],50);assert.equal(p.realised,8);assert.equal(p.volume,110);assert.equal(p.winRate,100);});
test('unknown transferred inventory never becomes free profit',()=>{const a=t('SELL',10,50);const p=performance([a],[{id:'x',wallet:'w',token:'t',direction:'in',quantity:String(10n*unit),block:0,tx:'other'}],0);assert.equal(p.realised,0);assert.equal(p.closed,0);assert.equal(p.excluded,1);});
test('ordinary trade transfers are not counted twice',()=>{const a=t('BUY',10,100),b=t('SELL',10,120);const p=performance([a,b],[{id:'x',token:'t',direction:'in',quantity:String(10n*unit),block:a.block,tx:a.tx}],0);assert.equal(p.realised,20);assert.equal(p.closed,1);});
test('unmatched sale excluded',()=>{const p=performance([t('SELL',10,100)],[],0);assert.equal(p.realised,0);assert.equal(p.closed,0);});
test('UTC boundaries',()=>{const now=Date.parse('2026-10-02T23:42:00Z');assert.equal(periodStart('day',now),Date.parse('2026-10-02T00:00Z')/1000);assert.equal(periodStart('week',now),Date.parse('2026-09-28T00:00Z')/1000);assert.equal(periodStart('month',now),Date.parse('2026-10-01T00:00Z')/1000);});

test('rolling 30 days includes September trades across October boundary',()=>{const now=Date.parse('2026-10-02T12:00:00Z');assert.equal(periodStart('30d',now),Math.floor(now/1000)-30*86400);assert.equal(periodStart('all',now),0);assert(periodStart('30d',now)<Date.parse('2026-09-11T12:00:00Z')/1000);});

test('provisional PnL requires matched cost basis and counts partial sells separately from wins',()=>{const p=performance([t('BUY',10,100),t('SELL',3,45)],[],0);assert.equal(p.matchedSells,1);assert.equal(p.realised,15);assert.equal(p.winRate,null);const unmatched=performance([t('SELL',5,80)],[],0);assert.equal(unmatched.matchedSells,0);assert.equal(unmatched.excluded,1);assert.equal(unmatched.winRate,null);});

test('a transfer of another token in an imported swap transaction still invalidates its basis',()=>{
 const buy=t('BUY',10,100);const sell=t('SELL',10,150);sell.token='gift';
 const p=performance([buy,sell],[{id:'gift-transfer',token:'gift',direction:'in',quantity:String(10n*unit),block:buy.block,tx:buy.tx}],0);
 assert.equal(p.excluded,1);assert.equal(p.realised,0);assert.equal(p.closed,0);
});
test('same-block trades with unknown transaction order cannot invent a winning cycle',()=>{
 const buy=t('BUY',10,100),sell=t('SELL',10,150);sell.block=buy.block;
 const p=performance([buy,sell],[],0);assert.equal(p.winRate,null);assert.equal(p.realised,0);assert.equal(p.excluded,1);
});

test('per-sale PnL includes proportional basis and gas without inventing unmatched profits',()=>{
 const buy=t('BUY',10,100,10,2),sell=t('SELL',5,70,100,1),unknown=t('SELL',1,20);unknown.token='unknown';
 const p=performance([buy,sell,unknown],[],50);
 assert.deepEqual(p.saleResults[sell.id],{pnl:18,basis:51,roi:35.29});
 assert.deepEqual(p.saleResults[unknown.id],{pnl:null,basis:null,roi:null});
 assert.equal(p.winRate,null);
});
