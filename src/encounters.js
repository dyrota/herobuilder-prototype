// Hand-built opponents. Each act has regular fights, elites, and a boss.
// Every deck starts from a class deck (8 core + 8 class cards); `cut` and
// `add` swap cards, and `up` upgrades copies (+1 power, marked "+").
// Bosses fight in a fixed arena: their locations arrive in the listed order.

import { CLASSES, CORE } from './content.js';

function build(cls, { cut = [], add = [], up = [] } = {}) {
  const deck = cls ? [...CLASSES[cls].deck] : [...CORE, ...CORE];
  for (const id of cut) { const i = deck.indexOf(id); if (i >= 0) deck.splice(i, 1); }
  deck.push(...add);
  for (const id of up) { const i = deck.indexOf(id); if (i >= 0) deck[i] = id + '+'; }
  return deck;
}

export const ENCOUNTERS = {
  1: [
    { name: 'Goblin Warband', art: 'goblin', colors: ['B'], difficulty: 'easy', deck: build('body', { cut: ['titan', 'warchief'], add: ['squire', 'militia'] }) },
    { name: 'Hedge Witches', art: 'witch', colors: ['S'], difficulty: 'easy', deck: build('soul', { cut: ['worldTree', 'tender'], add: ['squire', 'militia'] }) },
    { name: 'Street Tricksters', art: 'thief', colors: ['M'], difficulty: 'easy', deck: build('mind', { cut: ['puppetMaster', 'sage'], add: ['squire', 'militia'] }) },
    { name: 'Bandit Camp', art: 'bandit', colors: ['C'], difficulty: 'easy', deck: build(null) },
  ],
  2: [
    { name: 'Ember Cult', art: 'ember', colors: ['B'], difficulty: 'medium', deck: build('body', { up: ['raider', 'hothead'] }) },
    { name: 'Rotwood', art: 'rot', colors: ['S'], difficulty: 'medium', deck: build('soul', { cut: ['courier'], add: ['wisp'], up: ['bloodmage'] }) },
    { name: 'Mirror Court', art: 'mirror', colors: ['M'], difficulty: 'medium', deck: build('mind', { up: ['ambusher', 'scout'] }) },
    { name: 'Wild Hunt', art: 'hunt', colors: ['B', 'S'], difficulty: 'medium', deck: build('body', { cut: ['drummer', 'vanguard'], add: ['thornback', 'wisp'] }) },
    { name: 'Grove Wardens', art: 'warden', colors: ['S', 'M'], difficulty: 'medium', deck: build('soul', { cut: ['seedkeeper', 'bloodmage'], add: ['timekeeper', 'tidecaller'] }) },
  ],
  3: [
    { name: 'Night Court', art: 'night', colors: ['M', 'S'], difficulty: 'medium', deck: build('mind', { cut: ['apprentice', 'squire'], add: ['bloodmage', 'wisp'], up: ['ambusher', 'tidecaller', 'puppetMaster'] }) },
    { name: 'Ash Legion', art: 'legion', colors: ['B'], difficulty: 'medium', deck: build('body', { up: ['raider', 'berserker', 'warchief', 'brute'] }) },
    { name: 'Elder Grove', art: 'grove', colors: ['S'], difficulty: 'medium', deck: build('soul', { up: ['wisp', 'guardian', 'tender', 'thornback'] }) },
    { name: 'Thunder Clan', art: 'thunder', colors: ['B', 'M'], difficulty: 'medium', deck: build('body', { cut: ['courier', 'duelist'], add: ['trickster', 'ambusher'], up: ['warchief', 'titan', 'hothead'] }) },
  ],
};

export const ELITES = {
  1: [
    { name: 'Ogre Chieftain', art: 'ogre', colors: ['B'], difficulty: 'medium', deck: build('body', { cut: ['courier'], add: ['brute'], up: ['brute'] }) },
    { name: 'Coven of Thorns', art: 'coven', colors: ['S'], difficulty: 'medium', deck: build('soul', { cut: ['courier'], add: ['thornback'], up: ['thornback'] }) },
  ],
  2: [
    { name: 'The Mirror Twins', art: 'twins', colors: ['M'], difficulty: 'normal', deck: build('mind', { cut: ['squire', 'courier'], add: ['ambusher', 'scout'], up: ['tidecaller', 'puppetMaster'] }) },
    { name: 'Hellfire Brood', art: 'brood', colors: ['B'], difficulty: 'normal', deck: build('body', { cut: ['courier'], add: ['brawler'], up: ['brawler', 'raider', 'titan'] }) },
  ],
  3: [
    { name: 'Lich King', art: 'lich', colors: ['M', 'S'], difficulty: 'normal', deck: build('mind', { cut: ['squire', 'courier', 'duelist'], add: ['bloodmage', 'spirit', 'worldTree'], up: ['tidecaller', 'puppetMaster', 'sage'] }) },
  ],
};

export const BOSSES = {
  1: { name: 'The Iron Warden', art: 'warden_boss', colors: ['S', 'B'], difficulty: 'medium', boss: true,
    text: 'Fights in its own arena, starting with Old Keep, Sanctuary, and Hourglass Tower.',
    deck: build('soul', { cut: ['bloodmage', 'spirit'], add: ['berserker', 'raider'] }),
    fixedLocations: ['keep', 'sanctuary', 'hourglass', 'crossroads', 'duelPit', 'field', 'market', 'keep'] },
  2: { name: 'The Pale Queen', art: 'queen', colors: ['M', 'S'], difficulty: 'medium', boss: true,
    text: 'Rules from her court, starting with Gallows, Usurper\'s Throne, and Sunken Bog.',
    deck: build('mind', { cut: ['squire', 'courier'], add: ['bloodmage', 'wisp'], up: ['tidecaller', 'ambusher'] }),
    fixedLocations: ['gallows', 'throne', 'bog', 'volcano', 'crossroads', 'gallows', 'field', 'throne'] },
  3: { name: 'Ashmaw the Undying', art: 'dragon', colors: ['B', 'S'], difficulty: 'normal', boss: true,
    text: 'A dragon on its hoard, starting with Volcano, Hall of Echoes, and Old Keep.',
    deck: build('body', { cut: ['squire', 'courier'], add: ['worldTree', 'guardian'], up: ['raider', 'warchief', 'titan', 'brute'] }),
    fixedLocations: ['volcano', 'echoes', 'keep', 'throne', 'duelPit', 'volcano', 'keep', 'field'] },
};

// Stars needed to win. Short fights favor Mind and long ones favor Soul, so
// the run mixes them: quick act 1 fights, 5 for most, 6 for the last boss.
// An encounter can set its own `target`.
for (const [act, list] of Object.entries(ENCOUNTERS)) for (const e of list) e.target ??= act === '1' ? 4 : 5;
for (const list of Object.values(ELITES)) for (const e of list) e.target ??= 5;
for (const [act, b] of Object.entries(BOSSES)) b.target ??= act === '3' ? 6 : 5;
