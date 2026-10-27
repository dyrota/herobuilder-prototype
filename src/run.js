// Roguelike run: map generation, rewards, shop, camp, events, saving.

import { CARDS } from './cards.js';
import { CLASSES } from './content.js';
import { ENCOUNTERS, ELITES, BOSSES } from './encounters.js';

export const ACTS = 3;
export const STEPS_PER_ACT = 5; // then the boss
export const MIN_DECK = 8;
const SAVE_KEY = 'hb_run_v3';

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
    step: 0,
    map: [],
    removeCost: 50,
    stats: { wins: 0, losses: 0, started: Date.now() },
    over: false,
    won: false,
  };
  run.map = genAct(run, 1);
  return run;
}

function genAct(run, act) {
  const steps = [];
  const fights = sample(ENCOUNTERS[act], ENCOUNTERS[act].length);
  let fi = 0;
  const fight = () => ({ type: 'fight', enc: fights[fi++ % fights.length] });
  for (let i = 0; i < STEPS_PER_ACT; i++) {
    const opts = [];
    if (i === 0) {
      opts.push(fight(), fight());
    } else {
      opts.push(fight());
      const pool = ['event', 'shop', 'camp', 'fight'];
      if (i >= 2) pool.push('elite', 'elite');
      const used = new Set();
      while (opts.length < 3) {
        const t = pickOne(pool);
        if (used.has(t) && t !== 'fight') continue;
        used.add(t);
        if (t === 'fight') opts.push(fight());
        else if (t === 'elite') opts.push({ type: 'elite', enc: pickOne(ELITES[act]) });
        else opts.push({ type: t });
      }
    }
    steps.push(sample(opts, opts.length));
  }
  steps.push([{ type: 'boss', enc: BOSSES[act] }]);
  return steps;
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
  return Object.values(CARDS).filter((d) => !d.token && !d.id.startsWith('__') &&
    (d.color === color || d.color === 'C') && (!rarity || d.rarity === rarity));
}

export function cardChoices(run, { rare = false, spoilsFrom = null } = {}) {
  const rareChance = rare ? 1 : 0.08 + 0.1 * (run.act - 1);
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < 3 && guard++ < 100) {
    const wantRare = (out.length === 0 && rare) || Math.random() < rareChance;
    let pool = draftPool(run, wantRare ? 'rare' : 'common');
    // Core cards are a smaller share of offers.
    pool = pool.filter((d) => d.color !== 'C' || Math.random() < 0.3);
    if (!pool.length) continue;
    const d = pickOne(pool);
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    out.push({ id: d.id });
  }
  // Spoils: one option comes from the defeated opponent's deck, any color.
  if (spoilsFrom) {
    const cands = spoilsFrom.deck.map(baseId).filter((id) => !seen.has(id) && !CARDS[id].token);
    if (cands.length) out[2] = { id: pickOne(cands), spoils: true };
  }
  return out;
}

export function rewardFor(run, node, won) {
  if (!won) return { gold: 5, cards: [] };
  const enc = node.enc;
  if (node.type === 'boss') return { gold: 60, cards: cardChoices(run, { rare: true }), heal: 3 };
  if (node.type === 'elite') return { gold: 35, cards: cardChoices(run, { rare: true, spoilsFrom: enc }) };
  return { gold: 15 + rnd(11), cards: cardChoices(run, { spoilsFrom: enc }) };
}

export function afterFight(run, node, won) {
  if (won) run.stats.wins++;
  else {
    run.stats.losses++;
    run.hearts -= 1;
    if (run.hearts <= 0) {
      run.over = true;
      return;
    }
    // Losing to a boss means fighting it again.
    if (node.type === 'boss') return;
  }
  advance(run);
}

export function advance(run) {
  run.step += 1;
  if (run.step > STEPS_PER_ACT) {
    if (run.act >= ACTS) {
      run.over = true;
      run.won = true;
      return;
    }
    run.act += 1;
    run.step = 0;
    run.map = genAct(run, run.act);
  }
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
  return { cards };
}

// Events: each has options; `apply` mutates the run and returns a message.
export const EVENTS = [
  {
    title: 'The Wandering Alchemist', art: '⚗️',
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
    title: 'Shrine of Discord', art: '🗿',
    text: 'Whispers promise power from a class that is not your own.',
    options: [
      { label: 'Take a card from another class', apply: (run) => {
        const color = CLASSES[run.cls].color;
        const d = pickOne(Object.values(CARDS).filter((x) => !x.token && !x.id.startsWith('__') && x.color !== 'C' && x.color !== color));
        run.deck.push(d.id);
        return `You gained ${d.name}.`;
      } },
      { label: 'Leave it be', apply: () => 'The whispers fade.' },
    ],
  },
  {
    title: "Gambler's Den", art: '🎲',
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
    title: 'Training Grounds', art: '🏋️',
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
    title: 'The Mercenary Camp', art: '⛺',
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
    title: 'Blood Altar', art: '🩸',
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
    title: 'Quiet Chapel', art: '⛪',
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

export function randomEvent() {
  return pickOne(EVENTS);
}
