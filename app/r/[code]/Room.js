'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, clearToken, getToken, saveToken } from '@/lib/client';
import ProjectionChart, { fmt, seriesColor } from './Chart';
import TeamLogo from '@/components/TeamLogo';

const odds = (v) => (v > 0 ? `+${v}` : `${v}`);
const pct = (p) => `${Math.round(p * 100)}%`;
const sideCls = (s) => (s === 'over' ? 'over' : 'under');
const S = (s) => (s === 'over' ? 'O' : 'U');

export default function Room({ code }) {
  code = code.toUpperCase();
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('draft');
  const [now, setNow] = useState(Date.now());
  const skew = useRef(0);

  useEffect(() => {
    setToken(getToken(code));
    const t = new URLSearchParams(location.search).get('tab');
    if (t) setTab(t);
    setReady(true);
  }, [code]);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/rooms/${code}`, { token });
      skew.current = d.serverNow - Date.now();
      setData(d);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [code, token]);

  const live = data && (data.room.status === 'drafting' || data.room.status === 'paused');

  useEffect(() => {
    if (!ready) return;
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, live ? 2500 : 20000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [ready, load, live]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + skew.current), 250);
    return () => clearInterval(id);
  }, []);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const act = useCallback(async (action, okMsg) => {
    try {
      const d = await api(`/api/rooms/${code}/action`, { token, body: action });
      skew.current = d.serverNow - Date.now();
      setData(d);
      if (okMsg) flash(okMsg);
      return true;
    } catch (e) {
      flash(e.message);
      load();
      return false;
    }
  }, [code, token, load]);

  useTurnAlert(data);

  if (!ready) return null;
  if (!data) {
    return (
      <main className="wrap">
        {error ? <p className="error">{error} — <Link href="/">back home</Link></p> : <p className="muted">Loading…</p>}
      </main>
    );
  }
  if (!data.me) return <JoinGate code={code} room={data.room} onJoined={(t) => { saveToken(code, t); setToken(t); }} />;

  const { room, me, draft } = data;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '—';
  const pendingForMe = room.trades.filter((t) => t.status === 'pending' && t.to === me.id).length;
  const tabs = [
    ['draft', room.status === 'complete' ? 'Picks' : 'Draft'],
    ['board', 'Board'],
    ['standings', 'Standings'],
    ['teams', 'Teams'],
    ['trades', 'Trades', pendingForMe],
    ['activity', 'Activity'],
    ...(me.isCommish ? [['commish', 'Commish']] : []),
  ];
  const ctx = { data, room, me, draft, act, nameOf, now, flash };

  return (
    <main className="wrap">
      <header className="row between" style={{ marginBottom: 4 }}>
        <div className="grow">
          <h1 style={{ marginBottom: 2 }}>{room.name}</h1>
          <div className="row small muted">
            <span>{room.season}</span>
            <StatusPill status={room.status} />
            {room.test && <span className="pill warn">Test</span>}
            <button className="sm" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/r/${code}`); flash('Invite link copied'); }}>Code {code} · copy link</button>
          </div>
        </div>
        <div className="small" style={{ textAlign: 'right' }}>
          <div>{me.name}{me.isCommish && ' ⭐'}</div>
          <button className="sm" onClick={() => { clearToken(code); setToken(null); setData(null); }}>Switch user</button>
        </div>
      </header>

      <ClockBanner {...ctx} />

      <nav className="tabs">
        {tabs.map(([id, label, n]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}{n ? <span className="badge">{n}</span> : null}
          </button>
        ))}
      </nav>

      {tab === 'draft' && <DraftTab {...ctx} />}
      {tab === 'board' && <BoardTab {...ctx} />}
      {tab === 'standings' && <StandingsTab {...ctx} />}
      {tab === 'teams' && <TeamsTab {...ctx} />}
      {tab === 'trades' && <TradesTab {...ctx} />}
      {tab === 'activity' && <ActivityTab {...ctx} />}
      {tab === 'commish' && me.isCommish && <CommishTab {...ctx} />}

      <FeedsNote feeds={data.feeds} locked={room.lockedAt} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function StatusPill({ status }) {
  const map = { lobby: ['Lobby', ''], drafting: ['Drafting live', 'live'], paused: ['Paused', 'warn'], complete: ['Season underway', ''] };
  const [label, cls] = map[status] || [status, ''];
  return <span className={`pill ${cls}`}>{label}</span>;
}

