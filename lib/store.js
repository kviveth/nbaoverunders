// Key/value storage. On Vercel this is any Redis from the Vercel Marketplace:
// Upstash (REST env vars, possibly with a custom prefix) or a plain REDIS_URL.
// Locally, with no env vars, it falls back to a JSON file in .data/ so
// `npm run dev` works with no setup.
import { Redis } from '@upstash/redis';
import { createClient } from 'redis';
import fs from 'node:fs';
import path from 'node:path';

// Errors whose message is safe and useful to show the user as-is.
export class ConfigError extends Error {
  expose = true;
}

function envEndingWith(suffixes) {
  for (const [k, v] of Object.entries(process.env)) {
    for (const s of suffixes) if (v && k.endsWith(s)) return { key: k, prefix: k.slice(0, -s.length), value: v };
  }
  return null;
}

function upstashFromEnv() {
  const url = envEndingWith(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']);
  if (!url) return null;
  const token =
    process.env[`${url.prefix}KV_REST_API_TOKEN`] ||
    process.env[`${url.prefix}UPSTASH_REDIS_REST_TOKEN`] ||
    envEndingWith(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'])?.value;
  return token ? new Redis({ url: url.value, token }) : null;
}

// Same small interface over either client.
function wrapUpstash(r) {
  return {
    get: (k) => r.get(k),
    set: (k, v) => r.set(k, v),
    setNx: async (k, v, ms) => (await r.set(k, v, { nx: true, px: ms })) === 'OK',
    del: (k) => r.del(k),
  };
}

function wrapTcp(url) {
  const g = globalThis.__ouTcp || (globalThis.__ouTcp = {});
  const conn = () => {
    if (!g.client) {
      g.client = createClient({ url });
      g.client.on('error', (e) => console.error('redis', e));
      g.ready = g.client.connect().catch((e) => { g.client = null; throw e; });
    }
    return g.ready.then(() => g.client);
  };
  return {
    get: async (k) => { const s = await (await conn()).get(k); return s == null ? null : JSON.parse(s); },
    set: async (k, v) => (await conn()).set(k, JSON.stringify(v)),
    setNx: async (k, v, ms) => (await (await conn()).set(k, JSON.stringify(v), { NX: true, PX: ms })) === 'OK',
    del: async (k) => (await conn()).del(k),
  };
}

function pickBackend() {
  const up = upstashFromEnv();
  if (up) return wrapUpstash(up);
  const url = envEndingWith(['REDIS_URL', 'KV_URL']);
  if (url && /^rediss?:\/\//.test(url.value)) return wrapTcp(url.value);
  return null;
}

const db = pickBackend();
export const usingRedis = !!db;

const FILE = path.join(process.cwd(), '.data', 'store.json');
const mem = globalThis.__ouStore || (globalThis.__ouStore = { data: null, locks: {} });

function loadFile() {
  if (process.env.VERCEL) {
    throw new ConfigError('No database connected. In Vercel: Storage → Create Database → Upstash Redis (free) → connect it to this project, then Redeploy.');
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
  if (db) return (await db.get(key)) ?? null;
  const v = loadFile()[key];
  return v === undefined ? null : structuredClone(v);
}

export async function set(key, value) {
  if (db) return db.set(key, value);
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
    if (db) {
      ok = await db.setNx(key, id, 5000);
    } else {
      loadFile();
      const held = mem.locks[key];
      ok = !held || held.exp < Date.now();
      if (ok) mem.locks[key] = { id, exp: Date.now() + 5000 };
    }
    if (ok) {
      try {
        return await fn();
      } finally {
        if (db) {
          if ((await db.get(key)) === id) await db.del(key);
        } else if (mem.locks[key]?.id === id) {
          delete mem.locks[key];
        }
      }
    }
    await sleep(100);
  }
  throw new ConfigError('Server busy, try again');
}
