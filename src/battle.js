// Battle screen. Side 0 is the player, side 1 the AI.

import { Game, RULES, cardDef, locDef } from './engine.js';
import { chooseActions, applyActions, chooseMulligan } from './ai.js';
import { LOCATIONS, triggerText } from './locations.js';
import { cardHTML, esc, openSheet, showCardDetail, showLocDetail, toast, floatText, banner, sleep, icon, spr, timing } from './ui.js';
import { COLOR_NAMES, SUITS } from './cards.js';

const ME = 0, OPP = 1;

function speedFactor() {
  try { return localStorage.getItem('hb_speed') === 'fast' ? 0.45 : 1; } catch (e) { return 1; }
}
const wait = (ms) => sleep(ms * speedFactor());
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ } };

function shortTrigger(d) {
  const t = d.trigger;
  let s;
  switch (t.type) {
    case 'total': s = `${t.n} total power`; break;
    case 'solo': s = `${t.n} power on a side`; break;
    case 'cards': s = `${t.n} cards played`; break;
    case 'lead': s = `lead of ${t.n}`; break;
    case 'timer': s = `after ${t.n} turns`; break;
    case 'destroyed': s = `a card destroyed`; break;
  }
  return s + (t.or ? ` / ${t.or} total` : '');
}

const TIPS = [
  'Drag a card onto a lane, or tap it and then tap the lane. Tap a dashed card to take it back.',
  'A location scores when its bar fills. Whoever has more power there takes the star; then its cards leave and a new location arrives.',
  `Gold gems are energy, the same gem as a card's cost. The red shield is power. Tap your deck to draw a card for ${RULES.drawCost} energy. First to the stars shown at the top wins.`,
];

