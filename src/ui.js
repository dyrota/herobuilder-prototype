// Shared rendering helpers.

import { CARDS, COLOR_NAMES, SUITS } from './cards.js';
import { LOCATIONS, triggerText } from './locations.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Plain-language reminders for phrases that have a precise meaning.
const TEXT_TERMS = [
  ['loses', 'Losing power: a card that drops to 0 power is destroyed.'],
  ['this turn', 'This turn: the bonus lasts until the end of the turn, so it still counts if the location resolves now.'],
  ['played', 'Played: cards put into this lane this turn, whether or not they have revealed yet.'],
];

export function cardKeywordsHelp(def) {
  const out = [];
  for (const [term, help] of TEXT_TERMS) if ((def.text || '').includes(term)) out.push([term, help.split(': ').slice(1).join(': ')]);
  return out;
}

// Pixel icons from masks: c = currentColor, w = highlight, d = shade, with an
// auto outline. Gem = energy and cost; shield = power; star = points.
const MASKS = {
  gem: ['...c...', '..cwc..', '.cwccc.', 'cwccccc', 'ccccccc', '.cdddd.', '..ddd..', '...d...'],
  shield: ['ccccccccccc', 'cwwwccccccc', 'cwccccccccc', 'cwccccccccc', 'ccccccccccc', 'ccccccccccc', 'ccccccccccd', '.ccccccccd.', '.cccccccdd.', '..cccccdd..', '...ccddd...', '....ddd....', '.....d.....'],
  star: ['....c....', '....c....', '...cwc...', 'cccwccccc', '.ccccccc.', '..ccccc..', '..ccccc..', '.cc...cc.', '.c.....c.'],
};
export function icon(name, cls = '') {
  const m = MASKS[name], h = m.length, w = m[0].length;
  const on = (x, y) => y >= 0 && y < h && x >= 0 && x < w && m[y][x] !== '.';
  let r = '';
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) r += `<rect class="o" x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
  }
  m.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    r += `<rect class="${ch === 'w' ? 'w' : 'c'}" x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
    if (ch === 'd') r += `<rect class="d" x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
  }));
  return `<svg class="px-i i-${name} ${cls}" viewBox="0 0 ${w + 2} ${h + 2}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}

// A two-frame idle sprite from art/sprites (DawnLike, CC BY 4.0).
export const spr = (id, cls = '') => `<i class="spr ${cls}" style="background-image:url(art/sprites/${id}.png)"></i>`;

// A 16px pixel icon from art/icons (DawnLike items and GUI, plus a few drawn
// to match). Relics and encounter rules use their trait id as the icon.
export const ico = (id, cls = '') => `<i class="ico ${cls}" style="background-image:url(art/icons/${id}.png)"></i>`;

// One glyph for when a card's text applies, so effect cards read at a glance.
const TIMING = { reveal: ['✦', 'When revealed'], end: ['↻', 'At the end of each turn'], death: ['☠', 'When destroyed'], always: ['∞', 'Always on'] };
export function timing(def) {
  if (!def.text) return null;
  if (def.onReveal) return TIMING.reveal;
  if (def.endTurn) return TIMING.end;
  if (def.lastRites) return TIMING.death;
  return TIMING.always;
}
export { TIMING };

// opts: { size: 'hand'|'mini'|'big', power, upgraded, back, staged, selected,
//         movable, unplayable, uid, cost }
// Energy cost is the gold gem (top left); power is the red shield (top right).
export function cardHTML(def, opts = {}) {
  const size = opts.size || 'hand';
  const attrs = `data-uid="${opts.uid ?? ''}" data-id="${def ? def.id : ''}"`;
  if (opts.back) return `<div class="card ${size} back ${opts.cls || ''}" ${attrs}><i class="cb">${opts.hiddenMark ? '?' : ''}</i></div>`;
  const cls = ['card', size];
  if (opts.staged) cls.push('staged');
  if (opts.selected) cls.push('selected');
  if (opts.movable) cls.push('movable');
  if (opts.unplayable) cls.push('unplayable');
  if (opts.upgraded) cls.push('upgraded');
  if (def.rarity === 'rare') cls.push('rare');
  if (size === 'big' && (def.text || '').length > 80) cls.push('long');
  if (opts.cls) cls.push(opts.cls);
  const base = def.power + (opts.upgraded ? 1 : 0);
  const p = opts.power ?? base;
  const pcls = p > base ? 'up' : p < base ? 'down' : '';
  const t = timing(def);
  return `<div class="${cls.join(' ')}" data-color="${def.color}" ${attrs}><div class="cin">
    <div class="art">${spr(def.art)}${t && size !== 'mini' ? `<i class="tm" title="${t[1]}">${t[0]}</i>` : ''}</div>
    <div class="cost">${icon('gem')}<b>${opts.cost ?? def.cost}</b></div>
    <div class="power ${pcls}">${icon('shield')}<b>${p}</b></div>
    <span class="suit">${SUITS[def.color] || ''}</span>
    ${size !== 'mini' ? `<div class="box"><div class="name">${esc(def.name)}</div>${size === 'big' ? `<div class="text">${esc(def.text || 'No ability.')}</div>` : ''}</div>` : ''}
    ${def.rarity === 'rare' ? '<i class="holo"></i>' : ''}
  </div></div>`;
}

