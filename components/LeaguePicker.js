'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

// Dropdown of every league (the public directory).
export default function LeaguePicker({ value, onChange, showTests = true }) {
  const [leagues, setLeagues] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/api/leagues').then((d) => setLeagues(d.leagues)).catch((e) => setErr(e.message));
  }, []);
  if (err) return <p className="error small">{err}</p>;
  const list = (leagues || []).filter((l) => showTests || !l.test);
  return (
    <label>
      <span>League</span>
      <select required value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }} disabled={!leagues}>
        <option value="">{leagues ? (list.length ? 'Choose your league…' : 'No leagues yet') : 'Loading…'}</option>
        {list.map((l) => (
          <option key={l.code} value={l.code}>{l.name} · {l.season}{l.test ? ' (test)' : ''}</option>
        ))}
      </select>
    </label>
  );
}
