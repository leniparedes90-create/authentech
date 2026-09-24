'use strict';
/* AuthenCut Pro · núcleo: constantes, estado, utilidades, historial, medios y proyecto */

const FPS = 30, TH = 46;
const TRACKS = [{id:'V3'},{id:'V2'},{id:'V1'},{id:'A1'},{id:'A2'},{id:'A3'}];
const VROWS = [0,1,2], AROWS = [3,4,5];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const q = t => Math.round(t * FPS) / FPS;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let UID = Date.now() % 1e6;
const nid = (p = 'c') => p + (UID++).toString(36);

function freshTracks(){
  const o = {};
  TRACKS.forEach(tr => o[tr.id] = {hide:false, mute:false, solo:false, lock:false, vol:1, pan:0});
  return o;
}
const S = {
  seq: {w:1920, h:1080}, media: [], clips: [], markers: [],
  t: 0, playing: false, rate: 1, zoom: 40,
  sel: new Set(), primary: null, selTrans: null, gap: null, projSel: null,
  tool: 'select', snap: true, linkedSel: true,
  tracks: freshTracks(), master: {vol:1},
  src: {id:null, in:null, out:null}, clipboard: null,
  seqIn: null, seqOut: null, res: 1, monZoom: 'fit', mode: 'edit', ws: 'Edición'
};
let FOCUS = 'program', DRAGMEDIA = null, DRAGRANGE = null, DRAGFX = null, EXPORT = null;

const media = id => S.media.find(m => m.id === id);
const clip = id => S.clips.find(c => c.id === id);
const rowOf = tid => TRACKS.findIndex(t => t.id === tid);
const isV = tid => tid[0] === 'V';
const spd = c => c.speed || 1;
const cend = c => c.start + c.dur;
const srcAt = (c, t) => c.in + (t - c.start) * spd(c);
const seqEnd = () => S.clips.reduce((e, c) => Math.max(e, cend(c)), 0);
const mediaBased = c => c.kind === 'video' || c.kind === 'audio';
const visual = c => c.kind !== 'audio';
const srcDurOf = m => m.type === 'image' ? 5 : m.duration;
const prevOf = c => S.clips.find(o => o !== c && o.track === c.track && Math.abs(cend(o) - c.start) < 1e-3);
const nextOf = c => S.clips.find(o => o !== c && o.track === c.track && Math.abs(o.start - cend(c)) < 1e-3);

function tc(t){
  const f = Math.floor(Math.max(0, t) * FPS + 1e-6);
  const ff = f % FPS, s = Math.floor(f / FPS) % 60, m = Math.floor(f / FPS / 60) % 60, h = Math.floor(f / FPS / 3600);
  return [h, m, s, ff].map(n => String(n).padStart(2, '0')).join(':');
}
// Acepta "00:00:05:12", "5:12" o "512" (igual que el cuadro de código de tiempo)
function parseTCInput(str){
  const s = String(str).trim(); if (!s) return null;
  let p;
  if (/^\d+$/.test(s)){ const d = s.padStart(8, '0').slice(-8); p = [d.slice(0,2), d.slice(2,4), d.slice(4,6), d.slice(6,8)].map(Number); }
  else { p = s.split(/[:;.,]/).map(Number); if (p.some(isNaN)) return null; while (p.length < 4) p.unshift(0); p = p.slice(-4); }
  const [h, m, sec, f] = p;
  return h*3600 + m*60 + sec + f/FPS;
}
const dbStr = g => g <= 0.0001 ? '-∞ dB' : (20 * Math.log10(g)).toFixed(1).replace('.', ',') + ' dB';
const panStr = p => String(Math.round(p * 100));
const num = v => (Math.round(v * 100) / 100).toLocaleString('es');
const LABELS = {Violeta:'#8f84d6', Iris:'#6f6fc9', Caribe:'#1fae96', Lavanda:'#b19be8', 'Cerúleo':'#2e9bd6', Bosque:'#57a84a', Rosa:'#d9689f', Mango:'#e39a3a', Amarillo:'#cfc23a', Mandarina:'#e3662a'};

