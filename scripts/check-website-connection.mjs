import '../src/env.mjs';
import {testWebsiteConnection,closeWebsitePool} from '../src/website.mjs';
try{const result=await testWebsiteConnection({probeDraft:process.argv.includes('--probe-draft')});console.log(JSON.stringify(result));}
catch(error){console.error(error.message);process.exitCode=1;}
finally{await closeWebsitePool();}
