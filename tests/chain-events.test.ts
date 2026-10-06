import test from 'node:test';import assert from 'node:assert/strict';import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem';import {protocolQuote} from '../lib/chain-events.ts';
const token='0x'+'a'.repeat(40),wallet='0x'+'b'.repeat(40),other='0x'+'c'.repeat(40);
function event(version:number,buy:boolean,amounts:[bigint,bigint],actor=wallet){
 const name=version===1?(buy?'CurveBuy':'CurveSell'):(buy?'Buy':'Sell');const signature=version===1?`event ${name}(address indexed sender,address indexed token,uint256 amountIn,uint256 amountOut)`:`event ${name}(address indexed token,address indexed ${buy?'buyer':'seller'},uint256 ${buy?'quoteIn':'tokenIn'},uint256 ${buy?'tokenOut':'quoteOut'})`;
 return {address:version===1?'0xa7283d07812a02afb7c09b60f8896bcea3f90ace':'0x9f3832732923252a21044f21ee6bd87f09514ae4',topics:(encodeEventTopics as any)({abi:parseAbi([signature] as any),eventName:name,args:version===1?{sender:actor,token}:{token,[buy?'buyer':'seller']:actor}}),data:encodeAbiParameters([{type:'uint256'},{type:'uint256'}],amounts)};
}
for(const v of [1,2])test(`V${v} confirmed event buys and sells reconcile wallet amounts`,()=>{
 assert.deepEqual(protocolQuote(event(v,true,[50n,100n]),token,wallet,100n),{side:'BUY',native:50n});
 assert.deepEqual(protocolQuote(event(v,false,[100n,70n]),token,wallet,-100n),{side:'SELL',native:70n});
 assert.equal(protocolQuote(event(v,true,[50n,100n],other),token,wallet,100n),null);
 assert.equal(protocolQuote(event(v,true,[50n,100n]),token,wallet,90n),null);
});
test('untrusted emitter cannot spoof a nad.fun trade',()=>{assert.equal(protocolQuote({...event(2,true,[1n,2n]),address:other},token,wallet,2n),null);});