/* ============================== modelo de clip ============================== */
const PROP_DEFAULTS = {x:0, y:0, scale:100, rotation:0, opacity:100, volume:100, pan:0};
const TEXT_DEFAULTS = {text:'Título', size:120, color:'#ffffff', font:'Montserrat', bold:true, italic:false, align:'center', bg:false, bgColor:'#000000', shadow:true, stroke:0, strokeColor:'#000000'};
function defaultProps(kind){ const p = {...PROP_DEFAULTS}; if (kind === 'text') Object.assign(p, TEXT_DEFAULTS); return p; }
function normalizeClip(c){
  const p = Object.assign(defaultProps(c.kind), c.props || {});
  ['fadeIn','fadeOut','brightness','contrast','saturation','blur'].forEach(k => delete p[k]);
  c.props = p;
  c.speed = c.speed || 1; c.keepPitch = c.keepPitch !== false;
  c.kf = c.kf || {}; c.fx = c.fx || []; c.tIn = c.tIn || null; c.tOut = c.tOut || null;
  c.disabled = !!c.disabled; c.color = c.color || null; c.link = c.link || null;
  return c;
}
function newClip(kind, m, track, start, inP, dur, link){
  return normalizeClip({id:nid(), kind, mediaId: m ? m.id : null, track, start:q(start), in:inP || 0, dur:q(dur), link:link || null});
}
function clampTrans(c){ if (c.tIn && c.tIn.dur > c.dur) c.tIn.dur = c.dur; if (c.tOut && c.tOut.dur > c.dur) c.tOut.dur = c.dur; }
const TRASH = new Map(); // medios borrados, para poder deshacer
function cloneClip(c){ const n = JSON.parse(JSON.stringify(c)); n.id = nid(); return n; }

/* ------------------------------ fotogramas clave ------------------------------ */
const KEYABLE = new Set(['x','y','scale','rotation','opacity','volume','pan']);
function baseVal(c, key){
  if (key.startsWith('fx.')){ const [, id, p] = key.split('.'); const f = c.fx.find(f => f.id === id); return f ? f.p[p] : 0; }
  return c.props[key];
}
function setBase(c, key, v){
  if (key.startsWith('fx.')){ const [, id, p] = key.split('.'); const f = c.fx.find(f => f.id === id); if (f) f.p[p] = v; return; }
  c.props[key] = v;
}
const hasKf = (c, key) => !!(c.kf[key] && c.kf[key].length);
function val(c, key, t){
  const a = c.kf[key]; if (!a || !a.length) return baseVal(c, key);
  const l = t - c.start;
  if (l <= a[0].t) return a[0].v;
  for (let i = 1; i < a.length; i++) if (l <= a[i].t){ const p = a[i-1], n = a[i]; return p.v + (n.v - p.v) * ((l - p.t) / ((n.t - p.t) || 1)); }
  return a[a.length - 1].v;
}
function putKf(c, key, l, v){
  const a = c.kf[key] || (c.kf[key] = []);
  const ex = a.find(k => Math.abs(k.t - l) < .5 / FPS);
  if (ex) ex.v = v; else { a.push({t:l, v}); a.sort((x, y) => x.t - y.t); }
}
// Cambia un valor respetando la animación: con cronómetro activo crea/actualiza el fotograma clave en el cabezal
function setVal(c, key, v){
  if (hasKf(c, key)) putKf(c, key, clamp(q(S.t - c.start), 0, c.dur), v); else setBase(c, key, v);
}
function shiftKf(c, dt){ for (const k in c.kf) c.kf[k].forEach(x => x.t = +(x.t + dt).toFixed(5)); }
function scaleKf(c, f){ for (const k in c.kf) c.kf[k].forEach(x => x.t = +(x.t * f).toFixed(5)); }

