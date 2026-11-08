// Roguelike run: map generation, rewards, shop, camp, events, saving.

import { CARDS } from './cards.js';
import { CLASSES } from './content.js';
import { ENCOUNTERS, ELITES, BOSSES } from './encounters.js';
import { TRAITS, RELICS } from './traits.js';

export const ACTS = 3;
export const MIN_DECK = 8;
export const RELIC_COUNT = RELICS.length;
const SAVE_KEY = 'hb_run_v38';

// The act board: a grid of face-down cards, Voice of Cards style. Your piece
// starts at the bottom; the boss lair is at the top. Stepping onto a card
// flips it and its neighbours. Shops, camps, strangers, chests and elite dens
// show once flipped; ambushes stay hidden until you step on them.
export const COLS = 5;
export const ROWS = 7;
const WALLS = 6;
const AMBUSHES = [7, 7, 7];
const FORCED = [2, 3]; // every route to the boss crosses this many ambushes (min, max)
export const AMBUSH_TOLL = 25; // gold lost to an ambush (a heart if you can't pay)
export const TUNE = { bossHeal: 1 }; // hearts a boss win restores

const rnd = (n) => Math.floor(Math.random() * n);
const pickOne = (arr) => arr[rnd(arr.length)];
function sample(arr, n) {
  const a = [...arr];
  const out = [];
  while (a.length && out.length < n) out.push(a.splice(rnd(a.length), 1)[0]);
  return out;
}

export function baseId(entry) {
  return entry.endsWith('+') ? entry.slice(0, -1) : entry;
}

export function newRun(clsKey) {
  const cls = CLASSES[clsKey];
  const run = {
    cls: clsKey,
    deck: [...cls.deck],
    hearts: 3,
    maxHearts: 3,
    gold: 40,
    act: 1,
    board: null,
    removeCost: 50,
    relics: [],
    stats: { wins: 0, losses: 0, started: Date.now() },
    over: false,
    won: false,
  };
  run.board = genBoard(1);
  return run;
}

export const rc = (i) => [Math.floor(i / COLS), i % COLS];
const idx = (r, c) => r * COLS + c;
export function around(i, diag = false) {
  const [r, c] = rc(i);
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    if (!diag && dr && dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) out.push(idx(rr, cc));
  }
  return out;
}

// Fewest ambushes on any route from a to b (elite dens count as 10, so a
// cheap route never needs an elite).
function minAmbushes(tiles, a, b) {
  const dist = tiles.map(() => Infinity);
  dist[a] = 0;
  const dq = [a];
  while (dq.length) {
    const i = dq.shift();
    for (const j of around(i)) {
      const t = tiles[j];
      if (t.k === 'wall') continue;
      const w = t.k === 'ambush' ? 1 : t.k === 'elite' ? 10 : 0;
      if (dist[i] + w < dist[j]) { dist[j] = dist[i] + w; if (w) dq.push(j); else dq.unshift(j); }
    }
  }
  return dist[b];
}