// Beep + vibrate + browser notification when it becomes your pick.
function useTurnAlert(data) {
  const prev = useRef(null);
  const mine = !!data?.me && data.draft.onClock === data.me.id && data.room.status === 'drafting';
  useEffect(() => {
    if (mine && prev.current === false) {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.18].forEach((t) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(0.15, ac.currentTime + t);
          o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.12);
        });
      } catch {}
      navigator.vibrate?.([150, 80, 150]);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        new Notification("You're on the clock!", { body: `${data.room.name}: make your pick` });
      }
    }
    prev.current = mine;
    document.title = mine ? '⏰ Your pick! · O/U Draft' : 'O/U Draft';
  }, [mine, data]);
}

function ClockBanner({ room, draft, me, nameOf, now }) {
  if (room.status === 'lobby') {
    return (
      <div className="clock small">
        Waiting for the commissioner to start the draft. {draft.total} picks · {room.order.length} players
        {room.order.length ? ` · ${draft.total / room.order.length} each` : ''}. Lines stay live until the draft starts, then lock.
      </div>
    );
  }
  if (room.status === 'complete') return null;
  const mine = draft.onClock === me.id;
  const n = room.order.length;
  const remaining = room.status === 'paused' ? room.pausedRemaining : room.deadline ? room.deadline - now : null;
  const secs = remaining == null ? null : Math.max(0, Math.ceil(remaining / 1000));
  return (
    <div className={`clock ${mine ? 'mine' : ''}`}>
      <div className="row between">
        <div>
          <div className="small muted">Pick {draft.pickNo + 1} of {draft.total} · Round {Math.floor(draft.pickNo / n) + 1}{room.status === 'paused' && ' · PAUSED'}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{mine ? "🟢 You're on the clock!" : `On the clock: ${nameOf(draft.onClock)}`}</div>
          {!mine && draft.myGap != null && room.order.includes(me.id) && (
            <div className="small muted">{draft.myGap === 0 ? "You're up next" : `${draft.myGap + 1} picks until you`}</div>
          )}
        </div>
        {secs != null && <div className={`time ${secs <= 10 ? 'low' : ''}`}>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</div>}
      </div>
      {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
        <button className="sm" style={{ marginTop: 8 }} onClick={() => Notification.requestPermission()}>Notify me when it's my pick</button>
      )}
    </div>
  );
}

// ---------------- Draft ----------------

