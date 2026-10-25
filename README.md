# NBA Over/Under Draft

Snake-draft NBA season win totals (team + OVER/UNDER) with friends, live over the internet.

- **Any number of players.** All 60 sides (30 teams × over/under) go into the pool, and the same team can be drafted twice (once for each side).
- **Snake draft** with an optional pick timer. When the clock runs out, it auto-picks the top suggestion.
- **Live lines before the draft.** Lines are a built-in sportsbook consensus that you can edit or bulk-paste, plus live Polymarket prices. Everything locks when the draft starts.
- **Suggested picks.** Ranked by expected points, with a flag on picks that "won't last to your next pick".
- **Scoring:** a pick scores the number of wins its team finishes beyond the line, in its direction. A miss scores negative (default) or zero.
- **In-season projections** from ESPN records, a projected leaderboard, and a daily chart.
- **Trades** of drafted picks, with accept/decline. The commissioner can veto.
- **Draft board, teams table** (line value tracking), **activity log, and past-season archives.**
- Join with a room code, display name, and PIN. The PIN gets you back in on any device.

## Deploy (free, about 5 minutes)

1. Push this repo to GitHub.
2. At **vercel.com → Add New → Project**, import the repo, then click Deploy. No settings needed.
3. In the Vercel project, open **Storage → Create Database → Upstash (Redis) → Free plan**, and connect it to the project.
   This adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars automatically.
4. Go to **Deployments → ⋯ → Redeploy** so the app picks up the database.
5. Open `https://<your-project>.vercel.app`, create a room, and share the invite link.

Everything runs on free tiers: Vercel Hobby, Upstash free, ESPN's public standings feed, and Polymarket's public API.

## Local dev

```
npm install
npm run dev     # stores data in .data/store.json when no Redis env vars are set
npm test
```

## How the numbers work

- **Projection:** wins so far + remaining games × a pace that blends the actual win% with the line's pace (the line counts as 50 games of evidence).
- **Market lean:** the sportsbook's no-vig over probability, averaged with Polymarket's price (converted to the book's line) when that market has real volume.
- **Suggestions:** expected points of each open side under the room's scoring mode, using the projection nudged by the market lean.
- Built-in lines live in `lib/teams.js` (`SEED_LINES`). Update them there, or in the Commish tab before drafting.
