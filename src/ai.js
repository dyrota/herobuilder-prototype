// A generic AI that understands every card by simulation: it tries candidate
// plays on a cloned game, runs the end of turn, and scores the result.
//
// Fairness: it decides at the start of the turn, before the opponent stages,
// and it can't see Veiled cards (they're replaced by an average card). It does
// not look at the opponent's hand. To account for what the opponent might add
// this turn, each plan is scored twice: once with no enemy plays and once
// with "ghost" enemy power spread over the lanes.

import { Game, RULES, other, locDef } from './engine.js';
import { CARDS } from './cards.js';

CARDS.__ghost = { id: '__ghost', name: 'Ghost', color: 'N', cost: 0, power: 0, token: true, keywords: [], text: '' };
CARDS.__unknown = { id: '__unknown', name: 'Unknown', color: 'N', cost: 0, power: 4, token: true, keywords: [], text: '' };

export const DIFFICULTY = {
  easy: { noise: 18, maxPlays: 2, ghost: 0.6, samples: 0 },
  medium: { noise: 30, maxPlays: 3, ghost: 1.0, samples: 1 },
  normal: { noise: 4, maxPlays: 6, ghost: 1.0, samples: 2 },
  hard: { noise: 0, maxPlays: 8, ghost: 1.0, samples: 4 },
};

// Returns a list of actions: {type:'play', uid, lane} or {type:'move', uid, lane}.
//
// With samples > 0 the AI "determinizes": it deals the opponent random hands
// from their unseen cards, predicts their plays with the cheaper ghost-based
// AI, and scores its own plans against those predicted plays.
export function chooseActions(game, side, difficulty = 'normal') {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const view = redact(game, side);
  let scorer;
  if (cfg.samples > 0) {
    const opp = other(side);
    const worlds = [];
    for (let k = 0; k < cfg.samples; k++) {
      const w = determinize(view, side, k);
      const oppPlan = greedy(w, opp, (plan) => ghostScore(w, opp, plan, DIFFICULTY.normal), DIFFICULTY.normal);
      worlds.push({ w, oppPlan });
    }
    scorer = (plan) => {
      let total = 0;
      for (const { w, oppPlan } of worlds) {
        const g = applyPlan(w, side, plan);
        for (const a of oppPlan) {
          if (a.type === 'play') g.play(opp, a.uid, a.lane);
          else g.moveByShift(opp, a.uid, a.lane);
        }
        g.endTurn();
        total += evaluate(g, side);
      }
      // Blend in the cautious ghost score so plans stay robust to surprises.
      return 0.7 * (total / worlds.length) + 0.3 * ghostScore(view, side, plan, cfg);
    };
  } else {
    scorer = (plan) => ghostScore(view, side, plan, cfg);
  }
  const plan = greedy(view, side, scorer, cfg);
  // Leftover energy buys a card, unless it would be saved for next turn.
  const p = view.s.players[side];
  if (RULES.drawCost > 0 && applyPlanEnergy(view, side, plan, true) >= RULES.drawCost && !p.bought &&
      (!p.carry || p.hand.length <= 1) && applyPlan(view, side, plan).canBuyDraw(side)) plan.push({ type: 'draw' });
  return plan;
}

function greedy(view, side, scorer, cfg) {
  const plan = [];
  let current = scorer(plan) - TUNE.unspent * applyPlanEnergy(view, side, plan);
  for (let step = 0; step < cfg.maxPlays + 2; step++) {
    const base = applyPlan(view, side, plan);
    const cands = candidates(base, side);
    let best = null;
    let bestScore = -Infinity;
    for (const a of cands) {
      const next = [...plan, a];
      const sc = scorer(next) - TUNE.unspent * applyPlanEnergy(view, side, next) +
        (cfg.noise ? (base.random() - 0.5) * cfg.noise : 0);
      if (sc > bestScore) {
        bestScore = sc;
        best = a;
      }
    }
    if (!best || bestScore <= current + 0.5) break;
    if (best.type === 'play' && plan.filter((p) => p.type === 'play').length >= cfg.maxPlays) break;
    plan.push(best);
    current = bestScore;
  }
  return plan;
}

