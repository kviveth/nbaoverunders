// Key/value storage. On Vercel this is Upstash Redis (free tier, added from the
// Vercel Marketplace, which injects the env vars). Locally, with no env vars,
// it falls back to a JSON file in .data/ so `npm run dev` works with no setup.
import { Redis } from '@upstash/redis';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const usingRedis = !!redis;

const FILE = path.join(process.cwd(), '.data', 'store.json');
const mem = globalThis.__ouStore || (globalThis.__ouStore = { data: null, locks: {} });

function loadFile() {
  if (process.env.VERCEL) {
    throw new Error('No database connected: add Upstash Redis to this project in Vercel (Storage tab), then redeploy.');
  }
  if (mem.data) return mem.data;
  try {
    mem.data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    mem.data = {};
  }
  return mem.data;
}

function saveFile() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(mem.data));
}

export async function get(key) {
  if (redis) return (await redis.get(key)) ?? null;
  const v = loadFile()[key];
  return v === undefined ? null : structuredClone(v);
}

export async function set(key, value) {
  if (redis) return redis.set(key, value);
  loadFile()[key] = structuredClone(value);
  saveFile();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Serializes writes to one room so two people clicking the same pick at the
// same moment can't both get it.
export async function withLock(name, fn) {
  const key = `lock:${name}`;
  const id = Math.random().toString(36).slice(2);
  for (let i = 0; i < 50; i++) {
    let ok;
    if (redis) {
      ok = await redis.set(key, id, { nx: true, px: 5000 });
    } else {
      const held = mem.locks[key];
      ok = !held || held.exp < Date.now();
      if (ok) mem.locks[key] = { id, exp: Date.now() + 5000 };
    }
    if (ok) {
      try {
        return await fn();
      } finally {
        if (redis) {
          if ((await redis.get(key)) === id) await redis.del(key);
        } else if (mem.locks[key]?.id === id) {
          delete mem.locks[key];
        }
      }
    }
    await sleep(100);
  }
  throw new Error('Server busy, try again');
}
