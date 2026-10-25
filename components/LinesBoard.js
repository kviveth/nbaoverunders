'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import TeamLogo from './TeamLogo';

const odds = (v) => (v > 0 ? `+${v}` : `${v}`);
const pct = (p) => `${Math.round(p * 100)}%`;
const signed = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

// Front-page table of every team's current win-total line.
export default function LinesBoard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState('line');
  const [all, setAll] = useState(false);
  useEffect(() => {
    api('/api/lines').then(setData).catch((e) => setErr(e.message));
  }, []);

  const rows = data ? [...data.teams] : [];
  if (sort === 'line') rows.sort((a, b) => b.line - a.line);
  if (sort === 'lean') rows.sort((a, b) => Math.abs(b.pOver - 0.5) - Math.abs(a.pOver - 0.5));
  if (sort === 'proj') rows.sort((a, b) => Math.abs(b.proj - b.line) - Math.abs(a.proj - a.line));
  const shown = all ? rows : rows.slice(0, 10);

  return (
    <section className="card">
      <div className="row between">
        <h2>2026-27 win-total lines</h2>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort lines">
          <option value="line">Sort: line</option>
          <option value="lean">Sort: market lean</option>
          <option value="proj">Sort: projection vs line</option>
        </select>
      </div>
      {err && <p className="error small">{err}</p>}
      {!data && !err && <p className="muted small">Loading lines…</p>}
      {data && (
        <>
          <div className="scroll">
            <table className="small">
              <thead>
                <tr><th>Team</th><th className="r">Line</th><th className="r">Over</th><th className="r">Under</th><th className="r">Mkt O</th><th className="r">W-L</th><th className="r">Proj</th><th className="r">vs line</th></tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const d = t.proj - t.line;
                  return (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap' }}><TeamLogo abbr={t.abbr} /><b>{t.abbr}</b></td>
                      <td className="r num"><b>{t.line}</b></td>
                      <td className="r num muted">{odds(t.over)}</td>
                      <td className="r num muted">{odds(t.under)}</td>
                      <td className="r num">{pct(t.pOver)}{t.poly && <span className="tiny muted" title={`Polymarket O/U ${t.poly.line}: ${pct(t.poly.pOver)} over`}> ●</span>}</td>
                      <td className="r num">{t.w}-{t.l}</td>
                      <td className="r num">{t.proj}</td>
                      <td className={`r num ${d >= 0 ? 'pos' : 'neg'}`}>{signed(d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="sm" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>{all ? 'Show top 10' : 'Show all 30 teams'}</button>
          <p className="tiny muted">
            Consensus of DraftKings, FanDuel, BetMGM, Caesars, bet365 and Polymarket as of {data.feeds.seedLinesAsOf}.
            Mkt O = the market's chance of the OVER (no-vig book price, averaged with Polymarket ● when it has real trading).
            Proj = projected final wins from the current record. Each league can adjust its lines before drafting; they lock when its draft starts.
          </p>
        </>
      )}
    </section>
  );
}
