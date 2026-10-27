// App shell: screens and navigation.

import { CARDS, COLOR_NAMES, FACTIONS, SUITS } from './cards.js';
import { LOCATIONS } from './locations.js';
import { CLASSES } from './content.js';
import { RULES } from './engine.js';
import { startBattle } from './battle.js';
import * as Run from './run.js';
import { cardHTML, locCardHTML, esc, openSheet, closeAllSheets, showCardDetail, showLocDetail, toast, colorSwatches, spr, swirl, TIMING } from './ui.js';

const app = document.getElementById('app');
swirl(document.getElementById('felt'));
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
    <h1 class="logo">Herobuilder</h1>
    <div class="subtitle">Prototype v3 · a lane battler roguelike</div>
    <div class="menu">
      ${run && !run.over ? `<button class="btn primary" id="tContinue">Continue run (Act ${run.act})</button>` : ''}
      <button class="btn ${run && !run.over ? '' : 'primary'}" id="tRun">New run</button>
      <button class="btn" id="tDuel">Quick duel</button>
      <button class="btn" id="tHow">How to play</button>
      <button class="btn" id="tCards">Card gallery</button>
    </div>
    <div class="muted" style="margin-top:28px;font-size:12px;max-width:300px">Three classes, 32 cards, 12 locations, built to test the core loop. Pixel art: DawnLike by DragonDePlatino (CC BY 4.0).<span style="display:inline-block;vertical-align:middle;margin-left:4px">${spr('platino', 'tiny')}</span></div>
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
      mapScreen();
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

// ---------- Run: map ----------

const NODE_INFO = {
  fight: ['⚔️', 'Fight'],
  elite: ['💀', 'Elite'],
  shop: ['🪙', 'Shop'],
  camp: ['🔥', 'Camp'],
  event: ['❓', 'Event'],
  boss: ['👑', 'Boss'],
};

function runBar() {
  const cls = CLASSES[run.cls];
  return `<div class="runbar">
    <span class="pill" style="color:var(--${cls.color})">${SUITS[cls.color]} <span style="color:var(--text)">${esc(cls.name)}</span></span>
    <span class="pill">${'❤️'.repeat(run.hearts)}${'🖤'.repeat(Math.max(0, run.maxHearts - run.hearts))}</span>
    <span class="pill">🪙 ${run.gold}</span>
    <span class="spacer"></span>
    <button class="btn small" id="rbDeck">Deck ${run.deck.length}</button>
  </div>`;
}

function bindRunBar(el) {
  const b = el.querySelector('#rbDeck');
  if (b) b.onclick = () => deckScreen(() => mapScreen());
}

function mapScreen() {
  if (!run) return title();
  if (run.over) return runEnd();
  const steps = run.map.map((opts, i) => {
    const state = i < run.step ? 'done' : i === run.step ? 'current' : 'future';
    const nodes = opts.map((n, j) => {
      const [icon, label] = NODE_INFO[n.type];
      const sub = n.enc ? `${spr(n.enc.art)} ${esc(n.enc.name)}` : '';
      return `<div class="node ${n.type === 'boss' ? 'boss' : ''}" data-step="${i}" data-j="${j}">
        <div class="ni">${icon}</div><div class="nl">${label}</div>${sub ? `<div class="ns">${sub}</div>` : ''}</div>`;
    }).join('');
    return `<div class="map-step ${state}">${nodes}</div>`;
  }).join('');
  const el = screen(`
    <div class="header"><button class="icon-btn" id="back">←</button><h2>Act ${run.act} of ${Run.ACTS}</h2></div>
    ${runBar()}
    <div class="muted" style="font-size:12px;margin-bottom:6px">Pick a node on the highlighted row. Tap a fight to scout the enemy.</div>
    <div class="map">${steps}</div>`);
  el.querySelector('#back').onclick = title;
  bindRunBar(el);
  on(el, '.node', (e) => {
    const i = Number(e.currentTarget.dataset.step);
    const j = Number(e.currentTarget.dataset.j);
    const node = run.map[i][j];
    if (i !== run.step) {
      if (node.enc) scoutSheet(node, false);
      return;
    }
    enterNode(node);
  });
}

function scoutSheet(node, canFight) {
  const enc = node.enc;
  const counts = {};
  for (const e of enc.deck) counts[Run.baseId(e)] = (counts[Run.baseId(e)] || 0) + 1;
  const cards = Object.keys(counts).map((id) => cardHTML(CARDS[id], { uid: id })).join('');
  const sh = openSheet(`<h3><span style="display:inline-block;vertical-align:middle">${spr(enc.art)}</span> ${esc(enc.name)}</h3>
    <div class="muted">${enc.colors.map((c) => COLOR_NAMES[c]).join(' / ')} · AI: ${enc.difficulty} · first to ${enc.target || RULES.target}★${enc.text ? ' · ' + esc(enc.text) : ''}</div>
    <div class="section-title">Their cards</div><div class="deck-grid">${cards}</div>
    ${enc.fixedLocations ? `<div class="section-title">Their arena</div>
    <div class="grid-cards">${enc.fixedLocations.slice(0, 3).map((id) => locCardHTML(id)).join('')}</div>` : ''}
    <div style="height:14px"></div>
    ${canFight ? '<button class="btn primary" id="fight" style="width:100%">Fight</button><div style="height:8px"></div>' : ''}
    <button class="btn" data-close style="width:100%">Back</button>`);
  sh.el.querySelectorAll('.deck-grid .card').forEach((el) => el.addEventListener('click', () => showCardDetail(CARDS[el.dataset.id])));
  const f = sh.el.querySelector('#fight');
  if (f) f.onclick = () => { sh.close(); fightNode(node); };
}