/* ================================== iconos ================================== */
const P = d => `<svg viewBox="0 0 16 16" fill="currentColor">${d}</svg>`;
const ICON = {
  play: P('<path d="M4 2.5v11l9.5-5.5z"/>'),
  pause: P('<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>'),
  back: P('<path d="M10 3.5v9L4 8z"/><path d="M11.5 3.5H13v9h-1.5z"/>'),
  fwd: P('<path d="M6 3.5v9l6-4.5z"/><path d="M3 3.5h1.5v9H3z"/>'),
  markIn: P('<path d="M10 2.5H6v11h4v-1.6H7.6V4.1H10z"/>'),
  markOut: P('<path d="M6 2.5h4v11H6v-1.6h2.4V4.1H6z"/>'),
  goIn: P('<path d="M2.5 3h4v1.5H4v7h2.5V13h-4z"/><path d="M14 3v10L7.5 8z"/>'),
  goOut: P('<path d="M13.5 3h-4v1.5H12v7H9.5V13h4z"/><path d="M2 3v10l6.5-5z"/>'),
  insert: P('<path d="M1.5 10.5h5v3h-5zM9.5 10.5h5v3h-5z" opacity=".55"/><path d="M7.2 2h1.6v5.2l1.8-1.8 1.1 1.1L8 10.2 4.3 6.5l1.1-1.1 1.8 1.8z"/>'),
  overwrite: P('<path d="M1.5 10.5h13v3h-13z" opacity=".55"/><path d="M7.2 2h1.6v5.2l1.8-1.8 1.1 1.1L8 10.2 4.3 6.5l1.1-1.1 1.8 1.8z"/>'),
  lift: P('<path d="M1.5 11h13v3h-13z" opacity=".55"/><path d="M8 1.5l3.7 3.7-1.1 1.1-1.8-1.8V10H7.2V4.5L5.4 6.3 4.3 5.2z"/>'),
  extract: P('<path d="M1.5 11h5v3h-5zM9.5 11h5v3h-5z" opacity=".55"/><path d="M8 1.5l3.7 3.7-1.1 1.1-1.8-1.8V10H7.2V4.5L5.4 6.3 4.3 5.2z"/>'),
  frame: P('<path d="M5.5 3l1-1.5h3l1 1.5H14v10H2V3zm2.5 8.3a2.8 2.8 0 100-5.6 2.8 2.8 0 000 5.6z"/>'),
  marker: P('<path d="M4 2h8v8l-4 4-4-4z"/>'),
  select: P('<path d="M4 1.5l8.5 7.6H8.4l2.4 4.8-1.7.8-2.4-4.8L4 12.8z"/>'),
  trackfwd: P('<path d="M2 3h1.5v10H2z"/><path d="M5 4.5l4 3.5-4 3.5zM9.5 4.5l4 3.5-4 3.5z"/>'),
  ripple: P('<path d="M2.5 3h4v1.5H4v7h2.5V13h-4z"/><path d="M8 8l5.5-4v8z"/>'),
  rolling: P('<path d="M1.5 3h4v1.5H3v7h2.5V13h-4zM14.5 3h-4v1.5H13v7h-2.5V13h4z"/><path d="M7.2 2h1.6v12H7.2z"/>'),
  rate: P('<path d="M1 8l3-3v6zM15 8l-3-3v6z"/><path d="M5 7.2h6v1.6H5z"/><path d="M7.2 3h1.6v10H7.2z" opacity=".6"/>'),
  razor: P('<path d="M8.6 1.7l5.7 5.7-3.2 3.2-5.7-5.7zM5.1 6.5l4.4 4.4-6 3.6-2-2z"/>'),
  slip: P('<path d="M1 8l3-3v6zM15 8l-3-3v6z"/><path d="M5.5 3h5v10h-5z" opacity=".85"/>'),
  hand: P('<path d="M7 1.5a1 1 0 011 1V7h.5V3a1 1 0 012 0v4h.5V4a1 1 0 012 0v6c0 2.8-2 4.5-4.5 4.5-2 0-3.2-1-4.2-2.5L2.2 8.6a1 1 0 011.6-1.2L5.5 9V3a1 1 0 011-1z"/>'),
  zoom: '<svg viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.6 9.6L14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  text: P('<path d="M2.5 2.5h11v3H12V4H9v8.5h1.5V14h-5v-1.5H7V4H4v1.5H2.5z"/>'),
  eye: '<svg viewBox="0 0 16 16"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2.1" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="7" rx="1" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  magnet: P('<path d="M2.5 2h3.5v6a2 2 0 004 0V2h3.5v6a5.5 5.5 0 01-11 0zM2.5 2h3.5v2.5H2.5zM10 2h3.5v2.5H10z"/>'),
  link: '<svg viewBox="0 0 16 16"><path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.9 2.9 0 014.1 4.1L11 8.6M9 11.5l-1.2 1.2a2.9 2.9 0 01-4.1-4.1L5 7.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  wave: '<svg viewBox="0 0 16 16"><path d="M1 8h1.5M3 5.5v5M5 3v10M7 6v4M9 2v12M11 4.5v7M13 6.5v3M15 8h-.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  import: P('<path d="M2 3.5h4.5l1.5 1.5h6v8.5H2z" opacity=".55"/><path d="M7.2 6h1.6v3.2l1.3-1.3 1.1 1.1L8 12.2 4.8 9l1.1-1.1 1.3 1.3z"/>'),
  stopwatch: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 9V6M6.3 1.8h3.4M8 1.8v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  trash: P('<path d="M5.5 2h5l.5 1.5H14V5H2V3.5h3zM3.5 6h9l-.8 8H4.3z"/>'),
  folder: P('<path d="M1.5 3h5l1.5 1.5h6.5v8.5h-13z"/>'),
  home: P('<path d="M8 1.8l6.5 5.6V14H9.8v-4H6.2v4H1.5V7.4z"/>'),
  grid: P('<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/>'),
  full: P('<path d="M2 2h5v1.6H3.6V7H2zM14 2H9v1.6h3.4V7H14zM2 14h5v-1.6H3.6V9H2zM14 14H9v-1.6h3.4V9H14z"/>'),
  quick: P('<path d="M2 11.5h12V14H2z" opacity=".55"/><path d="M8 1.5l4 4-1.1 1.1-2.1-2.1V10H7.2V4.5L5.1 6.6 4 5.5z"/>'),
  upload: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 34H10a8 8 0 01-1-15.9A12 12 0 0132 14a9 9 0 016 17.4"/><path d="M24 40V22M17 29l7-7 7 7"/></svg>'
};

