import { existsSync } from 'node:fs';
// Node's dotenv parser preserves quoted JSON and never prints secret values.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}