// Deals the opponent a random hand from their unseen cards (hand + deck).
function determinize(view, side, k) {
  const g = view.clone();
  g.s.rng = (g.s.rng + 0x9e3779b9 * (k + 1)) >>> 0;
  const opp = other(side);
  const p = g.s.players[opp];
  const pool = [...p.hand, ...p.deck];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(g.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = p.hand.length;
  p.hand = pool.slice(0, n);
  p.deck = pool.slice(n);
  for (const u of p.hand) g.card(u).zone = 'hand';
  for (const u of p.deck) g.card(u).zone = 'deck';
  return g;
}

export function applyActions(game, side, actions) {
  for (const a of actions) {
    if (a.type === 'play') game.play(side, a.uid, a.lane);
    else if (a.type === 'move') game.moveByShift(side, a.uid, a.lane);
    else if (a.type === 'draw') game.buyDraw(side);
  }
}

function redact(game, side) {
  const g = game.clone();
  // The AI doesn't know its own deck order either.
  const own = g.s.players[side].deck;
  for (let i = own.length - 1; i > 0; i--) {
    const j = Math.floor(g.random() * (i + 1));
    [own[i], own[j]] = [own[j], own[i]];
  }
  for (const c of Object.values(g.s.cards)) {
    if (c.owner !== side && c.zone === 'board' && c.hidden) {
      c.id = '__unknown';
      c.perm = 0;
      c.gear = [];
    }
  }
  return g;
}

function applyPlan(view, side, plan) {
  const g = view.clone();
  for (const a of plan) {
    if (a.type === 'play') g.play(side, a.uid, a.lane);
    else g.moveByShift(side, a.uid, a.lane);
  }
  return g;
}

function applyPlanEnergy(view, side, plan, raw = false) {
  if (!raw && view.s.players[side].carry) return 0; // unspent energy is saved, not wasted
  let e = view.s.players[side].energy;
  for (const a of plan) if (a.type === 'play') e -= view.cost(view.card(a.uid));
  return Math.max(0, e);
}

function candidates(g, side) {
  const out = [];
  const p = g.s.players[side];
  const seen = new Set();
  for (const uid of p.hand) {
    const c = g.card(uid);
    const key = c.id + '/' + c.up;
    if (seen.has(key)) continue; // identical copies are interchangeable
    seen.add(key);
    for (let i = 0; i < RULES.lanes; i++) if (g.canPlay(side, uid, i)) out.push({ type: 'play', uid, lane: i });
  }
  for (const c of g.boardCards(side)) {
    for (let i = 0; i < RULES.lanes; i++) if (g.canMove(side, c.uid, i)) out.push({ type: 'move', uid: c.uid, lane: i });
  }
  return out;
}

function ghostScore(view, side, plan, cfg) {
  const opp = other(side);
  const g1 = applyPlan(view, side, plan);
  const g2 = g1.clone();
  g1.endTurn();
  const a = evaluate(g1, side);
  // Ghost enemy power: what the opponent could plausibly add this turn.
  HAND_VALUE = TUNE.hand;
  const budget = Math.round(g2.s.players[opp].energy * TUNE.ghost * cfg.ghost);
  const lanes = [0, 1, 2].filter((i) => g2.hasRoom(i, opp));
  if (budget > 0 && lanes.length) {
    for (const i of lanes) {
      const share = Math.round(budget / lanes.length);
      if (share <= 0) continue;
      const t = g2._newCard('__ghost', opp);
      t.zone = 'board';
      t.lane = i;
      t.revealed = true;
      t.perm = share;
      g2.s.lanes[i].cards[opp].push(t.uid);
    }
  }
  g2.endTurn();
  const b = evaluate(g2, side);
  return 0.45 * a + 0.55 * b;
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const TUNE = { hand: 1.5, unspent: 2.5, ghost: 1.5, ramp: 4, bank: 3, carry: 8, discount: 5 };
let HAND_VALUE = TUNE.hand;

export function evaluate(g, side) {
  const s = g.s;
  const opp = other(side);
  if (s.winner !== null) return s.winner === side ? 10000 : s.winner === -1 ? 0 : -10000;
  const pm = s.players[side].points;
  const po = s.players[opp].points;
  let v = 120 * (pm - po);
  // Being one point from winning is worth extra.
  if (pm === s.target - 1) v += 60;
  if (po === s.target - 1) v -= 60;
  for (let i = 0; i < RULES.lanes; i++) {
    const loc = s.lanes[i].loc;
    const ld = locDef(loc.id);
    const prog = g.triggerProgress(i);
    const f = Math.min(1, prog.value / Math.max(1, prog.need));
    let m = g.lanePower(i, side) - g.lanePower(i, opp);
    if (ld.lowestWins) {
      const mine = g.revealedIn(i, side).length, theirs = g.revealedIn(i, opp).length;
      m = mine === 0 ? -3 : theirs === 0 ? 3 : -m;
    }
    const spread = 2.5 + 4 * (1 - f);
    const win = sigmoid(m / spread);
    v += ld.points * (win - 0.5) * 2 * (30 + 45 * f);
  }
  // Cards in hand have some option value, but energy doesn't carry over, so
  // holding cards is only worth a little.
  const hand = s.players[side].hand.length;
  v += HAND_VALUE * Math.min(hand, 4);
  v -= HAND_VALUE * Math.min(s.players[opp].hand.length, 4);
  // Energy investments: ramp pays off until natural energy reaches the cap;
  // saved energy and next turn's discount are worth a little now.
  for (const [sd, sign] of [[side, 1], [opp, -1]]) {
    const p = s.players[sd];
    const left = Math.max(0, RULES.energyCap - (s.turn + RULES.energyStart));
    v += sign * (TUNE.ramp * Math.min(p.ramp, left) * Math.min(left, 5) / 2 +
      TUNE.bank * p.bank + (p.carry ? TUNE.carry : 0) + TUNE.discount * p.discountNext);
  }
  return v;
}

// Opening-hand mulligan: send back expensive cards first, then make sure
// there is something cheap to play on the first turns.
export function chooseMulligan(game, side) {
  const hand = game.s.players[side].hand.map((u) => game.card(u));
  const cost = (c) => game.def(c).cost;
  const back = hand.filter((c) => cost(c) >= 5).sort((x, y) => cost(y) - cost(x)).slice(0, RULES.mulligan);
  const kept = hand.filter((c) => !back.includes(c));
  if (back.length < RULES.mulligan && !kept.some((c) => cost(c) <= RULES.energyStart)) {
    const worst = kept.filter((c) => cost(c) >= 3).sort((x, y) => cost(y) - cost(x))[0];
    if (worst) back.push(worst);
  }
  return back.map((c) => c.uid);
}

// Plays a full AI-vs-AI game. Returns the final Game.
export function playOut(game, diffs = ['normal', 'normal']) {
  for (const side of [0, 1]) if (game.canMulligan(side)) game.mulligan(side, chooseMulligan(game, side));
  while (game.s.winner === null) {
    const plans = [0, 1].map((side) => chooseActions(game, side, diffs[side]));
    for (const side of [0, 1]) applyActions(game, side, plans[side]);
    game.endTurn();
  }
  return game;
}