export function startBattle(root, cfg, onEnd) {
  const target = cfg.target || RULES.target;
  const game = Game.create({
    decks: [cfg.myDeck, cfg.opp.deck],
    fixedLocations: cfg.opp.fixedLocations || null,
    seed: (Math.random() * 2 ** 31) >>> 0,
    target,
    names: ['You', cfg.opp.name],
  });
  const ui = { selected: null, busy: false, tipIdx: cfg.tutorial ? 0 : -1, ended: false };

  root.innerHTML = `<div class="battle">
    <div class="bar top" id="oppbar"></div>
    <div class="infoline" id="info"></div>
    <div class="board" id="board"></div>
    <div id="tip"></div>
    <div class="selinfo" id="selinfo"></div>
    <div class="handbar" id="mebar"></div>
    <div class="handrow" id="hand"></div>
  </div>`;
  const $ = (id) => root.querySelector('#' + id);

  function lanePowerText(i, side) {
    const p = game.lanePower(i, side);
    if (side === OPP) {
      const hidden = game.laneCards(i, OPP).filter((c) => c.revealed && c.hidden);
      if (hidden.length) {
        let shown = p;
        for (const c of hidden) shown -= game.power(c);
        return `${shown}+?`;
      }
    }
    return String(p);
  }

  // What would score if the turn ended now, counting your staged cards at
  // printed power (the opponent's staged cards are hidden).
  function projection() {
    const out = { gain: [0, 0], risk: [false, false], ready: [] };
    for (let i = 0; i < RULES.lanes; i++) {
      const lane = game.s.lanes[i];
      const d = locDef(lane.loc.id);
      const prog = game.triggerProgress(i);
      let staged = 0, stagedN = 0;
      for (const c of game.laneCards(i, ME)) if (!c.revealed) { staged += cardDef(c.id).power + c.up + c.trained; stagedN++; }
      const t = d.trigger.type;
      const add = t === 'total' || t === 'solo' ? staged : t === 'cards' ? stagedN : 0;
      const p0 = game.lanePower(i, ME) + staged, p1 = game.lanePower(i, OPP);
      const ready = !lane.loc.delayed && (game.shouldResolve(i) || prog.value + add >= prog.need);
      const lowest = !!d.lowestWins;
      const lead = p0 === p1 ? -1 : (lowest ? p0 < p1 : p0 > p1) ? ME : OPP;
      out.ready[i] = ready ? lead : null;
      if (ready && lead >= 0) {
        out.gain[lead] += d.points || 1;
        if (d.steal) out.risk[1 - lead] = true;
      }
    }
    return out;
  }

  function starsHTML(side, proj) {
    const s = game.s, have = s.players[side].points;
    let gain = proj.gain[side];
    return Array.from({ length: s.target }, (_, k) => {
      let st = k < have ? 'on' : gain > 0 && k < have + gain ? 'gain' : 'off';
      if (proj.risk[side] && k === have - 1) st = 'risk';
      return `<i class="star ${st}">${icon('star')}</i>`;
    }).join('');
  }

  function gemsHTML() {
    const s = game.s, me = s.players[ME];
    let spent = 0;
    for (const u of me.stagedOrder) { const c = game.card(u); if (!c.revealed) spent += c.paid || 0; }
    if (me.bought) spent += RULES.drawCost;
    const left = me.energy, total = left + spent;
    const sel = ui.selected && ui.selected.kind === 'hand' ? game.cost(game.card(ui.selected.uid)) : 0;
    const afford = sel <= left;
    return Array.from({ length: Math.max(RULES.energyCap, total) }, (_, k) => {
      let st = k < left ? 'on' : k < total ? 'spent' : 'locked';
      if (st === 'on' && sel && afford && k >= left - sel) st += ' pend';
      if (st !== 'locked' && sel && !afford && k < left) st += ' short';
      return `<i class="gem ${st}">${icon('gem')}</i>`;
    }).join('');
  }

  function render() {
    if (press && press.dragging) return;
    document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());
    const s = game.s;
    const me = s.players[ME], op = s.players[OPP];
    const proj = projection();
    const fan = Math.min(op.hand.length, 7);
    $('oppbar').innerHTML = `
      <div class="por opp">${spr(cfg.opp.art || 'night')}</div>
      <div class="who"><b>${esc(cfg.opp.name)}</b><div class="stars">${starsHTML(OPP, proj)}</div></div>
      <div class="ohand" title="Cards in their hand">${Array.from({ length: fan }, (_, k) => `<i class="back" style="--k:${k - (fan - 1) / 2}"></i>`).join('')}<span class="badge">${op.hand.length}</span></div>
      <div class="pile" title="Cards in their deck"><i class="back"></i><span>${op.deck.length}</span></div>
      <button class="icon-btn" id="btnLog" aria-label="Battle log">Log</button>
      <button class="icon-btn" id="btnMenu" aria-label="Menu">☰</button>`;
    const next = game.nextLocation();
    const first = s.priority === ME ? 'You reveal first' : 'They reveal first';
    const oppStaged = s.phase === 'stage' ? op.stagedOrder.filter((u) => !game.card(u).revealed).length : 0;
    $('info').innerHTML = `<span class="chip turn">Turn ${s.turn}</span><span class="chip first">${first}</span>${oppStaged ? `<span class="chip opp">They played ${oppStaged}</span>` : ''}${next ? `<span class="chip" id="nextLoc">Next ${spr('loc_' + next)} ${esc(LOCATIONS[next].name)}</span>` : ''}`;

    let board = '';
    for (let i = 0; i < RULES.lanes; i++) board += laneHTML(i, proj);
    $('board').innerHTML = board;

    $('tip').innerHTML = ui.tipIdx >= 0 && ui.tipIdx < TIPS.length ? `<div class="tutorial-tip" id="tipbox">${TIPS[ui.tipIdx]} <u>Next</u></div>` : '';

    const handCards = me.hand.map((u) => game.card(u));
    const anyPlayable = handCards.some((c) => [0, 1, 2].some((i) => game.canPlay(ME, c.uid, i)));
    let spent = 0;
    for (const u of me.stagedOrder) { const c = game.card(u); if (!c.revealed) spent += c.paid || 0; }
    if (me.bought) spent += RULES.drawCost;
    $('mebar').innerHTML = `
      <div class="por me">${spr(cfg.myArt || 'squire')}</div>
      <div class="who"><b>You</b><div class="stars">${starsHTML(ME, proj)}</div></div>
      <div class="energy"><div class="gems">${gemsHTML()}</div><span><b>${me.energy}</b>/${me.energy + spent} energy</span></div>
      <div class="piles"><button class="pile ${game.canBuyDraw(ME) && !ui.busy ? 'buy' : ''}" id="btnDeck" title="${game.canBuyDraw(ME) ? `Draw a card for ${RULES.drawCost} energy` : 'Your deck'}"><i class="back me"></i><span>${me.deck.length}</span>${RULES.drawCost && !me.bought && s.winner === null ? `<em class="buytag">+1 ${icon('gem')}${RULES.drawCost}</em>` : ''}</button>
        <button class="pile" id="btnDiscard" title="Your discard pile"><i class="back dis"></i><span>${me.discard.length}</span></button></div>
      <button class="endturn ${!ui.busy && s.winner === null && !anyPlayable ? 'pulse' : ''}" id="btnEnd" ${ui.busy || s.winner !== null ? 'disabled' : ''}>${ui.busy ? 'Revealing' : 'End turn'}</button>`;

    const sel = ui.selected && game.card(ui.selected.uid);
    if (sel && !ui.busy) {
      const d = cardDef(sel.id);
      const cost = game.cost(sel);
      const short = ui.selected.kind === 'hand' && cost > me.energy;
      const hint = short ? `<span class="warn">Needs ${cost} energy, you have ${me.energy}.</span>`
        : `<span class="hint">${ui.selected.kind === 'hand' ? 'Tap a lane to play it.' : 'Tap a lane to move it.'}</span>`;
      const t = timing(d);
      $('selinfo').innerHTML = `<div><b>${esc(d.name)}</b> <span class="tag">${SUITS[d.color]} ${COLOR_NAMES[d.color]}</span> ${t ? `<span class="tm">${t[0]}</span> ` : ''}${esc(d.text || 'No ability.')} ${hint}</div>`;
      $('selinfo').classList.add('on');
    } else {
      $('selinfo').innerHTML = '';
      $('selinfo').classList.remove('on');
    }

    $('hand').innerHTML = handCards.length ? handCards.map((c) => {
      const d = cardDef(c.id);
      const playable = [0, 1, 2].some((i) => game.canPlay(ME, c.uid, i));
      return cardHTML(d, { uid: c.uid, upgraded: !!c.up, power: d.power + c.up + c.trained, cost: game.cost(c),
        selected: ui.selected && ui.selected.uid === c.uid, unplayable: !playable });
    }).join('') : `<div class="empty">No cards in hand</div>`;
    fitHand();
    bindButtons();
  }

  // Overlap hand cards so they always fit on one row (no sideways scroll,
  // which used to fight with dragging).
  function fitHand() {
    const row = $('hand');
    const cards = row.querySelectorAll('.card');
    if (!cards.length) return;
    const n = cards.length;
    const avail = row.clientWidth - 20;
    // Shrink cards down to 60px wide first, then overlap them.
    const w = Math.max(60, Math.min(76, (avail - 5 * (n - 1)) / n));
    row.style.setProperty('--fit', w + 'px');
    const gap = n > 1 ? Math.min(5, (avail - w * n) / (n - 1)) : 0;
    cards.forEach((el, k) => { el.style.marginLeft = k ? gap + 'px' : '0'; el.style.zIndex = String(k + 1); });
  }

  function laneHTML(i, proj) {
    const s = game.s;
    const lane = s.lanes[i];
    const d = locDef(lane.loc.id);
    const sel = ui.selected;
    let isTarget = false, isNo = false;
    if (sel && !ui.busy) {
      if (sel.kind === 'hand') {
        isTarget = game.canPlay(ME, sel.uid, i);
        isNo = !isTarget && game.cost(game.card(sel.uid)) > s.players[ME].energy;
      } else if (sel.kind === 'board') isTarget = game.canMove(ME, sel.uid, i);
    }
    const zone = (side) => {
      // The AI commits first, so its staged cards stay invisible until they
      // reveal (otherwise you'd see its placements before choosing yours).
      const cards = game.laneCards(i, side).filter((c) => side === ME || c.revealed);
      let html = '';
      for (const c of cards) {
        const def = cardDef(c.id);
        if (side === OPP && c.hidden) {
          html += cardHTML(def, { size: 'mini', back: true, hiddenMark: true, uid: c.uid });
          continue;
        }
        html += cardHTML(def, {
          size: 'mini', uid: c.uid, power: c.revealed ? game.power(c) : def.power + c.up + c.trained,
          upgraded: !!c.up, staged: !c.revealed, movable: side === ME && movable(c),
          selected: sel && sel.uid === c.uid,
        });
      }
      const slot = side === ME && (isTarget || isNo) ? `<div class="slot ${isNo ? 'no' : ''}">+</div>` : '';
      const n = cards.length + (slot ? 1 : 0);
      const ghosts = '<i class="ghost"></i>'.repeat(Math.max(0, 4 - n));
      const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
      return `<div class="zone ${side === ME ? 'me' : 'opp'}" style="--cols:${cols}">${html}${slot}${ghosts}</div>`;
    };
    const prog = game.triggerProgress(i);
    const pct = Math.min(100, Math.round((100 * prog.value) / Math.max(1, prog.need)));
    // Preview of your staged cards (printed power; effects not included).
    let staged = 0, stagedN = 0;
    for (const c of game.laneCards(i, ME)) if (!c.revealed) { staged += cardDef(c.id).power + c.up + c.trained; stagedN++; }
    const t = d.trigger.type;
    const add = t === 'total' || t === 'solo' ? staged : t === 'cards' ? stagedN : 0;
    const pct2 = Math.min(100 - pct, Math.round((100 * add) / Math.max(1, prog.need)));
    const ready = proj.ready[i];
    const p0 = game.lanePower(i, ME) + staged, p1 = game.lanePower(i, OPP);
    const lowest = !!d.lowestWins;
    const lead = p0 === p1 ? 'tie' : (lowest ? p0 < p1 : p0 > p1) ? 'me' : 'opp';
    const flags = (lane.loc.ignite[0] || lane.loc.ignite[1] ? '<span class="flag">Closes if ahead</span>' : '') + (lane.loc.delayed ? '<span class="flag">Held this turn</span>' : '');
    const rew = d.steal ? `${icon('star')}<span>steal</span>` : `${icon('star')}<span>+${d.points}</span>`;
    const readyTag = ready !== null && ready !== undefined
      ? `<em class="ready-tag">${ready === ME ? 'You score ▼' : ready === OPP ? 'They score ▲' : 'Resolves: tied'}</em>` : '';
    return `<div class="lane ${isTarget ? 'target' : ''} ${isNo ? 'no' : ''} ${readyTag ? 'ready' : ''}" data-lane="${i}">
      ${readyTag}
      ${zone(OPP)}
      <div class="loc lead-${lead}" data-loc="${i}">
        <div class="lp opp"><b>${lanePowerText(i, OPP)}</b></div>
        <span class="rew">${rew}</span>
        <div class="lart">${spr('loc_' + lane.loc.id)}</div>
        <div class="lname">${esc(d.name)}</div>
        <div class="ltrig">${shortTrigger(d)}</div>
        ${d.text ? `<div class="lrule">${esc(d.text)}</div>` : ''}
        ${flags ? `<div class="flags">${flags}</div>` : ''}
        <div class="prog ${readyTag ? 'ready' : ''}"><div style="width:${pct}%"></div><div class="pre" style="width:${pct2}%"></div><span class="pn">${prog.value + add}/${prog.need}</span></div>
        <div class="lp me"><b>${p0}${staged ? '<small>*</small>' : ''}</b></div>
      </div>
      ${zone(ME)}
    </div>`;
  }

  // ---------- Input ----------
  //
  // One pointer controller for the whole battle screen. Its move/up
  // listeners live on the window, so a re-render mid-gesture (which replaces
  // the pressed element) can't leave a card or drag ghost stuck.
  //   tap        select a hand card / play the selection into a lane /
  //              take back a staged card / pick up a Shift card
  //   drag       hand card -> lane (play); staged card -> lane (re-stage) or
  //              hand (take back); Shift card -> lane (move)
  //   long-press card or location details

  const DRAG_PX = 8, LONG_MS = 450;
  let press = null;
  const listen = new AbortController();

  function bindButtons() {
    $('btnEnd').onclick = endTurn;
    $('btnLog').onclick = showLog;
    $('btnMenu').onclick = showMenu;
    $('btnDeck').onclick = () => {
      if (!ui.busy && game.buyDraw(ME)) { render(); toast(`Drew a card for ${RULES.drawCost} energy.`); return; }
      showPile('Your deck (random order)', game.s.players[ME].deck);
    };
    $('btnDiscard').onclick = () => showPile('Your discard pile', game.s.players[ME].discard);
    const tip = $('tipbox');
    if (tip) tip.onclick = () => { ui.tipIdx++; render(); };
    const nl = root.querySelector('#nextLoc');
    if (nl) nl.onclick = () => showLocDetail(game.nextLocation(), '<div class="muted">This location arrives next, when any location resolves.</div>');
  }

  function cardKind(uid) {
    const c = game.card(uid);
    if (!c) return null;
    if (c.zone === 'hand' && c.owner === ME) return 'hand';
    if (c.zone === 'board') return 'board';
    return null;
  }

  function canDrag(p) {
    if (ui.busy || p.uid == null) return false;
    const c = game.card(p.uid);
    if (p.kind === 'hand') return true;
    if (p.kind === 'board' && c.owner === ME) return game.canUnstage(ME, c.uid) || movable(c);
    return false;
  }

  function movable(c) {
    return c.owner === ME && c.revealed && game.s.phase === 'stage' && [0, 1, 2].some((i) => game.canMove(ME, c.uid, i));
  }

  function onDown(e) {
    if (press || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!root.contains(e.target) || e.target.closest('button, .chip, #tipbox')) return;
    const cardEl = e.target.closest('.card[data-uid]');
    const laneEl = e.target.closest('.lane');
    const uid = cardEl && cardEl.dataset.uid ? Number(cardEl.dataset.uid) : null;
    press = {
      id: e.pointerId, x: e.clientX, y: e.clientY, el: cardEl, uid,
      kind: uid != null ? cardKind(uid) : null,
      lane: laneEl ? Number(laneEl.dataset.lane) : null,
      onLoc: !!e.target.closest('.loc'),
      dragging: false, longFired: false, ghost: null, timer: null,
    };
    press.timer = setTimeout(() => {
      if (!press || press.dragging) return;
      press.longFired = true;
      buzz(10);
      if (press.uid != null) showDetailFor(press.uid);
      else if (press.lane != null) showLocDetail(game.s.lanes[press.lane].loc.id, laneStatus(press.lane));
    }, LONG_MS);
  }

  function onMove(e) {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    if (!p.dragging) {
      if (p.longFired || Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
      clearTimeout(p.timer);
      if (!canDrag(p) || !p.el) { p.longFired = true; return; } // moved too far for a tap
      startDrag(p);
    }
    p.ghost.style.left = e.clientX + 'px';
    p.ghost.style.top = e.clientY + 'px';
    const lane = laneAt(e.clientX, e.clientY);
    root.querySelectorAll('.lane').forEach((l) => l.classList.toggle('target', Number(l.dataset.lane) === lane && dropOk(p, lane)));
    $('hand').classList.toggle('target', p.kind === 'board' && overHand(e.clientX, e.clientY));
  }

  function startDrag(p) {
    p.dragging = true;
    ui.selected = null;
    const r = p.el.getBoundingClientRect();
    const g = p.el.cloneNode(true);
    g.classList.remove('selected', 'reveal');
    g.classList.add('drag-ghost');
    g.style.width = r.width + 'px';
    g.style.height = r.height + 'px';
    document.body.appendChild(g);
    p.ghost = g;
    p.el.classList.add('drag-src');
    root.querySelector('.battle').classList.add('dragging');
  }

  function dropOk(p, lane) {
    if (lane === null) return false;
    const c = game.card(p.uid);
    if (p.kind === 'hand') return game.canPlay(ME, p.uid, lane);
    if (game.canUnstage(ME, p.uid)) return lane !== c.lane;
    return game.canMove(ME, p.uid, lane);
  }

  function onUp(e) {
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    endPress();
    if (p.dragging) return drop(p, e.clientX, e.clientY);
    if (!p.longFired) tap(p);
  }

  function onCancel(e) {
    if (press && (!e || e.pointerId === press.id)) { endPress(); render(); }
  }

  function endPress() {
    const p = press;
    press = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (p.ghost) p.ghost.remove();
    document.querySelectorAll('.drag-ghost').forEach((g) => g.remove());
    const b = root.querySelector('.battle');
    if (b) b.classList.remove('dragging');
    root.querySelectorAll('.lane.target').forEach((l) => l.classList.remove('target'));
  }

  function drop(p, x, y) {
    const lane = laneAt(x, y);
    const c = game.card(p.uid);
    if (p.kind === 'hand') {
      if (lane !== null && game.canPlay(ME, p.uid, lane)) { game.play(ME, p.uid, lane); buzz(8); }
      else if (lane !== null) toast(whyCantPlay(p.uid, lane));
    } else if (game.canUnstage(ME, p.uid)) {
      if (overHand(x, y)) game.unstage(ME, p.uid);
      else if (lane !== null && lane !== c.lane) {
        game.unstage(ME, p.uid);
        if (!game.play(ME, p.uid, lane)) toast(whyCantPlay(p.uid, lane));
      }
    } else if (lane !== null && game.canMove(ME, p.uid, lane)) {
      game.moveByShift(ME, p.uid, lane);
      buzz(8);
    }
    render();
  }

  function tap(p) {
    if (p.uid != null) {
      const c = game.card(p.uid);
      if (!c) return render();
      if (p.kind === 'hand') {
        if (ui.busy) return showDetailFor(p.uid);
        ui.selected = ui.selected && ui.selected.uid === p.uid ? null : { kind: 'hand', uid: p.uid };
        return render();
      }
      // A board card: a pending selection plays into this card's lane.
      if (ui.selected && ui.selected.uid !== p.uid && laneTap(c.lane)) return;
      if (!ui.busy && game.canUnstage(ME, p.uid)) {
        game.unstage(ME, p.uid);
        ui.selected = null;
        return render();
      }
      if (!ui.busy && movable(c)) {
        ui.selected = ui.selected && ui.selected.uid === p.uid ? null : { kind: 'board', uid: p.uid };
        return render();
      }
      return showDetailFor(p.uid);
    }
    if (p.lane !== null) {
      if (laneTap(p.lane)) return;
      if (p.onLoc) return showLocDetail(game.s.lanes[p.lane].loc.id, laneStatus(p.lane));
      return;
    }
    if (ui.selected) { ui.selected = null; render(); }
  }

  window.addEventListener('pointerdown', onDown, { signal: listen.signal });
  window.addEventListener('pointermove', onMove, { signal: listen.signal });
  window.addEventListener('pointerup', onUp, { signal: listen.signal });
  window.addEventListener('pointercancel', onCancel, { signal: listen.signal });
  window.addEventListener('blur', () => onCancel(null), { signal: listen.signal });
  document.addEventListener('visibilitychange', () => onCancel(null), { signal: listen.signal });
  root.addEventListener('dragstart', (e) => e.preventDefault(), { signal: listen.signal });
  root.addEventListener('contextmenu', (e) => e.preventDefault(), { signal: listen.signal });

  function laneTap(i) {
    const sel = ui.selected;
    if (!sel || ui.busy) return false;
    if (sel.kind === 'hand') {
      if (game.canPlay(ME, sel.uid, i)) {
        game.play(ME, sel.uid, i);
        buzz(8);
        ui.selected = null;
        render();
      } else {
        toast(whyCantPlay(sel.uid, i));
      }
      return true;
    }
    if (sel.kind === 'board') {
      if (game.canMove(ME, sel.uid, i)) game.moveByShift(ME, sel.uid, i);
      ui.selected = null;
      render();
      return true;
    }
    return false;
  }

  function whyCantPlay(uid, lane) {
    const c = game.card(uid);
    if (game.cost(c) > game.s.players[ME].energy) return 'Not enough energy.';
    return 'Can\'t play there.';
  }

  function laneAt(x, y) {
    for (const el of root.querySelectorAll('.lane')) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return Number(el.dataset.lane);
    }
    return null;
  }

  function overHand(x, y) {
    const r = $('hand').getBoundingClientRect();
    return y >= r.top - 10 && x >= r.left && x <= r.right;
  }

  function laneStatus(i) {
    const prog = game.triggerProgress(i);
    const ready = game.shouldResolve(i);
    return `<div class="muted">Progress: ${prog.value} / ${prog.need}${ready ? ' — <b style="color:#ffb36b">will resolve at end of this turn as things stand</b>' : ''}.</div>`;
  }

  function showDetailFor(uid) {
    const c = game.card(uid);
    if (!c) return;
    const d = cardDef(c.id);
    const visible = c.owner === ME || (c.revealed && !c.hidden) || c.zone === 'discard';
    if (!visible) { toast('Face-down card'); return; }
    const power = c.zone === 'board' && c.revealed ? game.power(c) : d.power + c.up + c.trained;
    showCardDetail(d, { power, upgraded: !!c.up, cost: game.cost(c) });
  }

  // ---------- Turn flow ----------

  function aiTurn() {
    const actions = chooseActions(game, OPP, cfg.opp.difficulty || 'normal');
    applyActions(game, OPP, actions);
  }

  async function endTurn() {
    if (ui.busy || game.s.winner !== null) return;
    ui.busy = true;
    ui.selected = null;
    render();
    const it = game.endTurnSteps();
    while (true) {
      const before = snapshot();
      const { value, done } = it.next();
      game.s.events.length = 0;
      if (done) break;
      if (value.type === 'newturn') {
        aiTurn();
        ui.busy = false;
        render();
        if (ui.tipIdx === 1 && game.s.turn >= 2) { /* keep tip */ }
        break;
      }
      render();
      await animate(value, before);
      if (value.type === 'gameover') break;
    }
    ui.busy = false;
    render();
    if (game.s.winner !== null) finish();
  }

  function snapshot() {
    const m = {};
    for (const c of game.boardCards()) m[c.uid] = game.power(c);
    return m;
  }

  function cardEl(uid) {
    return root.querySelector(`.board .card[data-uid="${uid}"]`);
  }

  async function animate(ev, before) {
    const diffs = () => {
      for (const c of game.boardCards()) {
        if (c.owner === OPP && c.hidden) continue;
        const was = before[c.uid];
        const now = game.power(c);
        if (was !== undefined && was !== now) floatText(cardEl(c.uid), (now > was ? '+' : '') + (now - was), now > was);
      }
    };
    switch (ev.type) {
      case 'reveal': {
        const el = cardEl(ev.uid);
        if (el) el.classList.add('reveal');
        diffs();
        await wait(330);
        break;
      }
      case 'effect':
        diffs();
        await wait(420);
        break;
      case 'endturn':
        diffs();
        await wait(450);
        break;
      case 'resolve': {
        const laneEl = root.querySelector(`.lane[data-lane="${ev.lane}"]`);
        const who = ev.winner === ME ? 'me' : ev.winner === OPP ? 'opp' : 'none';
        if (laneEl) laneEl.classList.add('flash-' + who);
        buzz(ev.winner === ME ? [20, 40, 20] : 35);
        const name = LOCATIONS[ev.loc].name;
        banner(ev.winner === ME ? `★ You score · ${name}` : ev.winner === OPP ? `★ ${cfg.opp.name} scores · ${name}` : `${name}: tied, no star`, who === 'none' ? '' : who);
        await wait(1150);
        break;
      }
      case 'arrive': {
        const l = root.querySelector(`.loc[data-loc="${ev.lane}"]`);
        if (l) l.classList.add('arrive');
        await wait(450);
        break;
      }
      case 'gameover':
        await wait(300);
        break;
    }
  }

  function finish() {
    if (ui.ended) return;
    ui.ended = true;
    const w = game.s.winner;
    const won = w === ME;
    const title = won ? 'Victory' : w === -1 ? 'Draw' : 'Defeat';
    const s = game.s;
    const { close } = openSheet(`<div class="result">
      <div class="result-spr">${spr(won ? cfg.myArt || 'squire' : cfg.opp.art || 'night')}</div>
      <div class="big">${title}</div>
      <div class="muted">${s.players[ME].points} – ${s.players[OPP].points} after ${s.turn} turns</div>
      <div style="height:14px"></div>
      <button class="btn primary" id="resContinue" style="width:100%">Continue</button>
    </div>`, { center: true, dismissable: false });
    document.getElementById('resContinue').onclick = () => { close(); listen.abort(); onEnd(won, game); };
  }

  function showLog() {
    const lines = [...game.s.log].reverse().map((l) => `<div><span class="t">T${l.turn}</span>${esc(l.msg)}</div>`).join('');
    openSheet(`<h3>Battle log</h3><div class="log">${lines || 'Nothing yet.'}</div><div style="height:10px"></div><button class="btn" data-close style="width:100%">Close</button>`);
  }

  function showPile(title, uids) {
    const cards = uids.map((u) => game.card(u)).sort((a, b) => cardDef(a.id).cost - cardDef(b.id).cost);
    const html = cards.map((c) => cardHTML(cardDef(c.id), { upgraded: !!c.up, power: cardDef(c.id).power + c.up + c.trained, uid: c.uid })).join('');
    const sh = openSheet(`<h3>${title} · ${cards.length}</h3><div class="deck-grid">${html || '<span class="muted">Empty</span>'}</div><div style="height:10px"></div><button class="btn" data-close style="width:100%">Close</button>`);
    sh.el.querySelectorAll('.card').forEach((el) => el.addEventListener('click', () => {
      const c = game.card(Number(el.dataset.uid));
      showCardDetail(cardDef(c.id), { upgraded: !!c.up, power: cardDef(c.id).power + c.up + c.trained });
    }));
  }

  function showMenu() {
    const sh = openSheet(`<h3>Menu</h3>
      <div class="menu" style="max-width:none">
        <button class="btn" id="mHelp">How to play</button>
        <button class="btn" id="mSpeed">Animations: ${speedFactor() < 1 ? 'Fast' : 'Normal'}</button>
        <button class="btn danger" id="mConcede">Concede this battle</button>
        <button class="btn" data-close>Back to battle</button>
      </div>`);
    sh.el.querySelector('#mHelp').onclick = () => { sh.close(); cfg.showHelp && cfg.showHelp(); };
    sh.el.querySelector('#mSpeed').onclick = (e) => {
      const fast = speedFactor() < 1;
      try { localStorage.setItem('hb_speed', fast ? 'normal' : 'fast'); } catch (err) { /* ignore */ }
      e.currentTarget.textContent = `Animations: ${fast ? 'Normal' : 'Fast'}`;
    };
    sh.el.querySelector('#mConcede').onclick = () => {
      sh.close();
      game.s.winner = OPP;
      game.s.phase = 'over';
      finish();
    };
  }

  // Opening hand: the AI decides its mulligan at once; you get a sheet.
  game.mulligan(OPP, chooseMulligan(game, OPP));
  render();
  mulliganSheet();
  return game;

  function mulliganSheet() {
    const picks = new Set();
    const sh = openSheet('<div class="mull"></div>', { center: true, dismissable: false });
    const box = sh.el.querySelector('.mull');
    const draw = () => {
      const hand = game.s.players[ME].hand.map((u) => game.card(u));
      box.innerHTML = `<h3>Opening hand</h3>
        <div class="muted">Tap up to ${RULES.mulligan} to replace. They won't come back.</div>
        <div class="mull-row">${hand.map((c) => `<div class="mull-pick ${picks.has(c.uid) ? 'on' : ''}" data-u="${c.uid}">${cardHTML(cardDef(c.id), { size: 'big', uid: c.uid, upgraded: !!c.up, power: cardDef(c.id).power + c.up })}<span>Replace</span></div>`).join('')}</div>
        <button class="btn primary" id="mullGo" style="width:100%">${picks.size ? `Replace ${picks.size} card${picks.size > 1 ? 's' : ''}` : 'Keep this hand'}</button>`;
      box.querySelectorAll('.mull-pick').forEach((el) => el.addEventListener('click', () => {
        const u = Number(el.dataset.u);
        if (picks.has(u)) picks.delete(u);
        else if (picks.size < RULES.mulligan) picks.add(u);
        else toast(`You can replace up to ${RULES.mulligan} cards.`);
        draw();
      }));
      box.querySelector('#mullGo').onclick = () => {
        game.mulligan(ME, [...picks]);
        sh.close();
        aiTurn();
        render();
      };
    };
    draw();
  }
}
