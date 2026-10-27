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
  brawler: { name: 'Brawler', color: 'B', cost: 1, power: 1, art: 'brawler', text: 'When revealed: +3 power this turn.',
    onReveal: (g, c) => g.surge(c, 3) },
  raider: { name: 'Raider', color: 'B', cost: 2, power: 3, art: 'raider', text: 'When revealed: the weakest enemy card here loses 2 power.',
    onReveal: (g, c) => { const t = g.weakest(g.enemies(c)); if (t) g.debuff(t, 2, c.owner); } },
  hothead: { name: 'Hothead', color: 'B', cost: 2, power: 6, art: 'hothead', flags: ['burnout'], text: 'Destroyed at the end of the turn, after locations resolve.' },
  drummer: { name: 'War Drummer', color: 'B', cost: 2, power: 3, art: 'drummer', text: 'When revealed: next turn, your cards cost 1 less.',
    onReveal: (g, c) => { g.s.players[c.owner].discountNext += 1; } },
  vanguard: { name: 'Vanguard', color: 'B', cost: 2, power: 1, art: 'vanguard', text: 'When revealed: if you are ahead here at the end of the turn, this location resolves.',
    onReveal: (g, c) => g.ignite(c.lane, c.owner) },
  berserker: { name: 'Berserker', color: 'B', cost: 3, power: 3, art: 'berserker', text: '+1 power for each enemy card here.',
    ongoing: (g, c) => { c.aura += g.enemies(c).length; } },
  warchief: { name: 'Warchief', color: 'B', cost: 4, power: 6, art: 'warchief', text: 'When revealed: your other cards here get +2 power this turn.',
    onReveal: (g, c) => { for (const a of g.allies(c)) g.surge(a, 2); } },
  titan: { name: 'Titan', color: 'B', cost: 10, power: 11, rarity: 'rare', art: 'titan', text: 'Costs 1 less for each of your cards in play. When revealed: every enemy card here loses 2 power.',
    costLess: (g, c) => g.boardCards(c.owner).length,
    onReveal: (g, c) => { for (const e of g.enemies(c)) g.debuff(e, 2, c.owner); } },

  // ---------- Soul: endure ----------
  wisp: { name: 'Wisp', color: 'S', cost: 1, power: 1, art: 'wisp', text: 'At the end of each turn, +1 power.',
    endTurn: (g, c) => g.buff(c, 1) },
  seedkeeper: { name: 'Seed Keeper', color: 'S', cost: 2, power: 1, art: 'seedkeeper', text: 'When revealed: for the rest of the game, you get 1 more energy each turn.',
    onReveal: (g, c) => { g.s.players[c.owner].ramp += 1; } },
  spirit: { name: 'Restless Spirit', color: 'S', cost: 2, power: 2, art: 'spirit', flags: ['undying'], text: 'When it leaves play, it returns to your hand.' },
  thornback: { name: 'Thornback', color: 'S', cost: 3, power: 2, art: 'thornback', text: 'At the end of each turn, +2 power.',
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
