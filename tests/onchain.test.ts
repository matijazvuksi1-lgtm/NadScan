import {test} from 'node:test';
import assert from 'node:assert/strict';
import {poolQuote,tokenFlows,topic,TRANSFER,V2_SWAP,V3_SWAP,WMON} from '../lib/onchain-decode.ts';
const token='0x'+'a'.repeat(40),wallet='0x'+'b'.repeat(40),other='0x'+'c'.repeat(40);
const data=(xs:bigint[])=>'0x'+xs.map(x=>(x<0?2n**256n+x:x).toString(16).padStart(64,'0')).join('');
test('V2 buys and sells use WMON pool direction',()=>{assert.deepEqual(poolQuote({topics:[V2_SWAP],data:data([0n,50n,100n,0n])},token,token,WMON,99n),{side:'BUY',native:50n});assert.deepEqual(poolQuote({topics:[V2_SWAP],data:data([100n,0n,0n,40n])},token,token,WMON,-100n),{side:'SELL',native:40n});});
test('V3 signed values and reversed pair order',()=>{assert.deepEqual(poolQuote({topics:[V3_SWAP],data:data([-40n,100n,1n,1n,1n])},token,WMON,token,-100n),{side:'SELL',native:40n});});
test('non MON pairs and conflicting wallet direction are excluded',()=>{assert.equal(poolQuote({topics:[V2_SWAP],data:data([0n,50n,100n,0n])},token,token,other,100n),null);assert.equal(poolQuote({topics:[V2_SWAP],data:data([0n,50n,100n,0n])},token,token,WMON,-100n),null);});
test('wallet flows use net receipts and ignore NFT transfers',()=>{const log=(from:string,to:string,n:bigint)=>({address:token,topics:[TRANSFER,topic(from),topic(to)],data:data([n])});assert.equal(tokenFlows([log(other,wallet,100n),log(wallet,other,1n),log(wallet,wallet,20n),{...log(other,wallet,50n),topics:[TRANSFER,topic(other),topic(wallet),topic(token)]}],wallet).get(token),99n);});
