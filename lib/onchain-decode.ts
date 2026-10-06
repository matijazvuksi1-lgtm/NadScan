import {keccak256,toBytes} from 'viem';
export const TRANSFER=keccak256(toBytes('Transfer(address,address,uint256)'));
export const V2_SWAP=keccak256(toBytes('Swap(address,uint256,uint256,uint256,uint256,address)'));
export const V3_SWAP=keccak256(toBytes('Swap(address,address,int256,int256,uint160,uint128,int24)'));
export const CURVE_BUY=keccak256(toBytes('CurveBuy(address,address,uint256,uint256)'));
export const CURVE_SELL=keccak256(toBytes('CurveSell(address,address,uint256,uint256)'));
export const WMON='0x3bd359c1119da7da1d913d1c4d2b7c461115433a';
export const CURVE='0xa7283d07812a02afb7c09b60f8896bcea3f90ace';
export const topic=(a:string)=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
export function tokenFlows(logs:any[],wallet:string){const result=new Map<string,bigint>();for(const l of logs){if(l.removed||l.topics?.[0]?.toLowerCase()!==TRANSFER||l.topics.length!==3)continue;const amount=BigInt(l.data);let net=0n;if(l.topics[2].toLowerCase()===topic(wallet))net+=amount;if(l.topics[1].toLowerCase()===topic(wallet))net-=amount;if(net)result.set(l.address.toLowerCase(),(result.get(l.address.toLowerCase())||0n)+net);}return result;}
const words=(data:string)=>{if(!/^0x([0-9a-fA-F]{64})+$/.test(data))throw new Error('Invalid swap data');return data.slice(2).match(/.{64}/g)!.map(x=>BigInt('0x'+x));};
const signed=(v:bigint)=>v>=2n**255n?v-2n**256n:v;
export function poolQuote(log:any,token:string,token0:string,token1:string,net:bigint){const pair=[token0.toLowerCase(),token1.toLowerCase()];if(!pair.includes(token)||!pair.includes(WMON))return null;const w=words(log.data);let a:bigint,b:bigint;if(log.topics[0]===V2_SWAP&&w.length>=4){a=w[0]-w[2];b=w[1]-w[3];}else if(log.topics[0]===V3_SWAP&&w.length>=5){a=signed(w[0]);b=signed(w[1]);}else return null;const tokenDelta=pair[0]===token?a:b,nativeDelta=pair[0]===WMON?a:b;if(net>0n&&tokenDelta<0n&&nativeDelta>0n)return {side:'BUY',native:nativeDelta};if(net<0n&&tokenDelta>0n&&nativeDelta<0n)return {side:'SELL',native:-nativeDelta};return null;}
export function curveQuote(log:any,token:string,net:bigint){if(![CURVE_BUY,CURVE_SELL].includes(log.topics?.[0])||log.address.toLowerCase()!==CURVE||log.topics?.[2]?.toLowerCase()!==topic(token))return null;const w=words(log.data);if(w.length!==2)return null;if(log.topics[0]===CURVE_BUY&&net>0n)return {side:'BUY',native:w[0]};if(log.topics[0]===CURVE_SELL&&net<0n)return {side:'SELL',native:w[1]};return null;}
