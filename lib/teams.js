// Teams keyed by ESPN team id (used by the standings feed).
// `pm` is the team name Polymarket uses in its win-total markets.
export const TEAMS = [
  { id: '1', abbr: 'ATL', name: 'Hawks', city: 'Atlanta' },
  { id: '2', abbr: 'BOS', name: 'Celtics', city: 'Boston' },
  { id: '17', abbr: 'BKN', name: 'Nets', city: 'Brooklyn' },
  { id: '30', abbr: 'CHA', name: 'Hornets', city: 'Charlotte' },
  { id: '4', abbr: 'CHI', name: 'Bulls', city: 'Chicago' },
  { id: '5', abbr: 'CLE', name: 'Cavaliers', city: 'Cleveland' },
  { id: '6', abbr: 'DAL', name: 'Mavericks', city: 'Dallas' },
  { id: '7', abbr: 'DEN', name: 'Nuggets', city: 'Denver' },
  { id: '8', abbr: 'DET', name: 'Pistons', city: 'Detroit' },
  { id: '9', abbr: 'GSW', name: 'Warriors', city: 'Golden State' },
  { id: '10', abbr: 'HOU', name: 'Rockets', city: 'Houston' },
  { id: '11', abbr: 'IND', name: 'Pacers', city: 'Indiana' },
  { id: '12', abbr: 'LAC', name: 'Clippers', city: 'Los Angeles' },
  { id: '13', abbr: 'LAL', name: 'Lakers', city: 'Los Angeles' },
  { id: '29', abbr: 'MEM', name: 'Grizzlies', city: 'Memphis' },
  { id: '14', abbr: 'MIA', name: 'Heat', city: 'Miami' },
  { id: '15', abbr: 'MIL', name: 'Bucks', city: 'Milwaukee' },
  { id: '16', abbr: 'MIN', name: 'Timberwolves', city: 'Minnesota' },
  { id: '3', abbr: 'NOP', name: 'Pelicans', city: 'New Orleans' },
  { id: '18', abbr: 'NYK', name: 'Knicks', city: 'New York' },
  { id: '25', abbr: 'OKC', name: 'Thunder', city: 'Oklahoma City' },
  { id: '19', abbr: 'ORL', name: 'Magic', city: 'Orlando' },
  { id: '20', abbr: 'PHI', name: '76ers', city: 'Philadelphia' },
  { id: '21', abbr: 'PHX', name: 'Suns', city: 'Phoenix' },
  { id: '22', abbr: 'POR', name: 'Trail Blazers', city: 'Portland' },
  { id: '23', abbr: 'SAC', name: 'Kings', city: 'Sacramento' },
  { id: '24', abbr: 'SAS', name: 'Spurs', city: 'San Antonio' },
  { id: '28', abbr: 'TOR', name: 'Raptors', city: 'Toronto' },
  { id: '26', abbr: 'UTA', name: 'Jazz', city: 'Utah' },
  { id: '27', abbr: 'WAS', name: 'Wizards', city: 'Washington' },
];

// ESPN's logo file names differ from the usual abbreviations for a few teams.
const LOGO_SLUG = { GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah', WAS: 'wsh' };

export function logoUrl(abbr, size = 48) {
  const slug = LOGO_SLUG[abbr] || abbr.toLowerCase();
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/${slug}.png&h=${size}&w=${size}`;
}

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
export const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]));

export const SEASON = '2026-27';
export const GAMES = 82;
export const TOTAL_SIDES = TEAMS.length * 2;

// Consensus sportsbook win totals, gathered Oct 25 2026: median across
// Boyd's Bets' six-book consensus (bet365, BetMGM, DraftKings, Caesars, FanDuel,
// Hard Rock), BetMGM's posted board and Polymarket, preferring DraftKings'
// Oct 20 number where it published one. Prices are American odds.
// The commissioner can edit any of these before the draft starts.
export const SEED_LINES = {
  ATL: [43.5, -110, -110],
  BOS: [50.5, -120, 100],
  BKN: [23.5, -110, -110],
  CHA: [38.5, -110, -110],
  CHI: [27.5, -110, -110],
  CLE: [47.5, -110, -110],
  DAL: [34.5, -110, -110],
  DEN: [48.5, -110, -110],
  DET: [48.5, -130, 110],
  GSW: [40.5, -110, -110],
  HOU: [47.5, -110, -110],
  IND: [44.5, -110, -110],
  LAC: [27.5, -110, -110],
  LAL: [45.5, -115, -105],
  MEM: [28.5, -110, -110],
  MIA: [46.5, -110, -110],
  MIL: [24.5, -110, -110],
  MIN: [48.5, -110, -110],
  NOP: [27.5, -110, -110],
  NYK: [51.5, -110, -110],
  OKC: [60.5, -200, 165],
  ORL: [43.5, -110, -110],
  PHI: [50.5, -110, -110],
  PHX: [40.5, -110, -110],
  POR: [43.5, -110, -110],
  SAC: [20.5, -110, -110],
  SAS: [59.5, -125, 105],
  TOR: [45.5, -110, -110],
  UTA: [36.5, -110, -110],
  WAS: [35.5, -110, -110],
};

export const SEED_LINES_AS_OF = '2026-10-25';

export function seedLines() {
  const out = {};
  for (const t of TEAMS) {
    const [line, over, under] = SEED_LINES[t.abbr];
    out[t.id] = { line, over, under };
  }
  return out;
}

export function teamLabel(id) {
  const t = TEAM_BY_ID[id];
  return t ? `${t.city} ${t.name}` : id;
}