function tryBoard(act) {
  const n = ROWS * COLS;
  const tiles = Array.from({ length: n }, () => ({ k: 'open', deco: rnd(6) }));
  const start = idx(ROWS - 1, 2), boss = idx(0, 2);
  tiles[start].k = 'start';
  tiles[boss].k = 'boss';
  tiles[boss].enc = BOSSES[act];
  const near = new Set([start, boss, ...around(start, true), ...around(boss)]);
  const free = () => tiles.map((t, i) => i).filter((i) => tiles[i].k === 'open' && !near.has(i));
  for (const i of sample(free(), WALLS)) { tiles[i].k = 'wall'; tiles[i].v = rnd(2); }
  // Everything open must be reachable.
  const seen = new Set([start]);
  const q = [start];
  while (q.length) for (const j of around(q.shift())) if (tiles[j].k !== 'wall' && !seen.has(j)) { seen.add(j); q.push(j); }
  if (seen.size !== n - WALLS) return null;
  const place = (k, rows, extra = {}) => {
    const opts = free().filter((i) => rows.includes(rc(i)[0]));
    if (!opts.length) return false;
    Object.assign(tiles[pickOne(opts)], { k }, extra);
    return true;
  };
  const elites = sample(ELITES[act], 2);
  const evs = sample(EVENTS.map((e, i) => i), 2);
  const ok = place('shop', [2, 3, 4]) && place('camp', [1, 2, 3]) &&
    place('event', [2, 3, 4, 5], { ev: evs[0] }) && place('event', [1, 2, 3, 4], { ev: evs[1] }) &&
    place('chest', [0, 1, 2, 3, 4, 5]) && place('chest', [0, 1, 2, 3]) &&
    place('elite', [1, 2, 3], { enc: elites[0] }) && (act === 1 || !elites[1] || place('elite', [0, 1, 2, 3], { enc: elites[1] }));
  if (!ok) return null;
  // Ambushes may hide anywhere except right next to the start.
  const fights = sample(ENCOUNTERS[act], ENCOUNTERS[act].length);
  const amb = sample(tiles.map((t, i) => i).filter((i) => tiles[i].k === 'open' && !around(start, true).includes(i)), AMBUSHES[act - 1]);
  amb.forEach((i, k) => Object.assign(tiles[i], { k: 'ambush', enc: fights[k % fights.length] }));
  const m = minAmbushes(tiles, start, boss);
  if (m < FORCED[0] || m > FORCED[1]) return null;
  return { tiles, pos: start, prev: start };
}

export function genBoard(act) {
  let b = null;
  for (let t = 0; !b && t < 2000; t++) b = tryBoard(act);
  reveal(b, b.pos);
  b.tiles[b.pos].vis = true;
  b.tiles[b.pos].done = true;
  return b;
}

// Flip a card and the eight around it. Returns the ones that just flipped.
export function reveal(b, i) {
  const out = [];
  for (const j of [i, ...around(i, true)]) if (!b.tiles[j].seen) { b.tiles[j].seen = true; out.push(j); }
  return out;
}

// Safe to walk through: visited cards that have nothing left on them.
const safe = (t) => t.vis && t.done;

// The route to a card, through safe cards only. [] if it can't be reached.
export function pathTo(b, target) {
  if (target === b.pos) return [];
  const t = b.tiles[target];
  if (!t.seen || t.k === 'wall') return null;
  const from = new Map([[b.pos, -1]]);
  const q = [b.pos];
  while (q.length) {
    const i = q.shift();
    for (const j of around(i)) {
      if (from.has(j)) continue;
      if (j === target) {
        const path = [j];
        for (let k = i; k !== b.pos; k = from.get(k)) path.unshift(k);
        return path;
      }
      if (safe(b.tiles[j])) { from.set(j, i); q.push(j); }
    }
  }
  return null;
}

// Move one card. Returns the cards that flipped.
export function step(b, i) {
  b.prev = b.pos;
  b.pos = i;
  b.tiles[i].vis = true;
  if (b.tiles[i].k === 'open' || b.tiles[i].k === 'start') b.tiles[i].done = true;
  return reveal(b, i);
}

export function here(run) {
  return run.board.tiles[run.board.pos];
}

export function stepBack(run) {
  const b = run.board;
  b.pos = b.prev;
}

// How many ambushes are still hidden on this board.
export function lurking(run) {
  return run.board.tiles.filter((t) => t.k === 'ambush' && !t.done).length;
}

