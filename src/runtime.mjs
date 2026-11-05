import {passwordConfigured,passwordSource} from './admin-auth.mjs';
import {sheetsConfiguration} from './sheets.mjs';
import {facebookConnectionMetadata} from './facebook-auth.mjs';
export const jobNames=['sync','ingest','approvals','process','comments','mirror','analytics'];
const defaults={sync:15,ingest:10,approvals:1,process:1,comments:1,mirror:2,analytics:360};
export function intervals(){return Object.fromEntries(jobNames.map(job=>{const value=Number(process.env[`${job.toUpperCase()}_INTERVAL_MINUTES`]||defaults[job]);return[job,Number.isInteger(value)&&value>=1&&value<=1440?value:defaults[job]];}));}
export function publicConfiguration(){
  const get=(key,fallback='')=>process.env[key]||fallback;
  return {facebookConnections:facebookConnectionMetadata(),metaAppConfigured:!!(get('META_APP_ID')&&get('META_APP_SECRET')),googleSheets:sheetsConfiguration(),n8nAPIKeyConfigured:!!get('N8N_API_KEY'),airtableBaseId:get('AIRTABLE_BASE_ID'),airtableTokenConfigured:!!get('AIRTABLE_TOKEN'),databaseConfigured:!!get('DATABASE_URL'),directDatabaseConfigured:!!get('DATABASE_URL_UNPOOLED'),passwordConfigured:passwordConfigured(),passwordSource:passwordSource(),dryRun:get('DRY_RUN')!=='false',pageConcurrency:Number(get('PAGE_CONCURRENCY','1')),feedConcurrency:Number(get('FEED_CONCURRENCY','4')),maxItemsPerFeed:Number(get('MAX_ITEMS_PER_FEED','5')),aiTimeoutMs:Number(get('AI_TIMEOUT_MS','300000')),articleTimeoutMs:Number(get('ARTICLE_TIMEOUT_MS','15000')),allowedAIHosts:get('ALLOWED_AI_HOSTS'),sourceHosts:get('ALLOWED_SOURCE_HOSTS'),semanticEnabled:get('SEMANTIC_ENABLED')==='true',embeddingURL:get('EMBEDDING_URL','http://localhost:11434/v1/embeddings'),embeddingModel:get('EMBEDDING_MODEL','embeddinggemma:latest'),embeddingTokenConfigured:!!get('EMBEDDING_TOKEN'),semanticThreshold:Number(get('SEMANTIC_THRESHOLD','0.95')),semanticTTLDays:Number(get('SEMANTIC_TTL_DAYS','7')),intervals:intervals(),n8nBaseURL:get('N8N_BASE_URL','http://localhost:5678')};
}
