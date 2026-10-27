// Core rules engine. Pure logic, no DOM: runs in the browser and in Node.
//
// A match: three lanes, each holding one location. Both players stage cards
// face-down, then cards reveal (priority side first). At end of turn, any
// location whose trigger is met resolves: its winner scores its points, the
// cards there go to their owners' discard piles, and a new location arrives.
// First to RULES.target points wins.

import { CARDS } from './cards.js';
import { LOCATIONS } from './locations.js';
import { nextRandom, randInt, shuffle } from './rng.js';

export const RULES = {
  lanes: 3,
  laneCap: 4, // cards per side in each lane
  energyCap: 10,
  energyStart: 1, // energy on turn 1; +1 each turn up to the cap
  openingHand: 4,
  mulligan: 2, // cards you may replace from the opening hand
  drawPerTurn: 1,
  drawCost: 2, // once a turn, spend this much energy to draw a card (0 = off)
  maxHand: 8,
  target: 5,
  turnLimit: 30,
};

export const other = (side) => 1 - side;

export function cardDef(id) {
  const d = CARDS[id];
  if (!d) throw new Error('Unknown card ' + id);
  return d;
}

export function locDef(id) {
  const d = LOCATIONS[id];
  if (!d) throw new Error('Unknown location ' + id);
  return d;
}

// Deck entries are card ids, optionally suffixed with "+" for an upgraded
// copy (+1 power).
function parseEntry(entry) {
  const up = entry.endsWith('+');
  return { id: up ? entry.slice(0, -1) : entry, up: up ? 1 : 0 };
}

export class Game {
  constructor(state) {
    this.s = state;
  }

  // locations: the shared location pool (defaults to every location).
  // fixedLocations: a boss arena, in order (the first three start in play).
  static create({ decks, locations = null, seed = 1, target = RULES.target, names = ['You', 'Opponent'], fixedLocations = null }) {
    const s = {
      rng: seed >>> 0 || 1,
      turn: 0,
      target,
      phase: 'stage',
      winner: null, // 0, 1, or -1 for a draw
      firstPriority: 0,
      priority: 0,
      nextUid: 1,
      cards: {},
      players: [0, 1].map((side) => ({
        name: names[side],
        deck: [],
        hand: [],
        discard: [],
        energy: 0,
        points: 0,
        bloom: 0,
        ramp: 0, // permanent extra energy per turn
        carry: false, // unspent energy carries over
        bank: 0,
        discount: 0,
        discountNext: 0,
        stagedOrder: [],
        played: 0,
        mulliganed: false,
        bought: false,
      })),
      lanes: [],
      locDeck: [],
      locUsed: [],
      log: [],
      events: [],
      stats: { resolutions: 0, firstResolver: null },
    };
    const g = new Game(s);
    s.firstPriority = randInt(s, 0, 1);
    for (const side of [0, 1]) {
      for (const entry of decks[side]) {
        const { id, up } = parseEntry(entry);
        const c = g._newCard(id, side, up);
        s.players[side].deck.push(c.uid);
      }
      shuffle(s, s.players[side].deck);
    }
    if (fixedLocations) {
      s.locDeck = [...fixedLocations].reverse();
    } else {
      s.locDeck = [...(locations || Object.keys(LOCATIONS))];
      shuffle(s, s.locDeck);
    }
    for (let i = 0; i < RULES.lanes; i++) {
      s.lanes.push({ loc: null, cards: [[], []] });
      g._arrive(i);
    }
    for (const side of [0, 1]) g.draw(side, RULES.openingHand);
    g.startTurn();
    return g;
  }

  clone() {
    return new Game(structuredClone(this.s));
  }

  // --- Card instances ---

  _newCard(id, owner, up = 0) {
    const s = this.s;
    const c = {
      uid: s.nextUid++,
      id,
      owner,
      up,
      zone: 'deck',
      lane: -1,
      perm: 0,
      temp: 0,
      aura: 0,
      trained: 0,
      revealed: false,
      hidden: false,
      moved: false,
      warded: false,
      gear: [],
      playedTurn: 0,
    };
    s.cards[c.uid] = c;
    return c;
  }

  card(uid) {
    return this.s.cards[uid];
  }

  def(c) {
    return cardDef(c.id);
  }

