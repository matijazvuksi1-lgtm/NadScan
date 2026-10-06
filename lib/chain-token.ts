import {decodeFunctionResult,encodeFunctionData,parseAbi,formatUnits} from 'viem';
import v1Abi from './abi/nad-v1.json';import v2Abi from './abi/nad-v2.json';
import {rpc} from './indexer';import {db,setting} from './store';
export const CURVE_V1='0xa7283d07812a02afb7c09b60f8896bcea3f90ace';
export const CURVE_V2='0x9f3832732923252a21044f21ee6bd87f09514ae4';
const erc20=parseAbi(['function name() view returns (string)','function symbol() view returns (string)','function decimals() view returns (uint8)','function balanceOf(address) view returns (uint256)','function tokenURI() view returns (string)']);
export async function readContract(to:string,abi:any,name:string,args:any[],c:Record<string,string>,block='latest'){
 const data=encodeFunctionData({abi,functionName:name,args});const value=await rpc('eth_call',[{to,data},block],c);
 return decodeFunctionResult({abi,functionName:name,data:value});
}
const contractError=(e:unknown)=>/revert|execution error|could not decode|zero data|size of data/i.test(e instanceof Error?e.message:'');
async function optionalRead(to:string,abi:any,name:string,args:any[],c:Record<string,string>){try{return await readContract(to,abi,name,args,c);}catch(e){if(contractError(e))return null;throw e;}}
export async function ensureChainToken(token:string,c:Record<string,string>){
 const key='chainToken:'+token;if(c[key])return JSON.parse(c[key]);
 // Registry state from the official contracts, never from an API response or address suffix.
 const curve:any=await optionalRead(CURVE_V2,v2Abi,'getCurve',[token],c);
 let version=0,quote='';if(curve?.token?.toLowerCase()===token){version=2;quote=curve.quoteToken.toLowerCase();}
 if(!version){const created=await optionalRead(CURVE_V1,v1Abi,'createdAt',[token],c);if(created&&BigInt(created as any)>0n){version=1;quote='0x3bd359c1119da7da1d913d1c4d2b7c461115433a';}}
 if(!version)return null;
 const old=await db().prepare('SELECT * FROM tokens WHERE address=?').bind(token).first<any>();
 const name=old?.name||await optionalRead(token,erc20,'name',[],c)||token.slice(0,10);
 const symbol=old?.symbol||await optionalRead(token,erc20,'symbol',[],c)||token.slice(0,8);
 const decimals=await optionalRead(token,erc20,'decimals',[],c);if(decimals===null||Number(decimals)>255)throw new Error('Token decimals unavailable; balance not guessed.');
 const info={version,quote,decimals:Number(decimals),name:String(name).slice(0,120),symbol:String(symbol).slice(0,40)};
 await db().prepare('INSERT INTO tokens(address,symbol,name,image,valid) VALUES(?,?,?,?,1) ON CONFLICT(address) DO UPDATE SET symbol=excluded.symbol,name=excluded.name,valid=1').bind(token,info.symbol,info.name,old?.image||'').run();
 c[key]=JSON.stringify(info);await setting(key,c[key]);return info;
}
export async function tokenBalance(token:string,wallet:string,decimals:number,c:Record<string,string>,block:string){
 const raw=await readContract(token,erc20,'balanceOf',[wallet],c,block) as bigint;return {raw:raw.toString(),quantity:Number(formatUnits(raw,decimals))};
}