/* ================================ utilidades UI ================================ */
let toastT;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
function status(msg){ $('#msg').textContent = msg; }
function modal(title, bodyHTML, buttons){
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="dlg"><h3>${title}</h3><div class="db">${bodyHTML}</div><div class="df"></div></div>`;
  const df = m.querySelector('.df');
  (buttons || [['Cerrar', null, true]]).forEach(([label, fn, pri]) => {
    const b = document.createElement('button'); b.className = 'btn' + (pri ? ' pri' : ''); b.textContent = label;
    b.onclick = () => { if (fn && fn(m) === false) return; m.remove(); };
    df.appendChild(b);
  });
  m.addEventListener('mousedown', e => { if (e.target === m && !EXPORT) m.remove(); });
  m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA'){ const p = m.querySelector('.df .pri'); if (p){ e.preventDefault(); p.click(); } } });
  document.body.appendChild(m);
  const f = m.querySelector('input:not([type=checkbox]),select,textarea'); if (f) setTimeout(() => f.focus(), 0);
  return m;
}
function download(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .()-]/g, '_');
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
// items: [etiqueta, atajo, fn, deshabilitado, marcado] | '-' | {swatches: fn}
function ctxMenu(x, y, items){
  closeCtx();
  const m = document.createElement('div'); m.className = 'ctx'; m.id = 'ctx';
  for (const it of items){
    if (it === '-'){ m.appendChild(document.createElement('hr')); continue; }
    if (it.swatches){
      const d = document.createElement('div'); d.className = 'sws';
      d.innerHTML = '<span>Etiqueta</span>' + Object.entries(LABELS).map(([n, c]) => `<i title="${n}" data-c="${c}" style="background:${c}"></i>`).join('');
      d.querySelectorAll('i').forEach(i => i.onclick = () => { closeCtx(); it.swatches(i.dataset.c); });
      m.appendChild(d); continue;
    }
    const [label, key, fn, disabled, checked] = it;
    const b = document.createElement('button'); b.disabled = !!disabled;
    b.innerHTML = `<em>${checked ? '✓' : ''}</em>${esc(label)}<span>${key || ''}</span>`;
    b.onclick = () => { closeCtx(); fn && fn(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(2, Math.min(x, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(2, Math.min(y, innerHeight - r.height - 4)) + 'px';
}
function closeCtx(){ const m = $('#ctx'); if (m) m.remove(); }

/* ================================== historial ================================== */
const UNDO = [], REDO = [];
const snap = () => JSON.stringify({c:S.clips, m:S.markers, i:S.seqIn, o:S.seqOut});
function commit(before, label){
  if (before === snap()) return false;
  UNDO.push({s:before, label:label || 'Editar'}); if (UNDO.length > 300) UNDO.shift();
  REDO.length = 0; renderHistory(); scheduleSave(); return true;
}
function edit(fn, label){ const b = snap(); const r = fn(); cleanLinks(); commit(b, label); refresh(true); return r; }
function restore(s){
  const d = JSON.parse(s);
  S.clips = d.c.map(normalizeClip); S.markers = d.m || []; S.seqIn = d.i ?? null; S.seqOut = d.o ?? null;
  let back = false;
  for (const c of S.clips) if (c.mediaId && !media(c.mediaId) && TRASH.has(c.mediaId)){ S.media.push(TRASH.get(c.mediaId)); TRASH.delete(c.mediaId); back = true; }
  if (back) renderProject();
  S.sel = new Set([...S.sel].filter(id => clip(id)));
  if (S.selTrans && !clip(S.selTrans.id)) S.selTrans = null;
  S.gap = null; refresh(true);
}
function undo(){ const e = UNDO.pop(); if (!e) return status('Nada que deshacer'); REDO.push({s:snap(), label:e.label}); restore(e.s); status('Deshacer: ' + e.label); }
function redo(){ const e = REDO.pop(); if (!e) return status('Nada que rehacer'); UNDO.push({s:snap(), label:e.label}); restore(e.s); status('Rehacer: ' + e.label); }
function historyGo(n){ while (UNDO.length > n) undo(); while (UNDO.length < n && REDO.length) redo(); }
function cleanLinks(){
  const n = {}; S.clips.forEach(c => { if (c.link) n[c.link] = (n[c.link] || 0) + 1; });
  S.clips.forEach(c => { if (c.link && n[c.link] < 2) c.link = null; });
}
function refresh(force){ renderTimeline(); renderEffects(force); renderMarkers(); renderHistory(); renderInfo(); scheduleSave(); }

/* ================================= importación ================================= */
function guessType(n){
  const e = n.split('.').pop().toLowerCase();
  if (['mp4','mov','webm','mkv','m4v','ogv'].includes(e)) return 'video';
  if (['mp3','wav','ogg','m4a','aac','flac','opus'].includes(e)) return 'audio';
  if (['png','jpg','jpeg','gif','webp','bmp','avif'].includes(e)) return 'image';
  return null;
}
function thumbOf(src, w, h){
  const c = document.createElement('canvas'); c.width = 192; c.height = 108;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 192, 108);
  if (w && h){ const k = Math.min(192 / w, 108 / h); g.drawImage(src, (192 - w*k) / 2, (108 - h*k) / 2, w*k, h*k); }
  try { return c.toDataURL('image/jpeg', .72); } catch(e){ return null; }
}
function probeVideo(m){
  return new Promise(res => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = m.url;
    const done = () => { v.removeAttribute('src'); v.load(); res(); };
    v.onloadedmetadata = () => { m.duration = isFinite(v.duration) && v.duration > 0 ? v.duration : 10; m.w = v.videoWidth; m.h = v.videoHeight; v.currentTime = Math.min(m.duration * .25, 2); };
    v.onseeked = () => { m.thumb = thumbOf(v, m.w, m.h); done(); };
    v.onerror = done; setTimeout(res, 10000);
  });
}
function probeAudio(m){
  return new Promise(res => {
    const a = document.createElement('audio'); a.preload = 'metadata'; a.src = m.url;
    a.onloadedmetadata = () => { m.duration = isFinite(a.duration) && a.duration > 0 ? a.duration : 10; res(); };
    a.onerror = res; setTimeout(res, 10000);
  });
}
function probeImage(m){
  return new Promise(res => {
    const i = new Image();
    i.onload = () => { m.w = i.naturalWidth; m.h = i.naturalHeight; m.img = i; m.thumb = thumbOf(i, m.w, m.h); res(); };
    i.onerror = res; i.src = m.url;
  });
}
async function computePeaks(file, m){
  if (file.size > 400e6) return;
  try {
    const ac = ensureAudio(); if (!ac) return;
    const buf = await ac.decodeAudioData(await file.arrayBuffer());
    const pps = 100, n = Math.ceil(buf.duration * pps), per = Math.max(1, Math.floor(buf.length / n));
    const chs = []; for (let i = 0; i < Math.min(2, buf.numberOfChannels); i++) chs.push(buf.getChannelData(i));
    const peaks = new Float32Array(n);
    for (let i = 0; i < n; i++){
      let mx = 0; const s = i * per, e = Math.min(buf.length, s + per);
      for (const d of chs) for (let j = s; j < e; j += 4){ const v = Math.abs(d[j]); if (v > mx) mx = v; }
      peaks[i] = mx;
    }
    m.peaks = peaks; m.pps = pps; renderTimeline();
  } catch(e){ /* sin pista de audio decodificable */ }
}
async function importFiles(list){
  const files = [...list]; if (!files.length) return [];
  status(`Importando ${files.length} archivo(s)…`);
  const out = [];
  for (const f of files){
    const type = f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('image/') ? 'image' : guessType(f.name);
    if (!type){ toast('Formato no compatible: ' + f.name); continue; }
    let m = S.media.find(x => x.offline && x.name === f.name && x.type === type);
    const relinked = !!m;
    if (!m){ m = {id:nid('m'), name:f.name, type, duration:5, w:0, h:0, thumb:null}; S.media.push(m); }
    m.url = URL.createObjectURL(f); m.offline = false; m.size = f.size;
    if (type === 'video') await probeVideo(m); else if (type === 'audio') await probeAudio(m); else await probeImage(m);
    if (type !== 'image') computePeaks(f, m);
    if (relinked) toast('Medio reconectado: ' + f.name);
    out.push(m);
  }
  renderProject(); renderTimeline(); scheduleSave();
  if (S.mode === 'import') renderImportView();
  status(`${out.length} archivo(s) importado(s)`);
  return out;
}

/* ================================== proyecto ================================== */
function projName(){ return ($('#projName').value.trim() || 'Proyecto').replace(/[\\/:*?"<>|]/g, '_'); }
function syncName(){
  const n = $('#projName').value.trim() || 'Proyecto sin título';
  $('#projTab').textContent = n; document.title = n + ' · AuthenCut Pro';
}
function serialize(){
  return {app:'AuthenCut', v:2, name:$('#projName').value, seq:S.seq, zoom:S.zoom, tracks:S.tracks, master:S.master,
    markers:S.markers, seqIn:S.seqIn, seqOut:S.seqOut,
    media: S.media.map(m => ({id:m.id, name:m.name, type:m.type, duration:m.duration, w:m.w, h:m.h, thumb:m.thumb})), clips:S.clips};
}
function load(d){
  if (!d || !Array.isArray(d.clips)) return false;
  [...ELS.keys()].forEach(dropEl);
  S.media = (d.media || []).map(m => ({...m, offline:true, url:null}));
  S.clips = d.clips.map(normalizeClip); S.markers = d.markers || [];
  S.seqIn = d.seqIn ?? null; S.seqOut = d.seqOut ?? null;
  S.sel.clear(); S.selTrans = null; S.gap = null; S.t = 0; S.projSel = null; S.primary = null; S.clipboard = null; TRASH.clear();
  if (typeof ivSel !== 'undefined') ivSel.clear();
  S.tracks = freshTracks(); if (d.tracks) for (const k in S.tracks) if (d.tracks[k]) Object.assign(S.tracks[k], d.tracks[k]);
  S.master = Object.assign({vol:1}, d.master || {});
  $('#projName').value = d.name || 'Proyecto sin título'; syncName();
  S.seq = d.seq || {w:1920, h:1080};
  S.zoom = d.zoom || 40;
  UNDO.length = 0; REDO.length = 0; closeSource();
  buildTracks(); buildMixer(); renderProject(); refresh(true); setZoom(S.zoom);
  const off = S.media.length;
  if (off) toast(`${off} medio(s) sin conexión: impórtalos de nuevo para reconectarlos`);
  return true;
}
let saveT;
function scheduleSave(){ clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('authencut.project', JSON.stringify(serialize())); } catch(e){} }, 700); }
function saveProjectFile(){ download(new Blob([JSON.stringify(serialize())], {type:'application/json'}), projName() + '.acproj'); toast('Proyecto guardado'); }
function openProjectFile(){ $('#projIn').click(); }
function newProject(){
  if ((S.clips.length || S.media.length) && !confirm('¿Crear un proyecto nuevo? Se perderán los cambios que no hayas guardado.')) return;
  load({clips:[], media:[], name:'Proyecto sin título', seq:{w:1920, h:1080}, zoom:40});
  toast('Proyecto nuevo');
}