  power(c) {
    let p = this.def(c).power + c.up + c.perm + c.temp + c.aura + c.trained;
    for (const gid of c.gear) p += this.def(this.card(gid)).gearPower || 0;
    return Math.max(0, p);
  }

  cost(c) {
    const d = this.def(c);
    return Math.max(0, d.cost - this.s.players[c.owner].discount - (d.costLess ? d.costLess(this, c) : 0));
  }

  has(c, kw) {
    const d = this.def(c);
    if (d.keywords && d.keywords.includes(kw)) return true;
    if (kw === 'ward' && c.warded) return true;
    for (const gid of c.gear) {
      const gd = this.def(this.card(gid));
      if (gd.grants && gd.grants.includes(kw)) return true;
    }
    return false;
  }

  // --- Queries ---

  laneCards(i, side) {
    return this.s.lanes[i].cards[side].map((u) => this.card(u));
  }

  revealedIn(i, side) {
    return this.laneCards(i, side).filter((c) => c.revealed);
  }

  lanePower(i, side) {
    let total = 0;
    for (const c of this.laneCards(i, side)) if (c.revealed) total += this.power(c);
    return total;
  }

  laneCap(i) {
    const loc = this.s.lanes[i].loc;
    return loc && locDef(loc.id).capacity ? locDef(loc.id).capacity : RULES.laneCap;
  }

  hasRoom(i, side) {
    const lane = this.s.lanes[i];
    if (!lane.loc) return false;
    const n = lane.cards[side].filter((u) => !this.def(this.card(u)).gear).length;
    return n < this.laneCap(i);
  }

  // Cards `side` played (staged) into lane i this turn, revealed or not.
  castHere(i, side) {
    return this.laneCards(i, side).filter((c) => c.cast === this.s.turn).length;
  }

  allies(c, includeSelf = false) {
    if (c.lane < 0) return [];
    return this.revealedIn(c.lane, c.owner).filter((x) => includeSelf || x.uid !== c.uid);
  }

  enemies(c) {
    if (c.lane < 0) return [];
    return this.revealedIn(c.lane, other(c.owner));
  }

  boardCards(side = null) {
    const out = [];
    for (let i = 0; i < RULES.lanes; i++) {
      for (const sd of [0, 1]) {
        if (side !== null && sd !== side) continue;
        for (const c of this.laneCards(i, sd)) if (c.revealed) out.push(c);
      }
    }
    return out;
  }

  strongest(list) {
    let best = null;
    for (const c of list) if (!best || this.power(c) > this.power(best)) best = c;
    return best;
  }

  weakest(list) {
    let best = null;
    for (const c of list) if (!best || this.power(c) < this.power(best)) best = c;
    return best;
  }

  log(msg) {
    this.s.log.push({ turn: this.s.turn, msg });
    if (this.s.log.length > 200) this.s.log.shift();
  }

  event(e) {
    this.s.events.push(e);
  }

  // --- Turn flow ---

  startTurn() {
    const s = this.s;
    s.turn += 1;
    s.phase = 'stage';
    // Priority (reveals first): the side with fewer points goes second, so the
    // leader commits information first. Ties alternate.
    const [a, b] = [s.players[0].points, s.players[1].points];
    s.priority = a > b ? 0 : b > a ? 1 : (s.firstPriority + s.turn + 1) % 2;
    for (const side of [0, 1]) {
      const p = s.players[side];
      const base = Math.min(s.turn + RULES.energyStart - 1 + p.ramp, RULES.energyCap);
      p.energy = Math.min(base + p.bank, RULES.energyCap) + p.bloom;
      p.bloom = 0;
      p.bank = 0;
      p.discount = p.discountNext;
      p.discountNext = 0;
      p.stagedOrder = [];
      p.played = 0;
      p.bought = false;
      if (s.turn > 1) this.draw(side, RULES.drawPerTurn);
    }
    for (const c of Object.values(s.cards)) c.moved = false;
    this.event({ type: 'turn', turn: s.turn });
  }

  draw(side, n) {
    const p = this.s.players[side];
    for (let k = 0; k < n; k++) {
      if (p.deck.length === 0) {
        if (p.discard.length === 0) return;
        p.deck = shuffle(this.s, p.discard.filter((u) => !this.def(this.card(u)).token));
        p.discard = [];
        for (const u of p.deck) this.card(u).zone = 'deck';
        this.log(`${p.name} shuffles their discard pile into their deck.`);
        if (p.deck.length === 0) return;
      }
      const uid = p.deck.pop();
      const c = this.card(uid);
      if (p.hand.length >= RULES.maxHand) {
        c.zone = 'discard';
        p.discard.push(uid);
        continue;
      }
      c.zone = 'hand';
      p.hand.push(uid);
    }
  }

