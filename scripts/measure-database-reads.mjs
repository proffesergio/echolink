// Representative synthetic rows in a temporary local table, always rolled back.
import {databaseSettings} from './configure-databases.mjs';
import pg from '../platform/node_modules/pg/lib/index.js';
import {postListColumns} from '../platform/server/read-model.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const s=await databaseSettings(),db=new pg.Client({connectionString:s.local.LOCAL_POSTGRES_TEST_URL_UNPOOLED});await db.connect();
try{await db.query('BEGIN');await db.query('CREATE TEMP TABLE measured_posts AS SELECT * FROM creator.posts WITH NO DATA');
 const facts='Representative private source evidence. '.repeat(650),research={sources:Array.from({length:3},()=>({url:'https://example.com/story',title:'Verified source headline',excerpt:facts}))};
 await db.query("INSERT INTO measured_posts(id,title,body,caption,seo,creative) SELECT gen_random_uuid(),'Representative headline',$1,'A complete display caption with facts.',jsonb_build_object('research',$2::jsonb,'category','world'),'{}'::jsonb FROM generate_series(1,40)",[facts,research]);
 const original=(await db.query('SELECT * FROM measured_posts')).rows,compact=(await db.query('SELECT '+postListColumns+' FROM measured_posts')).rows;
 const bytes=value=>Buffer.byteLength(JSON.stringify(value)),result={fixture:'40 synthetic articles, each with source body and three research excerpts',originalBytes:bytes(original),compactBytes:bytes(compact),reductionPercent:Math.round((1-bytes(compact)/bytes(original))*1000)/10,fullDetailUnchanged:original[0].body===facts,storedBodyCharacters:facts.length,listBodyCharacters:compact[0].body.length,note:'JSON row sizes from local PostgreSQL, not measured Neon billable network bytes.'};
 await mkdir('platform/.local/verification/databases',{recursive:true});await writeFile('platform/.local/verification/databases/response-size.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await db.query('ROLLBACK');
}finally{await db.end();}
