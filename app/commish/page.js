'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, saveToken } from '@/lib/client';
import LeaguePicker from '@/components/LeaguePicker';

export default function CommishLogin() {
  const router = useRouter();
  const [login, setLogin] = useState({ code: '', name: '', pin: '' });
  const [test, setTest] = useState({ name: 'Test draft', commishName: '', pin: '', bots: 5, playing: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onLogin(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { token, code } = await api(`/api/rooms/${login.code}/login`, { body: { name: login.name, pin: login.pin, commish: true } });
      saveToken(code, token);
      router.push(`/r/${code}?tab=commish`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function onTest(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { code, token } = await api('/api/rooms', { body: { ...test, test: true } });
      saveToken(code, token);
      router.push(`/r/${code}?tab=commish`);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <main className="wrap" style={{ maxWidth: 860 }}>
      <p><Link href="/">← Home</Link></p>
      <h1>Commissioner</h1>
      {err && <p className="error">{err}</p>}
      <div className="grid2" style={{ alignItems: 'start' }}>
        <form className="card stack" onSubmit={onLogin}>
          <h2>Commissioner login</h2>
          <LeaguePicker value={login.code} onChange={(code) => setLogin({ ...login, code })} />
          <label><span>Your name</span><input required value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Your PIN</span><input required inputMode="numeric" pattern="\d{4,8}" value={login.pin} onChange={(e) => setLogin({ ...login, pin: e.target.value })} style={{ width: '100%' }} /></label>
          <button className="primary" disabled={busy || !login.code}>Open commissioner tools</button>
          <p className="tiny muted">
            Commissioner tools: start/pause/undo the draft, edit any pick (team, side or owner), edit lines even after they lock,
            rename players, reset forgotten PINs, add or remove players, veto trades, archive the season and delete the league.
          </p>
        </form>
        <form className="card stack" onSubmit={onTest}>
          <h2>Create a test draft</h2>
          <p className="small muted">A practice league filled with bots so you can see the whole thing work. Bots pick on their own every 1.5 seconds. Delete it from the Commish tab when you're done.</p>
          <label><span>League name</span><input required value={test.name} onChange={(e) => setTest({ ...test, name: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Your name</span><input required value={test.commishName} onChange={(e) => setTest({ ...test, commishName: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>PIN</span><input required inputMode="numeric" pattern="\d{4,8}" value={test.pin} onChange={(e) => setTest({ ...test, pin: e.target.value })} style={{ width: '100%' }} /></label>
          <label><span>Number of bots</span>
            <select value={test.bots} onChange={(e) => setTest({ ...test, bots: +e.target.value })}>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="row"><input type="checkbox" checked={test.playing} onChange={(e) => setTest({ ...test, playing: e.target.checked })} style={{ minHeight: 0 }} /> I draft a seat too (unchecked = bots draft everything)</label>
          <button className="primary" disabled={busy}>Create test draft</button>
        </form>
      </div>
    </main>
  );
}
