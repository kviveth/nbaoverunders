import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction, drafterAt, newRoom, onClock, picksUntilNext, projectTeam, scoreboard,
  sidePoints, suggestions, teamTable, tick, totalPicks, bookOverProb,
} from '../lib/engine.js';
import { SEED_LINES } from '../lib/teams.js';

let seq = 0;
const newId = () => `id${++seq}`;

function setup(names = ['A', 'B', 'C']) {
  const room = newRoom({ code: 'TEST1', name: 't', commishId: 'c', commishName: 'Comm', pinHash: 'x', tokenHash: 'y', playing: true });
  const commish = room.players[0];
  for (const n of names.slice(1)) applyAction(room, commish, { type: 'addPlayer', name: n }, ctx(room));
  return { room, commish, actor: (id) => room.players.find((p) => p.id === id) };
}
const ctx = (room, now = 1000, standings = {}, poly = {}) => ({ now, table: teamTable(room, standings, poly), newId });

test('seed lines sum to a sane league total', () => {
  const total = Object.values(SEED_LINES).reduce((s, [l]) => s + l, 0);
  assert.ok(total > 1180 && total < 1280, `total ${total}`);
});

test('snake order and pick counts', () => {
  const { room } = setup(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.equal(totalPicks(room), 56); // 8 each for 7 players
  room.settings.useAll60 = true;
  assert.equal(totalPicks(room), 60);
  const o = room.order;
  assert.deepEqual([0, 6, 7, 13, 14].map((n) => drafterAt(room, n)), [o[0], o[6], o[6], o[0], o[0]]);
});

test('scoring: margin past the line, misses are negative', () => {
  assert.equal(sidePoints('over', 50.5, 60.5), 10);
  assert.equal(sidePoints('under', 50.5, 60.5), -10);
  assert.equal(sidePoints('under', 50.5, 40.5), 10);
  assert.equal(sidePoints('over', 46.5, 42), -4.5); // Miami OVER, finished under by 4.5
});

test('projection blends record with line', () => {
  assert.equal(projectTeam(41, { w: 0, l: 0 }).proj, 41);
  const hot = projectTeam(41, { w: 10, l: 0 });
  assert.ok(hot.proj > 41 && hot.proj < 82);
  assert.equal(projectTeam(41, { w: 50, l: 32 }).proj, 50);
  assert.ok(projectTeam(41, { w: 50, l: 32 }).final);
});

test('no-vig book probability', () => {
  assert.equal(bookOverProb({ over: -110, under: -110 }), 0.5);
  assert.ok(bookOverProb({ over: -200, under: 165 }) > 0.6);
});

test('full draft flow: start locks lines, picks, both sides of a team, completion', () => {
  const { room, commish, actor } = setup(['A', 'B']);
  assert.throws(() => applyAction(room, actor(room.order[1]), { type: 'start' }, ctx(room)), /commissioner/);
  applyAction(room, commish, { type: 'start' }, ctx(room));
  assert.equal(room.status, 'drafting');
  assert.ok(room.locked.lines['2'].line);
  assert.throws(() => applyAction(room, commish, { type: 'setLines', lines: { 2: { line: 1, over: -110, under: -110 } } }, ctx(room)), /locked/);
  const p1 = actor(onClock(room));
  const p2 = actor(room.order[1]);
  assert.throws(() => applyAction(room, p2, { type: 'pick', teamId: '2', side: 'over' }, ctx(room)), /not your pick/);
  applyAction(room, p1, { type: 'pick', teamId: '2', side: 'over' }, ctx(room));
  assert.throws(() => applyAction(room, p2, { type: 'pick', teamId: '2', side: 'over' }, ctx(room)), /taken/);
  applyAction(room, p2, { type: 'pick', teamId: '2', side: 'under' }, ctx(room)); // same team, other side
  assert.equal(picksUntilNext(room, p1.id), 0); // snake: p2 picks again next, then p1
  while (room.status === 'drafting') {
    const s = suggestions(room, teamTable(room, {}, {}), onClock(room))[0];
    applyAction(room, commish, { type: 'pick', teamId: s.teamId, side: s.side }, ctx(room));
  }
  assert.equal(room.status, 'complete');
  assert.equal(room.picks.length, 60);
  applyAction(room, commish, { type: 'undo' }, ctx(room));
  assert.equal(room.status, 'drafting');
});

test('lines edits before start, rejected bad odds', () => {
  const { room, commish } = setup(['A']);
  applyAction(room, commish, { type: 'setLines', lines: { 2: { line: '52.5', over: '+105', under: '-125' } } }, ctx(room));
  assert.deepEqual(room.lines['2'], { line: 52.5, over: 105, under: -125 });
  assert.throws(() => applyAction(room, commish, { type: 'setLines', lines: { 2: { line: 50, over: 50, under: -110 } } }, ctx(room)), /odds/);
});

test('pick clock autopicks top suggestion', () => {
  const { room, commish } = setup(['A', 'B']);
  room.settings.pickSeconds = 30;
  applyAction(room, commish, { type: 'start' }, ctx(room, 0));
  assert.equal(room.deadline, 30000);
  assert.equal(tick(room, teamTable(room, {}, {}), 29000), false);
  assert.equal(tick(room, teamTable(room, {}, {}), 31000), true);
  assert.equal(room.picks.length, 1);
  assert.ok(room.picks[0].auto);
  assert.equal(room.deadline, 61000);
});

test('pause and resume keep remaining time', () => {
  const { room, commish } = setup(['A']);
  applyAction(room, commish, { type: 'start' }, ctx(room, 0));
  applyAction(room, commish, { type: 'pause' }, ctx(room, 50000));
  assert.equal(tick(room, teamTable(room, {}, {}), 999999), false);
  applyAction(room, commish, { type: 'resume' }, ctx(room, 100000));
  assert.equal(room.deadline, 140000);
});

test('trades swap ownership and score follows owner', () => {
  const { room, commish, actor } = setup(['A', 'B']);
  room.settings.pickSeconds = 0;
  applyAction(room, commish, { type: 'start' }, ctx(room));
  const [x, y] = room.order.map(actor);
  applyAction(room, x, { type: 'pick', teamId: '25', side: 'over' }, ctx(room));
  applyAction(room, y, { type: 'pick', teamId: '23', side: 'under' }, ctx(room));
  assert.throws(() => applyAction(room, x, { type: 'proposeTrade', to: y.id, give: [1], get: [] }, ctx(room)), /own/);
  applyAction(room, x, { type: 'proposeTrade', to: y.id, give: [0], get: [1] }, ctx(room));
  const tr = room.trades[0];
  assert.throws(() => applyAction(room, x, { type: 'acceptTrade', tradeId: tr.id }, ctx(room)), /receiving/);
  applyAction(room, y, { type: 'acceptTrade', tradeId: tr.id }, ctx(room));
  assert.equal(room.picks[0].owner, y.id);
  assert.equal(room.picks[1].owner, x.id);
  const standings = { 25: { w: 70, l: 12 }, 23: { w: 10, l: 72 } };
  const board = scoreboard(room, teamTable(room, standings, {}));
  const yScore = board.find((s) => s.id === y.id);
  assert.equal(yScore.pts, 70 - room.locked.lines['25'].line);
});

test('archive resets for next season and keeps history', () => {
  const { room, commish } = setup(['A']);
  applyAction(room, commish, { type: 'start' }, ctx(room));
  applyAction(room, commish, { type: 'pick', teamId: '2', side: 'over' }, ctx(room));
  applyAction(room, commish, { type: 'archive' }, ctx(room));
  assert.equal(room.season, '2027-28');
  assert.equal(room.status, 'lobby');
  assert.equal(room.archives.length, 1);
  assert.equal(room.picks.length, 0);
});

test('bots draft on their own, pausing between picks', () => {
  const { room, commish } = setup(['A']);
  for (const n of ['Bot1', 'Bot2']) applyAction(room, commish, { type: 'addPlayer', name: n, bot: true }, ctx(room));
  room.settings.pickSeconds = 60;
  applyAction(room, commish, { type: 'start' }, ctx(room, 0));
  // Commish (human) is first: a bot doesn't jump in.
  assert.equal(tick(room, teamTable(room, {}, {}), 1000), false);
  applyAction(room, commish, { type: 'pick', teamId: '2', side: 'over' }, ctx(room, 1000));
  assert.equal(tick(room, teamTable(room, {}, {}), 1500), false); // bot waits BOT_DELAY
  tick(room, teamTable(room, {}, {}), 10_000); // both bots, then the snake comes back to them... until a human is up
  assert.ok(room.picks.length >= 3);
  assert.equal(onClock(room), room.order.find((id) => !room.players.find((p) => p.id === id).bot));
});

test('commish edits picks, locked lines, players', () => {
  const { room, commish, actor } = setup(['A', 'B']);
  room.settings.pickSeconds = 0;
  applyAction(room, commish, { type: 'start' }, ctx(room));
  const [x, y] = room.order.map(actor);
  applyAction(room, x, { type: 'pick', teamId: '14', side: 'over' }, ctx(room));
  applyAction(room, y, { type: 'pick', teamId: '2', side: 'under' }, ctx(room));
  assert.throws(() => applyAction(room, y, { type: 'editPick', n: 0, side: 'under' }, ctx(room)), /commissioner/);
  assert.throws(() => applyAction(room, commish, { type: 'editPick', n: 0, teamId: '2', side: 'under' }, ctx(room)), /already has/);
  applyAction(room, commish, { type: 'editPick', n: 0, side: 'under', owner: y.id }, ctx(room));
  assert.deepEqual([room.picks[0].side, room.picks[0].owner], ['under', y.id]);
  applyAction(room, commish, { type: 'editLockedLine', teamId: '14', line: '44.5' }, ctx(room));
  assert.equal(room.picks[0].line, 44.5);
  assert.equal(room.locked.lines['14'].line, 44.5);
  applyAction(room, commish, { type: 'renamePlayer', pid: x.id, name: 'Xavier' }, ctx(room));
  assert.equal(x.name, 'Xavier');
  applyAction(room, commish, { type: 'resetPin', pid: x.id }, ctx(room));
  assert.equal(x.pinHash, null);
  applyAction(room, commish, { type: 'addPlayer', name: 'Late' }, ctx(room));
  const late = room.players.at(-1);
  assert.ok(!room.order.includes(late.id));
  applyAction(room, commish, { type: 'editPick', n: 1, owner: late.id }, ctx(room));
  assert.ok(scoreboard(room, teamTable(room, {}, {})).some((s) => s.id === late.id));
  assert.throws(() => applyAction(room, commish, { type: 'removePlayer', pid: late.id }, ctx(room)), /owns? picks/);
});
