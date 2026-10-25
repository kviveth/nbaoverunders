import crypto from 'node:crypto';
import { del, get, set, withLock } from './store.js';
import { getStandings, getPolymarket } from './feeds.js';
import {
  ActionError, applyAction, autoPickDue, newRoom, onClock, picksUntilNext, scoreboard, snapshotDue,
  suggestions, takeSnapshot, teamTable, tick, totalPicks,
} from './engine.js';
import { SEED_LINES_AS_OF, seedLines } from './teams.js';

const key = (code) => `room:${code.toUpperCase()}`;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newId = () => crypto.randomBytes(6).toString('base64url');
const pinHash = (code, pin) => sha(`${code.toUpperCase()}:${pin}`);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export { ActionError };

function cleanName(name) {
  const n = String(name || '').trim().slice(0, 24);
  if (!n) throw new ActionError('Enter a display name');
  return n;
}

function cleanPin(pin) {
  const p = String(pin || '').trim();
  if (!/^\d{4,8}$/.test(p)) throw new ActionError('PIN must be 4–8 digits');
  return p;
}

// Each player can stay signed in on a few devices at once (phone + laptop...).
const MAX_DEVICES = 5;

function issueToken(player) {
  const token = crypto.randomBytes(24).toString('base64url');
  player.tokens = [sha(token), ...(player.tokens || [])].slice(0, MAX_DEVICES);
  delete player.tokenHash;
  return token;
}

// ---------- league directory (public list for the home page) ----------

const INDEX = 'rooms:index';

export async function listRooms() {
  return ((await get(INDEX)) || []).sort((a, b) => !!a.test - !!b.test || b.createdAt - a.createdAt);
}

async function updateIndex(code, entry) {
  await withLock('index', async () => {
    const list = ((await get(INDEX)) || []).filter((r) => r.code !== code);
    if (entry) list.push(entry);
    await set(INDEX, list);
  });
}

const indexEntry = (room) => ({ code: room.code, name: room.name, season: room.season, test: !!room.test, createdAt: room.createdAt });

// ---------- create / join / log in ----------

const BOT_NAMES = ['Bot Ace', 'Bot Buckets', 'Bot Chef', 'Bot Dunk', 'Bot Euro', 'Bot Fadeaway', 'Bot Glass', 'Bot Hook', 'Bot Iso', 'Bot Jumper', 'Bot Kobe', 'Bot Lob', 'Bot Mamba', 'Bot Nothing-but-net'];

export async function createRoom({ name, commishName, pin, playing = true, test = false, bots = 0 }) {
  cleanPin(pin);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  for (let i = 0; i < 20; i++) {
    code = Array.from(crypto.randomBytes(5), (b) => alphabet[b % alphabet.length]).join('');
    if (!(await get(key(code)))) break;
  }
  const commishId = newId();
  const room = newRoom({
    code, name: String(name || 'O/U Draft').slice(0, 60), commishId, commishName: cleanName(commishName),
    pinHash: pinHash(code, pin), tokenHash: null, playing, test: !!test,
  });
  if (test) {
    const n = Math.max(1, Math.min(BOT_NAMES.length, Math.round(Number(bots) || 5)));
    for (const botName of BOT_NAMES.slice(0, n)) {
      const id = newId();
      room.players.push({ id, name: botName, pinHash: null, tokenHash: null, bot: true });
      room.order.push(id);
    }
    room.settings.pickSeconds = 60;
  }
  const token = issueToken(room.players[0]);
  await set(key(code), room);
  await updateIndex(code, indexEntry(room));
  return { code, token };
}

// Log back in to a league you're already in (score checker / commissioner login).
// A player whose PIN was reset, or who was added by the commissioner, sets their PIN here.
export async function loginRoom(code, { name, pin, commish = false }) {
  name = cleanName(name);
  pin = cleanPin(pin);
  return withLock(code, async () => {
    const room = await get(key(code));
    if (!room) throw new ActionError('League not found');
    const p = room.players.find((x) => !x.bot && x.name.toLowerCase() === name.toLowerCase());
    if (!p) throw new ActionError(`No player named "${name}" in ${room.name}`);
    if (p.pinHash && p.pinHash !== pinHash(code, pin)) throw new ActionError('Wrong PIN');
    if (commish && !p.isCommish) throw new ActionError(`${p.name} isn't the commissioner of ${room.name}`);
    p.pinHash ||= pinHash(code, pin);
    const token = issueToken(p);
    room.version++;
    await set(key(code), room);
    return { token, code: room.code };
  });
}

export async function deleteRoom(code, token) {
  await withLock(code, async () => {
    const room = await get(key(code));
    if (!room) throw new ActionError('League not found');
    if (!actorFor(room, token)?.isCommish) throw new ActionError('Only the commissioner can delete the league');
    await del(key(code));
  });
  await updateIndex(code.toUpperCase(), null);
}

