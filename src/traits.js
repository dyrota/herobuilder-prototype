// Traits: rules that belong to one side for a whole battle. Encounters use
// them as their signature mechanic; the player's relics are traits too.
//
// Hooks get the Game (g) and the side that owns the trait. Per-battle state
// lives in g.s.players[side].ts.
//   setup(g, side)                  after opening hands are drawn
//   turnStart(g, side)              after energy and draws
//   ongoing(g, side)                with every recompute (auras)
//   endTurn(g, side)                with end-of-turn card effects
//   onReveal(g, side, c)            after any card's reveal (either side's)
//   onDestroy(g, side, c, lane)     after any card is destroyed
//   afterResolve(g, side, lane, w)  after a location scores and its cards leave
//   costMod(g, side, c)             added to the cost of any card
//   onMove(g, side, c)              after any card moves
// Flags: freeMove, drawCost, moveTax, winsTies, spyglass. UI helpers: status(g, side) for a
// short counter, laneMark(g, side, lane) for an icon on a location.

const other = (s) => 1 - s;
const ts = (g, side) => g.s.players[side].ts;

export const TRAITS = {
  // ---------- Bosses ----------
  sentinel: {
    name: 'Sentinel', icon: '🛡', kind: 'enemy',
    text: 'Each turn the Warden holds one lane (🛡), never the same one twice in a row. That location can\'t score this turn.',
    turnStart: (g, side) => {
      const t = ts(g, side);
      const opts = [0, 1, 2].filter((i) => i !== t.lane);
      t.lane = opts[g.randInt(0, opts.length - 1)];
      g.delay(t.lane);
    },
    laneMark: (g, side, i) => (ts(g, side).lane === i ? { icon: '🛡', short: 'Held', text: 'The Warden holds this lane: it can\'t score this turn.' } : null),
  },
  charm: {
    name: 'Charm', icon: '💋', kind: 'enemy',
    text: 'Once you reach 2 stars, the next card you reveal is charmed: it switches to her side. Only once, so lead with something cheap.',
    afterResolve: (g, side) => {
      const t = ts(g, side);
      if (!t.charmed && !t.armed && g.s.players[other(side)].points >= 2) t.armed = true;
    },
    onReveal: (g, side, c) => {
      const t = ts(g, side);
      if (!t.armed || c.owner === side || g.def(c).token || c.zone !== 'board') return;
      t.armed = false;
      t.charmed = true;
      g.announce(`The Pale Queen charms your ${g.def(c).name}!`);
      g.steal(c, side);
    },
    status: (g, side) => { const t = ts(g, side); return t.charmed ? null : t.armed ? 'Charms your next card' : 'Charm at 2★'; },
  },
  court: {
    name: 'Royal Court', icon: '👑', kind: 'enemy',
    text: 'Whenever a new location arrives, a 2-power Pale Guard appears there on her side.',
    afterResolve: (g, side, lane) => { g.createToken('guard', lane, side); },
  },
  breath: {
    name: 'Fire Breath', icon: '🔥', kind: 'enemy',
    text: 'Every third turn, Ashmaw breathes on the lane where you have the most power (marked 🔥 at the start of that turn). Your cards there lose 2 power.',
    setup: (g, side) => { ts(g, side).n = 3; },
    turnStart: (g, side) => {
      const t = ts(g, side), opp = other(side);
      t.lane = null;
      if (t.n !== 1) return;
      let best = -1, bp = -1;
      for (let i = 0; i < 3; i++) { const p = g.lanePower(i, opp); if (p > bp) { bp = p; best = i; } }
      t.lane = best;
    },
    endTurn: (g, side) => {
      const t = ts(g, side);
      t.n -= 1;
      if (t.n > 0) return;
      t.n = 3;
      if (t.lane == null) return;
      g.announce('Ashmaw breathes fire!');
      for (const c of g.revealedIn(t.lane, other(side))) g.debuff(c, 2, side);
      t.lane = null;
    },
    status: (g, side) => { const n = ts(g, side).n; return n === 1 ? 'Breath this turn' : `Breath in ${n}`; },
    laneMark: (g, side, i) => (ts(g, side).lane === i ? { icon: '🔥', short: 'Fire breath', text: 'Ashmaw breathes here at the end of this turn: your cards here lose 2 power.' } : null),
  },
  enrage: {
    name: 'Enrage', icon: '💢', kind: 'enemy',
    text: 'Once you reach 3 stars, Ashmaw\'s cards have +1 power for the rest of the battle.',
    afterResolve: (g, side) => { if (g.s.players[other(side)].points >= 3) ts(g, side).enraged = true; },
    ongoing: (g, side) => { if (ts(g, side).enraged) for (const c of g.boardCards(side)) if (c.revealed) c.aura += 1; },
    status: (g, side) => (ts(g, side).enraged ? 'Enraged' : null),
  },

  // ---------- Elites ----------
  smash: {
    name: 'Smash', icon: '🪨', kind: 'enemy',
    text: 'When one of its cards with 6 or more power is revealed, your weakest card there loses 2 power.',
    onReveal: (g, side, c) => {
      if (c.owner !== side || g.power(c) < 6) return;
      const t = g.weakest(g.enemies(c).filter((e) => e.revealed));
      if (t) g.debuff(t, 2, side);
    },
  },
  curse: {
    name: 'Thorn Curse', icon: '🥀', kind: 'enemy',
    text: 'At the start of every second turn, your strongest card in play loses 1 power.',
    turnStart: (g, side) => {
      if (g.s.turn % 2) return;
      const t = g.strongest(g.boardCards(other(side)).filter((c) => c.revealed));
      if (t) g.debuff(t, 1, side);
    },
  },
  mirror: {
    name: 'Mirror Image', icon: '🪞', kind: 'enemy',
    text: 'The first card the Twins reveal each turn makes a 2-power Reflection in the next lane.',
    onReveal: (g, side, c) => {
      const t = ts(g, side);
      if (c.owner !== side || g.def(c).token || t.turn === g.s.turn) return;
      t.turn = g.s.turn;
      g.createToken('reflection', (c.lane + 1) % 3, side);
    },
  },
  hatch: {
    name: 'Hatchery', icon: '🥚', kind: 'enemy',
    text: 'When the Brood loses a location, a 1-power Imp hatches at the new one.',
    afterResolve: (g, side, lane, w) => { if (w === other(side)) g.createToken('imp', lane, side); },
  },
  raise: {
    name: 'Raise Dead', icon: '💀', kind: 'enemy',
    text: 'Whenever one of your cards is destroyed, a 2-power Skeleton rises for the Lich in that lane.',
    onDestroy: (g, side, c, lane) => { if (c.owner !== side && !g.def(c).token) g.createToken('skeleton', lane, side); },
  },

  // ---------- Regular encounters (light rules) ----------
  swarm: {
    name: 'Swarm', icon: '🐜', kind: 'enemy',
    text: 'Their 1-cost cards have +1 power.',
    ongoing: (g, side) => { for (const c of g.boardCards(side)) if (c.revealed && !g.def(c).token && g.def(c).cost === 1) c.aura += 1; },
  },
  fervor: {
    name: 'Fervor', icon: '🕯', kind: 'enemy',
    text: 'When one of their cards is destroyed, their other cards there get +1 power.',
    onDestroy: (g, side, c, lane) => { if (c.owner === side) for (const a of g.revealedIn(lane, side)) g.buff(a, 1); },
  },
  ambush: {
    name: 'Ambush', icon: '🗡', kind: 'enemy',
    text: 'They start the battle with a Bandit already in play.',
    setup: (g, side) => {
      const u = g.s.players[side].deck.find((x) => g.card(x).id === 'bandit');
      if (u) g.putInPlay(u, g.randInt(0, 2));
    },
  },
  overgrowth: {
    name: 'Overgrowth', icon: '🌿', kind: 'enemy',
    text: 'At the end of every second turn, their weakest card in play gets +1 power.',
    endTurn: (g, side) => {
      if (g.s.turn % 2) return; const t = g.weakest(g.boardCards(side).filter((c) => c.revealed)); if (t) g.buff(t, 1); },
  },
  drill: {
    name: 'Drilled', icon: '🥁', kind: 'enemy',
    text: 'Their cards have +1 power in lanes where they have 3 or more cards.',
    ongoing: (g, side) => { for (let i = 0; i < 3; i++) { const cs = g.revealedIn(i, side); if (cs.length >= 3) for (const c of cs) c.aura += 1; } },
  },
  static: {
    name: 'Static', icon: '⚡', kind: 'enemy',
    text: 'Moving your cards costs 1 more energy.',
    moveTax: 1,
  },

  // ---------- Relics (the player's) ----------
  whetstone: {
    name: 'Whetstone', icon: '🗡', kind: 'relic',
    text: 'Your 1-cost cards have +1 power.',
    ongoing: (g, side) => { for (const c of g.boardCards(side)) if (c.revealed && g.def(c).cost === 1) c.aura += 1; },
  },
  satchel: {
    name: 'Satchel', icon: '🎒', kind: 'relic',
    text: 'Start each battle with 1 extra card.',
    setup: (g, side) => g.draw(side, 1),
  },
  emberStone: {
    name: 'Ember Stone', icon: '🔶', kind: 'relic',
    text: '+1 energy on turns 1 and 2.',
    turnStart: (g, side) => { if (g.s.turn <= 2) g.s.players[side].energy += 1; },
  },
  boots: {
    name: 'Swift Boots', icon: '👢', kind: 'relic',
    text: 'Moving one of your cards costs no energy.',
    freeMove: true,
  },
  secondWind: {
    name: 'Second Wind', icon: '🌬', kind: 'relic',
    text: 'When you lose a location, draw 1 more card.',
    afterResolve: (g, side, lane, w) => { if (w === other(side)) g.draw(side, 1); },
  },
  laurel: {
    name: 'Victor\'s Laurel', icon: '🌿', kind: 'relic',
    text: 'When you win a location, your cards in play get +1 power.',
    afterResolve: (g, side, lane, w) => { if (w === side) for (const c of g.boardCards(side)) if (c.revealed) g.buff(c, 1); },
  },
  purse: {
    name: 'Coin Purse', icon: '👛', kind: 'relic',
    text: 'Drawing a card from your deck costs 1 energy instead of 2.',
    drawCost: 1,
  },
  underdog: {
    name: 'Underdog\'s Charm', icon: '🍀', kind: 'relic',
    text: 'At the start of each turn, if you have fewer stars, gain 1 energy.',
    turnStart: (g, side) => { if (g.s.players[side].points < g.s.players[other(side)].points) g.s.players[side].energy += 1; },
  },
  loadedDie: {
    name: 'Lucky Ring', icon: '💍', kind: 'relic',
    text: 'You win tied locations (if you have a card there).',
    winsTies: true,
  },
  seedPouch: {
    name: 'Seed Pouch', icon: '🌱', kind: 'relic',
    text: 'From turn 4 on, you get 1 more energy each turn.',
    turnStart: (g, side) => { if (g.s.turn === 4) { g.s.players[side].ramp += 1; g.s.players[side].energy += 1; } },
  },
  bloodstone: {
    name: 'Bloodstone', icon: '🩸', kind: 'relic',
    text: 'The first time each turn one of your cards is destroyed, draw a card.',
    onDestroy: (g, side, c) => {
      const t = ts(g, side);
      if (c.owner !== side || t.turn === g.s.turn) return;
      t.turn = g.s.turn;
      g.draw(side, 1);
    },
  },
  warHorn: {
    name: 'War Horn', icon: '📯', kind: 'relic',
    text: 'Your first card each battle is revealed with +3 power.',
    onReveal: (g, side, c) => {
      const t = ts(g, side);
      if (c.owner !== side || t.used) return;
      t.used = true;
      g.buff(c, 3);
    },
  },
  // Build-around relics: they pay off one way of playing.
  lodestone: {
    name: 'Lodestone', icon: '🧲', kind: 'relic',
    text: 'Whenever one of your cards moves, it gets +1 power.',
    onMove: (g, side, c) => { if (c.owner === side && c.revealed) g.buff(c, 1); },
  },
  warBanner: {
    name: 'War Banner', icon: '🚩', kind: 'relic',
    text: 'Cards your cards create (Goblins, Recruits and the like) have +1 power.',
    ongoing: (g, side) => { for (const c of g.boardCards(side)) if (g.def(c).token) c.aura += 1; },
  },
  graveLantern: {
    name: 'Grave Lantern', icon: '🏮', kind: 'relic',
    text: 'Whenever one of your cards is destroyed, your strongest card in play gets +2 power.',
    onDestroy: (g, side, c) => { if (c.owner !== side) return; const t = g.strongest(g.boardCards(side)); if (t) g.buff(t, 2); },
  },
  tuningFork: {
    name: 'Tuning Fork', icon: '🎶', kind: 'relic',
    text: 'Your When revealed effects in the left lane happen twice.',
    onReveal: (g, side, c) => {
      const d = g.def(c);
      if (c.owner !== side || !d.onReveal || c.lane !== 0 || c.zone !== 'board') return;
      d.onReveal(g, c);
    },
    laneMark: (g, side, i) => (i === 0 ? { icon: '🎶', short: 'Fork', text: 'Tuning Fork: your When revealed effects here happen twice.' } : null),
  },
  spyglass: {
    name: 'Spyglass', icon: '🔭', kind: 'relic',
    text: 'You can see which lanes the enemy played cards into this turn (but not which cards).',
    spyglass: true,
  },
  // Run-level relics: they act between battles (see run.js).
  idol: { name: 'Gilded Idol', icon: '🏺', kind: 'relic', text: '+12 gold after each battle you win.' },
  feather: { name: 'Phoenix Feather', icon: '🪶', kind: 'relic', text: 'The next battle you lose doesn\'t cost a heart. Then it\'s used up.' },
};

for (const [id, t] of Object.entries(TRAITS)) t.id = id;

export const RELICS = Object.values(TRAITS).filter((t) => t.kind === 'relic').map((t) => t.id);