export function locCardHTML(id, opts = {}) {
  const d = LOCATIONS[id];
  return `<div class="loc-card ${opts.bring ? 'bring' : ''}" data-loc="${id}">
    <div class="lart">${spr('loc_' + id)}</div>
    <div class="lname">${esc(d.name)}${d.points > 1 ? ` · ${d.points}★` : ''}</div>
    <div class="ltrig">${esc(triggerText(d))}</div>
    ${d.text ? `<div class="lrule">${esc(d.text)}</div>` : ''}
  </div>`;
}

let overlayStack = [];

export function openSheet(html, { center = false, onClose = null, dismissable = true } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay' + (center ? ' center' : '');
  ov.innerHTML = `<div class="sheet">${html}</div>`;
  const close = () => {
    if (!ov.isConnected) return;
    ov.remove();
    overlayStack = overlayStack.filter((x) => x !== ov);
    if (onClose) onClose();
  };
  if (dismissable) ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.body.appendChild(ov);
  overlayStack.push(ov);
  return { el: ov, close };
}

export function closeAllSheets() {
  for (const ov of [...overlayStack]) ov.remove();
  overlayStack = [];
}

export function showCardDetail(def, opts = {}) {
  const help = cardKeywordsHelp(def);
  const t = timing(def);
  if (t) help.unshift([t[0], t[1] + '.']);
  const html = `<div class="detail">
    ${cardHTML(def, { ...opts, size: 'big' })}
    <div class="muted" style="font-size:12px">${SUITS[def.color]} ${COLOR_NAMES[def.color]}${def.rarity === 'rare' ? ' · Rare' : ''}${def.token ? ' · Token' : ''}${opts.note ? ' · ' + esc(opts.note) : ''}</div>
    ${help.length ? `<div class="glossary">${help.map(([k, v]) => `<div><b>${esc(k)}</b>: ${esc(v)}</div>`).join('')}</div>` : ''}
    <button class="btn" data-close style="width:100%">Close</button>
  </div>`;
  return openSheet(html);
}

export function showLocDetail(id, extra = '') {
  const d = LOCATIONS[id];
  const html = `<div class="detail">
    <div class="loc-big">${spr('loc_' + id)}</div>
    <h3>${esc(d.name)}</h3>
    <div>${esc(triggerText(d))}.</div>
    ${d.text ? `<div style="color:#e9d9a6">${esc(d.text)}</div>` : ''}
    <div class="muted">Worth ${d.points} point${d.points > 1 ? 's' : ''}. When it resolves, the side with more power here scores and the other side draws a card; then the cards here go to their owners' discard piles and a new location arrives. If it's tied, it stays.</div>
    ${extra}
    <button class="btn" data-close style="width:100%">Close</button>
  </div>`;
  return openSheet(html);
}

export function toast(msg, ms = 1800) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function floatText(el, text, positive) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'float ' + (positive ? 'pos' : 'neg');
  f.textContent = text;
  f.style.left = r.left + r.width / 2 + 'px';
  f.style.top = r.top + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 950);
}

export function banner(text, who) {
  const b = document.createElement('div');
  b.className = 'banner ' + (who || '');
  b.textContent = text;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 1150);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function colorSwatches(colors) {
  return `<div class="swatches">${colors.map((c) => `<span class="swatch" style="color:var(--${c})">${SUITS[c]}</span>`).join('')}</div>`;
}

export { CARDS, LOCATIONS, triggerText };