  // Before turn 1's plays, replace up to RULES.mulligan opening cards. The
  // replacements are drawn first, so you never redraw a card you sent back.
  canMulligan(side) {
    const p = this.s.players[side];
    return this.s.turn === 1 && this.s.phase === 'stage' && !p.mulliganed && p.played === 0;
  }

  mulligan(side, uids) {
    if (!this.canMulligan(side)) return false;
    const p = this.s.players[side];
    p.mulliganed = true;
    const back = [...new Set(uids)].filter((u) => p.hand.includes(u)).slice(0, RULES.mulligan);
    if (!back.length) return true;
    for (const u of back) p.hand.splice(p.hand.indexOf(u), 1);
    this.draw(side, back.length);
    for (const u of back) { this.card(u).zone = 'deck'; p.deck.push(u); }
    shuffle(this.s, p.deck);
    this.log(`${p.name} replaces ${back.length} card${back.length > 1 ? 's' : ''}.`);
    return true;
  }

  // Once a turn during staging: pay RULES.drawCost energy to draw a card.
  canBuyDraw(side) {
    const s = this.s, p = s.players[side];
    return RULES.drawCost > 0 && s.phase === 'stage' && s.winner === null && !p.bought &&
      p.energy >= RULES.drawCost && p.hand.length < RULES.maxHand && (p.deck.length + p.discard.length) > 0;
  }

  buyDraw(side) {
    if (!this.canBuyDraw(side)) return false;
    const p = this.s.players[side];
    p.energy -= RULES.drawCost;
    p.bought = true;
    this.draw(side, 1);
    return true;
  }

  canPlay(side, uid, lane) {
    const s = this.s;
    if (s.phase !== 'stage' || s.winner !== null) return false;
    const c = this.card(uid);
    if (!c || c.owner !== side || c.zone !== 'hand') return false;
    if (lane < 0 || lane >= RULES.lanes) return false;
    if (this.cost(c) > s.players[side].energy) return false;
    const d = this.def(c);
    if (d.gear) {
      // Gear needs a friendly card here (revealed or staged) to attach to.
      return this.s.lanes[lane].loc && this.laneCards(lane, side).some((x) => !this.def(x).gear);
    }
    return this.hasRoom(lane, side);
  }

  play(side, uid, lane) {
    if (!this.canPlay(side, uid, lane)) return false;
    const s = this.s;
    const c = this.card(uid);
    const p = s.players[side];
    c.paid = this.cost(c);
    p.energy -= c.paid;
    p.hand.splice(p.hand.indexOf(uid), 1);
    c.zone = 'board';
    c.lane = lane;
    c.revealed = false;
    c.playedTurn = s.turn;
    c.cast = s.turn;
    s.lanes[lane].cards[side].push(uid);
    p.stagedOrder.push(uid);
    p.played += 1;
    return true;
  }

  canUnstage(side, uid) {
    const c = this.card(uid);
    return c && c.owner === side && c.zone === 'board' && !c.revealed && c.playedTurn === this.s.turn && this.s.phase === 'stage';
  }

  unstage(side, uid) {
    if (!this.canUnstage(side, uid)) return false;
    const c = this.card(uid);
    const p = this.s.players[side];
    const lane = this.s.lanes[c.lane];
    lane.cards[side].splice(lane.cards[side].indexOf(uid), 1);
    p.stagedOrder.splice(p.stagedOrder.indexOf(uid), 1);
    p.energy += c.paid || 0;
    p.played -= 1;
    c.cast = 0;
    c.zone = 'hand';
    c.lane = -1;
    p.hand.push(uid);
    return true;
  }

  // Shift: a revealed card with "shift" may move once per turn during staging.
  canMove(side, uid, lane) {
    const c = this.card(uid);
    if (!c || c.owner !== side || c.zone !== 'board' || !c.revealed || c.moved) return false;
    if (this.s.phase !== 'stage') return false;
    if (!this.has(c, 'shift')) return false;
    if (lane === c.lane || lane < 0 || lane >= RULES.lanes) return false;
    return this.hasRoom(lane, side);
  }

