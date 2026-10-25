'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getToken, saveToken } from '@/lib/client';
import LeaguePicker from '@/components/LeaguePicker';
import LinesBoard from '@/components/LinesBoard';
import TeamLogo from '@/components/TeamLogo';
import { fmt } from './r/[code]/Chart';

export default function Home() {
  const router = useRouter();
  const [create, setCreate] = useState({ name: 'O/U Draft 2026-27', commishName: '', pin: '', playing: true });
  const [join, setJoin] = useState({ code: '', name: '', pin: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onCreate(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { code, token } = await api('/api/rooms', { body: create });
      saveToken(code, token);
      router.push(`/r/${code}?tab=commish`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function onJoin(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const code = join.code.trim().toUpperCase();
    try {
      const { token } = await api(`/api/rooms/${code}/join`, { body: join });
      saveToken(code, token);
      router.push(`/r/${code}`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <div className="hero">
        <h1>🏀 NBA Over/Under Draft</h1>
      </div>

      {err && <p className="error">{err}</p>}
      <div className="grid2">
        <form className="card stack" onSubmit={onJoin}>
          <h2>Join a new league</h2>
          <label><span>Room code (from the invite)</span><input required value={join.code} onChange={(e) => setJoin({ ...join, code: e.target.value })} placeholder="ABCDE" autoCapitalize="characters" style={{ width: '100%' }} /></label>
          <label><span>Display name</span><input required value={join.name} onChange={(e) => setJoin({ ...join, name: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Choose a PIN (4–8 digits — you'll use it to check your score)</span><input required inputMode="numeric" pattern="\d{4,8}" value={join.pin} onChange={(e) => setJoin({ ...join, pin: e.target.value })} style={{ width: '100%' }} /></label>
          <button className="primary" disabled={busy}>Join</button>
        </form>
        <form className="card stack" onSubmit={onCreate}>
          <h2>Start a league (commissioner)</h2>
          <label><span>League name</span><input required value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Your display name</span><input required value={create.commishName} onChange={(e) => setCreate({ ...create, commishName: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Your PIN (4–8 digits)</span><input required inputMode="numeric" pattern="\d{4,8}" value={create.pin} onChange={(e) => setCreate({ ...create, pin: e.target.value })} style={{ width: '100%' }} /></label>
          <label className="row"><input type="checkbox" checked={create.playing} onChange={(e) => setCreate({ ...create, playing: e.target.checked })} style={{ minHeight: 0 }} /> I'm drafting too</label>
          <button className="primary" disabled={busy}>Create league</button>
          <p className="tiny muted">Want to try it first? <Link href="/commish">Create a test draft with bots</Link>.</p>
        </form>
      </div>

      <ScoreChecker />

      <LinesBoard />

    </main>
  );
}

// Pick your league, sign in with name + PIN, see your score.
function ScoreChecker() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in to this league on this device? Show the score straight away.
  useEffect(() => {
    setData(null); setErr('');
    const token = code && getToken(code);
    if (!token) return;
    api(`/api/rooms/${code}`, { token }).then((d) => d.me && setData(d)).catch(() => {});
  }, [code]);

  async function check(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { token } = await api(`/api/rooms/${code}/login`, { body: { name, pin } });
      saveToken(code, token);
      setData(await api(`/api/rooms/${code}`, { token }));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const mine = data && data.scores.findIndex((s) => s.id === data.me.id);
  const me = data && data.scores[mine];

  return (
    <section className="card">
      <h2>My league — check my score</h2>
      <div className="grid2">
        <form className="stack" onSubmit={check}>
          <LeaguePicker value={code} onChange={setCode} />
          {!data && (
            <>
              <label><span>Your name</span><input required value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></label>
              <label><span>Your PIN</span><input required inputMode="numeric" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value)} style={{ width: '100%' }} /></label>
              <button className="primary" disabled={busy || !code}>Check my score</button>
            </>
          )}
          {err && <p className="error small">{err}</p>}
        </form>
        <div>
          {data ? (
            <div className="stack">
              <div className="row between">
                <div>
                  <div className="small muted">{data.room.name} · signed in as {data.me.name}</div>
                  {me ? (
                    <div><span className={`lb-pts ${me.pts >= 0 ? 'pos' : 'neg'}`}>{fmt(me.pts)}</span> <span className="muted">pts · #{mine + 1} of {data.scores.length}</span></div>
                  ) : <div className="muted">You don't own any picks in this league.</div>}
                </div>
                <Link href={`/r/${data.room.code}`}><button className="primary">Open league</button></Link>
              </div>
              {me?.picks.length > 0 && (
                <table className="small">
                  <thead><tr><th>Pick</th><th className="r">W-L</th><th className="r">Proj W</th><th className="r">Pts</th></tr></thead>
                  <tbody>
                    {[...me.picks].sort((a, b) => b.pts - a.pts).map((k) => (
                      <tr key={k.n}>
                        <td style={{ whiteSpace: 'nowrap' }}><TeamLogo abbr={k.abbr} /><b>{k.abbr}</b> <span className={k.side === 'over' ? 'over' : 'under'}>{k.side === 'over' ? 'O' : 'U'} {k.line}</span></td>
                        <td className="r num">{k.w}-{k.l}</td>
                        <td className="r num">{k.proj}</td>
                        <td className={`r num ${k.pts >= 0 ? 'pos' : 'neg'}`}>{fmt(k.pts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <details>
                <summary className="small">League standings</summary>
                <ol className="small">
                  {data.scores.map((s) => <li key={s.id}>{s.name} <b className="num">{fmt(s.pts)}</b></li>)}
                </ol>
              </details>
              <button className="sm" onClick={() => setData(null)}>Sign in as someone else</button>
            </div>
          ) : (
            <p className="small muted">Pick your league and sign in with the name and PIN you joined with to see your points, your picks and the league standings.</p>
          )}
        </div>
      </div>
    </section>
  );
}
