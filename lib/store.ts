import pg from 'pg';
pg.types.setTypeParser(20, value => Number(value));
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000,statement_timeout:20000});
// Adapter for the fixed, parameterized SQL used by the shared onchain engine.
export function postgresSql(sql:string){
 let i=0;const ignore=/^INSERT OR IGNORE /i.test(sql);
 sql=sql.replace(/^INSERT OR IGNORE /i,'INSERT ').replace(/\bAS INTEGER\b/g,'AS BIGINT').replace(/\bMAX\(CAST\(settings.value/g,'GREATEST(CAST(settings.value');
 sql=sql.replace(/\?/g,()=>'$'+(++i));
 if(ignore)sql+=' ON CONFLICT DO NOTHING';return sql;
}
function statement(sql:string,values:any[]=[]){return {sql:postgresSql(sql),values,bind(...args:any[]){return statement(sql,args);},async first<T>(){return (await pool.query(this.sql,this.values)).rows[0] as T||null;},async all<T>(){return {results:(await pool.query(this.sql,this.values)).rows as T[]};},async run(){return pool.query(this.sql,this.values);}};}
export function db(){return {prepare:statement,async batch(statements:ReturnType<typeof statement>[]){const client=await pool.connect();try{await client.query('BEGIN');const result=[];for(const s of statements)result.push(await client.query(s.sql,s.values));await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}};}
export async function config(){const result=await pool.query('SELECT key,value FROM settings');const c:Record<string,string>=Object.fromEntries(result.rows.map(x=>[x.key,x.value]));if(process.env.MONAD_RPC_URL&&!c.rpcOverride)c.rpcUrl=process.env.MONAD_RPC_URL;return c;}
export async function setting(key:string,value:string){await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,value]);}
export function failure(e:unknown){return Response.json({error:e instanceof Error?e.message:'Request failed'},{status:400});}