  moveByShift(side, uid, lane) {
    if (!this.canMove(side, uid, lane)) return false;
    const c = this.card(uid);
    if (!this.moveCard(c, lane, side)) return false;
    c.moved = true;
    this.recompute();
    return true;
  }

  // Moves a board card to another lane. Returns true if it moved.
  moveCard(c, lane, sourceSide) {
    if (c.zone !== 'board' || lane === c.lane || !this.hasRoom(lane, c.owner)) return false;
    if (sourceSide !== c.owner && this.has(c, 'ward')) return false;
    if (this.has(c, 'root')) return false;
    const from = this.s.lanes[c.lane];
    from.cards[c.owner].splice(from.cards[c.owner].indexOf(c.uid), 1);
    this.s.lanes[lane].cards[c.owner].push(c.uid);
    const fromIdx = c.lane;
    c.lane = lane;
    this.s.lanes[lane].loc.entered += 1;
    this.event({ type: 'move', uid: c.uid, from: fromIdx, to: lane });
    const d = this.def(c);
    if (d.onMove) d.onMove(this, c, fromIdx);
    return true;
  }

  // Runs the end of turn to completion (AI, simulations).
  endTurn() {
    for (const _ of this.endTurnSteps()) {
      /* drain */
    }
  }

  // Generator version so the UI can animate each step.
  *endTurnSteps() {
    const s = this.s;
    if (s.winner !== null) return;
    s.phase = 'reveal';
    const order = [s.priority, other(s.priority)];
    for (const side of order) {
      for (const uid of [...s.players[side].stagedOrder]) {
        const c = this.card(uid);
        if (c.zone !== 'board' || c.revealed) continue;
        yield* this._reveal(c);
      }
    }
    // End-of-turn effects.
    s.phase = 'end';
    let any = false;
    for (const c of this.boardCards()) {
      const d = this.def(c);
      if (d.endTurn && c.zone === 'board') {
        d.endTurn(this, c);
        any = true;
      }
    }
    for (let i = 0; i < RULES.lanes; i++) {
      const ld = locDef(s.lanes[i].loc.id);
      if (ld.endTurn) {
        ld.endTurn(this, i);
        any = true;
      }
    }
    this.recompute();
    if (any) yield { type: 'endturn' };

    for (const lane of s.lanes) lane.loc.age += 1;
    for (let i = 0; i < RULES.lanes; i++) {
      if (this.shouldResolve(i)) yield* this._resolve(i);
      if (s.winner !== null) break;
    }
    // Burnout cards destroy themselves after locations have resolved;
    // cards marked to recall return to hand.
    for (const c of this.boardCards()) if (this.has(c, 'burnout')) this.destroy(c, c.owner, true);
    for (const c of this.boardCards()) if (c.recallAtEnd) { c.recallAtEnd = false; this.bounce(c, c.owner); }
    for (const c of Object.values(s.cards)) c.temp = 0;
    for (const lane of s.lanes) {
      lane.loc.ignite = [false, false];
      lane.loc.delayed = false;
    }
    this.recompute();
    for (const p of s.players) if (p.carry) p.bank = p.energy;
    this._checkWinner();
    if (s.winner !== null) {
      s.phase = 'over';
      yield { type: 'gameover', winner: s.winner };
      return;
    }
    this.startTurn();
    yield { type: 'newturn' };
  }

  *_reveal(c) {
    const d = this.def(c);
    if (d.gear) {
      // Attach to the strongest friendly revealed card here; otherwise return.
      const host = this.strongest(this.revealedIn(c.lane, c.owner));
      const lane = this.s.lanes[c.lane];
      lane.cards[c.owner].splice(lane.cards[c.owner].indexOf(c.uid), 1);
      if (host) {
        c.zone = 'gear';
        c.revealed = true;
        c.hostUid = host.uid;
        host.gear.push(c.uid);
        this.log(`${this.s.players[c.owner].name}'s ${d.name} equips ${this.def(host).name}.`);
        this.recompute();
        yield { type: 'reveal', uid: host.uid, gear: c.uid };
      } else {
        c.zone = 'hand';
        c.lane = -1;
        this.s.players[c.owner].hand.push(c.uid);
        this.s.players[c.owner].energy += 0;
        this.log(`${d.name} had nothing to equip and returns to hand.`);
      }
      return;
    }
    c.revealed = true;
    this.s.lanes[c.lane].loc.entered += 1;
    if (this.has(c, 'veiled')) c.hidden = true;
    const here = locDef(this.s.lanes[c.lane].loc.id);
    if (here.onRevealHere) here.onRevealHere(this, c);
    this.recompute();
    yield { type: 'reveal', uid: c.uid };
    if (d.onReveal) {
      const times = locDef(this.s.lanes[c.lane].loc.id).doubleReveal ? 2 : 1;
      for (let k = 0; k < times && c.zone === 'board'; k++) d.onReveal(this, c);
      this.recompute();
      yield { type: 'effect', uid: c.uid };
    }
  }

