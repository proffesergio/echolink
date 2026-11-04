import {cosine,hash} from './core.mjs';
import {query} from './db.mjs';
import {jsonRequest} from './net.mjs';
export class SemanticError extends Error{}

// A versioned lead representation avoids mixing old vectors, prompt formats or
// providers. This is story similarity, not a factual-verification service.
export function semanticInput(article,model=''){
  const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
  const text=`${clean(String(article.title||'').slice(0,180))}\n${clean(String(article.body||'').slice(0,900))}`;
  return /embeddinggemma/i.test(model)?`task: sentence similarity | query: ${text}`:text;
}
export function semanticConfiguration(env=process.env){
  const url=env.EMBEDDING_URL||'http://localhost:11434/v1/embeddings',model=env.EMBEDDING_MODEL||'embeddinggemma:latest';
  const days=Number(env.SEMANTIC_TTL_DAYS||7),threshold=Number(env.SEMANTIC_THRESHOLD||0.95),timeoutMs=Number(env.AI_TIMEOUT_MS||300000);
  if(!Number.isInteger(days)||days<1||days>30||!Number.isFinite(threshold)||threshold<=0||threshold>1)throw new Error('Invalid semantic threshold or memory window');
  const endpoint=new URL(url);if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password)throw new Error('Invalid embedding endpoint');
  if(!model.trim()||!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>600000)throw new Error('Invalid embedding model or timeout');
  return {enabled:env.SEMANTIC_ENABLED==='true',url,model,days,threshold,timeoutMs,profile:`lead-v1:${hash(`${url}|${model}|sentence-similarity|180|900`)}`};
}
export async function embedArticles(articles,{env=process.env,fetcher=jsonRequest}={}){
  if(!Array.isArray(articles)||!articles.length||articles.length>8)throw new Error('Embed between one and eight articles per batch');
  const c=semanticConfiguration(env),input=articles.map(article=>semanticInput(article,c.model));
  const response=await fetcher(c.url,{method:'POST',headers:{'Content-Type':'application/json',...(env.EMBEDDING_TOKEN?{Authorization:`Bearer ${env.EMBEDDING_TOKEN}`}:{})},body:JSON.stringify({model:c.model,input})},{hosts:hostListFrom(env.ALLOWED_AI_HOSTS),local:true,timeoutMs:c.timeoutMs});
  if(!Array.isArray(response.data)||response.data.length!==articles.length)throw new Error('Embedding provider returned the wrong number of vectors');
  const vectors=new Array(articles.length);
  for(const row of response.data){
    const index=row.index??(articles.length===1?0:undefined),vector=row.embedding;
    if(!Number.isInteger(index)||index<0||index>=articles.length||vectors[index]||!Array.isArray(vector)||!vector.length||vector.length>8192)throw new Error('Invalid embedding response index or dimensions');
    cosine(vector,vector);vectors[index]=vector;
  }
  if(vectors.some(vector=>vector.length!==vectors[0].length))throw new Error('Incompatible embedding dimensions in batch');
  return vectors;
}
const hostListFrom=value=>String(value||'').split(',').map(host=>host.trim()).filter(Boolean);
async function articleVector(article,pageId,{env,db,fetcher},profile){
  const cacheKey=`${profile}:${hash(semanticInput(article,semanticConfiguration(env).model))}`;
  const existing=(await db('SELECT vector,vector_model FROM echolink.articles WHERE id=$1 AND page_id=$2',[article.id,pageId])).rows[0];
  if(!existing)throw new Error('Semantic article is missing from this Page');
  if(existing.vector_model===cacheKey&&Array.isArray(existing.vector)){cosine(existing.vector,existing.vector);return existing.vector;}
  const [vector]=await embedArticles([article],{env,fetcher});
  const saved=await db(`UPDATE echolink.articles SET vector=$3::jsonb,vector_model=$4,dirty=true,updated_at=now()
    WHERE id=$1 AND page_id=$2 AND title=$5 AND left(body,900)=$6`,[article.id,pageId,JSON.stringify(vector),cacheKey,article.title,article.body.slice(0,900)]);
  if(!saved.rowCount)throw new SemanticError('Source changed during embedding; retry the semantic check before publishing');
  return vector;
}
export async function findSemanticDuplicate(page,article,{env=process.env,db=query,fetcher=jsonRequest}={}){
  if(env.SEMANTIC_ENABLED!=='true')return null;
  try{
  const c=semanticConfiguration(env),dependencies={env,db,fetcher};
  // Publication time, rather than ingestion time, keeps an old queued article
  // in memory when it was posted recently. Unpublished drafts never suppress it.
  const candidates=(await db(`SELECT id,title,left(body,900) AS body,status,published_at FROM echolink.articles
    WHERE page_id=$1 AND id<>$2 AND status IN ('Posted','Publishing','Publish Unknown')
      AND COALESCE(published_at,updated_at)>now()-($3::int*interval '1 day')
    ORDER BY COALESCE(published_at,updated_at) DESC,id LIMIT 1001`,[page.id,article.id,c.days])).rows;
  if(candidates.length>1000)throw new SemanticError('Semantic history exceeds 1000 articles in this Page window; shorten the memory window before retrying');
  const vector=await articleVector(article,page.id,dependencies,c.profile);
  let best=null;
  for(const candidate of candidates){
    const other=await articleVector(candidate,page.id,dependencies,c.profile),score=cosine(vector,other);
    if(score>=c.threshold&&(!best||score>best.score))best={id:candidate.id,title:candidate.title,status:candidate.status,score};
  }
  return best;
  }catch(error){
    if(error instanceof SemanticError)throw error;
    throw new SemanticError('Semantic duplicate check failed. Verify the embedding connection, model and memory window before retrying; no post was sent.');
  }
}