// Join with name + PIN. Same name + same PIN reclaims your seat on a new
// device; a new name joins as a new player while the room is in the lobby.
export async function joinRoom(code, { name, pin }) {
  name = cleanName(name);
  pin = cleanPin(pin);
  return withLock(code, async () => {
    const room = await get(key(code));
    if (!room) throw new ActionError('Room not found — check the code');
    let p = room.players.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (p?.bot) throw new ActionError('That name belongs to a bot');
    if (p) {
      // Players the commissioner added by hand claim their seat with the first PIN they choose.
      if (p.pinHash && p.pinHash !== pinHash(code, pin)) throw new ActionError('That name is taken (wrong PIN?)');
      p.pinHash ||= pinHash(code, pin);
    } else {
      if (room.status !== 'lobby') throw new ActionError('The draft has started — ask the commissioner to add you before it starts');
      p = { id: newId(), name, pinHash: pinHash(code, pin), tokenHash: null };
      room.players.push(p);
      room.order.push(p.id);
    }
    const token = issueToken(p);
    room.version++;
    await set(key(code), room);
    return { token };
  });
}

function actorFor(room, token) {
  if (!token) return null;
  const h = sha(token);
  return room.players.find((p) => p.tokens?.includes(h) || p.tokenHash === h) || null;
}

async function feeds() {
  const [st, pm] = await Promise.all([getStandings(), getPolymarket()]);
  return { standings: st.data, poly: pm.data, standingsAt: st.fetchedAt, polyAt: pm.fetchedAt };
}

// Read a room, running the pick clock and daily snapshot if they're due.
export async function readRoom(code, token) {
  let room = await get(key(code));
  if (!room) return null;
  const f = await feeds();
  const now = Date.now();
  let table = teamTable(room, f.standings, f.poly);
  const due = autoPickDue(room);
  const clockDue = due && now >= due;
  if (clockDue || snapshotDue(room, today())) {
    room = await withLock(code, async () => {
      const r = await get(key(code));
      const t = teamTable(r, f.standings, f.poly);
      let changed = tick(r, t, Date.now());
      if (snapshotDue(r, today())) {
        takeSnapshot(r, teamTable(r, f.standings, f.poly), today());
        changed = true;
      }
      if (changed) {
        r.version++;
        await set(key(code), r);
      }
      return r;
    });
    table = teamTable(room, f.standings, f.poly);
  }
  return view(room, table, actorFor(room, token), f);
}

export async function act(code, token, action) {
  const f = await feeds();
  const room = await withLock(code, async () => {
    const r = await get(key(code));
    if (!r) throw new ActionError('Room not found');
    const actor = actorFor(r, token);
    const now = Date.now();
    tick(r, teamTable(r, f.standings, f.poly), now);
    applyAction(r, actor, action, { now, table: teamTable(r, f.standings, f.poly), newId });
    r.version++;
    await set(key(code), r);
    return r;
  });
  if (action.type === 'settings' || action.type === 'archive') await updateIndex(room.code, indexEntry(room));
  return readRoom(code, token);
}

function view(room, table, me, f) {
  const clock = onClock(room);
  return {
    serverNow: Date.now(),
    me: me ? { id: me.id, name: me.name, isCommish: !!me.isCommish } : null,
    room: {
      code: room.code, name: room.name, season: room.season, status: room.status, version: room.version, test: !!room.test,
      settings: room.settings, order: room.order, deadline: room.deadline, pausedRemaining: room.pausedRemaining,
      players: room.players.map((p) => ({ id: p.id, name: p.name, isCommish: !!p.isCommish, claimed: !!p.pinHash, bot: !!p.bot })),
      picks: room.picks, trades: room.trades.slice(0, 50), log: room.log, snapshots: room.snapshots,
      archives: room.archives, lockedAt: room.locked?.at || null, lines: room.lines,
    },
    draft: {
      total: totalPicks(room),
      pickNo: room.picks.length,
      onClock: clock,
      myGap: me ? picksUntilNext(room, me.id) : null,
    },
    teams: table.map(({ mu, ...t }) => t),
    suggestions: suggestions(room, table, me && room.order.includes(me.id) ? me.id : clock).slice(0, 12),
    scores: scoreboard(room, table),
    feeds: { standingsAt: f.standingsAt, polyAt: f.polyAt, seedLinesAsOf: SEED_LINES_AS_OF },
  };
}

// Current consensus lines with live records and projections, for the home page.
export async function publicLines() {
  const f = await feeds();
  const table = teamTable({ lines: seedLines(), locked: null, picks: [] }, f.standings, f.poly);
  return {
    teams: table.map(({ mu, overOwner, underOwner, ...t }) => t),
    feeds: { standingsAt: f.standingsAt, polyAt: f.polyAt, seedLinesAsOf: SEED_LINES_AS_OF },
  };
}