  // Recomputes ongoing effects (auras, ward, tie rules).
  recompute() {
    const s = this.s;
    for (const c of Object.values(s.cards)) {
      c.aura = 0;
      c.warded = false;
      c.frozen = false;
    }
    for (const lane of s.lanes) lane.tieWinner = null;
    for (let i = 0; i < RULES.lanes; i++) {
      const ld = locDef(s.lanes[i].loc.id);
      if (ld.ongoing) ld.ongoing(this, i);
    }
    for (const c of this.boardCards()) {
      const d = this.def(c);
      if (d.ongoing) d.ongoing(this, c);
    }
  }

  // --- Effects API (used by card and location definitions) ---

  buff(c, n) {
    if (!c || c.zone !== 'board') return;
    if (n > 0 && c.frozen) return;
    c.perm += n;
    this.event({ type: 'power', uid: c.uid, delta: n });
  }

  surge(c, n) {
    if (!c || c.zone !== 'board') return;
    if (n > 0 && c.frozen) return;
    c.temp += n;
    this.event({ type: 'power', uid: c.uid, delta: n, temp: true });
  }

  // Enemy-sourced power loss. Ward blocks it. Destroys at 0 power if `kill`.
  debuff(c, n, sourceSide, kill = true) {
    if (!c || c.zone !== 'board') return;
    if (sourceSide !== c.owner && this.has(c, 'ward')) return;
    c.perm -= n;
    this.event({ type: 'power', uid: c.uid, delta: -n });
    if (kill && this.power(c) <= 0) this.destroy(c, sourceSide);
  }

  canDestroy(c, sourceSide) {
    if (!c || c.zone !== 'board') return false;
    if (sourceSide !== c.owner && this.has(c, 'ward')) return false;
    if (this.has(c, 'indestructible')) return false;
    if (locDef(this.s.lanes[c.lane].loc.id).noDestroy) return false;
    return true;
  }

  destroy(c, sourceSide, force = false) {
    if (!force && !this.canDestroy(c, sourceSide)) return false;
    if (c.zone !== 'board') return false;
    const laneIdx = c.lane;
    const lane = this.s.lanes[laneIdx];
    lane.cards[c.owner].splice(lane.cards[c.owner].indexOf(c.uid), 1);
    lane.loc.destroyed += 1;
    this.log(`${this.def(c).name} is destroyed.`);
    this.event({ type: 'destroy', uid: c.uid, lane: laneIdx });
    this._leaveBoard(c, 'destroyed');
    const d = this.def(c);
    if (d.lastRites) d.lastRites(this, c, laneIdx);
    for (const sd of [0, 1]) {
      for (const w of this.revealedIn(laneIdx, sd)) {
        const wd = this.def(w);
        if (wd.onDestroyHere) wd.onDestroyHere(this, w, c);
      }
    }
    return true;
  }

  // Returns a board card to its owner's hand.
  bounce(c, sourceSide) {
    if (!c || c.zone !== 'board') return false;
    if (sourceSide !== c.owner && this.has(c, 'ward')) return false;
    const lane = this.s.lanes[c.lane];
    lane.cards[c.owner].splice(lane.cards[c.owner].indexOf(c.uid), 1);
    this._returnGear(c);
    const p = this.s.players[c.owner];
    if (this.def(c).token) {
      c.zone = 'gone';
    } else {
      this._reset(c);
      c.zone = 'hand';
      p.hand.push(c.uid);
    }
    this.event({ type: 'bounce', uid: c.uid });
    return true;
  }

  _reset(c) {
    c.lane = -1;
    c.perm = 0;
    c.temp = 0;
    c.aura = 0;
    c.revealed = false;
    c.hidden = false;
    c.moved = false;
    c.warded = false;
  }

