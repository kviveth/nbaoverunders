'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveToken } from '@/lib/client';

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
      router.push(`/r/${code}`);
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
    <main className="wrap" style={{ maxWidth: 820 }}>
      <div className="hero">
        <h1>🏀 NBA Over/Under Draft</h1>
        <p className="muted">Snake-draft season win totals with friends. Score = how far your team beats the line.</p>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="grid2">
        <form className="card stack" onSubmit={onJoin}>
          <h2>Join a draft</h2>
          <label><span>Room code</span><input required value={join.code} onChange={(e) => setJoin({ ...join, code: e.target.value })} placeholder="ABCDE" autoCapitalize="characters" style={{ width: '100%' }} /></label>
          <label><span>Display name</span><input required value={join.name} onChange={(e) => setJoin({ ...join, name: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>PIN (4–8 digits — use it to log back in on any device)</span><input required inputMode="numeric" pattern="\d{4,8}" value={join.pin} onChange={(e) => setJoin({ ...join, pin: e.target.value })} style={{ width: '100%' }} /></label>
          <button className="primary" disabled={busy}>Join</button>
        </form>
        <form className="card stack" onSubmit={onCreate}>
          <h2>Start a draft (commissioner)</h2>
          <label><span>League name</span><input required value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Your display name</span><input required value={create.commishName} onChange={(e) => setCreate({ ...create, commishName: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Your PIN (4–8 digits)</span><input required inputMode="numeric" pattern="\d{4,8}" value={create.pin} onChange={(e) => setCreate({ ...create, pin: e.target.value })} style={{ width: '100%' }} /></label>
          <label className="row"><input type="checkbox" checked={create.playing} onChange={(e) => setCreate({ ...create, playing: e.target.checked })} style={{ minHeight: 0 }} /> I'm drafting too</label>
          <button className="primary" disabled={busy}>Create room</button>
        </form>
      </div>
      <div className="card small muted">
        <b>How it works:</b> there are 60 picks (every team's OVER and UNDER). Players snake-draft sides. Lines lock when the draft starts.
        At season's end, each pick scores the number of wins the team finished above (OVER) or below (UNDER) its line, minus that much if it missed.
        During the season the app projects final wins from the current record.
      </div>
    </main>
  );
}
