// App shell: screens and navigation.

import { CARDS, COLOR_NAMES, FACTIONS, SUITS } from './cards.js';
import { LOCATIONS } from './locations.js';
import { CLASSES } from './content.js';
import { RULES } from './engine.js';
import { startBattle } from './battle.js';
import * as Run from './run.js';
import { TRAITS } from './traits.js';
import { cardHTML, locCardHTML, esc, openSheet, closeAllSheets, showCardDetail, showLocDetail, toast, colorSwatches, spr, ico, TIMING, timing as TIMING_OF } from './ui.js';

const app = document.getElementById('app');
let run = Run.load();

function screen(html, cls = '') {
  closeAllSheets();
  app.innerHTML = `<div class="screen ${cls}">${html}</div>`;
  app.scrollTop = 0;
  return app.firstElementChild;
}

const on = (root, sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', fn));

// ---------- Title ----------

function title() {
  const el = screen(`
    <div class="title-art">${['puppetmaster', 'warchief', 'worldtree'].map((a) => spr(a)).join('')}</div>
    <h1 class="logo">Herobuilder</h1>
    <div class="subtitle">A lane battler roguelike · prototype v3.8</div>
    <div class="menu">
      ${run && !run.over ? `<button class="btn primary" id="tContinue">Continue run (Act ${run.act})</button>` : ''}
      <button class="btn ${run && !run.over ? '' : 'primary'}" id="tRun">New run</button>
      <button class="btn" id="tDuel">Quick duel</button>
      <button class="btn" id="tHow">How to play</button>
      <button class="btn" id="tCards">Card gallery</button>
    </div>
    <div class="credit">Three classes, ${Object.values(CARDS).filter((d) => !d.token && !d.id.startsWith('__')).length} cards, ${Object.keys(LOCATIONS).length} locations, ${Run.RELIC_COUNT} relics, built to test the core loop. Pixel art: DawnLike by DragonDePlatino (CC BY 4.0).<span style="display:inline-block;vertical-align:middle;margin-left:4px">${spr('platino', 'tiny')}</span></div>
  `, 'center');
  const c = el.querySelector('#tContinue');
  if (c) c.onclick = () => mapScreen();
  el.querySelector('#tRun').onclick = () => {
    if (run && !run.over) {
      const sh = openSheet(`<h3>Abandon current run?</h3><div class="menu" style="max-width:none">
        <button class="btn danger" id="yes">Start a new run</button><button class="btn" data-close>Keep it</button></div>`);
      sh.el.querySelector('#yes').onclick = () => { sh.close(); classSelect('run'); };
    } else classSelect('run');
  };
  el.querySelector('#tDuel').onclick = () => classSelect('duel');
  el.querySelector('#tHow').onclick = () => howTo(title);
  el.querySelector('#tCards').onclick = () => gallery();
}

// ---------- Class select ----------

function classSelect(mode) {
  const list = Object.entries(CLASSES).map(([k, c]) => `
    <button class="class-card" data-cls="${k}" style="--c:var(--${c.color})">
      <div class="art">${spr(c.art)}</div>
      <div><h3>${esc(c.name)}${colorSwatches([c.color])}</h3>
      <p style="color:var(--text)">${FACTIONS[c.color].theme}. ${esc(c.blurb)}</p>
      <p style="margin-top:4px">${esc(FACTIONS[c.color].text)}</p></div>
    </button>`).join('');
  const el = screen(`
    <div class="header"><button class="icon-btn" id="back">←</button><h2>${mode === 'run' ? 'Choose a class' : 'Duel: choose your class'}</h2></div>
    <div class="class-list">${list}</div>`);
  el.querySelector('#back').onclick = title;
  on(el, '.class-card', (e) => {
    const k = e.currentTarget.dataset.cls;
    previewClass(k, mode);
  });
}

function previewClass(k, mode) {
  const c = CLASSES[k];
  const grid = (ids) => ids.map((id) => cardHTML(CARDS[id], { uid: id })).join('');
  const sh = openSheet(`<h3>${esc(c.name)} ${colorSwatches([c.color])}</h3>
    <div class="muted" style="margin-bottom:10px">${FACTIONS[c.color].theme}. ${esc(c.blurb)}</div>
    <div class="section-title">${SUITS[c.color]} ${esc(c.name)} cards · ${c.cards.length}</div>
    <div class="deck-grid">${grid(c.cards)}</div>
    <div class="section-title">${SUITS.C} Core cards · ${c.deck.length - c.cards.length}</div>
    <div class="muted" style="font-size:12px;margin:-4px 0 8px">Every deck has these.</div>
    <div class="deck-grid">${grid(c.deck.filter((id) => !c.cards.includes(id)))}</div>
    <div style="height:14px"></div>
    ${mode === 'duel' ? `<div class="section-title">Difficulty</div><div class="row" style="justify-content:center">
      ${['easy', 'normal', 'hard'].map((d) => `<button class="btn small diff ${d === 'normal' ? 'primary' : ''}" data-d="${d}">${d}</button>`).join('')}</div><div style="height:10px"></div>` : ''}
    <button class="btn primary" id="go" style="width:100%">${mode === 'run' ? 'Begin run' : 'Fight a random opponent'}</button>`);
  let diff = 'normal';
  sh.el.querySelectorAll('.diff').forEach((b) => b.addEventListener('click', () => {
    diff = b.dataset.d;
    sh.el.querySelectorAll('.diff').forEach((x) => x.classList.toggle('primary', x === b));
  }));
  sh.el.querySelectorAll('.deck-grid .card').forEach((el) => el.addEventListener('click', () => showCardDetail(CARDS[el.dataset.id])));
  sh.el.querySelector('#go').onclick = () => {
    sh.close();
    if (mode === 'run') {
      run = Run.newRun(k);
      Run.save(run);
      relicPick('Choose a starting relic', 'Relics are rules that help you in every battle of this run.', Run.relicChoices(run, 3), false, () => mapScreen());
    } else {
      const others = Object.keys(CLASSES).filter((x) => x !== k);
      const ok = others[Math.floor(Math.random() * others.length)];
      const oc = CLASSES[ok];
      battle({ myDeck: c.deck, myArt: c.art,
        opp: { name: oc.name, art: oc.art, deck: oc.deck, difficulty: diff } },
      () => title());
    }
  };
}

// ---------- Battle wrapper ----------

function battle(cfg, done) {
  closeAllSheets();
  app.innerHTML = '';
  const holder = document.createElement('div');
  holder.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0';
  app.appendChild(holder);
  let tutorial = false;
  try { tutorial = !localStorage.getItem('hb_tut_done'); localStorage.setItem('hb_tut_done', '1'); } catch (e) { /* ignore */ }
  startBattle(holder, { ...cfg, tutorial, showHelp: () => howToSheet() }, done);
}

// ---------- Run: the board ----------

const ACT_NAMES = ['The Borderlands', 'The Pale Court', 'The Ashen Peaks'];
// Per act: wall art (two kinds), and the little things growing on open ground.
const ACT_ART = [
  { walls: ['forest', 'peak1'], deco: ['grass', 'flowers', 'tree', 'shrub', 'grass', 'stones'] },
  { walls: ['deadwood', 'peak2'], deco: ['stones', 'deadtree', 'bones', 'stones', 'shrub', 'grass'] },
  { walls: ['burnwood', 'peak3'], deco: ['pebbles', 'burntree', 'stones', 'bones', 'pebbles', 'stones'] },
];
const mapArt = (id, cls = '') => `<i class="mart ${cls}" style="background-image:url(art/map/${id}.png)"></i>`;
const LABELS = { shop: 'Peddler', camp: 'Camp', event: 'Stranger', chest: 'Chest', elite: 'Elite', boss: 'Lair' };
let walking = false;
let narration = '';

const coin = (n) => `<span class="coin">${ico('gold')}<b>${n}</b></span>`;
const relicIcons = (ids, max = 4) => ids.slice(0, max).map((id) => ico(id)).join('') + (ids.length > max ? `<b>+${ids.length - max}</b>` : '');

function runBar() {
  const cls = CLASSES[run.cls];
  return `<div class="runbar">
    <span class="pill cls" style="--c:var(--${cls.color})" title="${esc(cls.name)}"><span class="suit">${SUITS[cls.color]}</span>${esc(cls.name)}</span>
    <span class="pill hearts" title="Hearts: lose a fight, lose a heart">${Array.from({ length: run.maxHearts }, (_, k) => ico(k < run.hearts ? 'heart' : 'heartEmpty')).join('')}</span>
    <span class="pill gold" title="Gold">${coin(run.gold)}</span>
    ${run.relics && run.relics.length ? `<button class="pill relics" id="rbRelics" title="Your relics">${relicIcons(run.relics)}</button>` : ''}
    <span class="spacer"></span>
    <button class="pill deck" id="rbDeck" title="Your deck"><i class="deckicon"></i>${run.deck.length}</button>
  </div>`;
}

function bindRunBar(el) {
  const b = el.querySelector('#rbDeck');
  if (b) b.onclick = () => deckScreen(() => mapScreen());
  const r = el.querySelector('#rbRelics');
  if (r) r.onclick = () => openSheet(`<h3>Your relics</h3>${traitRows(run.relics)}<div style="height:10px"></div><button class="btn" data-close style="width:100%">Close</button>`);
}

function traitRows(ids) {
  return `<div class="trait-list">${ids.map((id) => `<div class="trait-row"><span class="ti">${ico(id)}</span><div><b>${esc(TRAITS[id].name)}</b><div class="muted">${esc(TRAITS[id].text)}</div></div></div>`).join('')}</div>`;
}

// Choose one relic (or skip, when allowed), then continue.
function relicPick(heading, sub, choices, canSkip, next) {
  if (!choices.length) return next();
  let picked = null;
  const render = () => {
    const el = screen(`
      <div class="header"><h2>${esc(heading)}</h2></div>
      ${runBar()}
      <div class="muted" style="margin-bottom:10px">${esc(sub)}</div>
      <div class="relic-pick">${choices.map((id, k) => `<button class="relic-opt ${picked === k ? 'picked' : ''}" data-k="${k}">
        <span class="ti">${ico(id)}</span><div><b>${esc(TRAITS[id].name)}</b><div class="muted">${esc(TRAITS[id].text)}</div></div></button>`).join('')}</div>
      <div style="height:16px"></div>
      <button class="btn ${picked !== null ? 'primary' : ''}" id="go" ${picked === null && !canSkip ? 'disabled' : ''}>${picked !== null ? `Take ${esc(TRAITS[choices[picked]].name)}` : canSkip ? 'Skip' : 'Pick one'}</button>`);
    on(el, '.relic-opt', (e) => { picked = Number(e.currentTarget.dataset.k); render(); });
    el.querySelector('#go').onclick = () => {
      if (picked !== null) run.relics.push(choices[picked]);
      Run.save(run);
      next();
    };
  };
  render();
}

function tileFace(t, i, b) {
  const art = ACT_ART[run.act - 1];
  // Ambushes look like open ground until someone steps on them.
  const k = t.k === 'ambush' && !t.vis ? 'open' : t.k;
  let inner = '';
  let label = '';
  if (k === 'wall') inner = mapArt(art.walls[t.v || 0], 'fill');
  else if (k === 'open' || k === 'start') inner = t.deco < 4 ? mapArt(art.deco[t.deco], 'deco') : '';
  else if (k === 'ambush') { inner = t.done ? mapArt('bones', 'deco') : spr(t.enc.art); label = t.done ? '' : 'Ambush'; }
  else if (k === 'shop') { inner = mapArt('town', 'big'); label = LABELS.shop; }
  else if (k === 'camp') { inner = mapArt('tents', 'big'); label = LABELS.camp; }
  else if (k === 'event') { inner = spr(Run.EVENTS[t.ev].art); label = LABELS.event; }
  else if (k === 'chest') { inner = ico('chest', 'x2'); label = LABELS.chest; }
  else if (k === 'elite') { inner = `${spr(t.enc.art)}<span class="badge">${ico('elite')}</span>`; label = t.enc.name; }
  else if (k === 'boss') { inner = `${mapArt('castle', 'lair')}${spr(t.enc.art)}`; label = 'Boss'; }
  return `<span class="mface">${inner}</span>${label ? `<span class="ml">${esc(label)}</span>` : ''}`;
}

function mapScreen(flipped = []) {
  if (!run) return title();
  if (run.over) return runEnd();
  const b = run.board;
  const cur = b.tiles[b.pos];
  const stuck = cur.k === 'ambush' && !cur.done;
  const cells = b.tiles.map((t, i) => {
    if (!t.seen) return `<button class="mc back" data-i="${i}" aria-label="Face-down card" disabled></button>`;
    const path = stuck ? null : Run.pathTo(b, i);
    const canGo = i !== b.pos && path && t.k !== 'wall';
    // Glow only where something new waits: unknown ground or an unused stop.
    const reach = canGo && !(t.vis && t.done);
    const k = t.k === 'ambush' && !t.vis ? 'open' : t.k;
    const cls = ['mc', 'face', `k-${k}`, reach ? 'reach' : '', reach && !t.vis ? 'new' : '', t.done && k !== 'open' && k !== 'start' ? 'done' : '',
      flipped.includes(i) ? 'flip' : '', i === b.pos ? 'here' : '', !canGo && !t.vis && i !== b.pos ? 'far' : ''].join(' ');
    return `<button class="${cls}" data-i="${i}" style="--d:${flipped.indexOf(i) * 45}ms">${tileFace(t, i, b)}${i === b.pos ? `<span class="piece">${spr(CLASSES[run.cls].art)}</span>` : ''}</button>`;
  }).join('');
  const left = Run.lurking(run);
  const el = screen(`
    <div class="header"><button class="icon-btn" id="back" aria-label="Title">←</button><h2>Act ${run.act} of ${Run.ACTS}</h2></div>
    ${runBar()}
    <div class="board-wrap act${run.act}">
      <div class="board-head"><span class="bn">${ACT_NAMES[run.act - 1]}</span><span class="lurk" title="Ambushes still hidden on this board">${ico('ambush')}${left} hidden</span></div>
      <div class="board" style="--cols:${Run.COLS}">${cells}</div>
      <div class="narrator">${narration || defaultNarration()}</div>
    </div>`);
  el.querySelector('.mc.here')?.scrollIntoView({ block: 'nearest' });
  el.querySelector('#back').onclick = title;
  bindRunBar(el);
  on(el, '.mc.face', (e) => tapTile(Number(e.currentTarget.dataset.i)));
}

function defaultNarration() {
  const b = run.board;
  const cur = b.tiles[b.pos];
  if (cur.k === 'ambush' && !cur.done) return `<b>${esc(cur.enc.name)}</b> blocks the way. Tap your piece to face them.`;
  if (b.pos === b.prev && cur.k === 'start') return 'Your piece is on the board. Tap a lit card to walk there. Cards flip as you get close, but ambushes stay hidden until you step on them.';
  return 'Tap a lit card to walk there. Tap a flipped elite or the lair to scout it.';
}

function tapTile(i) {
  if (walking) return;
  const b = run.board;
  const t = b.tiles[i];
  if (i === b.pos) return enterTile(t, false);
  const cur = b.tiles[b.pos];
  if (cur.k === 'ambush' && !cur.done) return enterTile(cur, false);
  const path = Run.pathTo(b, i);
  if (!path) {
    if ((t.k === 'elite' || t.k === 'boss') && !t.done) scoutSheet(t, false);
    else if (t.k !== 'wall') toast('Too far: walk next to it first.', 1400);
    return;
  }
  walk(path);
}

async function walk(path) {
  walking = true;
  narration = '';
  for (const j of path) {
    const flipped = Run.step(run.board, j);
    Run.save(run);
    mapScreen(flipped);
    await new Promise((r) => setTimeout(r, flipped.length ? 260 : 150));
  }
  walking = false;
  enterTile(Run.here(run), true);
}

// You arrive on a card (or tap the one you're on).
function enterTile(t, arrived) {
  if (t.done) { if (arrived) narrate(t); return; }
  switch (t.k) {
    case 'ambush':
      narration = `Ambush! <b>${esc(t.enc.name)}</b> leaps out.`;
      mapScreen([run.board.pos]);
      return setTimeout(() => scoutSheet(t, true, { ambush: true }), arrived ? 650 : 0);
    case 'elite':
    case 'boss':
      return scoutSheet(t, true);
    case 'shop': return shopScreen();
    case 'camp': return campScreen();
    case 'event': return eventScreen(Run.eventAt(t));
    case 'chest': return chestOpen();
  }
}

function narrate(t) {
  const lines = { open: 'Quiet here.', start: 'Back where you started.', ambush: 'Bones where the ambush was.', shop: 'The Peddler has packed up.', camp: 'Cold ashes of your camp.', event: 'The stranger is gone.', chest: 'An empty chest.', elite: 'The den is empty now.' };
  narration = lines[t.k] || '';
  if (t.k === 'open' && Run.lurking(run) === 0) narration = 'No ambushes left on this board. The way to the lair is clear.';
  mapScreen();
}

function chestOpen() {
  const res = Run.openChest(run);
  Run.save(run);
  narration = `The chest held ${res.gold} gold${res.relic ? ` and <b>${esc(TRAITS[res.relic].name)}</b>` : ''}.`;
  mapScreen();
  if (res.relic) openSheet(`<div class="foe"><div class="foe-art">${ico('chest', 'x3')}</div><div><div class="foe-kind">Chest</div><h3>${esc(TRAITS[res.relic].name)}</h3></div></div>
    ${traitRows([res.relic])}<p class="muted">Plus ${res.gold} gold.</p><button class="btn primary" data-close style="width:100%">Take it</button>`, { center: true });
  else toast(`+${res.gold} gold`, 1400);
}

function scoutSheet(node, canFight, { ambush = false } = {}) {
  const enc = node.enc;
  const counts = {};
  for (const e of enc.deck) counts[Run.baseId(e)] = (counts[Run.baseId(e)] || 0) + 1;
  const cards = Object.keys(counts).map((id) => cardHTML(CARDS[id], { uid: id })).join('');
  const kind = { ambush: 'Ambush', elite: 'Elite', boss: 'Boss' }[node.k] || '';
  const sh = openSheet(`<div class="foe"><div class="foe-art">${spr(enc.art)}</div><div>
    <div class="foe-kind">${kind} · ${enc.colors.map((c) => `<span style="color:var(--${c})">${SUITS[c]}</span> ${COLOR_NAMES[c]}`).join(' / ')}</div>
    <h3 class="${node.k === 'boss' ? 'boss-name' : ''}">${esc(enc.name)}</h3>
    <div class="muted">First to ${enc.target || RULES.target} stars · AI ${enc.difficulty}</div></div></div>
    <div class="stakes">${node.k === 'ambush' ? `Lose and they rob you of ${Run.AMBUSH_TOLL} gold (a heart if you can't pay).` : node.k === 'boss' ? 'Lose and you lose a heart, then fall back for a rematch.' : 'Lose and you lose a heart.'}</div>
    ${enc.text ? `<p class="muted" style="margin:8px 0 0">${esc(enc.text)}</p>` : ''}
    ${enc.traits && enc.traits.length ? `<div class="section-title">Their rules</div>${traitRows(enc.traits)}` : ''}
    <div class="section-title">Their cards</div><div class="deck-grid">${cards}</div>
    ${enc.fixedLocations ? `<div class="section-title">Their arena</div>
    <div class="grid-cards">${enc.fixedLocations.slice(0, 3).map((id) => locCardHTML(id)).join('')}</div>` : ''}
    <div style="height:14px"></div>
    ${canFight ? '<button class="btn primary" id="fight" style="width:100%">Fight</button><div style="height:8px"></div>' : ''}
    ${canFight && !ambush ? '<button class="btn" id="backoff" style="width:100%">Back away</button>' : `<button class="btn" data-close style="width:100%">${ambush ? 'Look at the board' : 'Back'}</button>`}`);
  sh.el.querySelectorAll('.deck-grid .card').forEach((el) => el.addEventListener('click', () => showCardDetail(CARDS[el.dataset.id])));
  const f = sh.el.querySelector('#fight');
  if (f) f.onclick = () => { sh.close(); fightNode(node); };
  const bo = sh.el.querySelector('#backoff');
  if (bo) bo.onclick = () => { sh.close(); Run.stepBack(run); Run.save(run); narration = `You back away from ${esc(node.enc.name)}.`; mapScreen(); };
}

function fightNode(node) {
  const enc = node.enc;
  battle({
    myDeck: run.deck, myArt: CLASSES[run.cls].art, myTraits: run.relics || [],
    target: enc.target,
    opp: { name: enc.name, art: enc.art, deck: enc.deck, fixedLocations: enc.fixedLocations || null, difficulty: enc.difficulty, traits: enc.traits || [] },
  }, (won) => {
    const reward = Run.rewardFor(run, node, won);
    run.gold += reward.gold;
    if (reward.heal) run.hearts = Math.min(run.maxHearts, run.hearts + reward.heal);
    const actBefore = run.act;
    Run.afterFight(run, node, won);
    if (won) narration = run.act !== actBefore ? `Act ${run.act}: ${ACT_NAMES[run.act - 1]}. A new board is dealt.` : `You beat ${esc(node.enc.name)}.`;
    Run.save(run);
    if (run.over) return runEnd();
    if (!won) {
      const robbed = run.robbed;
      const lost = robbed ? `They took ${Run.AMBUSH_TOLL} gold.` : run.featherUsed ? 'The Phoenix Feather burns away instead of a heart.' : 'You lost a heart.';
      run.featherUsed = false;
      run.robbed = false;
      toast(node.k === 'boss' ? `${lost} The boss awaits a rematch.` : lost, 2600);
      narration = node.k === 'boss' ? 'You fall back from the lair.' : robbed ? `${esc(node.enc.name)} beat you and made off with ${Run.AMBUSH_TOLL} gold.` : `${esc(node.enc.name)} beat you, then slipped away.`;
      return mapScreen();
    }
    rewardScreen(reward, node);
  });
}

// ---------- Rewards ----------

// The selected reward card's rules, on parchment under the choices.
function pickInfo(d) {
  const t = TIMING_OF(d);
  return `<div class="pickinfo parchment"><b>${esc(d.name)}</b> <span class="tag">${SUITS[d.color]} ${COLOR_NAMES[d.color]}${d.rarity === 'rare' ? ' · Rare' : ''} · costs ${d.cost}</span>
    <div>${t ? `<span class="tm">${t[0]}</span> ` : ''}${esc(d.text || 'No ability: just power.')}</div></div>`;
}

function rewardScreen(reward, node) {
  let pickedCard = null;
  const render = () => {
    const el = screen(`
      <div class="header"><h2>${node.k === 'boss' ? 'Boss defeated' : 'Victory'}</h2></div>
      ${runBar()}
      <div class="loot">${ico('chest', 'x2')}<div><b>+${reward.gold} gold</b>${reward.heal ? `<div class="muted">${reward.heal >= run.maxHearts ? 'Hearts restored' : `+${reward.heal} heart${reward.heal > 1 ? 's' : ''}`}</div>` : ''}</div></div>
      <div class="section-title">Add a card to your deck</div>
      <div class="grid-cards reward">${reward.cards.map((c, k) => `<div class="choice ${pickedCard === k ? 'picked' : ''}" data-k="${k}">
        ${cardHTML(CARDS[c.id], { uid: c.id })}<div class="tag">${c.spoils ? 'Spoils' : CARDS[c.id].rarity === 'rare' ? 'Rare' : !run.deck.some((e) => Run.baseId(e) === c.id) ? 'New' : '&nbsp;'}</div></div>`).join('')}</div>
      ${pickedCard !== null ? pickInfo(CARDS[reward.cards[pickedCard].id]) : '<div class="pickinfo empty">Tap a card to read it. Picking is optional.</div>'}
      <button class="btn ${pickedCard !== null ? 'primary' : ''}" id="done">${pickedCard !== null ? `Take ${esc(CARDS[reward.cards[pickedCard].id].name)}` : 'Skip the card'}</button>`);
    bindRunBar(el);
    on(el, '.choice[data-k]', (e) => {
      const k = Number(e.currentTarget.dataset.k);
      if (pickedCard === k) showCardDetail(CARDS[reward.cards[k].id], { note: reward.cards[k].spoils ? 'Spoils from your opponent' : '' });
      else { pickedCard = k; render(); }
    });
    el.querySelector('#done').onclick = () => {
      if (pickedCard !== null) run.deck.push(reward.cards[pickedCard].id);
      Run.save(run);
      if (reward.relics && reward.relics.length) relicPick(node.k === 'boss' ? 'The boss drops a relic' : 'The elite drops a relic', 'Take one.', reward.relics, true, () => mapScreen());
      else mapScreen();
    };
  };
  render();
}

// ---------- Deck & locations ----------

function deckScreen(back) {
  const render = () => {
    const sorted = run.deck.map((e, i) => ({ e, i })).sort((a, b) => CARDS[Run.baseId(a.e)].cost - CARDS[Run.baseId(b.e)].cost);
    const el = screen(`
      <div class="header"><button class="icon-btn" id="back">←</button><h2>Your deck</h2></div>
      ${runBar()}
      <div class="section-title">Cards · ${run.deck.length}</div>
      <div class="deck-grid">${sorted.map(({ e, i }) => cardHTML(CARDS[Run.baseId(e)], { uid: i, upgraded: e.endsWith('+'), power: CARDS[Run.baseId(e)].power + (e.endsWith('+') ? 1 : 0) })).join('')}</div>`);
    el.querySelector('#back').onclick = back;
    on(el, '.deck-grid .card', (e) => {
      const i = Number(e.currentTarget.dataset.uid);
      const entry = run.deck[i];
      showCardDetail(CARDS[Run.baseId(entry)], { upgraded: entry.endsWith('+'), power: CARDS[Run.baseId(entry)].power + (entry.endsWith('+') ? 1 : 0) });
    });
  };
  render();
}

// Pick a card from the deck (for upgrade/remove).
function pickFromDeck(titleText, filter, onPick) {
  const items = run.deck.map((e, i) => ({ e, i })).filter(({ e }) => filter(e))
    .sort((a, b) => CARDS[Run.baseId(a.e)].cost - CARDS[Run.baseId(b.e)].cost);
  const sh = openSheet(`<h3>${esc(titleText)}</h3><div class="deck-grid">${items.map(({ e, i }) =>
    cardHTML(CARDS[Run.baseId(e)], { uid: i, upgraded: e.endsWith('+'), power: CARDS[Run.baseId(e)].power + (e.endsWith('+') ? 1 : 0) })).join('')}</div>
    <div style="height:10px"></div><button class="btn" data-close style="width:100%">Cancel</button>`);
  sh.el.querySelectorAll('.deck-grid .card').forEach((el) => el.addEventListener('click', () => {
    const i = Number(el.dataset.uid);
    const entry = run.deck[i];
    const d = CARDS[Run.baseId(entry)];
    const conf = openSheet(`<div class="detail">${cardHTML(d, { size: 'big', upgraded: entry.endsWith('+'), power: d.power + (entry.endsWith('+') ? 1 : 0) })}
      <button class="btn primary" id="cy" style="width:100%">Choose ${esc(d.name)}</button><button class="btn" data-close style="width:100%">Back</button></div>`);
    conf.el.querySelector('#cy').onclick = () => { conf.close(); sh.close(); onPick(i); };
  }));
}

// ---------- Shop ----------

function shopScreen() {
  const stock = Run.shopStock(run);
  const render = () => {
    const el = screen(`
      <div class="scene shop">${spr('thief')}${ico('shop', 'x2')}<div><h2>The Peddler</h2><div class="muted">Coin for cards, relics and a trim.</div></div></div>
      ${runBar()}
      <div class="section-title">Cards</div>
      <div class="grid-cards">${stock.cards.map((c, k) => `<div class="choice" data-k="${k}">${c.sold ? '<div class="card hand back"><div class="art">SOLD</div></div>' : cardHTML(CARDS[c.id], { uid: c.id })}
        <div class="tag price ${!c.sold && run.gold < c.price ? 'short' : ''}">${c.sold ? 'Sold' : coin(c.price)}</div></div>`).join('')}</div>
      ${stock.relic ? `<div class="section-title">Relic</div>
      <button class="relic-opt" id="relic" ${stock.relic.sold || run.gold < stock.relic.price ? 'disabled' : ''}><span class="ti">${ico(stock.relic.id)}</span>
        <div><b>${esc(TRAITS[stock.relic.id].name)}</b> · ${stock.relic.sold ? 'Sold' : coin(stock.relic.price)}<div class="muted">${esc(TRAITS[stock.relic.id].text)}</div></div></button>` : ''}
      <div class="section-title">Services</div>
      <div class="menu" style="max-width:none">
        <button class="btn" id="remove" ${run.gold < run.removeCost || run.deck.length <= Run.MIN_DECK ? 'disabled' : ''}>Remove a card <span class="spacer"></span>${coin(run.removeCost)}</button>
        <button class="btn" id="upg" ${run.gold < 60 ? 'disabled' : ''}>Upgrade a card (+1 power) <span class="spacer"></span>${coin(60)}</button>
        <button class="btn primary" id="leave">Leave shop</button>
      </div>`);
    bindRunBar(el);
    on(el, '.choice[data-k]', (e) => {
      const c = stock.cards[Number(e.currentTarget.dataset.k)];
      if (c.sold) return;
      const d = CARDS[c.id];
      const sh = openSheet(`<div class="detail">${cardHTML(d, { size: 'big' })}
        <button class="btn primary" id="buy" style="width:100%" ${run.gold < c.price ? 'disabled' : ''}>Buy for ${coin(c.price)}</button>
        <button class="btn" data-close style="width:100%">Back</button></div>`);
      sh.el.querySelector('#buy').onclick = () => { run.gold -= c.price; run.deck.push(c.id); c.sold = true; Run.save(run); sh.close(); render(); };
    });
    const rb = el.querySelector('#relic');
    if (rb) rb.onclick = () => {
      if (stock.relic.sold || run.gold < stock.relic.price) return;
      run.gold -= stock.relic.price; run.relics.push(stock.relic.id); stock.relic.sold = true; Run.save(run); render();
    };
    el.querySelector('#remove').onclick = () => pickFromDeck('Remove which card?', () => true, (i) => {
      run.gold -= run.removeCost; run.removeCost += 25; Run.removeCard(run, i); Run.save(run); render();
    });
    el.querySelector('#upg').onclick = () => pickFromDeck('Upgrade which card?', (e) => !e.endsWith('+'), (i) => {
      run.gold -= 60; Run.upgrade(run, i); Run.save(run); render();
    });
    el.querySelector('#leave').onclick = () => { Run.finishTile(run); Run.save(run); narration = 'The Peddler packs up and moves on.'; mapScreen(); };
  };
  render();
}

// ---------- Camp ----------

function campScreen() {
  const el = screen(`
    <div class="scene camp">${spr(CLASSES[run.cls].art)}${ico('camp', 'x3 anim')}<div><h2>Camp</h2><div class="muted">Rest by the fire. Choose one.</div></div></div>
    ${runBar()}
    <div class="options">
      <button class="option" id="cUp">${ico('fight', 'x2')}<div><b>Train</b><span>Upgrade a card: +1 power for the rest of the run.</span></div></button>
      <button class="option" id="cRm" ${run.deck.length <= Run.MIN_DECK ? 'disabled' : ''}>${ico('scroll', 'x2')}<div><b>Lighten the pack</b><span>Remove a card from your deck.</span></div></button>
      <button class="option" id="cHeal" ${run.hearts >= run.maxHearts ? 'disabled' : ''}>${ico('heart', 'x2')}<div><b>Rest</b><span>${run.hearts >= run.maxHearts ? 'Your hearts are full.' : 'Recover 1 heart.'}</span></div></button>
    </div>
    <div style="height:10px"></div>
    <button class="btn" id="cLater" style="width:100%">Move on (come back later)</button>`);
  bindRunBar(el);
  const done = () => { Run.finishTile(run); Run.save(run); narration = 'You break camp at dawn.'; mapScreen(); };
  el.querySelector('#cUp').onclick = () => pickFromDeck('Upgrade which card?', (e) => !e.endsWith('+'), (i) => { Run.upgrade(run, i); done(); });
  el.querySelector('#cRm').onclick = () => pickFromDeck('Remove which card?', () => true, (i) => { Run.removeCard(run, i); done(); });
  el.querySelector('#cHeal').onclick = () => { run.hearts = Math.min(run.maxHearts, run.hearts + 1); done(); };
  el.querySelector('#cLater').onclick = () => { narration = 'You leave the camp for later.'; mapScreen(); };
}

// ---------- Event ----------

function eventScreen(ev) {
  const el = screen(`
    <div class="scene event">${spr(ev.art)}<div><h2>${esc(ev.title)}</h2><div class="muted">An encounter on the road</div></div></div>
    ${runBar()}
    <div class="parchment"><p>${esc(ev.text)}</p></div>
    <div class="options">${ev.options.map((o, k) => `<button class="option" data-k="${k}" ${o.enabled && !o.enabled(run) ? 'disabled' : ''}><div><b>${esc(o.label)}</b></div></button>`).join('')}</div>`);
  bindRunBar(el);
  on(el, '[data-k]', (e) => {
    const o = ev.options[Number(e.currentTarget.dataset.k)];
    const msg = o.apply(run);
    Run.finishTile(run);
    Run.save(run);
    narration = esc(msg);
    const sh = openSheet(`<div class="foe"><div class="foe-art">${spr(ev.art)}</div><h3>${esc(ev.title)}</h3></div><p>${esc(msg)}</p><button class="btn primary" data-close style="width:100%">Continue</button>`,
      { center: true, onClose: () => mapScreen() });
  });
}

// ---------- End of run ----------

function runEnd() {
  const won = run.won;
  const el = screen(`
    <div class="title-art">${spr(CLASSES[run.cls].art)}${won ? ico('boss', 'x3') : ''}</div>
    <h1 class="logo" style="font-size:52px">${won ? 'Victorious' : 'Fallen'}</h1>
    <div class="subtitle">${CLASSES[run.cls].name} · reached Act ${run.act} · ${run.stats.wins} wins, ${run.stats.losses} losses</div>
    <div class="menu">
      <button class="btn primary" id="again">New run</button>
      <button class="btn" id="home">Title</button>
    </div>`, 'center');
  Run.clearSave();
  const finished = run;
  run = null;
  el.querySelector('#again').onclick = () => classSelect('run');
  el.querySelector('#home').onclick = title;
  void finished;
}

// ---------- Gallery ----------

function gallery() {
  const order = ['M', 'B', 'S', 'C'];
  let colorFilter = 'all';
  const render = () => {
    const cards = Object.values(CARDS).filter((d) => !d.id.startsWith('__') && !d.token &&
      (colorFilter === 'all' || (colorFilter === 'X' ? d.monster : d.color === colorFilter && !d.monster)))
      .sort((a, b) => order.indexOf(a.color) - order.indexOf(b.color) || a.cost - b.cost);
    const el = screen(`
      <div class="header"><button class="icon-btn" id="back">←</button><h2>Card gallery</h2></div>
      <div class="row" style="flex-wrap:wrap;margin-bottom:10px">
        <button class="btn small ${colorFilter === 'all' ? 'primary' : ''}" data-f="all">All</button>
        ${order.map((c) => `<button class="btn small ${colorFilter === c ? 'primary' : ''}" data-f="${c}"><span style="color:var(--${c})">${SUITS[c]}</span> ${COLOR_NAMES[c]}</button>`).join('')}
        <button class="btn small ${colorFilter === 'X' ? 'primary' : ''}" data-f="X">Monsters</button>
        <button class="btn small ${colorFilter === 'loc' ? 'primary' : ''}" data-f="loc">Locations</button>
      </div>
      ${colorFilter === 'loc'
        ? `<div class="grid-cards">${Object.keys(LOCATIONS).map((id) => locCardHTML(id)).join('')}</div>`
        : `<div class="deck-grid">${cards.map((d) => cardHTML(d, { uid: d.id })).join('')}</div>`}`);
    el.querySelector('#back').onclick = title;
    on(el, '[data-f]', (e) => { colorFilter = e.currentTarget.dataset.f; render(); });
    on(el, '.deck-grid .card', (e) => showCardDetail(CARDS[e.currentTarget.dataset.id]));
    on(el, '.loc-card', (e) => showLocDetail(e.currentTarget.dataset.loc));
  };
  render();
}

// ---------- How to play ----------

const HOWTO = `
  <h3>Goal</h3>
  <p>Be the first to <b>${RULES.target} stars</b> (in a run, each opponent shows how many it takes). You earn stars by winning <b>locations</b>.</p>
  <h3>Reading a card</h3>
  <ul>
    <li>The <b style="color:var(--en)">gold gem</b> (top left) is its energy cost. Your energy uses the same gem.</li>
    <li>The <b style="color:var(--pow)">red shield</b> (top right) is its power. It turns green when boosted and grey when hurt.</li>
    <li>The suit is its class: <span style="color:var(--M)">♦ Mind</span>, <span style="color:var(--B)">♥ Body</span>, <span style="color:var(--S)">♣ Soul</span>, or <span style="color:var(--C)">● Core</span>.</li>
    <li>The small glyph under the art says when its text happens: ${Object.values(TIMING).map(([g, t]) => `<b>${g}</b> ${t.toLowerCase()}`).join(', ')}. Tap and hold any card to read it.</li>
  </ul>
  <h3>Your deck</h3>
  <p>Every deck is the same 8 core cards plus the 8 cards of your class. You start with ${RULES.openingHand} cards and may replace up to ${RULES.mulligan} of them before the first turn. Then you draw ${RULES.drawPerTurn} card a turn. When your deck runs out, your discard pile is shuffled back in.</p>
  <h3>A turn</h3>
  <ul>
    <li>You have ${RULES.energyStart} energy on turn 1 and 1 more each turn, up to ${RULES.energyCap}. Unspent energy is lost unless a card says otherwise.</li>
    <li>Once a turn you can tap your deck to draw a card for ${RULES.drawCost} energy.</li>
    ${RULES.moveCost ? `<li>Once a turn you can move one of your revealed cards to another lane for ${RULES.moveCost} energy: drag it, or tap it and then tap the lane. Moves happen in secret and show when the turn ends.</li>` : ''}
    <li>Drag cards face-down onto any of the three lanes, up to ${RULES.laneCap} of your cards in each. Both players do this at the same time; you can't see where the opponent played until they reveal.</li>
    <li>Press <b>End turn</b> and everything reveals. The player with more stars reveals first (ties alternate), so their effects happen before yours.</li>
  </ul>
  <h3>Locations score</h3>
  <p>Each location has a goal, shown by its bar (for example "8 total power" or "after 2 turns"). At the end of a turn, every location whose bar is full <b>scores</b>:</p>
  <ul>
    <li>The side with more power there takes its star (Old Keep is worth 2). The loser draws ${RULES.loserDraws} card${RULES.loserDraws === 1 ? '' : 's'}.</li>
    ${RULES.tieHolds ? '<li>If it\'s tied, nothing scores and nothing leaves: the location stays until someone is ahead when it scores.</li>' : ''}
    <li>Every card there leaves for its owner's discard pile, unless its text says it stays.</li>
    <li>The next location (shown at the top) takes its place.</li>
  </ul>
  <p>Power you add counts toward the goal for <i>both</i> sides. Push a location over the line when you're ahead, and hold back when you're behind. A gold border and a ghost star show what would score if the turn ended now.</p>
  <h3>Classes</h3>
  <ul>
    <li><b style="color:var(--M)">♦ Mind</b> (outthink): read where they'll play, move cards, and control when locations score.</li>
    <li><b style="color:var(--B)">♥ Body</b> (overwhelm): burst power, weaken enemy cards, and close a location while you're ahead.</li>
    <li><b style="color:var(--S)">♣ Soul</b> (endure): grow every turn, stay on the board across locations, and profit from losses.</li>
  </ul>
  <h3>Runs</h3>
  <p>Pick a class and a starting <b>relic</b> (a rule that helps you in every battle). Each act is a board of face-down cards. Your piece starts at the bottom and the boss's lair is at the top. Tap a lit card to walk there; cards flip as you get close.</p>
  <ul>
    <li>Flipped cards show the <b>Peddler</b> (shop), <b>camps</b>, <b>strangers</b> (events), <b>chests</b> and <b>elite</b> dens. Walk onto one to use it. Elites can be scouted first, and you can back away.</li>
    <li><b>Ambushes</b> stay hidden: they look like open ground until you step on them. The counter by the act name says how many are left. Every route to the lair crosses at least two. Lose one and they rob you of ${Run.AMBUSH_TOLL} gold (a heart if you can't pay).</li>
    <li>Losing to an elite or the boss costs one of your 3 hearts. Beating a boss gives one back; camps can heal too.</li>
    <li>Cards you've cleared are safe to walk back across. How much of the board to explore is up to you.</li>
  </ul>
  <p>Wins add cards, including <b>spoils</b> from the opponent's deck: often one of their monster cards. Elites and bosses also drop relics.</p>
  <p>Many opponents have <b>rules</b> of their own, shown in red under the turn bar (tap them to read). Bosses have the big ones: the Warden guards a lane, the Pale Queen charms a card, and Ashmaw breathes fire. Tap an elite or the lair to scout its rules first.</p>
  <h3>Controls</h3>
  <p>Drag a card to a lane, or tap it and then tap the lane. Drag a staged card back to your hand, or tap it, to take it back. Long-press anything for details.</p>`;

function howTo(back) {
  const el = screen(`<div class="header"><button class="icon-btn" id="back">←</button><h2>How to play</h2></div><div class="howto">${HOWTO}</div>`);
  el.querySelector('#back').onclick = back;
}

function howToSheet() {
  openSheet(`<div class="howto">${HOWTO}</div><div style="height:10px"></div><button class="btn" data-close style="width:100%">Close</button>`);
}

title();