function enterNode(node) {
  switch (node.type) {
    case 'fight':
    case 'elite':
    case 'boss':
      return scoutSheet(node, true);
    case 'shop': return shopScreen();
    case 'camp': return campScreen();
    case 'event': return eventScreen();
  }
}

function fightNode(node) {
  const enc = node.enc;
  battle({
    myDeck: run.deck, myArt: CLASSES[run.cls].art,
    target: enc.target,
    opp: { name: enc.name, art: enc.art, deck: enc.deck, fixedLocations: enc.fixedLocations || null, difficulty: enc.difficulty },
  }, (won) => {
    const reward = Run.rewardFor(run, node, won);
    run.gold += reward.gold;
    if (reward.heal) run.hearts = Math.min(run.maxHearts, run.hearts + reward.heal);
    Run.afterFight(run, node, won);
    Run.save(run);
    if (run.over) return runEnd();
    if (!won) {
      toast(node.type === 'boss' ? 'You lost a heart. The boss awaits a rematch.' : 'You lost a heart.', 2600);
      return mapScreen();
    }
    rewardScreen(reward, node);
  });
}

// ---------- Rewards ----------

function rewardScreen(reward, node) {
  let pickedCard = null;
  const render = () => {
    const el = screen(`
      <div class="header"><h2>${node.type === 'boss' ? 'Boss defeated!' : 'Victory!'}</h2></div>
      ${runBar()}
      <div class="pill" style="align-self:flex-start">+${reward.gold} gold${reward.heal ? ' · hearts restored' : ''}</div>
      <div class="section-title">Add a card to your deck</div>
      <div class="grid-cards">${reward.cards.map((c, k) => `<div class="choice ${pickedCard === k ? 'picked' : ''}" data-k="${k}">
        ${cardHTML(CARDS[c.id], { uid: c.id })}<div class="tag">${c.spoils ? 'Spoils' : CARDS[c.id].rarity === 'rare' ? 'Rare' : '&nbsp;'}</div></div>`).join('')}</div>
      <div style="height:16px"></div>
      <div class="muted" style="font-size:12px;text-align:center;margin-bottom:8px">Tap to select, tap again for details. Picking is optional.</div>
      <button class="btn primary" id="done">${pickedCard !== null ? 'Take and continue' : 'Skip and continue'}</button>`);
    bindRunBar(el);
    on(el, '.choice[data-k]', (e) => {
      const k = Number(e.currentTarget.dataset.k);
      if (pickedCard === k) showCardDetail(CARDS[reward.cards[k].id], { note: reward.cards[k].spoils ? 'Spoils from your opponent' : '' });
      else { pickedCard = k; render(); }
    });
    el.querySelector('#done').onclick = () => {
      if (pickedCard !== null) run.deck.push(reward.cards[pickedCard].id);
      Run.save(run);
      mapScreen();
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
      <div class="header"><h2>🪙 Shop</h2></div>
      ${runBar()}
      <div class="section-title">Cards</div>
      <div class="grid-cards">${stock.cards.map((c, k) => `<div class="choice" data-k="${k}">${c.sold ? '<div class="card hand back"><div class="art">SOLD</div></div>' : cardHTML(CARDS[c.id], { uid: c.id })}
        <div class="tag">${c.sold ? '' : '🪙 ' + c.price}</div></div>`).join('')}</div>
      <div class="section-title">Services</div>
      <div class="menu" style="max-width:none">
        <button class="btn" id="remove" ${run.gold < run.removeCost || run.deck.length <= Run.MIN_DECK ? 'disabled' : ''}>Remove a card · 🪙 ${run.removeCost}</button>
        <button class="btn" id="upg" ${run.gold < 60 ? 'disabled' : ''}>Upgrade a card (+1 power) · 🪙 60</button>
        <button class="btn primary" id="leave">Leave shop</button>
      </div>`);
    bindRunBar(el);
    on(el, '.choice[data-k]', (e) => {
      const c = stock.cards[Number(e.currentTarget.dataset.k)];
      if (c.sold) return;
      const d = CARDS[c.id];
      const sh = openSheet(`<div class="detail">${cardHTML(d, { size: 'big' })}
        <button class="btn primary" id="buy" style="width:100%" ${run.gold < c.price ? 'disabled' : ''}>Buy for 🪙 ${c.price}</button>
        <button class="btn" data-close style="width:100%">Back</button></div>`);
      sh.el.querySelector('#buy').onclick = () => { run.gold -= c.price; run.deck.push(c.id); c.sold = true; Run.save(run); sh.close(); render(); };
    });
    el.querySelector('#remove').onclick = () => pickFromDeck('Remove which card?', () => true, (i) => {
      run.gold -= run.removeCost; run.removeCost += 25; Run.removeCard(run, i); Run.save(run); render();
    });
    el.querySelector('#upg').onclick = () => pickFromDeck('Upgrade which card?', (e) => !e.endsWith('+'), (i) => {
      run.gold -= 60; Run.upgrade(run, i); Run.save(run); render();
    });
    el.querySelector('#leave').onclick = () => { Run.advance(run); Run.save(run); mapScreen(); };
  };
  render();
}

// ---------- Camp ----------

function campScreen() {
  const el = screen(`
    <div class="header"><h2>🔥 Camp</h2></div>
    ${runBar()}
    <div class="muted" style="margin-bottom:12px">Rest by the fire. Choose one.</div>
    <div class="menu" style="max-width:none">
      <button class="btn" id="cUp">Upgrade a card (+1 power)</button>
      <button class="btn" id="cRm" ${run.deck.length <= Run.MIN_DECK ? 'disabled' : ''}>Remove a card</button>
      <button class="btn" id="cHeal" ${run.hearts >= run.maxHearts ? 'disabled' : ''}>Recover 1 heart</button>
    </div>`);
  bindRunBar(el);
  const done = () => { Run.advance(run); Run.save(run); mapScreen(); };
  el.querySelector('#cUp').onclick = () => pickFromDeck('Upgrade which card?', (e) => !e.endsWith('+'), (i) => { Run.upgrade(run, i); done(); });
  el.querySelector('#cRm').onclick = () => pickFromDeck('Remove which card?', () => true, (i) => { Run.removeCard(run, i); done(); });
  el.querySelector('#cHeal').onclick = () => { run.hearts = Math.min(run.maxHearts, run.hearts + 1); done(); };
}

// ---------- Event ----------

function eventScreen() {
  const ev = Run.randomEvent();
  const el = screen(`
    <div class="header"><h2>${ev.art} ${esc(ev.title)}</h2></div>
    ${runBar()}
    <p style="font-size:15px;line-height:1.5">${esc(ev.text)}</p>
    <div class="menu" style="max-width:none">${ev.options.map((o, k) => `<button class="btn" data-k="${k}" ${o.enabled && !o.enabled(run) ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}</div>`);
  bindRunBar(el);
  on(el, '[data-k]', (e) => {
    const o = ev.options[Number(e.currentTarget.dataset.k)];
    const msg = o.apply(run);
    Run.advance(run);
    Run.save(run);
    const sh = openSheet(`<h3>${ev.art} ${esc(ev.title)}</h3><p>${esc(msg)}</p><button class="btn primary" data-close style="width:100%">Continue</button>`,
      { center: true, onClose: () => mapScreen() });
  });
}

// ---------- End of run ----------

function runEnd() {
  const won = run.won;
  const el = screen(`
    <div style="font-size:64px">${won ? '👑' : '🪦'}</div>
    <h1 class="logo" style="font-size:32px">${won ? 'Run complete!' : 'Run over'}</h1>
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
    const cards = Object.values(CARDS).filter((d) => !d.id.startsWith('__') && (colorFilter === 'all' || d.color === colorFilter))
      .sort((a, b) => order.indexOf(a.color) - order.indexOf(b.color) || a.cost - b.cost);
    const el = screen(`
      <div class="header"><button class="icon-btn" id="back">←</button><h2>Card gallery</h2></div>
      <div class="row" style="flex-wrap:wrap;margin-bottom:10px">
        <button class="btn small ${colorFilter === 'all' ? 'primary' : ''}" data-f="all">All</button>
        ${order.map((c) => `<button class="btn small ${colorFilter === c ? 'primary' : ''}" data-f="${c}"><span style="color:var(--${c})">${SUITS[c]}</span> ${COLOR_NAMES[c]}</button>`).join('')}
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
    <li>Drag cards face-down onto any of the three lanes, up to ${RULES.laneCap} of your cards in each. Both players do this at the same time; you can't see where the opponent played until they reveal.</li>
    <li>Press <b>End turn</b> and everything reveals. The player with more stars reveals first (ties alternate), so their effects happen before yours.</li>
  </ul>
  <h3>Locations score</h3>
  <p>Each location has a goal, shown by its bar (for example "8 total power" or "after 2 turns"). At the end of a turn, every location whose bar is full <b>scores</b>:</p>
  <ul>
    <li>The side with more power there takes its star (Old Keep is worth 2).</li>
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
  <p>Pick a class. Each act has fights, elites, shops, camps, and events, then a boss with its own arena. Wins add cards, including <b>spoils</b> from the opponent's deck. You have 3 hearts.</p>
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
