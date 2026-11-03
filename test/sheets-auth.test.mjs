import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {testSheet} from '../src/sheets.mjs';
test('Sheets adapter signs a scoped service-account JWT and exchanges it for a server-side token',async()=>{
  const saved={...process.env},originalFetch=globalThis.fetch;
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({type:'service_account',client_email:'test@echo-test.iam.gserviceaccount.com',private_key:keys.privateKey});
  process.env.GOOGLE_SHEET_ID='example_spreadsheet_12345';let exchanges=0;
  globalThis.fetch=async(url,options)=>{
    if(String(url)==='https://oauth2.googleapis.com/token'){
      exchanges++;const body=new URLSearchParams(options.body),parts=body.get('assertion').split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
      assert.equal(body.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer');
      assert.equal(claims.scope,'https://www.googleapis.com/auth/spreadsheets');assert.equal(claims.aud,'https://oauth2.googleapis.com/token');
      assert.equal(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),keys.publicKey,Buffer.from(parts[2],'base64url')),true);
      return Response.json({access_token:'test-server-side-token',expires_in:3600});
    }
    assert.equal(new URL(url).hostname,'sheets.googleapis.com');assert.equal(options.headers.Authorization,'Bearer test-server-side-token');
    return Response.json({spreadsheetId:process.env.GOOGLE_SHEET_ID,properties:{title:'EchoLink log'},sheets:[{properties:{title:'EchoLink Posts'}}]});
  };
  try{const result=await testSheet();assert.equal(result.title,'EchoLink log');assert.equal(JSON.stringify(result).includes(keys.privateKey),false);await testSheet();assert.equal(exchanges,1);}
  finally{globalThis.fetch=originalFetch;for(const key of ['GOOGLE_SERVICE_ACCOUNT_JSON','GOOGLE_SHEET_ID'])if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});
