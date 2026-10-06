import {decodeEventLog} from 'viem';import v1 from './abi/nad-v1.json' with {type:'json'};import v2 from './abi/nad-v2.json' with {type:'json'};
const C1='0xa7283d07812a02afb7c09b60f8896bcea3f90ace',C2='0x9f3832732923252a21044f21ee6bd87f09514ae4';
export function protocolQuote(log:any,token:string,wallet:string,net:bigint){
 const version=log.address?.toLowerCase()===C1?1:log.address?.toLowerCase()===C2?2:0;if(!version)return null;
 try{const event:any=decodeEventLog({abi:version===1?v1:v2,data:log.data,topics:log.topics,strict:true});const a=event.args;
 if(a.token?.toLowerCase()!==token)return null;
 if(version===1){if(a.sender?.toLowerCase()!==wallet)return null;if(event.eventName==='CurveBuy'&&net>0n&&a.amountOut===net)return {side:'BUY',native:a.amountIn as bigint};if(event.eventName==='CurveSell'&&net<0n&&a.amountIn===-net)return {side:'SELL',native:a.amountOut as bigint};}
 else {if(event.eventName==='Buy'&&a.buyer?.toLowerCase()===wallet&&net>0n&&a.tokenOut===net)return {side:'BUY',native:a.quoteIn as bigint};if(event.eventName==='Sell'&&a.seller?.toLowerCase()===wallet&&net<0n&&a.tokenIn===-net)return {side:'SELL',native:a.quoteOut as bigint};}
 return null;
 }catch{return null;}
}
