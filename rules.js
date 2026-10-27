// Golden Express rules, shared by the game server and the page: one file, copied as is next to the page.
// No outside code here: plain numbers and functions, so it runs on the game server and in a browser alike.
// Returns about 96% of the stakes: free spins included, the gamble is an even bet and changes nothing.

// Pays for 1..5 symbols in a row from the left reel on a line, per 1 coin bet on the line. WILD stands in for any
// symbol but BONUS; five WILD on a line pay the most.
export const PAY = {
  seven: [0, 0, 50, 200, 1000],
  bar: [0, 0, 25, 100, 400],
  bell: [0, 0, 20, 60, 250],
  melon: [0, 0, 15, 40, 150],
  grapes: [0, 0, 15, 40, 150],
  plum: [0, 0, 10, 25, 100],
  orange: [0, 0, 10, 25, 100],
  lemon: [0, 0, 5, 15, 75],
  cherry: [0, 2, 5, 15, 75],
  wild: [0, 0, 100, 500, 2500],
};
export const SCAT = [0, 0, 0, 2, 10, 50]; // 3, 4, 5 BONUS anywhere on the screen pay this times the whole bet
export const FREE_SPINS = 10;             // 3+ BONUS give this many free spins...
export const FREE_MULT = 2;               // ...whose wins are doubled
export const FREE_MAX = 100;              // free spins per round at most, the ones given again included
export const GAMBLE_MAX = 5;              // doublings in a row at most in the gamble

export const MAX_LINES = 20;
export const BETS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2500, 5000]; // bet per line
export const MAX_STAKE = MAX_LINES * BETS[BETS.length - 1];               // the biggest bet of a spin

// The row (0 top, 1 middle, 2 bottom) of each line on reels 1..5. With N lines on, the first N play.
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 2, 2, 0],
];

// How many of each symbol a reel strip holds; star is BONUS
export const WEIGHTS = { seven: 4, bar: 6, bell: 8, melon: 10, grapes: 10, plum: 12, orange: 12, lemon: 12, cherry: 14, wild: 5, star: 4 };

// A fixed shuffle of the symbols, with no symbol twice in a row where it can be helped
function makeStrip(w, seed) {
  const s = [];
  for (const [k, n] of Object.entries(w)) for (let i = 0; i < n; i++) s.push(k);
  let r = seed;
  for (let i = s.length - 1; i > 0; i--) {
    r = (r * 16807) % 2147483647;
    const j = r % (i + 1);
    [s[i], s[j]] = [s[j], s[i]];
  }
  for (let i = 1; i < s.length; i++) {
    if (s[i] !== s[i - 1]) continue;
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] !== s[i] && s[j - 1] !== s[i] && (j + 1 >= s.length || s[j + 1] !== s[i])) {
        [s[i], s[j]] = [s[j], s[i]];
        break;
      }
    }
  }
  return s;
}
export const STRIPS = [0, 1, 2, 3, 4].map(i => makeStrip(WEIGHTS, 1234 + i * 77));

// The gamble card: suit 0..3 (the first two are red), rank 0..12
export const SUITS = 4;
export const RANKS = 13;
export const isRed = suit => suit < 2;

// The three symbols a reel shows, top to bottom, when it stops at pos
export function visible(reel, pos) {
  const s = STRIPS[reel];
  return [s[pos % s.length], s[(pos + 1) % s.length], s[(pos + 2) % s.length]];
}

// Stops of the five reels -> grid[reel][row]
export const gridOf = stops => stops.map((pos, i) => visible(i, pos));

// Wins of one screen with the first `lines` lines on and `bet` per line. A line pays only its best combination.
export function evalGrid(grid, lines, bet) {
  const wins = [];
  let total = 0;
  for (let li = 0; li < lines; li++) {
    const syms = LINES[li].map((r, c) => grid[c][r]);
    let base = syms.find(s => s !== "wild");
    if (base === "star") base = undefined;
    let n = 0;
    if (base) for (const s of syms) { if (s === base || s === "wild") n++; else break; }
    let wn = 0;
    for (const s of syms) { if (s === "wild") wn++; else break; }
    const pB = base && PAY[base] ? PAY[base][n - 1] || 0 : 0;
    const pW = wn ? PAY.wild[wn - 1] || 0 : 0;
    const [pay, sym, cnt] = pW >= pB ? [pW, "wild", wn] : [pB, base, n];
    if (pay > 0) {
      wins.push({ line: li, sym, cnt, amount: pay * bet });
      total += pay * bet;
    }
  }
  const scPos = [];
  grid.forEach((col, c) => col.forEach((s, r) => { if (s === "star") scPos.push([c, r]); }));
  const sc = scPos.length;
  const scWin = SCAT[Math.min(5, sc)] * bet * lines;
  return { wins, total, sc, scPos, scWin };
}

// One paid spin and the free spins it brings. rand(n) gives a whole number 0..n-1.
// spins: [{ stops, win, more }], the first is the paid one; more = free spins this spin gave. win = all of them.
export function playRound(lines, bet, rand) {
  const spins = [];
  let left = 0, given = 0, win = 0;
  do {
    const free = spins.length > 0;
    if (free) left--;
    const stops = STRIPS.map(s => rand(s.length));
    const res = evalGrid(gridOf(stops), lines, bet);
    const w = (res.total + res.scWin) * (free ? FREE_MULT : 1);
    const more = res.sc >= 3 ? Math.min(FREE_SPINS, FREE_MAX - given) : 0;
    left += more;
    given += more;
    win += w;
    spins.push({ stops, win: w, more });
  } while (left > 0);
  return { spins, win };
}