export function save(run) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(run)); } catch (e) { /* storage unavailable */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

// Cards your class can draft: its own cards plus the core cards.
export function draftPool(run, rarity = null) {
  const color = CLASSES[run.cls].color;
  return Object.values(CARDS).filter((d) => !d.token && !d.monster && !d.id.startsWith('__') &&
    (d.color === color || d.color === 'C') && (!rarity || d.rarity === rarity));
}

export function cardChoices(run, { rare = false, spoilsFrom = null } = {}) {
  const rareChance = rare ? 1 : 0.08 + 0.1 * (run.act - 1);
  const out = [];
  const seen = new Set();
  const owned = new Set(run.deck.map(baseId));
  let guard = 0;
  while (out.length < 3 && guard++ < 100) {
    const wantRare = (out.length === 0 && rare) || Math.random() < rareChance;
    let pool = draftPool(run, wantRare ? 'rare' : 'common');
    // Core cards are a smaller share of offers.
    pool = pool.filter((d) => d.color !== 'C' || Math.random() < 0.3);
    if (!pool.length) continue;
    const d = pickOne(pool);
    if (seen.has(d.id)) continue;
    // Favor cards you don't have yet, so rewards show you something new.
    if (owned.has(d.id) && guard < 60 && Math.random() < 0.65) continue;
    seen.add(d.id);
    out.push({ id: d.id });
  }
  // Spoils: one option comes from the defeated opponent's deck, any color.
  if (spoilsFrom) {
    const cands = spoilsFrom.deck.map(baseId).filter((id) => !seen.has(id) && !CARDS[id].token);
    // Their monster cards are the best souvenirs.
    const monsters = cands.filter((id) => CARDS[id].monster);
    if (cands.length) out[2] = { id: pickOne(monsters.length && Math.random() < 0.75 ? monsters : cands), spoils: true };
  }
  return out;
}

// Relics you don't have yet, n of them at random.
export function relicChoices(run, n) {
  return sample(RELICS.filter((id) => !run.relics.includes(id)), n);
}

export function hasRelic(run, id) {
  return (run.relics || []).includes(id);
}

export function rewardFor(run, node, won) {
  if (!won) return { gold: 5, cards: [] };
  const enc = node.enc;
  const idol = hasRelic(run, 'idol') ? 12 : 0;
  if (node.k === 'boss') return { gold: 60 + idol, cards: cardChoices(run, { rare: true }), heal: TUNE.bossHeal, relics: run.act < ACTS ? relicChoices(run, 3) : [] };
  if (node.k === 'elite') return { gold: 35 + idol, cards: cardChoices(run, { rare: true, spoilsFrom: enc }), relics: relicChoices(run, 2) };
  return { gold: 15 + rnd(11) + idol, cards: cardChoices(run, { spoilsFrom: enc }) };
}

export function afterFight(run, node, won) {
  run.robbed = false;
  if (won) run.stats.wins++;
  else {
    run.stats.losses++;
    // Ambushes are low stakes: they rob you instead of wounding you.
    if (node.k === 'ambush' && run.gold >= AMBUSH_TOLL) {
      run.gold -= AMBUSH_TOLL;
      run.robbed = true;
      node.done = true;
      return;
    }
    if (hasRelic(run, 'feather')) {
      run.relics.splice(run.relics.indexOf('feather'), 1);
      run.featherUsed = true;
    } else run.hearts -= 1;
    if (run.hearts <= 0) {
      run.over = true;
      return;
    }
    // Losing to a boss means fighting it again: you fall back a card.
    if (node.k === 'boss') { stepBack(run); return; }
  }
  node.done = true;
  if (node.k === 'boss') nextAct(run);
}

// The card you're on is used up (shop left, camp used, event answered...).
export function finishTile(run) {
  here(run).done = true;
}

export function nextAct(run) {
  if (run.act >= ACTS) {
    run.over = true;
    run.won = true;
    return;
  }
  run.act += 1;
  run.board = genBoard(run.act);
}

// A chest: gold, and sometimes a relic.
export function openChest(run) {
  const gold = 20 + rnd(16) + (hasRelic(run, 'idol') ? 12 : 0);
  run.gold += gold;
  const relic = Math.random() < 0.2 ? relicChoices(run, 1)[0] : null;
  if (relic) run.relics.push(relic);
  finishTile(run);
  return { gold, relic };
}

export function upgrade(run, index) {
  if (run.deck[index].endsWith('+')) return false;
  run.deck[index] = run.deck[index] + '+';
  return true;
}

export function removeCard(run, index) {
  if (run.deck.length <= MIN_DECK) return false;
  run.deck.splice(index, 1);
  return true;
}

export function shopStock(run) {
  const cards = cardChoices(run, {}).map((c) => ({ ...c, price: CARDS[c.id].rarity === 'rare' ? 90 : 45 + rnd(10) }));
  const rareCard = cardChoices(run, { rare: true })[0];
  if (rareCard && !cards.some((c) => c.id === rareCard.id)) cards.push({ ...rareCard, price: 95 + rnd(15) });
  const relic = relicChoices(run, 1)[0];
  return { cards, relic: relic ? { id: relic, price: 110 + rnd(30) } : null };
}

// Events: each has options; `apply` mutates the run and returns a message.
export const EVENTS = [
  {
    title: 'The Wandering Alchemist', art: 'sage',
    text: 'A traveler offers to transmute one of your cards into something new.',
    options: [
      { label: 'Transmute a random card', apply: (run) => {
        const i = rnd(run.deck.length);
        const old = CARDS[baseId(run.deck[i])].name;
        const d = pickOne(draftPool(run).filter((x) => x.rarity === (Math.random() < 0.3 ? 'rare' : 'common')));
        run.deck[i] = d.id;
        return `${old} became ${d.name}.`;
      } },
      { label: 'Decline', apply: () => 'You move on.' },
    ],
  },
  {
    title: 'Shrine of Discord', art: 'mirror',
    text: 'Whispers promise power from a class that is not your own.',
    options: [
      { label: 'Take a card from another class', apply: (run) => {
        const color = CLASSES[run.cls].color;
        const d = pickOne(Object.values(CARDS).filter((x) => !x.token && !x.monster && !x.id.startsWith('__') && x.color !== 'C' && x.color !== color));
        run.deck.push(d.id);
        return `You gained ${d.name}.`;
      } },
      { label: 'Leave it be', apply: () => 'The whispers fade.' },
    ],
  },
  {
    title: "Gambler's Den", art: 'thief',
    text: 'Double or nothing? Stake 25 gold on a coin flip for 75.',
    options: [
      { label: 'Bet 25 gold', enabled: (run) => run.gold >= 25, apply: (run) => {
        run.gold -= 25;
        if (Math.random() < 0.5) { run.gold += 75; return 'You won 75 gold!'; }
        return 'You lost.';
      } },
      { label: 'Walk away', apply: () => 'You keep your gold.' },
    ],
  },
  {
    title: 'Training Grounds', art: 'militia',
    text: 'Veterans drill your troops. Two random cards are upgraded.',
    options: [
      { label: 'Train (upgrade 2 random cards)', apply: (run) => {
        const idx = sample(run.deck.map((e, i) => i).filter((i) => !run.deck[i].endsWith('+')), 2);
        for (const i of idx) run.deck[i] += '+';
        return idx.length ? `Upgraded ${idx.map((i) => CARDS[baseId(run.deck[i])].name).join(' and ')}.` : 'Nothing to upgrade.';
      } },
    ],
  },
  {
    title: 'The Mercenary Camp', art: 'sellsword',
    text: 'Sellswords for hire, or a buyer for your spare gear.',
    options: [
      { label: 'Hire a Hill Giant (40 gold)', enabled: (run) => run.gold >= 40, apply: (run) => {
        run.gold -= 40;
        run.deck.push('giant');
        return 'A Hill Giant joins your deck.';
      } },
      { label: 'Take 30 gold', apply: (run) => { run.gold += 30; return 'You pocket 30 gold.'; } },
    ],
  },
  {
    title: 'Blood Altar', art: 'bloodmage',
    text: 'Offer a heart for a rare card of your class.',
    options: [
      { label: 'Offer 1 heart', enabled: (run) => run.hearts > 1, apply: (run) => {
        run.hearts -= 1;
        const d = pickOne(draftPool(run, 'rare'));
        run.deck.push(d.id);
        return `You gained ${d.name}.`;
      } },
      { label: 'Refuse', apply: () => 'You keep your heart.' },
    ],
  },
  {
    title: 'Quiet Chapel', art: 'martyr',
    text: 'A place to rest, or to let go of what weighs you down.',
    options: [
      { label: 'Recover 1 heart', enabled: (run) => run.hearts < run.maxHearts, apply: (run) => { run.hearts += 1; return 'You feel restored.'; } },
      { label: 'Remove a random card', enabled: (run) => run.deck.length > MIN_DECK, apply: (run) => {
        const i = rnd(run.deck.length);
        const name = CARDS[baseId(run.deck[i])].name;
        run.deck.splice(i, 1);
        return `${name} was removed.`;
      } },
    ],
  },
];

EVENTS.push(
  {
    title: 'Abandoned Cart', art: 'courier',
    text: 'A merchant\'s cart lies tipped in the ditch. Among the spilled goods, something hums with power.',
    options: [
      { label: 'Take the curio (a random relic)', enabled: (run) => relicChoices(run, 1).length > 0, apply: (run) => {
        const id = relicChoices(run, 1)[0];
        run.relics.push(id);
        return `You found ${TRAITS[id].name}: ${TRAITS[id].text}`;
      } },
      { label: 'Take the coin purse (40 gold)', apply: (run) => { run.gold += 40; return 'You pocket 40 gold.'; } },
    ],
  },
  {
    title: 'The Beast Tamer', art: 'hunt',
    text: 'A tamer with a cage of strange creatures offers you one, for a price.',
    options: [
      { label: 'Buy a random monster (30 gold)', enabled: (run) => run.gold >= 30, apply: (run) => {
        run.gold -= 30;
        const d = pickOne(Object.values(CARDS).filter((x) => x.monster));
        run.deck.push(d.id);
        return `${d.name} joins your deck.`;
      } },
      { label: 'Free one and take its reward (25 gold)', apply: (run) => { run.gold += 25; return 'The creature bolts. The tamer\'s rival pays you 25 gold.'; } },
    ],
  },
  {
    title: 'The Old Champion', art: 'warchief',
    text: 'A retired champion will teach one lesson: hit hard, or hit often.',
    options: [
      { label: 'Hit hard: upgrade your most expensive card', apply: (run) => {
        const idx = run.deck.map((e, i) => i).filter((i) => !run.deck[i].endsWith('+'))
          .sort((a, b) => CARDS[baseId(run.deck[b])].cost - CARDS[baseId(run.deck[a])].cost)[0];
        if (idx === undefined) return 'You have nothing left to learn.';
        run.deck[idx] += '+';
        return `Upgraded ${CARDS[baseId(run.deck[idx])].name}.`;
      } },
      { label: 'Hit often: upgrade your 3 cheapest cards', apply: (run) => {
        const idx = run.deck.map((e, i) => i).filter((i) => !run.deck[i].endsWith('+'))
          .sort((a, b) => CARDS[baseId(run.deck[a])].cost - CARDS[baseId(run.deck[b])].cost).slice(0, 3);
        for (const i of idx) run.deck[i] += '+';
        return idx.length ? `Upgraded ${idx.map((i) => CARDS[baseId(run.deck[i])].name).join(', ')}.` : 'You have nothing left to learn.';
      } },
    ],
  },
);

export function randomEvent() {
  return pickOne(EVENTS);
}

export function eventAt(tile) {
  return EVENTS[tile.ev] || randomEvent();
}
