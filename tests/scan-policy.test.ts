import test from 'node:test';import assert from 'node:assert/strict';
import {scanRange,recentPageFinished,validateRpcResult} from '../lib/scan-policy.ts';
test('live ranges honor requested size and the provider plan cap',()=>{
 assert.equal(scanRange({chunk:'1000'}),1000);assert.equal(scanRange({chunk:'1000',rpcMaxLogRange:'10'}),10);
 for(const chunk of ['0','-1','NaN','1.5'])assert.equal(scanRange({chunk}),100);
});
test('recent history spans multiple pages until total or time boundary',()=>{
 const swaps=Array.from({length:20},()=>({swap_info:{created_at:200}}));
 assert.equal(recentPageFinished(swaps,1,60,100),false);
 assert.equal(recentPageFinished(swaps,3,60,100),true);
 assert.equal(recentPageFinished([{swap_info:{created_at:99}}],1,60,100),true);
});
test('malformed provider results never advance scan progress',()=>{
 assert.throws(()=>validateRpcResult('eth_blockNumber',undefined));
 assert.throws(()=>validateRpcResult('eth_blockNumber','not-a-block'));
 assert.throws(()=>validateRpcResult('eth_getLogs',null));
 assert.deepEqual(validateRpcResult('eth_getLogs',[]),[]);
 assert.equal(validateRpcResult('eth_getTransactionReceipt',null),null);
});