  _returnGear(c) {
    for (const gid of c.gear) {
      const g = this.card(gid);
      this._reset(g);
      g.zone = 'hand';
      g.hostUid = null;
      this.s.players[g.owner].hand.push(gid);
    }
    c.gear = [];
  }

  // Moves a card off the board to its owner's discard pile (or hand, for
  // Undying; tokens vanish). Trained power persists.
  _leaveBoard(c, why) {
    this._returnGear(c);
    const p = this.s.players[c.owner];
    const d = this.def(c);
    this._reset(c);
    if (d.token) {
      c.zone = 'gone';
    } else if (this.has(c, 'undying')) {
      c.zone = 'hand';
      p.hand.push(c.uid);
    } else {
      c.zone = 'discard';
      p.discard.push(c.uid);
    }
  }

  createToken(id, lane, side, n = 1) {
    let made = 0;
    for (let k = 0; k < n; k++) {
      if (!this.hasRoom(lane, side)) break;
      const t = this._newCard(id, side);
      t.zone = 'board';
      t.lane = lane;
      t.revealed = true;
      t.playedTurn = this.s.turn;
      this.s.lanes[lane].cards[side].push(t.uid);
      this.s.lanes[lane].loc.entered += 1;
      made++;
      this.event({ type: 'summon', uid: t.uid, lane });
    }
    return made;
  }

  ignite(lane, side) {
    this.s.lanes[lane].loc.ignite[side] = true;
  }

  delay(lane) {
    this.s.lanes[lane].loc.delayed = true;
  }

  // --- Locations ---

  _arrive(i) {
    const s = this.s;
    if (s.locDeck.length === 0 && s.locUsed.length) {
      s.locDeck = shuffle(s, s.locUsed);
      s.locUsed = [];
    }
    const id = s.locDeck.pop();
    // Keep the next location known: refill as soon as the deck runs dry.
    if (s.locDeck.length === 0 && s.locUsed.length) {
      s.locDeck = shuffle(s, s.locUsed);
      s.locUsed = [];
    }
    const lane = s.lanes[i];
    lane.loc = {
      id,
      age: 0,
      base: [this.lanePower(i, 0), this.lanePower(i, 1)],
      entered: 0,
      destroyed: 0,
      ignite: [false, false],
      delayed: false,
    };
    this.event({ type: 'arrive', lane: i, id });
    this.log(`${locDef(id).name} arrives.`);
  }

  nextLocation() {
    const s = this.s;
    return s.locDeck.length ? s.locDeck[s.locDeck.length - 1] : null;
  }

  // Moves the next location to the bottom of the location deck.
  bottomNextLocation() {
    const s = this.s;
    if (s.locDeck.length > 1) s.locDeck.unshift(s.locDeck.pop());
  }

  // Replaces lane i's location with the next one (cards stay).
  swapLocation(i) {
    const s = this.s;
    s.locUsed.push(s.lanes[i].loc.id);
    this._arrive(i);
  }

  // How far lane i is toward its trigger: {value, need, label}.
  triggerProgress(i) {
    const lane = this.s.lanes[i];
    const loc = lane.loc;
    const t = locDef(loc.id).trigger;
    const p0 = this.lanePower(i, 0) - loc.base[0];
    const p1 = this.lanePower(i, 1) - loc.base[1];
    switch (t.type) {
      case 'total':
        return { value: Math.max(0, p0 + p1), need: t.n };
      case 'solo':
        return { value: Math.max(0, p0, p1), need: t.n };
      case 'cards':
        return { value: loc.entered, need: t.n };
      case 'lead':
        return { value: Math.abs(this.lanePower(i, 0) - this.lanePower(i, 1)), need: t.n };
      case 'timer':
        return { value: loc.age, need: t.n };
      case 'destroyed':
        return { value: loc.destroyed, need: t.n };
    }
    return { value: 0, need: 1 };
  }

  shouldResolve(i) {
    const lane = this.s.lanes[i];
    const loc = lane.loc;
    if (loc.delayed) return false;
    for (const side of [0, 1]) {
      if (loc.ignite[side] && this.lanePower(i, side) > this.lanePower(i, other(side))) return true;
    }
    const t = locDef(loc.id).trigger;
    if (t.or) {
      const p = this.lanePower(i, 0) - loc.base[0] + this.lanePower(i, 1) - loc.base[1];
      if (p >= t.or) return true;
    }
    const prog = this.triggerProgress(i);
    return prog.value >= prog.need;
  }