function DraftTab({ data, room, me, draft, act }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('line');
  const drafting = room.status === 'drafting';
  const canPick = drafting && (draft.onClock === me.id || me.isCommish);
  const pick = (teamId, side, label) => {
    if (draft.onClock !== me.id && !confirm(`Pick ${label} on behalf of the player on the clock?`)) return;
    act({ type: 'pick', teamId, side }, `Drafted ${label}`);
  };
  const teams = useMemo(() => {
    const f = q.trim().toLowerCase();
    const list = data.teams.filter((t) => !f || t.name.toLowerCase().includes(f) || t.abbr.toLowerCase().includes(f));
    if (sort === 'line') list.sort((a, b) => b.line - a.line);
    if (sort === 'edge') list.sort((a, b) => Math.abs(b.proj - b.line) - Math.abs(a.proj - a.line));
    return list;
  }, [data.teams, q, sort]);
  const myPicks = data.scores.find((s) => s.id === me.id)?.picks || [];
  const showSugg = room.status !== 'complete';

  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <div>
        {showSugg && (
          <section className="card">
            <div className="row between">
              <h2>Suggested for you</h2>
              <span className="tiny muted">exp. pts · hit chance</span>
            </div>
            {data.suggestions.slice(0, 8).map((s) => (
              <div key={`${s.teamId}${s.side}`} className="sugg">
                <span className="rank">{s.rank}</span>
                <div style={{ minWidth: 0 }}>
                  <div><TeamLogo abbr={s.abbr} /><b>{s.abbr}</b> <span className={sideCls(s.side)}>{s.side.toUpperCase()} {s.line}</span></div>
                  <div className="tiny muted">
                    <span className="num">{fmt(s.exp)} pts · {s.hit}%</span>
                    {s.likelyGone && <span className="pill warn" style={{ marginLeft: 6 }}>won't last to your next pick</span>}
                  </div>
                </div>
                {canPick && <button className="sm primary" onClick={() => pick(s.teamId, s.side, `${s.abbr} ${s.side.toUpperCase()} ${s.line}`)}>Draft</button>}
              </div>
            ))}
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              Ranked by expected points: our projection plus the market's lean (sportsbook juice and Polymarket price). If your clock runs out, #1 is auto-picked.
            </p>
          </section>
        )}
        <section className="card">
          <h2>My picks ({myPicks.length})</h2>
          {myPicks.length === 0 ? <p className="muted small">None yet.</p> : (
            <table className="small">
              <tbody>
                {myPicks.map((k) => (
                  <tr key={k.n}>
                    <td style={{ whiteSpace: 'nowrap' }}><TeamLogo abbr={k.abbr} /><b>{k.abbr}</b> <span className={sideCls(k.side)}>{S(k.side)} {k.line}</span></td>
                    <td className="r num muted">{k.w}-{k.l}</td>
                    <td className="r num">proj {k.proj}</td>
                    <td className={`r num ${k.pts >= 0 ? 'pos' : 'neg'}`}>{fmt(k.pts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <div className="row between">
          <h2>All sides</h2>
          <span className="tiny muted">{60 - room.picks.length} left</span>
        </div>
        <div className="row" style={{ margin: '6px 0' }}>
          <input className="grow" placeholder="Search team" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="line">Sort: line</option>
            <option value="edge">Sort: proj vs line</option>
          </select>
        </div>
        {teams.map((t) => (
          <div key={t.id} className="team-row">
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}><TeamLogo abbr={t.abbr} size={24} /><b>{t.abbr}</b>&nbsp;<span className="small">{t.name}</span></div>
              <div className="tiny muted num">
                Line {t.line} · {t.w}-{t.l} · proj {t.proj} · mkt O {pct(t.pOver)}
              </div>
            </div>
            {['over', 'under'].map((side) => {
              const owner = t[`${side}Owner`];
              const label = `${t.abbr} ${side.toUpperCase()} ${t.line}`;
              return (
                <button
                  key={side}
                  className={`side-btn ${owner ? 'taken' : ''} ${owner === me.id ? 'mine' : ''}`}
                  disabled={!!owner || !canPick}
                  onClick={() => pick(t.id, side, label)}
                  title={owner ? `Taken by ${room.players.find((p) => p.id === owner)?.name}` : label}
                >
                  <b className={sideCls(side)}>{S(side)} {t.line}</b>
                  <span className="tiny muted">{owner ? room.players.find((p) => p.id === owner)?.name : odds(t[side])}</span>
                </button>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------- Board ----------------

function BoardTab({ data, room, draft, me, nameOf }) {
  const n = room.order.length;
  const abbr = Object.fromEntries(data.teams.map((t) => [t.id, t.abbr]));
  if (!n) return <p className="muted">No players yet.</p>;
  const rounds = Math.ceil(draft.total / n);
  const byN = Object.fromEntries(room.picks.map((p) => [p.n, p]));
  return (
    <section className="card scroll">
      <table className="board">
        <thead>
          <tr><th>Rd</th>{room.order.map((id) => <th key={id}>{nameOf(id)}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, r) => (
            <tr key={r}>
              <td className="muted">{r + 1}</td>
              {room.order.map((id, col) => {
                const pickNo = r * n + (r % 2 ? n - 1 - col : col);
                const p = byN[pickNo];
                const isNow = pickNo === draft.pickNo && room.status !== 'complete';
                const traded = p && p.owner !== p.pid;
                return (
                  <td key={id} className={`${isNow ? 'now' : ''} ${p?.owner === me.id ? 'me' : ''}`}>
                    {p ? (
                      <>
                        <div style={{ whiteSpace: 'nowrap' }}><TeamLogo abbr={abbr[p.teamId]} /><b>{abbr[p.teamId]}</b></div>
                        <span className={sideCls(p.side)}>{S(p.side)} {p.line}</span>
                        {traded && <div className="tiny muted">→ {nameOf(p.owner)}</div>}
                        {p.auto && <div className="tiny muted">auto</div>}
                      </>
                    ) : <span className="tiny muted">#{pickNo + 1}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------- Standings ----------------

function StandingsTab({ data, room, me }) {
  const [open, setOpen] = useState(me.id);
  const colorIndex = Object.fromEntries(room.order.map((id, i) => [id, i]));
  const allFinal = data.teams.every((t) => t.final);
  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>{allFinal ? 'Final standings' : 'Projected standings'}</h2>
          <Link href="/rules" className="tiny">Misses score negative · rules</Link>
        </div>
        {data.scores.map((s, i) => (
          <div key={s.id}>
            <div className="lb-row" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="rank">{i + 1}</span>
              <div><span className="swatch" style={{ background: seriesColor(colorIndex[s.id]) }} /><b>{s.name}</b>{s.id === me.id && <span className="muted"> (you)</span>} <span className="tiny muted">{s.picks.length} picks</span></div>
              <span className={`lb-pts ${s.pts >= 0 ? 'pos' : 'neg'}`}>{fmt(s.pts)}</span>
            </div>
            {open === s.id && s.picks.length > 0 && (
              <div className="scroll">
                <table className="small">
                  <thead><tr><th>Pick</th><th className="r">Record</th><th className="r">Proj W</th><th className="r">Hit</th><th className="r">Pts</th></tr></thead>
                  <tbody>
                    {[...s.picks].sort((a, b) => b.pts - a.pts).map((k) => (
                      <tr key={k.n}>
                        <td style={{ whiteSpace: 'nowrap' }}><TeamLogo abbr={k.abbr} /><b>{k.abbr}</b> <span className={sideCls(k.side)}>{S(k.side)} {k.line}</span></td>
                        <td className="r num">{k.w}-{k.l}</td>
                        <td className="r num">{k.proj}{k.final && ' ✓'}</td>
                        <td className="r num muted">{k.hit}%</td>
                        <td className={`r num ${k.pts >= 0 ? 'pos' : 'neg'}`}>{fmt(k.pts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="card">
        <h2>Projected points over the season</h2>
        <ProjectionChart snapshots={room.snapshots} players={data.scores} colorIndex={colorIndex} meId={me.id} />
      </section>
      <p className="tiny muted">
        Projection: current wins + remaining games at a pace that blends the team's actual win% with its line (the line counts as 50 games of evidence, so early results move it gently).
        Points = projected wins minus the line for OVERs (line minus wins for UNDERs). "Hit" = chance the side cashes.
      </p>
    </>
  );
}

// ---------------- Teams (line value tracking) ----------------

function TeamsTab({ data, room, nameOf }) {
  const [sort, setSort] = useState('diff');
  const rows = [...data.teams].sort((a, b) => (sort === 'diff' ? (b.proj - b.line) - (a.proj - a.line) : b.line - a.line));
  return (
    <section className="card">
      <div className="row between">
        <h2>Teams</h2>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="diff">Sort: proj vs line</option>
          <option value="line">Sort: line</option>
        </select>
      </div>
      <p className="tiny muted">{room.lockedAt ? `Lines locked at draft start (${new Date(room.lockedAt).toLocaleString()}). "vs line" shows how much value each side has gained since.` : 'Lines are live until the draft starts.'}</p>
      <div className="scroll">
        <table className="small">
          <thead>
            <tr><th>Team</th><th className="r">Line</th><th className="r">O / U</th><th className="r">Mkt O</th><th className="r">W-L</th><th className="r">Proj</th><th className="r">vs line</th><th>Over</th><th>Under</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const d = t.proj - t.line;
              return (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}><TeamLogo abbr={t.abbr} /><b>{t.abbr}</b></td>
                  <td className="r num">{t.line}</td>
                  <td className="r num muted">{odds(t.over)} / {odds(t.under)}</td>
                  <td className="r num">{pct(t.pOver)}{t.poly && <span className="tiny muted" title={`Polymarket O/U ${t.poly.line}: ${pct(t.poly.pOver)} over`}> ●</span>}</td>
                  <td className="r num">{t.w}-{t.l}</td>
                  <td className="r num">{t.proj}</td>
                  <td className={`r num ${d >= 0 ? 'pos' : 'neg'}`}>{fmt(d)}</td>
                  <td className="tiny">{t.overOwner ? nameOf(t.overOwner) : <span className="muted">—</span>}</td>
                  <td className="tiny">{t.underOwner ? nameOf(t.underOwner) : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">Mkt O = no-vig chance of the OVER from the sportsbook price, averaged with Polymarket (●) when that market has real trading.</p>
    </section>
  );
}

// ---------------- Trades ----------------

function TradesTab({ data, room, me, act, nameOf }) {
  const others = room.order.filter((id) => id !== me.id);
  const [to, setTo] = useState(others[0] || '');
  const [give, setGive] = useState([]);
  const [get, setGet] = useState([]);
  const [note, setNote] = useState('');
  const owned = (pid) => room.picks.filter((p) => p.owner === pid);
  const label = (n) => {
    const p = room.picks[n];
    const t = data.teams.find((x) => x.id === p.teamId);
    return `${t.abbr} ${S(p.side)} ${p.line}`;
  };
  const toggle = (arr, set, n) => set(arr.includes(n) ? arr.filter((x) => x !== n) : [...arr, n]);
  const value = (n) => data.scores.flatMap((s) => s.picks).find((k) => k.n === n)?.pts;

  async function propose(e) {
    e.preventDefault();
    if (await act({ type: 'proposeTrade', to, give, get, note }, 'Trade proposed')) { setGive([]); setGet([]); setNote(''); }
  }

  const pending = room.trades.filter((t) => t.status === 'pending');
  const done = room.trades.filter((t) => t.status !== 'pending');
  const TradeLine = ({ t }) => (
    <div className="small">
      <b>{nameOf(t.from)}</b> gives {t.give.map(label).join(', ') || 'nothing'} · <b>{nameOf(t.to)}</b> gives {t.get.map(label).join(', ') || 'nothing'}
      {t.note && <div className="tiny muted">“{t.note}”</div>}
    </div>
  );

  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="card">
        <h2>Open offers</h2>
        {pending.length === 0 && <p className="muted small">No open trades.</p>}
        {pending.map((t) => (
          <div key={t.id} className="stack" style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
            <TradeLine t={t} />
            <div className="row">
              {t.to === me.id && <button className="sm primary" onClick={() => act({ type: 'acceptTrade', tradeId: t.id }, 'Trade accepted')}>Accept</button>}
              {t.to === me.id && <button className="sm" onClick={() => act({ type: 'declineTrade', tradeId: t.id })}>Decline</button>}
              {t.from === me.id && <button className="sm" onClick={() => act({ type: 'cancelTrade', tradeId: t.id })}>Cancel</button>}
              {me.isCommish && <button className="sm danger" onClick={() => act({ type: 'vetoTrade', tradeId: t.id })}>Veto</button>}
            </div>
          </div>
        ))}
        {done.length > 0 && <h3 style={{ marginTop: 14 }}>History</h3>}
        {done.map((t) => (
          <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span className={`pill ${t.status === 'accepted' ? 'live' : ''}`}>{t.status}</span> <TradeLine t={t} />
          </div>
        ))}
      </section>
      {room.order.includes(me.id) && others.length > 0 && (
        <form className="card stack" onSubmit={propose}>
          <h2>Propose a trade</h2>
          <label><span>Trade with</span>
            <select value={to} onChange={(e) => { setTo(e.target.value); setGet([]); }} style={{ width: '100%' }}>
              {others.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </label>
          <div className="grid2">
            <div>
              <h3>You give</h3>
              {owned(me.id).map((p) => (
                <label key={p.n} className="row small"><input type="checkbox" style={{ minHeight: 0 }} checked={give.includes(p.n)} onChange={() => toggle(give, setGive, p.n)} />{label(p.n)} <span className="muted num">{fmt(value(p.n))}</span></label>
              ))}
              {!owned(me.id).length && <p className="muted small">No picks yet.</p>}
            </div>
            <div>
              <h3>You get</h3>
              {owned(to).map((p) => (
                <label key={p.n} className="row small"><input type="checkbox" style={{ minHeight: 0 }} checked={get.includes(p.n)} onChange={() => toggle(get, setGet, p.n)} />{label(p.n)} <span className="muted num">{fmt(value(p.n))}</span></label>
              ))}
              {!owned(to).length && <p className="muted small">No picks yet.</p>}
            </div>
          </div>
          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
          <button className="primary" disabled={!give.length && !get.length}>Send offer</button>
          <p className="tiny muted">Numbers are each pick's current projected points.</p>
        </form>
      )}
    </div>
  );
}

// ---------------- Activity & archives ----------------

function ActivityTab({ room }) {
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="card">
        <h2>Activity</h2>
        <ul className="log small">
          {room.log.map((l, i) => (
            <li key={i}><span className="tiny muted">{new Date(l.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> · {l.text}</li>
          ))}
          {!room.log.length && <li className="muted">Nothing yet.</li>}
        </ul>
      </section>
      <section className="card">
        <h2>Past seasons</h2>
        {!room.archives.length && <p className="muted small">Archived seasons show up here — bragging rights forever.</p>}
        {room.archives.map((a, i) => (
          <details key={i} open={i === 0}>
            <summary><b>{a.season}</b> — 🏆 {a.standings[0]?.name} ({fmt(a.standings[0]?.pts)})</summary>
            <ol className="small">
              {a.standings.map((s) => (
                <li key={s.name}><b>{s.name}</b> {fmt(s.pts)}<div className="tiny muted">{s.picks.join(' · ')}</div></li>
              ))}
            </ol>
          </details>
        ))}
      </section>
    </div>
  );
}

// ---------------- Commissioner ----------------

function CommishTab({ data, room, draft, act, nameOf, flash }) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const lobby = room.status === 'lobby';
  const n = room.order.length;
  const maxEach = n ? Math.floor(60 / n) : 0;
  const move = (i, d) => {
    const o = [...room.order];
    [o[i], o[i + d]] = [o[i + d], o[i]];
    act({ type: 'order', order: o });
  };
  const rename = (p) => {
    const name = prompt(`New name for ${p.name}:`, p.name);
    if (name && name !== p.name) act({ type: 'renamePlayer', pid: p.id, name }, 'Renamed');
  };
  const resetPin = (p) => {
    if (confirm(`Reset ${p.name}'s PIN? They'll log back in with their name and choose a new PIN.`)) act({ type: 'resetPin', pid: p.id }, 'PIN reset — tell them to log in again');
  };
  async function deleteLeague() {
    if (prompt(`This permanently deletes "${room.name}" and everything in it. Type DELETE to confirm.`) !== 'DELETE') return;
    try {
      await api(`/api/rooms/${room.code}`, { method: 'DELETE', token: getToken(room.code) });
      clearToken(room.code);
      router.push('/');
    } catch (e) { flash(e.message); }
  }
  const PlayerRow = ({ p, i }) => (
    <div className="row" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted num" style={{ width: 20 }}>{i == null ? '–' : i + 1}</span>
      <span className="grow">
        {p.bot && '🤖 '}{p.name}{p.isCommish && ' ⭐'}
        {!p.bot && !p.claimed && <span className="tiny muted"> (hasn't logged in / PIN reset)</span>}
        {i == null && <span className="tiny muted"> (not in draft order)</span>}
      </span>
      {lobby && i != null && <button className="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>}
      {lobby && i != null && <button className="sm" disabled={i === n - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>}
      <button className="sm" onClick={() => rename(p)}>Rename</button>
      {!p.bot && <button className="sm" onClick={() => resetPin(p)}>Reset PIN</button>}
      {lobby && p.isCommish && i != null && <button className="sm" onClick={() => act({ type: 'setPlaying', pid: p.id, playing: false })}>Sit out</button>}
      {lobby && i == null && <button className="sm" onClick={() => act({ type: 'setPlaying', pid: p.id, playing: true })}>Add to draft</button>}
      {!p.isCommish && <button className="sm danger" onClick={() => confirm(`Remove ${p.name}?`) && act({ type: 'removePlayer', pid: p.id }, 'Removed')} aria-label={`Remove ${p.name}`}>✕</button>}
    </div>
  );
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <div>
        <section className="card stack">
          <h2>Draft controls</h2>
          {room.test && <p className="pill warn">Test league — bots draft on their own</p>}
          {lobby && (
            <>
              <button className="primary" disabled={!n} onClick={() => confirm(`Start the draft? Lines lock now. ${draft.total} picks, ${n} players.`) && act({ type: 'start' }, 'Draft started!')}>
                Start draft & lock lines
              </button>
              <p className="tiny muted">You can pick on behalf of whoever is on the clock from the Draft tab.</p>
            </>
          )}
          {room.status === 'drafting' && <button onClick={() => act({ type: 'pause' })}>Pause draft</button>}
          {room.status === 'paused' && <button className="primary" onClick={() => act({ type: 'resume' })}>Resume draft</button>}
          {!lobby && room.picks.length > 0 && (
            <button onClick={() => confirm('Undo the last pick?') && act({ type: 'undo' }, 'Last pick undone')}>Undo last pick</button>
          )}
          {!lobby && (
            <button className="danger" onClick={() => confirm(`Archive ${room.season} and reset for next season? Picks and standings are saved to Past seasons.`) && act({ type: 'archive' }, 'Season archived')}>
              Archive season & reset
            </button>
          )}
        </section>

        <section className="card stack">
          <h2>Settings</h2>
          <label><span>League name</span>
            <input defaultValue={room.name} onBlur={(e) => e.target.value !== room.name && act({ type: 'settings', name: e.target.value }, 'Renamed league')} />
          </label>
          <label><span>Pick timer (seconds, 0 = no timer; autopicks the top suggestion)</span>
            <input type="number" min="0" max="3600" defaultValue={room.settings.pickSeconds} onBlur={(e) => +e.target.value !== room.settings.pickSeconds && act({ type: 'settings', pickSeconds: e.target.value }, 'Timer updated')} />
          </label>
          <label><span>Picks per player{n ? ` (${n} players · ${draft.total} total picks)` : ''}</span>
            <select
              disabled={!lobby || !n}
              value={room.settings.useAll60 ? 'all' : String(Math.min(room.settings.rounds || maxEach, maxEach))}
              onChange={(e) => act(e.target.value === 'all' ? { type: 'settings', useAll60: true } : { type: 'settings', useAll60: false, rounds: +e.target.value }, 'Pick count updated')}
            >
              {Array.from({ length: maxEach }, (_, i) => maxEach - i).map((r) => (
                <option key={r} value={r}>{r} each ({r * n} total){r === maxEach ? ' — max' : ''}</option>
              ))}
              {n && 60 % n !== 0 && <option value="all">Use all 60 (some get one extra)</option>}
            </select>
          </label>
          <p className="tiny muted">Scoring: wins past the line in your direction; misses are negative. <Link href="/rules">Rules</Link></p>
        </section>

        <section className="card">
          <h2>Players & draft order</h2>
          {room.order.map((id, i) => <PlayerRow key={id} p={room.players.find((x) => x.id === id)} i={i} />)}
          {room.players.filter((p) => !room.order.includes(p.id)).map((p) => <PlayerRow key={p.id} p={p} i={null} />)}
          {lobby && (
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={() => act({ type: 'randomize' }, 'Order randomized')} disabled={n < 2}>🎲 Randomize order</button>
            </div>
          )}
          <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); act({ type: 'addPlayer', name: newName }, 'Player added').then((ok) => ok && setNewName('')); }}>
            <input className="grow" placeholder={lobby ? 'Add player by name' : 'Add a late player'} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button>Add</button>
          </form>
          <p className="tiny muted">
            Players can join themselves with the room code. Anyone you add (or whose PIN you reset) logs in with their name and picks a new PIN.
            {!lobby && ' Late players have no draft slot; give them picks with Edit picks below.'}
          </p>
        </section>

        {room.picks.length > 0 && <PickEditor data={data} room={room} act={act} nameOf={nameOf} />}

        <section className="card stack">
          <h2 className="neg">Danger zone</h2>
          <button className="danger" onClick={deleteLeague}>Delete this league</button>
          <p className="tiny muted">Permanently removes the league, its picks and history.</p>
        </section>
      </div>
      <LinesEditor data={data} room={room} act={act} />
    </div>
  );
}

// Fix any pick: change its team, side or owner.
function PickEditor({ data, room, act, nameOf }) {
  const [open, setOpen] = useState(null);
  const [draftEdit, setDraftEdit] = useState(null);
  const abbr = Object.fromEntries(data.teams.map((t) => [t.id, t.abbr]));
  const startEdit = (p) => { setOpen(p.n); setDraftEdit({ teamId: p.teamId, side: p.side, owner: p.owner }); };
  async function save(p) {
    if (await act({ type: 'editPick', n: p.n, ...draftEdit }, 'Pick updated')) setOpen(null);
  }
  return (
    <section className="card">
      <h2>Edit picks</h2>
      <p className="tiny muted">Fix a mis-click or move a pick to another player. The pick takes the team's locked line.</p>
      <div className="scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table className="small">
          <tbody>
            {room.picks.map((p) => (
              <tr key={p.n}>
                <td className="muted num">#{p.n + 1}</td>
                {open === p.n ? (
                  <>
                    <td colSpan={2}>
                      <div className="row">
                        <select value={draftEdit.teamId} onChange={(e) => setDraftEdit({ ...draftEdit, teamId: e.target.value })} aria-label="Team">
                          {[...data.teams].sort((a, b) => a.abbr.localeCompare(b.abbr)).map((t) => <option key={t.id} value={t.id}>{t.abbr}</option>)}
                        </select>
                        <select value={draftEdit.side} onChange={(e) => setDraftEdit({ ...draftEdit, side: e.target.value })} aria-label="Side">
                          <option value="over">OVER</option>
                          <option value="under">UNDER</option>
                        </select>
                        <select value={draftEdit.owner} onChange={(e) => setDraftEdit({ ...draftEdit, owner: e.target.value })} aria-label="Owner">
                          {room.players.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="sm primary" onClick={() => save(p)}>Save</button> <button className="sm" onClick={() => setOpen(null)}>✕</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ whiteSpace: 'nowrap' }}><TeamLogo abbr={abbr[p.teamId]} /><b>{abbr[p.teamId]}</b> <span className={sideCls(p.side)}>{S(p.side)} {p.line}</span></td>
                    <td>{nameOf(p.owner)}</td>
                    <td className="r"><button className="sm" onClick={() => startEdit(p)}>Edit</button></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LinesEditor({ data, room, act }) {
  const lobby = room.status === 'lobby';
  const [edits, setEdits] = useState({});
  const [paste, setPaste] = useState('');
  const set = (id, f, v) => {
    const t = data.teams.find((x) => x.id === id);
    setEdits((e) => ({ ...e, [id]: { ...(e[id] || { line: t.line, over: t.over, under: t.under }), [f]: v } }));
  };
  const dirty = Object.keys(edits).length > 0;

  async function save() {
    if (lobby) {
      if (await act({ type: 'setLines', lines: edits }, 'Lines saved')) setEdits({});
      return;
    }
    if (!confirm(`Change ${Object.keys(edits).length} locked line(s)? Every pick on those teams moves to the new line and scores recalculate.`)) return;
    for (const [teamId, v] of Object.entries(edits)) {
      if (!(await act({ type: 'editLockedLine', teamId, ...v }))) return;
    }
    setEdits({});
  }

  function applyPaste() {
    // Accepts lines like "BOS 50.5 -120 +100" or "Celtics 50.5" (odds default to -110).
    const out = {};
    const bad = [];
    for (const raw of paste.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^(.+?)\s+(\d+(?:\.\d+)?)(?:\s+([+-]?\d+))?(?:\s+([+-]?\d+))?\s*$/.exec(line);
      const t = m && data.teams.find((x) => x.abbr.toLowerCase() === m[1].toLowerCase() || x.name.toLowerCase().includes(m[1].toLowerCase()));
      if (!t) { bad.push(line); continue; }
      out[t.id] = { line: m[2], over: m[3] || -110, under: m[4] || -110 };
    }
    if (bad.length) alert(`Couldn't read:\n${bad.join('\n')}`);
    if (Object.keys(out).length) setEdits((e) => ({ ...e, ...out }));
  }

  return (
    <section className="card">
      <div className="row between">
        <h2>Lines</h2>
        {lobby && <button className="sm" onClick={() => confirm('Reset all lines to the built-in consensus?') && act({ type: 'resetLines' }, 'Lines reset').then(() => setEdits({}))}>Reset to consensus</button>}
      </div>
      <p className="tiny muted">
        {lobby
          ? `Built-in lines are a consensus of DraftKings, FanDuel, BetMGM, Caesars, bet365 and Polymarket as of ${data.feeds.seedLinesAsOf}. Edit any line before starting — they lock at draft start.`
          : 'Locked at draft start. Only change one to fix a mistake: picks on that team move to the new line.'}
      </p>
      <div className="scroll">
        <table className="small">
          <thead><tr><th>Team</th><th>Line</th><th>Over</th><th>Under</th></tr></thead>
          <tbody>
            {data.teams.map((t) => {
              const v = edits[t.id] || { line: t.line, over: t.over, under: t.under };
              return (
                <tr key={t.id}>
                  <td><b>{t.abbr}</b>{edits[t.id] && ' •'}</td>
                  {['line', 'over', 'under'].map((f) => (
                    <td key={f}>
                      <input style={{ width: 72, minHeight: 32, padding: '4px 6px' }} inputMode="decimal" value={v[f]} onChange={(e) => set(t.id, f, e.target.value)} aria-label={`${t.abbr} ${f}`} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" disabled={!dirty} onClick={save}>{lobby ? 'Save lines' : 'Save locked-line changes'}</button>
        {dirty && <button onClick={() => setEdits({})}>Discard</button>}
      </div>
      {lobby && (
        <details style={{ marginTop: 10 }}>
          <summary className="small">Bulk paste</summary>
          <p className="tiny muted">One team per line: <code>BOS 50.5 -120 +100</code> or <code>Celtics 50.5</code>.</p>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="sm" onClick={applyPaste}>Apply to table</button>
        </details>
      )}
    </section>
  );
}

function FeedsNote({ feeds, locked }) {
  const ago = (t) => {
    if (!t) return 'unavailable';
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : `${m} min ago`;
  };
  return (
    <p className="tiny muted" style={{ marginTop: 16 }}>
      Records from ESPN (updated {ago(feeds.standingsAt)}){!locked && <> · Polymarket prices updated {ago(feeds.polyAt)}</>}. For fun among friends — not betting advice.
    </p>
  );
}

function JoinGate({ code, room, onJoined }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const { token } = await api(`/api/rooms/${code}/join`, { body: { name, pin } });
      onJoined(token);
    } catch (e) { setErr(e.message); }
  }
  return (
    <main className="wrap" style={{ maxWidth: 460 }}>
      <form className="card stack" onSubmit={submit} style={{ marginTop: 32 }}>
        <h1>{room.name}</h1>
        <p className="muted small">Room {code} · {room.players.length} joined{room.status !== 'lobby' && ' · draft has started (existing players: log back in with your name + PIN)'}</p>
        {err && <p className="error">{err}</p>}
        <label><span>Display name</span><input required value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></label>
        <label><span>PIN (4–8 digits)</span><input required inputMode="numeric" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value)} style={{ width: '100%' }} /></label>
        <button className="primary">Join</button>
        <Link href="/" className="small">← Home</Link>
      </form>
    </main>
  );
}
