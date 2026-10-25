'use client';
import { useState } from 'react';

// Fixed categorical order; a player keeps their color for the whole season.
export const seriesColor = (i) => (i < 8 ? `var(--s${i + 1})` : 'var(--muted)');

const W = 640, H = 240, PAD = { l: 40, r: 12, t: 12, b: 26 };

export default function ProjectionChart({ snapshots, players, colorIndex, meId }) {
  const [hover, setHover] = useState(null);
  if (snapshots.length < 2) {
    return <p className="muted small">The chart fills in day by day once the season has a couple of days of results (one point per day).</p>;
  }
  const vals = snapshots.flatMap((s) => players.map((p) => s.pts[p.id] ?? 0));
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 10) { hi += 5; lo -= 5; }
  const x = (i) => PAD.l + (i / (snapshots.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const step = niceStep((hi - lo) / 4);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (snapshots.length - 1));
    setHover(Math.max(0, Math.min(snapshots.length - 1, i)));
  }

  const hs = hover != null ? snapshots[hover] : null;
  const order = hs ? [...players].sort((a, b) => (hs.pts[b.id] ?? 0) - (hs.pts[a.id] ?? 0)) : [];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0] ? { ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)} role="img" aria-label="Projected points by player over the season">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize="11" fill="var(--muted)">{fmtDate(snapshots[0].d)}</text>
        <text x={W - PAD.r} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{fmtDate(snapshots.at(-1).d)}</text>
        {players.map((p) => {
          const d = snapshots.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.pts[p.id] ?? 0).toFixed(1)}`).join('');
          return <path key={p.id} d={d} fill="none" stroke={seriesColor(colorIndex[p.id])} strokeWidth={p.id === meId ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {hs && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-2)" strokeDasharray="3 3" />
            {players.map((p) => (
              <circle key={p.id} cx={x(hover)} cy={y(hs.pts[p.id] ?? 0)} r="4" fill={seriesColor(colorIndex[p.id])} stroke="var(--surface)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hs && (
        <div className="tip" style={{ left: `min(calc(${(x(hover) / W) * 100}% + 10px), calc(100% - 150px))`, top: 8 }}>
          <b>{fmtDate(hs.d)}</b>
          {order.map((p) => (
            <div key={p.id}><span className="swatch" style={{ background: seriesColor(colorIndex[p.id]) }} />{p.name}: <b className="num">{fmt(hs.pts[p.id])}</b></div>
          ))}
        </div>
      )}
      <div className="legend">
        {players.map((p) => (
          <span key={p.id}><span className="swatch" style={{ background: seriesColor(colorIndex[p.id]) }} />{p.name}</span>
        ))}
      </div>
    </div>
  );
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
}

export const fmt = (v) => (v == null ? '–' : `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`);
