// Hand-built opponents. Each act has regular fights, elites, and a boss.
// Every deck starts from a class deck (8 core + 8 class cards); `cut` and
// `add` swap cards, and `up` upgrades copies (+1 power, marked "+").
// Bosses fight in a fixed arena: their locations arrive in the listed order.
// `traits` are the encounter's own rules (see traits.js); most decks also
// carry a monster card or two that you can win as spoils. Enemy decks don't
// use Titan: it's the payoff for the player's wide decks.

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
    { name: 'Goblin Warband', art: 'goblin', colors: ['B'], difficulty: 'easy', traits: ['swarm'], deck: build('body', { cut: ['titan', 'warchief'], add: ['goblinSneak', 'goblinSneak'] }) },
    { name: 'Hedge Witches', art: 'witch', colors: ['S'], difficulty: 'easy', deck: build('soul', { cut: ['worldTree', 'tender', 'seedkeeper'], add: ['hedgeWitch', 'hedgeWitch', 'martyr'] }) },
    { name: 'Street Tricksters', art: 'thief', colors: ['M'], difficulty: 'easy', deck: build('mind', { cut: ['puppetMaster', 'sage', 'scout'], add: ['pickpocket', 'pickpocket', 'lurker'] }) },
    { name: 'Bandit Camp', art: 'bandit', colors: ['C'], difficulty: 'easy', traits: ['ambush'], deck: build(null, { cut: ['colossus', 'giant', 'militia'], add: ['bandit', 'bandit', 'bully'] }) },
  ],
  2: [
    { name: 'Ember Cult', art: 'ember', colors: ['B'], difficulty: 'medium', traits: ['fervor'], deck: build('body', { cut: ['courier', 'squire', 'titan'], add: ['cultist', 'cultist'], up: ['raider', 'hothead'] }) },
    { name: 'Rotwood', art: 'rot', colors: ['S'], difficulty: 'medium', deck: build('soul', { cut: ['courier', 'squire'], add: ['rotGrub', 'rotGrub'], up: ['bloodmage'] }) },
    { name: 'Mirror Court', art: 'mirror', colors: ['M'], difficulty: 'medium', traits: ['static'], deck: build('mind', { cut: ['courier', 'squire'], add: ['mirrorMage', 'mirrorMage'], up: ['ambusher', 'scout'] }) },
    { name: 'Wild Hunt', art: 'hunt', colors: ['B', 'S'], difficulty: 'medium', deck: build('body', { cut: ['drummer', 'vanguard', 'courier', 'titan'], add: ['thornback', 'hound', 'hound'] }) },
    { name: 'Grove Wardens', art: 'warden', colors: ['S', 'M'], difficulty: 'medium', deck: build('soul', { cut: ['seedkeeper', 'bloodmage', 'courier'], add: ['timekeeper', 'tidecaller', 'mossGolem'] }) },
  ],
  3: [
    { name: 'Night Court', art: 'night', colors: ['M', 'S'], difficulty: 'medium', deck: build('mind', { cut: ['apprentice', 'squire', 'courier'], add: ['bloodmage', 'vampire', 'mesmerist'], up: ['ambusher', 'tidecaller', 'puppetMaster'] }) },
    { name: 'Ash Legion', art: 'legion', colors: ['B'], difficulty: 'medium', traits: ['drill'], deck: build('body', { cut: ['courier', 'squire', 'titan'], add: ['legionnaire', 'legionnaire', 'shieldWall'], up: ['raider', 'berserker', 'warchief', 'brute'] }) },
    { name: 'Elder Grove', art: 'grove', colors: ['S'], difficulty: 'medium', traits: ['overgrowth'], deck: build('soul', { cut: ['courier', 'giant', 'spirit'], add: ['oak', 'oak', 'sapling'], up: ['wisp', 'guardian', 'tender', 'thornback'] }) },
    { name: 'Thunder Clan', art: 'thunder', colors: ['B', 'M'], difficulty: 'medium', deck: build('body', { cut: ['courier', 'duelist', 'vanguard', 'titan'], add: ['stormCaller', 'stormCaller', 'packLeader'], up: ['warchief', 'giant', 'hothead'] }) },
  ],
};

