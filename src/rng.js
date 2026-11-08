// Seeded RNG (mulberry32). The state lives in the game state so that
// cloned games (AI lookahead, simulations) stay reproducible.

export function nextRandom(holder) {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(holder, lo, hi) {
  return lo + Math.floor(nextRandom(holder) * (hi - lo + 1));
}

export function shuffle(holder, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(holder) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick(holder, arr) {
  return arr.length ? arr[Math.floor(nextRandom(holder) * arr.length)] : undefined;
}
