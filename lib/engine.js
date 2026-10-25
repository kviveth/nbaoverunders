// Pure draft/scoring logic. No I/O here, so it is easy to test.
import { TEAMS, GAMES, TOTAL_SIDES, seedLines, teamLabel } from './teams.js';

// ---------- math helpers ----------

// Standard normal CDF (Abramowitz-Stegun 7.1.26).
export function phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Inverse normal CDF (Acklam's approximation, plenty for this).
export function phiInv(p) {
  p = Math.min(0.999, Math.max(0.001, p));
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -phiInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// American odds -> implied probability (with vig).
export function implied(odds) {
  odds = Number(odds);
  if (!odds) return 0.5;
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

// No-vig probability the over hits, from the book's two prices.
export function bookOverProb({ over, under }) {
  const o = implied(over), u = implied(under);
  return o / (o + u);
}

const round1 = (x) => Math.round(x * 10) / 10;

// ---------- projections ----------

// How many games of "line pace" the current record is blended with. Early in
// the season the line dominates; by midseason the actual record does.
const PRIOR_GAMES = 50;

export function projectTeam(line, rec = { w: 0, l: 0 }) {
  const w = rec.w || 0, l = rec.l || 0;
  const gp = Math.min(GAMES, w + l);
  const rem = GAMES - gp;
  const pace = (w + PRIOR_GAMES * (line / GAMES)) / (gp + PRIOR_GAMES);
  const proj = w + rem * pace;
  const sd = 0.5 + 8 * Math.sqrt(rem / GAMES);
  return { w, l, gp, rem, proj, sd, final: rem === 0 };
}

// Points a side earns if the team finishes with `wins`: how far the team
// landed past the line in the picked direction. A miss is negative
// (Miami OVER 46.5, Miami wins 42 -> -4.5).
export function sidePoints(side, line, wins) {
  return side === 'over' ? wins - line : line - wins;
}

// Live market read on the over, blending the sportsbook price with
// Polymarket's price (translated onto the book's line) when it's traded.
export function marketOverProb(lineObj, poly, sd) {
  const book = bookOverProb(lineObj);
  if (!poly) return book;
  const pmMean = poly.line + sd * phiInv(poly.pOver);
  const pmAtLine = phi((pmMean - lineObj.line) / sd);
  return (book + pmAtLine) / 2;
}

// ---------- draft order ----------

// Most picks each player can get with an equal share of the 60 sides.
export const maxRounds = (n) => (n ? Math.floor(TOTAL_SIDES / n) : 0);

export function totalPicks(room) {
  const n = room.order.length;
  if (!n) return 0;
  if (room.settings.useAll60) return TOTAL_SIDES;
  // `rounds` lets a league draft fewer picks (6 players × 5 = 30); unset means as many as fit.
  return Math.min(room.settings.rounds || Infinity, maxRounds(n)) * n;
}

export function drafterAt(room, pickNo) {
  const n = room.order.length;
  const round = Math.floor(pickNo / n), i = pickNo % n;
  return room.order[round % 2 ? n - 1 - i : i];
}

export function onClock(room) {
  if (room.status !== 'drafting' && room.status !== 'paused') return null;
  return drafterAt(room, room.picks.length);
}

// Picks other people make before `pid` is up again (after the current pick).
export function picksUntilNext(room, pid) {
  const total = totalPicks(room);
  let gap = 0;
  for (let n = room.picks.length + 1; n < total; n++) {
    if (drafterAt(room, n) === pid) return gap;
    gap++;
  }
  return null;
}

// ---------- derived views ----------

const sideKey = (teamId, side) => `${teamId}:${side}`;

export function linesFor(room) {
  return room.locked ? room.locked.lines : room.lines;
}

// Per-team table: line, record, projection, market lean, who owns each side.
export function teamTable(room, standings, poly) {
  const lines = linesFor(room);
  const owners = {};
  for (const p of room.picks) owners[sideKey(p.teamId, p.side)] = p.owner;
  return TEAMS.map((t) => {
    const lo = lines[t.id];
    const pr = projectTeam(lo.line, standings[t.id]);
    const pOver = room.locked ? lo.pOver : marketOverProb(lo, poly[t.id], pr.sd);
    // Expected final wins: our projection nudged by the market's lean.
    const mu = pr.proj + pr.sd * phiInv(pOver) * (pr.rem / GAMES);
    return {
      id: t.id, abbr: t.abbr, name: teamLabel(t.id),
      line: lo.line, over: lo.over, under: lo.under,
      poly: room.locked ? null : poly[t.id] || null,
      pOver: round1(pOver * 1000) / 1000,
      ...pr, proj: round1(pr.proj), mu,
      overOwner: owners[sideKey(t.id, 'over')] || null,
      underOwner: owners[sideKey(t.id, 'under')] || null,
    };
  });
}

// Expected points and hit chance for drafting one side right now.
export function sideValue(team, side) {
  const edge = side === 'over' ? team.mu - team.line : team.line - team.mu;
  return { exp: round1(edge), hit: Math.round(phi(edge / team.sd) * 100) };
}

export function suggestions(room, table, pid) {
  const avail = [];
  for (const t of table) {
    for (const side of ['over', 'under']) {
      if (t[`${side}Owner`]) continue;
      avail.push({ teamId: t.id, abbr: t.abbr, name: t.name, side, line: t.line, ...sideValue(t, side) });
    }
  }
  avail.sort((a, b) => b.exp - a.exp || b.hit - a.hit);
  const gap = pid ? picksUntilNext(room, pid) : null;
  const mineNow = pid && onClock(room) === pid;
  return avail.map((s, i) => ({
    ...s,
    rank: i + 1,
    // If I'm picking now I take #1; others then take roughly the next `gap`.
    likelyGone: gap != null && (mineNow ? i >= 1 && i <= gap : i < gap),
  }));
}

export function scoreboard(room, table) {
  const byTeam = Object.fromEntries(table.map((t) => [t.id, t]));
  const players = room.players.filter((p) => room.order.includes(p.id) || room.picks.some((k) => k.owner === p.id));
  return players
    .map((p) => {
      const picks = room.picks
        .filter((k) => k.owner === p.id)
        .map((k) => {
          const t = byTeam[k.teamId];
          return {
            n: k.n, teamId: k.teamId, abbr: t.abbr, name: t.name, side: k.side, line: k.line,
            w: t.w, l: t.l, proj: t.proj, final: t.final,
            pts: round1(sidePoints(k.side, k.line, t.proj)),
            hit: sideValue(t, k.side).hit,
          };
        });
      const pts = round1(picks.reduce((s, k) => s + k.pts, 0));
      return { id: p.id, name: p.name, pts, picks };
    })
    .sort((a, b) => b.pts - a.pts);
}

// ---------- actions ----------

export class ActionError extends Error {}
const fail = (msg) => { throw new ActionError(msg); };

export function newRoom({ code, name, commishId, commishName, pinHash, tokenHash, playing, test = false }) {
  const commish = { id: commishId, name: commishName, pinHash, tokenHash, isCommish: true };
  return {
    code, name, season: '2026-27', createdAt: Date.now(), version: 1, test,
    status: 'lobby',
    settings: { pickSeconds: 90, useAll60: false, rounds: null },
    players: [commish],
    order: playing ? [commishId] : [],
    lines: seedLines(),
    locked: null,
    picks: [], trades: [], snapshots: [], archives: [], log: [],
    deadline: null, pausedRemaining: null,
  };
}

function log(room, text, now) {
  room.log.unshift({ at: now, text });
  room.log.length = Math.min(room.log.length, 60);
}

const nameOf = (room, pid) => room.players.find((p) => p.id === pid)?.name || '?';
const sideText = (teamId, side, line) => `${teamLabel(teamId)} ${side.toUpperCase()} ${line}`;

function setDeadline(room, now) {
  room.deadline = room.settings.pickSeconds > 0 ? now + room.settings.pickSeconds * 1000 : null;
}

function makePick(room, teamId, side, { now, auto = false, by }) {
  if (room.status !== 'drafting') fail(room.status === 'paused' ? 'Draft is paused' : 'Draft is not running');
  if (!room.locked.lines[teamId]) fail('Unknown team');
  if (side !== 'over' && side !== 'under') fail('Pick over or under');
  if (room.picks.some((p) => p.teamId === teamId && p.side === side)) fail('That side is already taken');
  const pid = onClock(room);
  const line = room.locked.lines[teamId].line;
  room.picks.push({ n: room.picks.length, pid, owner: pid, teamId, side, line, at: now, auto, by: by !== pid ? by : undefined });
  log(room, `#${room.picks.length} ${nameOf(room, pid)}: ${sideText(teamId, side, line)}${auto ? ' (auto)' : ''}`, now);
  if (room.picks.length >= totalPicks(room)) {
    room.status = 'complete';
    room.deadline = null;
    log(room, 'Draft complete!', now);
  } else {
    setDeadline(room, now);
  }
}

// Bots in test leagues take a moment per pick so you can watch the draft.
export const BOT_DELAY = 1500;

const isBot = (room, pid) => !!room.players.find((p) => p.id === pid)?.bot;

// When the next automatic pick is due: a bot's turn, or a human's clock running out.
export function autoPickDue(room) {
  if (room.status !== 'drafting') return null;
  if (isBot(room, onClock(room))) return (room.picks.at(-1)?.at ?? room.locked.at) + BOT_DELAY;
  return room.deadline;
}

// Called on every read: bots pick, and anyone whose clock ran out gets the top suggestion.
export function tick(room, table, now) {
  let changed = false;
  for (let due = autoPickDue(room); due && now >= due; due = autoPickDue(room)) {
    const pid = onClock(room);
    const bot = isBot(room, pid);
    const list = suggestions(room, table, pid);
    // Bots take one of their top three so test drafts don't all look alike.
    const best = bot ? list[Math.floor(Math.random() * Math.min(3, list.length))] : list[0];
    if (!best) break;
    // Catch-up picks are stamped at their due time so a backlog of bots replays in order.
    makePick(room, best.teamId, best.side, { now: bot ? Math.min(now, due) : now, auto: !bot, by: pid });
    // Mark the side taken in the table so a second auto-pick skips it.
    const t = table.find((x) => x.id === best.teamId);
    t[`${best.side}Owner`] = pid;
    changed = true;
  }
  return changed;
}

export function snapshotDue(room, today) {
  return !!room.locked && room.picks.length > 0 && room.snapshots.at(-1)?.d !== today;
}

export function takeSnapshot(room, table, today) {
  const pts = {};
  for (const s of scoreboard(room, table)) pts[s.id] = s.pts;
  room.snapshots.push({ d: today, pts });
  if (room.snapshots.length > 220) room.snapshots.shift();
}

function requireCommish(actor) {
  if (!actor?.isCommish) fail('Only the commissioner can do that');
}

function parseLine(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > GAMES) fail(`Bad line: ${v}`);
  return n;
}

function parseOdds(v) {
  const n = Number(String(v).replace('+', ''));
  if (!Number.isFinite(n) || (n > -100 && n < 100)) fail(`Bad odds: ${v} (use American odds like -110 or +120)`);
  return n;
}

export function applyAction(room, actor, action, { now, table, newId }) {
  const a = action;
  switch (a.type) {
    case 'start': {
      requireCommish(actor);
      if (room.status !== 'lobby') fail('Draft already started');
      if (room.order.length < 1) fail('Add at least one player');
      const lines = {};
      for (const t of table) lines[t.id] = { line: t.line, over: t.over, under: t.under, pOver: t.pOver };
      room.locked = { at: now, lines };
      room.status = 'drafting';
      setDeadline(room, now);
      log(room, `Draft started — lines locked. ${totalPicks(room)} picks, ${room.order.length} players.`, now);
      break;
    }
    case 'pick': {
      if (!actor) fail('Join the room first');
      if (onClock(room) !== actor.id && !actor.isCommish) fail("It's not your pick");
      makePick(room, a.teamId, a.side, { now, by: actor.id });
      break;
    }
    case 'pause': {
      requireCommish(actor);
      if (room.status !== 'drafting') fail('Draft is not running');
      room.status = 'paused';
      room.pausedRemaining = room.deadline ? Math.max(0, room.deadline - now) : null;
      room.deadline = null;
      log(room, 'Draft paused', now);
      break;
    }
    case 'resume': {
      requireCommish(actor);
      if (room.status !== 'paused') fail('Draft is not paused');
      room.status = 'drafting';
      if (room.settings.pickSeconds > 0) room.deadline = now + (room.pausedRemaining ?? room.settings.pickSeconds * 1000);
      room.pausedRemaining = null;
      log(room, 'Draft resumed', now);
      break;
    }
    case 'undo': {
      requireCommish(actor);
      const last = room.picks.at(-1);
      if (!last) fail('No picks to undo');
      if (last.owner !== last.pid) fail('That pick was traded; cancel the trade first');
      room.picks.pop();
      room.trades = room.trades.map((t) => (t.status === 'pending' && [...t.give, ...t.get].includes(last.n) ? { ...t, status: 'cancelled' } : t));
      if (room.status === 'complete') room.status = 'drafting';
      if (room.status === 'drafting') setDeadline(room, now);
      log(room, `Undo: ${sideText(last.teamId, last.side, last.line)} (${nameOf(room, last.pid)})`, now);
      break;
    }
    case 'settings': {
      requireCommish(actor);
      const s = room.settings;
      if (a.pickSeconds !== undefined) {
        const v = Math.round(Number(a.pickSeconds));
        if (!(v >= 0 && v <= 3600)) fail('Pick timer must be 0–3600 seconds');
        s.pickSeconds = v;
        if (room.status === 'drafting') setDeadline(room, now);
      }
      if (a.useAll60 !== undefined || a.rounds !== undefined) {
        if (room.status !== 'lobby') fail('Pick count is fixed once the draft starts');
        if (a.useAll60 !== undefined) s.useAll60 = !!a.useAll60;
        if (a.rounds !== undefined) {
          const r = a.rounds === null ? null : Math.round(Number(a.rounds));
          if (r !== null && !(r >= 1 && r <= TOTAL_SIDES)) fail('Picks per player must be at least 1');
          s.rounds = r;
        }
      }
      if (a.name !== undefined) room.name = String(a.name).slice(0, 60) || room.name;
      break;
    }
    case 'order': {
      requireCommish(actor);
      if (room.status !== 'lobby') fail('Order is fixed once the draft starts');
      const ids = a.order;
      const playing = new Set(room.players.map((p) => p.id));
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((x) => !playing.has(x))) fail('Bad order');
      room.order = ids;
      break;
    }
    case 'randomize': {
      requireCommish(actor);
      if (room.status !== 'lobby') fail('Order is fixed once the draft starts');
      const o = [...room.order];
      for (let i = o.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [o[i], o[j]] = [o[j], o[i]];
      }
      room.order = o;
      log(room, `Draft order randomized: ${o.map((id) => nameOf(room, id)).join(', ')}`, now);
      break;
    }
    case 'setLines': {
      requireCommish(actor);
      if (room.status !== 'lobby') fail('Lines are locked once the draft starts');
      for (const [teamId, v] of Object.entries(a.lines || {})) {
        if (!room.lines[teamId]) fail(`Unknown team ${teamId}`);
        room.lines[teamId] = { line: parseLine(v.line), over: parseOdds(v.over), under: parseOdds(v.under) };
      }
      break;
    }
    case 'resetLines': {
      requireCommish(actor);
      if (room.status !== 'lobby') fail('Lines are locked once the draft starts');
      room.lines = seedLines();
      break;
    }
    case 'addPlayer': {
      requireCommish(actor);
      const name = String(a.name || '').trim().slice(0, 24);
      if (!name) fail('Enter a name');
      if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('Name taken');
      const id = newId();
      room.players.push({ id, name, pinHash: null, tokenHash: null, bot: !!a.bot });
      // After the draft starts the order is fixed; a late player gets picks by edit or trade.
      if (room.status === 'lobby') room.order.push(id);
      else log(room, `${name} joined late — give them picks with Edit picks or a trade`, now);
      break;
    }
    case 'setPlaying': {
      requireCommish(actor);
      if (room.status !== 'lobby') fail('Order is fixed once the draft starts');
      const p = room.players.find((x) => x.id === a.pid) || fail('No such player');
      room.order = room.order.filter((x) => x !== p.id);
      if (a.playing) room.order.push(p.id);
      break;
    }
    case 'removePlayer': {
      requireCommish(actor);
      const p = room.players.find((x) => x.id === a.pid) || fail('No such player');
      if (p.isCommish) fail("Can't remove the commissioner");
      if (room.status !== 'lobby' && room.order.includes(p.id)) fail('They have a draft slot; reassign their picks with Edit picks, then remove them after archiving');
      if (room.picks.some((k) => k.owner === p.id)) fail('They still own picks; move them to someone else first');
      room.players = room.players.filter((x) => x.id !== p.id);
      room.order = room.order.filter((x) => x !== p.id);
      break;
    }
    case 'editPick': {
      requireCommish(actor);
      const p = room.picks[a.n] || fail('No such pick');
      const teamId = a.teamId ?? p.teamId, side = a.side ?? p.side;
      if (!linesFor(room)[teamId]) fail('Unknown team');
      if (side !== 'over' && side !== 'under') fail('Pick over or under');
      if (room.picks.some((k) => k !== p && k.teamId === teamId && k.side === side)) fail('Another pick already has that side');
      if (a.owner !== undefined && !room.players.some((x) => x.id === a.owner)) fail('No such player');
      const before = sideText(p.teamId, p.side, p.line);
      Object.assign(p, { teamId, side, line: linesFor(room)[teamId].line, owner: a.owner ?? p.owner });
      log(room, `Commish edited pick #${p.n + 1}: ${before} → ${sideText(p.teamId, p.side, p.line)} (${nameOf(room, p.owner)})`, now);
      break;
    }
    case 'editLockedLine': {
      requireCommish(actor);
      if (!room.locked) fail('Lines are not locked yet — edit them in the Lines table');
      const lo = room.locked.lines[a.teamId] || fail('Unknown team');
      const line = parseLine(a.line);
      Object.assign(lo, { line, over: parseOdds(a.over ?? lo.over), under: parseOdds(a.under ?? lo.under) });
      for (const p of room.picks) if (p.teamId === a.teamId) p.line = line;
      log(room, `Commish changed the locked ${teamLabel(a.teamId)} line to ${line}`, now);
      break;
    }
    case 'renamePlayer': {
      requireCommish(actor);
      const p = room.players.find((x) => x.id === a.pid) || fail('No such player');
      const name = String(a.name || '').trim().slice(0, 24);
      if (!name) fail('Enter a name');
      if (room.players.some((x) => x !== p && x.name.toLowerCase() === name.toLowerCase())) fail('Name taken');
      log(room, `${p.name} is now ${name}`, now);
      p.name = name;
      break;
    }
    case 'resetPin': {
      requireCommish(actor);
      const p = room.players.find((x) => x.id === a.pid) || fail('No such player');
      // They log back in with their name and whatever new PIN they choose.
      p.pinHash = null;
      if (p.id !== actor.id) p.tokens = [];
      break;
    }
    case 'proposeTrade': {
      if (!actor) fail('Join the room first');
      const to = room.players.find((p) => p.id === a.to && room.order.includes(p.id)) || fail('Pick someone to trade with');
      if (to.id === actor.id) fail("You can't trade with yourself");
      const give = [...new Set(a.give || [])], get = [...new Set(a.get || [])];
      if (!give.length && !get.length) fail('Choose picks to trade');
      for (const n of give) if (room.picks[n]?.owner !== actor.id) fail('You can only offer picks you own');
      for (const n of get) if (room.picks[n]?.owner !== to.id) fail(`${to.name} doesn't own one of those picks`);
      const id = newId();
      room.trades.unshift({ id, from: actor.id, to: to.id, give, get, status: 'pending', at: now, note: String(a.note || '').slice(0, 140) });
      log(room, `${actor.name} proposed a trade to ${to.name}`, now);
      break;
    }
    case 'acceptTrade':
    case 'declineTrade':
    case 'cancelTrade':
    case 'vetoTrade': {
      if (!actor) fail('Join the room first');
      const t = room.trades.find((x) => x.id === a.tradeId) || fail('No such trade');
      if (t.status !== 'pending') fail('That trade is no longer open');
      if (a.type === 'acceptTrade' || a.type === 'declineTrade') {
        if (actor.id !== t.to) fail('Only the receiving player can respond');
      } else if (a.type === 'cancelTrade') {
        if (actor.id !== t.from) fail('Only the proposer can cancel');
      } else {
        requireCommish(actor);
      }
      if (a.type !== 'acceptTrade') {
        t.status = { declineTrade: 'declined', cancelTrade: 'cancelled', vetoTrade: 'vetoed' }[a.type];
        log(room, `Trade ${nameOf(room, t.from)} ↔ ${nameOf(room, t.to)} ${t.status}`, now);
        break;
      }
      for (const n of t.give) if (room.picks[n]?.owner !== t.from) fail('Trade is stale: a pick changed hands');
      for (const n of t.get) if (room.picks[n]?.owner !== t.to) fail('Trade is stale: a pick changed hands');
      for (const n of t.give) room.picks[n].owner = t.to;
      for (const n of t.get) room.picks[n].owner = t.from;
      t.status = 'accepted';
      t.doneAt = now;
      const moved = new Set([...t.give, ...t.get]);
      for (const o of room.trades) {
        if (o.status === 'pending' && [...o.give, ...o.get].some((n) => moved.has(n))) o.status = 'cancelled';
      }
      const desc = (ns) => ns.map((n) => sideText(room.picks[n].teamId, room.picks[n].side, room.picks[n].line)).join(', ') || 'nothing';
      log(room, `TRADE: ${nameOf(room, t.from)} sends ${desc(t.give)} to ${nameOf(room, t.to)} for ${desc(t.get)}`, now);
      break;
    }
    case 'archive': {
      requireCommish(actor);
      if (room.status === 'lobby' && !room.picks.length) fail('Nothing to archive yet');
      const board = scoreboard(room, table);
      room.archives.unshift({
        season: room.season, at: now,
        standings: board.map((s) => ({ name: s.name, pts: s.pts, picks: s.picks.map((k) => `${k.abbr} ${k.side[0].toUpperCase()} ${k.line} (${k.pts > 0 ? '+' : ''}${k.pts})`) })),
      });
      const [y] = room.season.split('-').map(Number);
      room.season = `${y + 1}-${String((y + 2) % 100).padStart(2, '0')}`;
      Object.assign(room, { status: 'lobby', picks: [], trades: [], snapshots: [], locked: null, deadline: null, pausedRemaining: null, lines: seedLines() });
      log(room, `Season archived. Welcome to ${room.season}!`, now);
      break;
    }
    default:
      fail('Unknown action');
  }
}
