// Card definitions. Every deck is the same 8 core cards plus the 8 cards of
// one class:
//   C Core  (shared curve: simple bodies and two light effects)
//   M Mind  (outthink: read the opponent, reposition, control timing)
//   B Body  (overwhelm: burst power, crush enemies, slam locations shut)
//   S Soul  (endure: grow, persist across locations, profit from loss)
//
// No keywords: every effect is spelled out in plain text. A few cards still
// use engine flags internally (`flags`), but players only ever see the text.
//
// Effects receive the Game (g) and the card instance (c).
// Hooks: onReveal, ongoing (recomputed constantly), endTurn, onResolve
// (before scoring), lastRites (when destroyed), onDestroyHere (any card
// destroyed in this lane), onMove.

export const CARDS = {
  // ---------- Core: in every deck ----------
  squire: { name: 'Squire', color: 'C', cost: 1, power: 2, art: 'squire', text: '' },
  courier: { name: 'Courier', color: 'C', cost: 2, power: 1, art: 'courier', text: 'When revealed: draw a card.',
    onReveal: (g, c) => g.draw(c.owner, 1) },
  militia: { name: 'Militia', color: 'C', cost: 2, power: 3, art: 'militia', text: '' },
  duelist: { name: 'Duelist', color: 'C', cost: 2, power: 2, art: 'duelist', text: '+2 power while it is your only card here.',
    ongoing: (g, c) => { if (g.allies(c).length === 0) c.aura += 2; } },
  sellsword: { name: 'Sellsword', color: 'C', cost: 3, power: 4, art: 'sellsword', text: '' },
  brute: { name: 'Stone Brute', color: 'C', cost: 4, power: 6, art: 'brute', text: '' },
  giant: { name: 'Hill Giant', color: 'C', cost: 6, power: 9, art: 'giant', text: '' },
  colossus: { name: 'Colossus', color: 'C', cost: 9, power: 14, art: 'colossus', text: '' },

  // ---------- Mind: outthink ----------
  apprentice: { name: 'Apprentice', color: 'M', cost: 1, power: 1, art: 'apprentice', text: 'When revealed: draw a card.',
    onReveal: (g, c) => g.draw(c.owner, 1) },
  trickster: { name: 'Trickster', color: 'M', cost: 1, power: 3, art: 'trickster', flags: ['shift'],
    text: 'Once each turn after it is revealed, you can move it to another lane.' },
  ambusher: { name: 'Ambusher', color: 'M', cost: 2, power: 3, art: 'ambusher', text: 'When revealed: +3 power if the enemy played a card here this turn.',
    onReveal: (g, c) => { if (g.castHere(c.lane, 1 - c.owner) > 0) g.buff(c, 3); } },
  scout: { name: 'Lone Scout', color: 'M', cost: 2, power: 3, art: 'scout', text: 'When revealed: +3 power if the enemy played no card here this turn.',
    onReveal: (g, c) => { if (g.castHere(c.lane, 1 - c.owner) === 0) g.buff(c, 3); } },
  timekeeper: { name: 'Timekeeper', color: 'M', cost: 2, power: 4, art: 'timekeeper', text: 'When revealed: this location can\'t resolve this turn.',
    onReveal: (g, c) => g.delay(c.lane) },
  tidecaller: { name: 'Tidecaller', color: 'M', cost: 3, power: 4, art: 'tidecaller', text: 'When revealed: return the most expensive enemy card here to its owner\'s hand.',
    onReveal: (g, c) => {
      let t = null;
      for (const e of g.enemies(c)) if (!t || g.def(e).cost > g.def(t).cost) t = e;
      if (t) g.bounce(t, c.owner);
    } },
  sage: { name: 'Patient Sage', color: 'M', cost: 2, power: 2, art: 'sage', text: 'When revealed: for the rest of the game, energy you don\'t spend carries over to your next turn.',
    onReveal: (g, c) => { g.s.players[c.owner].carry = true; } },
  puppetMaster: { name: 'Puppet Master', color: 'M', cost: 8, power: 10, rarity: 'rare', art: 'puppetmaster', text: 'When revealed: move every enemy card here to their other lanes.',
    onReveal: (g, c) => {
      for (const e of g.enemies(c)) {
        if (g.has(e, 'root')) continue;
        for (const i of g.otherLanes(c.lane)) if (g.moveCard(e, i, c.owner)) break;
      }
    } },

  // ---------- Body: overwhelm ----------
  brawler: { name: 'Brawler', color: 'B', cost: 1, power: 2, art: 'brawler', text: 'When revealed: +3 power this turn.',
    onReveal: (g, c) => g.surge(c, 3) },
  raider: { name: 'Raider', color: 'B', cost: 2, power: 4, art: 'raider', text: 'When revealed: the weakest enemy card here loses 2 power.',
    onReveal: (g, c) => { const t = g.weakest(g.enemies(c)); if (t) g.debuff(t, 2, c.owner); } },
  hothead: { name: 'Hothead', color: 'B', cost: 2, power: 6, art: 'hothead', flags: ['burnout'], text: 'Destroyed at the end of the turn, after locations resolve.' },
  drummer: { name: 'War Drummer', color: 'B', cost: 2, power: 4, art: 'drummer', text: 'When revealed: next turn, your cards cost 1 less.',
    onReveal: (g, c) => { g.s.players[c.owner].discountNext += 1; } },
  vanguard: { name: 'Vanguard', color: 'B', cost: 2, power: 2, art: 'vanguard', text: 'When revealed: if you are ahead here by 3 or more at the end of the turn, this location resolves.',
    onReveal: (g, c) => g.ignite(c.lane, c.owner, 3) },
  berserker: { name: 'Berserker', color: 'B', cost: 3, power: 4, art: 'berserker', text: '+1 power for each enemy card here.',
    ongoing: (g, c) => { c.aura += g.enemies(c).length; } },
  warchief: { name: 'Warchief', color: 'B', cost: 4, power: 7, art: 'warchief', text: 'When revealed: your other cards here get +2 power this turn.',
    onReveal: (g, c) => { for (const a of g.allies(c)) g.surge(a, 2); } },
  titan: { name: 'Titan', color: 'B', cost: 8, power: 11, rarity: 'rare', art: 'titan', text: 'Costs 1 less for each of your cards in play, counting ones you play this turn. When revealed: every enemy card here loses 2 power.',
    costLess: (g, c) => { let n = 0; for (let i = 0; i < 3; i++) n += g.laneCards(i, c.owner).filter((x) => x !== c).length; return n; },
    onReveal: (g, c) => { for (const e of g.enemies(c)) g.debuff(e, 2, c.owner); } },

  // ---------- Soul: endure ----------
  wisp: { name: 'Wisp', color: 'S', cost: 1, power: 2, art: 'wisp', text: 'At the end of each turn, +1 power.',
    endTurn: (g, c) => g.buff(c, 1) },
  seedkeeper: { name: 'Seed Keeper', color: 'S', cost: 2, power: 1, art: 'seedkeeper', text: 'When revealed: for the rest of the game, you get 1 more energy each turn.',
    onReveal: (g, c) => { g.s.players[c.owner].ramp += 1; } },
  spirit: { name: 'Restless Spirit', color: 'S', cost: 2, power: 2, art: 'spirit', flags: ['undying'], text: 'When it leaves play, it returns to your hand.' },
  thornback: { name: 'Thornback', color: 'S', cost: 3, power: 3, art: 'thornback', text: 'At the end of each turn, +2 power.',
    endTurn: (g, c) => g.buff(c, 2) },
  guardian: { name: 'Old Guardian', color: 'S', cost: 3, power: 4, art: 'guardian', flags: ['root'], text: 'Stays when its location resolves, and fights at the next one.' },
  bloodmage: { name: 'Blood Mage', color: 'S', cost: 3, power: 3, art: 'bloodmage', text: 'When revealed: destroy your weakest other card here and gain double its power.',
    onReveal: (g, c) => {
      const t = g.weakest(g.allies(c));
      if (!t) return;
      const p = g.power(t);
      if (g.destroy(t, c.owner)) g.buff(c, 2 * p);
    } },
  tender: { name: 'Grove Tender', color: 'S', cost: 4, power: 5, art: 'tender', text: 'At the end of each turn, your other cards here get +1 power.',
    endTurn: (g, c) => { for (const a of g.allies(c)) g.buff(a, 1); } },
  worldTree: { name: 'World Tree', color: 'S', cost: 8, power: 6, rarity: 'rare', art: 'worldtree', flags: ['root'], text: 'Stays when its location resolves. At the end of each turn, all your cards get +1 power.',
    endTurn: (g, c) => { for (const x of g.boardCards(c.owner)) g.buff(x, 1); } },

  // ---------- Rares beyond the starter decks (found in runs) ----------
  archmage: { name: 'Archmage', color: 'M', cost: 6, power: 6, rarity: 'rare', art: 'archmage', text: 'When revealed: your other cards here repeat their When revealed effects.',
    onReveal: (g, c) => {
      for (const a of g.allies(c)) { const d = g.def(a); if (a.id !== 'archmage' && d.onReveal && a.revealed && a.zone === 'board') d.onReveal(g, a); }
    } },
  puppeteer: { name: 'Puppeteer', color: 'M', cost: 5, power: 4, rarity: 'rare', art: 'puppeteer', text: 'When revealed: take control of the weakest enemy card here.',
    onReveal: (g, c) => { const t = g.weakest(g.enemies(c)); if (t) g.steal(t, c.owner); } },
  bearer: { name: 'Standard Bearer', color: 'B', cost: 5, power: 5, rarity: 'rare', art: 'bearer', text: 'Your other cards in every lane have +1 power.',
    ongoing: (g, c) => { for (const x of g.boardCards(c.owner)) if (x !== c && x.revealed) x.aura += 1; } },
  tyrant: { name: 'Ember Tyrant', color: 'B', cost: 7, power: 8, rarity: 'rare', art: 'brood', text: 'When revealed: destroy every enemy card here with 3 or less power.',
    onReveal: (g, c) => { for (const e of g.enemies(c)) if (g.power(e) <= 3) g.destroy(e, c.owner); } },
  phoenix: { name: 'Phoenix', color: 'S', cost: 4, power: 4, rarity: 'rare', art: 'ember', flags: ['undying'], text: 'When it leaves play, it returns to your hand with +2 power for the rest of the battle.',
    onLeave: (g, c) => { c.trained += 2; } },
  reaper: { name: 'Soul Reaper', color: 'S', cost: 4, power: 3, rarity: 'rare', art: 'lich', text: 'Whenever any card is destroyed, +2 power.',
    onAnyDestroy: (g, c) => g.buff(c, 2) },

  // ---------- Reward cards: never in a starter deck, found in runs ----------
  // Each pushes a way to build: Mind moves and draws, Body goes wide and
  // slams locations shut, Soul profits from loss and grows.
  lurker: { name: 'Lurker', color: 'M', cost: 1, power: 2, art: 'lurker', text: 'When revealed: +3 power if the enemy played a card here this turn.',
    onReveal: (g, c) => { if (g.castHere(c.lane, 1 - c.owner) > 0) g.buff(c, 3); } },
  blinkAdept: { name: 'Blink Adept', color: 'M', cost: 2, power: 4, art: 'blinkAdept', flags: ['shift'], text: 'Once each turn after it is revealed, you can move it to another lane. When it moves: +2 power.',
    onMove: (g, c) => g.buff(c, 2) },
  scholar: { name: 'Scholar', color: 'M', cost: 2, power: 2, art: 'scholar', text: '+1 power for each card in your hand.',
    ongoing: (g, c) => { c.aura += g.s.players[c.owner].hand.length; } },
  mesmerist: { name: 'Mesmerist', color: 'M', cost: 3, power: 3, art: 'mesmerist', text: 'When revealed: move the most expensive card the enemy played here this turn to another lane.',
    onReveal: (g, c) => {
      let t = null;
      for (const e of g.laneCards(c.lane, 1 - c.owner)) if (e.cast === g.s.turn && (!t || g.def(e).cost > g.def(t).cost)) t = e;
      if (t) for (const i of g.otherLanes(c.lane)) if (g.moveCard(t, i, c.owner)) break;
    } },
  lorekeeper: { name: 'Lorekeeper', color: 'M', cost: 3, power: 4, art: 'lorekeeper', text: 'When revealed: draw a card.',
    onReveal: (g, c) => g.draw(c.owner, 1) },
  recruiter: { name: 'Recruiter', color: 'B', cost: 2, power: 3, art: 'recruiter', text: 'When revealed: add a 1-power Recruit here.',
    onReveal: (g, c) => g.createToken('recruit', c.lane, c.owner) },
  shieldWall: { name: 'Shield Wall', color: 'B', cost: 3, power: 3, art: 'shieldWall', text: 'Your other cards here have +1 power.',
    ongoing: (g, c) => { for (const a of g.allies(c)) a.aura += 1; } },
  bully: { name: 'Bully', color: 'B', cost: 3, power: 4, art: 'bully', text: 'When revealed: destroy the weakest enemy card here if it has 2 or less power.',
    onReveal: (g, c) => { const t = g.weakest(g.enemies(c)); if (t && g.power(t) <= 2) g.destroy(t, c.owner); } },
  siegeRam: { name: 'Siege Ram', color: 'B', cost: 4, power: 4, art: 'siegeRam', text: 'When revealed: if you are ahead here at the end of the turn, this location resolves.',
    onReveal: (g, c) => g.ignite(c.lane, c.owner, 1) },
  packLeader: { name: 'Pack Leader', color: 'B', cost: 4, power: 3, art: 'packLeader', text: '+1 power for each of your other cards in play.',
    ongoing: (g, c) => { c.aura += g.boardCards(c.owner).filter((x) => x !== c).length; } },
  martyr: { name: 'Martyr', color: 'S', cost: 1, power: 2, art: 'martyr', text: 'When destroyed: your strongest card in play gets +3 power.',
    lastRites: (g, c) => { const t = g.strongest(g.boardCards(c.owner)); if (t) g.buff(t, 3); } },
  sapling: { name: 'Sapling', color: 'S', cost: 2, power: 1, art: 'sapling', flags: ['root'], text: 'Stays when its location resolves. At the end of each turn, +1 power.',
    endTurn: (g, c) => g.buff(c, 1) },
  mourner: { name: 'Mourner', color: 'S', cost: 2, power: 3, art: 'mourner', text: 'Whenever one of your other cards is destroyed, +2 power.',
    onAnyDestroy: (g, c, dead) => { if (dead.owner === c.owner && dead !== c) g.buff(c, 2); } },
  harvester: { name: 'Harvester', color: 'S', cost: 3, power: 1, art: 'harvester', text: 'When revealed: +2 power for each star the enemy has.',
    onReveal: (g, c) => g.buff(c, 2 * g.s.players[1 - c.owner].points) },
  lifebinder: { name: 'Lifebinder', color: 'S', cost: 4, power: 4, art: 'lifebinder', text: 'At the end of each turn, your weakest card in play gets +2 power.',
    endTurn: (g, c) => { const t = g.weakest(g.boardCards(c.owner)); if (t) g.buff(t, 2); } },

  // ---------- Monsters: enemy cards you can win as spoils ----------
  goblinSneak: { name: 'Goblin Sneak', color: 'B', cost: 1, power: 1, monster: true, art: 'goblin', text: 'When revealed: add a 1-power Goblin to each other lane.',
    onReveal: (g, c) => { for (const i of g.otherLanes(c.lane)) g.createToken('goblin', i, c.owner); } },
  hedgeWitch: { name: 'Hedge Witch', color: 'S', cost: 2, power: 2, monster: true, art: 'witch', text: 'When revealed: your other cards here get +1 power.',
    onReveal: (g, c) => { for (const a of g.allies(c)) g.buff(a, 1); } },
  pickpocket: { name: 'Pickpocket', color: 'M', cost: 1, power: 2, monster: true, art: 'thief', text: 'When revealed: if the enemy played a card here this turn, draw a card.',
    onReveal: (g, c) => { if (g.castHere(c.lane, 1 - c.owner) > 0) g.draw(c.owner, 1); } },
  bandit: { name: 'Bandit', color: 'C', cost: 2, power: 3, monster: true, art: 'bandit', text: 'When revealed: +2 power if you have fewer stars.',
    onReveal: (g, c) => { if (g.s.players[c.owner].points < g.s.players[1 - c.owner].points) g.buff(c, 2); } },
  cultist: { name: 'Ember Cultist', color: 'B', cost: 2, power: 3, monster: true, art: 'cultist', text: 'When destroyed: your other cards here get +2 power.',
    lastRites: (g, c, lane) => { for (const a of g.revealedIn(lane, c.owner)) g.buff(a, 2); } },
  rotGrub: { name: 'Rot Grub', color: 'S', cost: 1, power: 2, monster: true, art: 'rot', text: 'When destroyed: draw a card.',
    lastRites: (g, c) => g.draw(c.owner, 1) },
  mirrorMage: { name: 'Mirror Mage', color: 'M', cost: 3, power: 2, monster: true, art: 'mirror', text: 'When revealed: its power becomes that of the strongest enemy card here.',
    onReveal: (g, c) => { const t = g.strongest(g.enemies(c)); if (t && g.power(t) > g.power(c)) g.buff(c, g.power(t) - g.power(c)); } },
  hound: { name: 'War Hound', color: 'B', cost: 2, power: 2, monster: true, art: 'hunt', flags: ['shift'], text: 'Once each turn after it is revealed, you can move it to another lane. +2 power while it is your only card here.',
    ongoing: (g, c) => { if (g.allies(c).length === 0) c.aura += 2; } },
  mossGolem: { name: 'Moss Golem', color: 'S', cost: 4, power: 5, monster: true, art: 'warden', flags: ['root'], text: 'Stays when its location resolves, and fights at the next one.' },
  vampire: { name: 'Vampire', color: 'M', cost: 3, power: 3, monster: true, art: 'night', text: 'At the end of each turn, the weakest enemy card here loses 1 power and this gets +1.',
    endTurn: (g, c) => { const t = g.weakest(g.enemies(c).filter((e) => e.revealed)); if (t) { g.debuff(t, 1, c.owner); g.buff(c, 1); } } },
  legionnaire: { name: 'Legionnaire', color: 'B', cost: 3, power: 3, monster: true, art: 'legion', text: '+3 power while you have 3 or more cards here.',
    ongoing: (g, c) => { if (g.allies(c).length >= 2) c.aura += 3; } },
  oak: { name: 'Ancient Oak', color: 'S', cost: 5, power: 6, monster: true, art: 'grove', flags: ['root', 'indestructible'], text: 'Stays when its location resolves. It can\'t be destroyed.' },
  stormCaller: { name: 'Storm Caller', color: 'M', cost: 3, power: 3, monster: true, art: 'thunder', text: 'When revealed: move the strongest enemy card here to another lane.',
    onReveal: (g, c) => {
      const t = g.strongest(g.enemies(c));
      if (t && !g.has(t, 'root')) for (const i of g.otherLanes(c.lane)) if (g.moveCard(t, i, c.owner)) break;
    } },
  ogre: { name: 'Ogre', color: 'B', cost: 5, power: 8, monster: true, art: 'ogre', text: '' },

  // ---------- Tokens made by monsters and encounter rules ----------
  goblin: { name: 'Goblin', color: 'C', cost: 0, power: 1, token: true, art: 'goblin', text: '' },
  imp: { name: 'Imp', color: 'B', cost: 0, power: 1, token: true, art: 'brood', text: '' },
  skeleton: { name: 'Skeleton', color: 'S', cost: 0, power: 2, token: true, art: 'lich', text: '' },
  reflection: { name: 'Reflection', color: 'M', cost: 0, power: 2, token: true, art: 'twins', text: '' },
  recruit: { name: 'Recruit', color: 'B', cost: 0, power: 1, token: true, art: 'recruit', text: '' },
  guard: { name: 'Pale Guard', color: 'M', cost: 0, power: 2, token: true, art: 'queen', text: '' },
};

// Fill in defaults. `keywords` is the engine's flag list; it is never shown.
for (const [id, d] of Object.entries(CARDS)) {
  d.id = id;
  d.rarity = d.rarity || 'common';
  d.keywords = d.flags || [];
}

export const COLOR_NAMES = { C: 'Core', M: 'Mind', B: 'Body', S: 'Soul' };
export const SUITS = { C: '●', M: '♦', B: '♥', S: '♣' };
export const FACTIONS = {
  M: { name: 'Mind', theme: 'Outthink', text: 'Read where they will play, move cards and locations, and control when things resolve.' },
  B: { name: 'Body', theme: 'Overwhelm', text: 'Burst power, crush enemy cards, and slam a location shut before they can answer.' },
  S: { name: 'Soul', theme: 'Endure', text: 'Grow over time, keep cards on the board across locations, and profit from loss.' },
};
