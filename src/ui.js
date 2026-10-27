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

// Animated felt swirl (Balatro-like) on a low-res canvas behind the app.
export function swirl(canvas, cols = [[0.13, 0.55, 0.36], [0.08, 0.36, 0.5], [0.04, 0.12, 0.1]]) {
  const gl = canvas.getContext('webgl', { antialias: false });
  if (!gl) return;
  const v = (c) => `vec3(${c.map((n) => n.toFixed(3)).join(',')})`;
  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `precision mediump float;uniform float t;uniform vec2 r;
    void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/length(r)*1.7;float d=length(uv);
    float a=atan(uv.y,uv.x)+t*.08-d*4.2;uv=vec2(cos(a),sin(a))*d;vec2 p=uv*24.;
    for(int i=0;i<5;i++){p+=vec2(sin(p.y*.21+t*.35)*1.6,cos(p.x*.19-t*.28)*1.6);}
    float c=sin(length(p)*.19+t*.15)*.5+.5;float c2=sin((p.x-p.y)*.09+t*.1)*.5+.5;
    vec3 col=mix(${v(cols[0])},${v(cols[1])},smoothstep(.38,.62,c));
    col=mix(col,${v(cols[2])},smoothstep(.72,.96,c2)*.85);gl_FragColor=vec4(col,1.);}`;
  const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const ut = gl.getUniformLocation(pr, 't'), ur = gl.getUniformLocation(pr, 'r');
  const size = () => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth / 5)); canvas.height = Math.max(1, Math.round(canvas.clientHeight / 5));
    gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(ur, canvas.width, canvas.height);
  };
  size(); addEventListener('resize', size);
  const draw = (ms) => { gl.uniform1f(ut, 20 + ms / 1000); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  draw(0);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // ~30 fps is plenty for a slow background, and saves battery.
  let last = 0;
  const loop = (ms) => { if (!document.hidden && ms - last > 33) { last = ms; draw(ms); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
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
    <div class="muted">Worth ${d.points} point${d.points > 1 ? 's' : ''}. When it resolves, the side with more power here scores; then the cards here go to their owners' discard piles and a new location arrives.</div>
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
