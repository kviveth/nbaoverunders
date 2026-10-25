// Free live data: ESPN standings (records) and Polymarket win-total markets
// (live prices). Both are cached in the store so a room full of people polling
// only hits the upstream every few minutes.
import { get, set } from './store.js';
import { TEAMS } from './teams.js';

const STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const POLY_URL = 'https://gamma-api.polymarket.com/events?slug=nba-2026-27-regular-season-win-totals';

const STANDINGS_TTL = 15 * 60 * 1000;
const POLY_TTL = 5 * 60 * 1000;

const mem = globalThis.__ouFeeds || (globalThis.__ouFeeds = {});

async function cached(key, ttl, fetcher) {
  const now = Date.now();
  const hot = mem[key];
  if (hot && now - hot.fetchedAt < Math.min(ttl, 60_000)) return hot;
  let doc = await get(`feed:${key}`);
  if (!doc || now - doc.fetchedAt > ttl) {
    try {
      doc = { fetchedAt: now, data: await fetcher() };
      await set(`feed:${key}`, doc);
    } catch (e) {
      console.error(`feed ${key} failed`, e);
      if (!doc) doc = { fetchedAt: 0, data: {}, error: String(e) };
    }
  }
  mem[key] = doc;
  return doc;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

export function parseStandings(json) {
  const out = {};
  for (const conf of json.children || []) {
    for (const e of conf.standings?.entries || []) {
      const stat = (n) => e.stats.find((s) => s.name === n)?.value ?? 0;
      out[e.team.id] = { w: stat('wins'), l: stat('losses') };
    }
  }
  return out;
}

export async function getStandings() {
  return cached('standings', STANDINGS_TTL, async () => parseStandings(await fetchJson(STANDINGS_URL)));
}

// Polymarket: one O/U market per team. Markets nobody has traded sit at a
// placeholder 50/50, so those are ignored rather than read as "coin flip".
export function parsePolymarket(json) {
  const ev = Array.isArray(json) ? json[0] : json;
  const out = {};
  for (const m of ev?.markets || []) {
    const team = TEAMS.find((t) => m.groupItemTitle?.endsWith(t.name));
    const line = Number(/O\/U\s*([\d.]+)/.exec(m.question || '')?.[1]);
    let prices;
    try {
      prices = JSON.parse(m.outcomePrices).map(Number);
    } catch {
      continue;
    }
    const volume = Number(m.volume) || 0;
    if (!team || !line || m.closed || volume <= 0) continue;
    out[team.id] = { line, pOver: prices[0], volume };
  }
  return out;
}

export async function getPolymarket() {
  return cached('poly', POLY_TTL, async () => parsePolymarket(await fetchJson(POLY_URL)));
}
