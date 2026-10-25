import { usingRedis } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Setup check: shows whether a database is connected and which database-looking
// env var NAMES exist (never their values).
export function GET() {
  const names = Object.keys(process.env).filter((k) => /REDIS|KV_|UPSTASH/i.test(k)).sort();
  return Response.json({ database: usingRedis ? 'connected' : 'NOT connected', envVarNames: names });
}