export const ELITES = {
  1: [
    { name: 'Ogre Chieftain', art: 'ogre', colors: ['B'], difficulty: 'medium', traits: ['smash'], deck: build('body', { cut: ['courier', 'squire', 'titan'], add: ['ogre', 'ogre'], up: ['brute'] }) },
    { name: 'Coven of Thorns', art: 'coven', colors: ['S'], difficulty: 'medium', traits: ['curse'], deck: build('soul', { cut: ['courier'], add: ['hedgeWitch'], up: ['thornback'] }) },
  ],
  2: [
    { name: 'The Mirror Twins', art: 'twins', colors: ['M'], difficulty: 'normal', traits: ['mirror'], deck: build('mind', { cut: ['squire', 'courier'], add: ['ambusher', 'mirrorMage'], up: ['tidecaller', 'puppetMaster'] }) },
    { name: 'Hellfire Brood', art: 'brood', colors: ['B'], difficulty: 'normal', traits: ['hatch'], deck: build('body', { cut: ['courier', 'titan'], add: ['cultist', 'militia'], up: ['raider'] }) },
  ],
  3: [
    { name: 'Lich King', art: 'lich', colors: ['M', 'S'], difficulty: 'normal', traits: ['raise'], deck: build('mind', { cut: ['squire', 'courier', 'duelist'], add: ['bloodmage', 'mourner', 'worldTree'], up: ['tidecaller', 'puppetMaster', 'sage'] }) },
  ],
};

export const BOSSES = {
  1: { name: 'The Iron Warden', art: 'warden_boss', colors: ['S', 'B'], difficulty: 'medium', boss: true,
    traits: ['sentinel'],
    text: 'Fights in its own arena, starting with Old Keep, Sanctuary, and Hourglass Tower.',
    deck: build('soul', { cut: ['bloodmage', 'spirit'], add: ['berserker', 'raider'] }),
    fixedLocations: ['keep', 'sanctuary', 'hourglass', 'crossroads', 'duelPit', 'field', 'market', 'keep'] },
  2: { name: 'The Pale Queen', art: 'queen', colors: ['M', 'S'], difficulty: 'medium', boss: true,
    traits: ['charm'],
    text: 'Rules from her court, starting with Gallows, Usurper\'s Throne, and Hall of Echoes.',
    deck: build('mind', { cut: ['squire', 'courier'], add: ['bloodmage', 'wisp'], up: ['tidecaller', 'ambusher'] }),
    fixedLocations: ['gallows', 'throne', 'echoes', 'crossroads', 'bog', 'market', 'field', 'throne'] },
  3: { name: 'Ashmaw the Undying', art: 'dragon', colors: ['B', 'S'], difficulty: 'normal', boss: true,
    traits: ['breath'],
    text: 'A dragon on its hoard, starting with Volcano, Hall of Echoes, and Old Keep.',
    deck: build('body', { cut: ['squire', 'courier', 'titan'], add: ['worldTree', 'guardian'], up: ['raider', 'warchief', 'giant', 'brute'] }),
    fixedLocations: ['volcano', 'echoes', 'keep', 'throne', 'duelPit', 'volcano', 'keep', 'field'] },
};

// Stars needed to win. Short fights favor Mind and long ones favor Soul, so
// the run mixes them: quick act 1 fights, 5 for most, 6 for the last boss.
// An encounter can set its own `target`.
for (const [act, list] of Object.entries(ENCOUNTERS)) for (const e of list) e.target ??= act === '1' ? 4 : 5;
for (const list of Object.values(ELITES)) for (const e of list) e.target ??= 5;
for (const [act, b] of Object.entries(BOSSES)) b.target ??= act === '3' ? 6 : 5;
for (const e of [...Object.values(ENCOUNTERS).flat(), ...Object.values(ELITES).flat(), ...Object.values(BOSSES)]) e.traits ??= [];
