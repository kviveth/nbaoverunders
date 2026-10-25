// The scoring rules, shown on /rules and in the home-page score checker.
export default function ScoringRules({ compact = false }) {
  return (
    <div className="stack small">
      <p>
        <b>Every pick scores how far its team finishes past the line — in the direction you picked.</b>{' '}
        Right by 10 wins = <span className="pos">+10</span>. Wrong by 4 wins = <span className="neg">−4</span>. Misses always cost you.
      </p>
      <table className="small">
        <thead>
          <tr><th>Your pick</th><th className="r">Final wins</th><th className="r">Points</th></tr>
        </thead>
        <tbody>
          <tr><td>Miami <span className="over">OVER 46.5</span></td><td className="r num">52</td><td className="r num pos">+5.5</td></tr>
          <tr><td>Miami <span className="over">OVER 46.5</span></td><td className="r num">42</td><td className="r num neg">−4.5</td></tr>
          <tr><td>Miami <span className="under">UNDER 46.5</span></td><td className="r num">42</td><td className="r num pos">+4.5</td></tr>
          <tr><td>Miami <span className="under">UNDER 46.5</span></td><td className="r num">52</td><td className="r num neg">−5.5</td></tr>
        </tbody>
      </table>
      <p className="muted">Formula: OVER = wins − line. UNDER = line − wins. Your total is the sum of all your picks.</p>
      {!compact && (
        <>
          <h3>Draft</h3>
          <ul>
            <li>60 picks in the pool: every team's OVER and every team's UNDER. Both sides of the same team can be drafted (by different players).</li>
            <li>Snake order: 1→N, then N→1, and so on. Everyone gets the same number of picks unless the commissioner chooses to use all 60.</li>
            <li>Lines lock the moment the draft starts. Every pick keeps its locked line for the whole season.</li>
            <li>If your pick clock runs out, the app auto-drafts the top suggestion for you.</li>
          </ul>
          <h3>During the season</h3>
          <ul>
            <li>Standings show <b>projected</b> points: each team's projected final wins, scored with the same formula.</li>
            <li>Projected wins = wins so far + remaining games at a pace blending the team's actual win% with its line (the line counts as 50 games of evidence, so a hot or cold first week doesn't swing everything).</li>
            <li>Points become final when the regular season ends (82 games).</li>
            <li>Half-point lines mean there are no ties. If a whole-number line is used and a team lands exactly on it, that pick scores 0.</li>
          </ul>
          <h3>Trades</h3>
          <ul>
            <li>Players can trade drafted picks any time. The receiver accepts or declines, and the commissioner can veto.</li>
            <li>A traded pick keeps its line; its points go to whoever owns it at season's end.</li>
          </ul>
          <h3>Winner</h3>
          <p>Most total points after the regular season wins the league.</p>
        </>
      )}
    </div>
  );
}