  laneWinner(i) {
    const lane = this.s.lanes[i];
    const ld = locDef(lane.loc.id);
    const p0 = this.lanePower(i, 0);
    const p1 = this.lanePower(i, 1);
    const n0 = this.revealedIn(i, 0).length;
    const n1 = this.revealedIn(i, 1).length;
    if (ld.lowestWins) {
      // Lowest power wins, but you need a card here to win.
      if (n0 === 0 && n1 === 0) return -1;
      if (n0 === 0) return 1;
      if (n1 === 0) return 0;
      if (p0 !== p1) return p0 < p1 ? 0 : 1;
    } else {
      if (p0 === 0 && p1 === 0) return -1;
      if (p0 !== p1) return p0 > p1 ? 0 : 1;
    }
    if (lane.tieWinner !== null && lane.tieWinner !== undefined) return lane.tieWinner;
    if (ld.tieFewerCards && n0 !== n1) return n0 < n1 ? 0 : 1;
    return -1;
  }

  *_resolve(i) {
    const s = this.s;
    const lane = s.lanes[i];
    const ld = locDef(lane.loc.id);
    for (const sd of [s.priority, other(s.priority)]) {
      for (const c of this.revealedIn(i, sd)) {
        const d = this.def(c);
        if (d.onResolve && c.zone === 'board') d.onResolve(this, c);
      }
    }
    this.recompute();
    const w = this.laneWinner(i);
    const powers = [this.lanePower(i, 0), this.lanePower(i, 1)];
    let pts = ld.points || 1;
    if (w >= 0) {
      for (const c of this.revealedIn(i, w)) {
        const d = this.def(c);
        if (d.overpower && powers[w] - powers[other(w)] >= d.overpower) pts += 1;
      }
      s.players[w].points += pts;
      if (ld.steal && s.players[other(w)].points > 0) s.players[other(w)].points -= 1;
      if (ld.winnerDraws) this.draw(w, ld.winnerDraws);
      for (const c of this.revealedIn(i, w)) if (this.has(c, 'train')) c.trained += 1;
      if (ld.onWin) ld.onWin(this, i, w);
    }
    if (ld.afterResolve) ld.afterResolve(this, i, w);
    s.stats.resolutions += 1;
    if (s.stats.firstResolver === null) s.stats.firstResolver = w;
    const name = w >= 0 ? s.players[w].name : 'Nobody';
    this.log(`${ld.name} resolves (${powers[0]}–${powers[1]}). ${name} ${w >= 0 ? `scores ${pts}` : 'scores'}.`);
    yield { type: 'resolve', lane: i, winner: w, points: pts, powers, loc: lane.loc.id };
    // Cards leave (Root cards stay and join the next location).
    for (const sd of [0, 1]) {
      for (const c of this.laneCards(i, sd)) {
        if (!c.revealed) continue;
        if (this.has(c, 'root')) continue;
        lane.cards[sd].splice(lane.cards[sd].indexOf(c.uid), 1);
        this._leaveBoard(c, 'resolved');
      }
    }
    s.locUsed.push(lane.loc.id);
    this.recompute();
    this._arrive(i);
    this.recompute();
    yield { type: 'arrive', lane: i };
  }

  _checkWinner() {
    const s = this.s;
    const [a, b] = [s.players[0].points, s.players[1].points];
    if (a >= s.target || b >= s.target || s.turn >= RULES.turnLimit) {
      if (a !== b) s.winner = a > b ? 0 : 1;
      else {
        // Tiebreak: total power on the board.
        let p0 = 0, p1 = 0;
        for (let i = 0; i < RULES.lanes; i++) {
          p0 += this.lanePower(i, 0);
          p1 += this.lanePower(i, 1);
        }
        s.winner = p0 > p1 ? 0 : p1 > p0 ? 1 : -1;
      }
    }
  }

  // --- Helpers for effects ---

  random() {
    return nextRandom(this.s);
  }

  randInt(lo, hi) {
    return randInt(this.s, lo, hi);
  }

  otherLanes(i) {
    return [0, 1, 2].filter((x) => x !== i);
  }
}
