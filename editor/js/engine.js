'use strict';
/* AuthenCut Pro · motor: audio, reproducción y render del monitor de programa */

/* ================================ grafo de audio ================================ */
let AC = null, master = null, anL = null, anR = null, recDest = null;
const TRK = {};
function ensureAudio(){
  if (AC){ if (AC.state === 'suspended') AC.resume().catch(() => {}); return AC; }
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
  try { AC = new Ctx({sampleRate:48000}); } catch(e){ try { AC = new Ctx(); } catch(e2){ AC = null; return null; } }
  master = AC.createGain(); master.connect(AC.destination);
  const sp = AC.createChannelSplitter(2); master.connect(sp);
  anL = AC.createAnalyser(); anR = AC.createAnalyser(); anL.fftSize = anR.fftSize = 2048;
  sp.connect(anL, 0); sp.connect(anR, 1);
  recDest = AC.createMediaStreamDestination(); master.connect(recDest);
  return AC;
}
// Nodo de pista de audio (se crea al primer uso; las pistas pueden añadirse en cualquier momento)
function trkNode(id){
  if (!AC) return null;
  if (!TRK[id]){
    const g = AC.createGain(), pan = AC.createStereoPanner(), an = AC.createAnalyser();
    an.fftSize = 1024; g.connect(pan); pan.connect(an); an.connect(master);
    TRK[id] = {g, pan, an};
  }
  return TRK[id];
}

/* ============================ elementos multimedia ============================ */
const ELS = new Map();
function elFor(c){
  const m = media(c.mediaId); if (!m || m.offline || !m.url) return null;
  let r = ELS.get(c.id);
  if (r && r.url === m.url) return r;
  if (r) dropEl(c.id);
  if (c.kind === 'image'){ r = {url:m.url, el:m.img}; ELS.set(c.id, r); return r; }
  const el = document.createElement(c.kind === 'video' ? 'video' : 'audio');
  el.preload = 'auto'; el.playsInline = true; el.src = m.url; if (c.kind === 'video') el.muted = true;
  $('#mediaHold').appendChild(el); r = {url:m.url, el};
  if (c.kind === 'audio' && ensureAudio()){
    try { r.node = AC.createMediaElementSource(el); r.gain = AC.createGain(); r.pan = AC.createStereoPanner(); r.node.connect(r.gain); r.gain.connect(r.pan); } catch(e){}
  }
  ELS.set(c.id, r); return r;
}
function routeTrack(r, tid){
  if (!r.pan || r.route === tid) return;
  const n = trkNode(tid); if (!n) return;
  try { r.pan.disconnect(); } catch(e){}
  r.pan.connect(n.g); r.route = tid;
}
function dropEl(id){
  const r = ELS.get(id); if (!r) return;
  if (r.el && r.el.tagName !== 'IMG'){
    r.el.pause(); r.el.removeAttribute('src'); r.el.load(); r.el.remove();
    try { r.node && r.node.disconnect(); r.gain && r.gain.disconnect(); r.pan && r.pan.disconnect(); } catch(e){}
  }
  ELS.delete(id);
}

/* =========================== transiciones de audio =========================== */
function curve(type, x){ x = clamp(x, 0, 1); if (type === 'gain') return x; if (type === 'expo') return x * x; return Math.sin(x * Math.PI / 2); }
function transK(c, t){
  const l = t - c.start, e = cend(c); let k = 1;
  if (c.tIn && l < c.tIn.dur) k *= curve(c.tIn.type, l / c.tIn.dur);
  if (t >= e){ const n = nextOf(c); k *= (n && n.tIn) ? curve(n.tIn.type, 1 - (t - e) / n.tIn.dur) : 0; }
  else if (c.tOut && !nextOf(c) && e - t < c.tOut.dur) k *= curve(c.tOut.type, (e - t) / c.tOut.dur);
  return k;
}

/* ================================ sincronización ================================ */
function sync(){
  const t = S.t, live = new Set(S.clips.map(c => c.id));
  for (const id of [...ELS.keys()]) if (!live.has(id)) dropEl(id);
  if (AC){
    const anySolo = AROWS.some(i => S.tracks[TRACKS[i].id].solo);
    for (const i of AROWS){
      const id = TRACKS[i].id, tr = S.tracks[id], n = trkNode(id); if (!n) continue;
      n.g.gain.value = (tr.mute || (anySolo && !tr.solo)) ? 0 : tr.vol; n.pan.pan.value = clamp(tr.pan, -1, 1);
    }
    master.gain.value = S.master.vol;
  }
  const scrubbing = !S.playing || S.rate < 0, boost = S.playing && S.rate > 1 ? S.rate : 1;
  for (const c of S.clips){
    if (c.kind === 'text' || c.kind === 'image') continue;
    const n = nextOf(c), e = cend(c) + (n && n.tIn ? n.tIn.dur : 0);
    const active = !c.disabled && t >= c.start - 1e-4 && t < e;
    const near = t >= c.start - 3 && t < e;
    if (!near){ if (ELS.has(c.id) && (t < c.start - 6 || t > e + 2)) dropEl(c.id); continue; }
    const r = elFor(c); if (!r) continue;
    const el = r.el, m = media(c.mediaId), rate = clamp(spd(c) * boost, .0625, 16);
    if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
    if ('preservesPitch' in el && el.preservesPitch !== c.keepPitch) el.preservesPitch = c.keepPitch;
    if (active){
      const want = srcAt(c, t), maxT = Math.max(0, m.duration - .05), target = Math.min(want, maxT), frozen = want >= maxT;
      if (c.kind === 'audio'){
        routeTrack(r, c.track);
        let g = val(c, 'volume', t) / 100 * transK(c, t);
        for (const f of c.fx) if (f.on && f.type === 'amp') g *= Math.pow(10, val(c, 'fx.' + f.id + '.db', t) / 20);
        if (frozen || scrubbing) g = S.playing ? 0 : g;
        if (r.gain){ r.gain.gain.value = g; r.pan.pan.value = clamp(val(c, 'pan', t) / 100, -1, 1); }
        else el.volume = clamp(g, 0, 1);
      }
      if (!scrubbing && !frozen){
        if (el.paused){ if (Math.abs(el.currentTime - target) > .05) el.currentTime = target; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - target) > .3) el.currentTime = target;
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - target) > .5 / FPS) el.currentTime = target;
      }
    } else {
      if (!el.paused) el.pause();
      if (t < c.start && !el.seeking && Math.abs(el.currentTime - c.in) > .1) el.currentTime = c.in;
    }
  }
}

/* ================================== render ================================== */
const CV = $('#prg'); let PG = CV.getContext('2d');
const OFF = document.createElement('canvas'), MK = document.createElement('canvas'), MM = document.createElement('canvas');
function resizeCanvas(){
  const r = EXPORT ? 1 : S.res, w = Math.round(S.seq.w / r), h = Math.round(S.seq.h / r);
  if (CV.width !== w || CV.height !== h){ CV.width = w; CV.height = h; PG = CV.getContext('2d'); }
}
function overlayFill(g, color, a){ g.save(); g.globalAlpha = clamp(a, 0, 1); g.fillStyle = color; g.fillRect(0, 0, S.seq.w, S.seq.h); g.restore(); }
function draw(){
  resizeCanvas();
  const g = PG, sc = CV.width / S.seq.w;
  g.setTransform(sc, 0, 0, sc, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.fillStyle = '#000'; g.fillRect(0, 0, S.seq.w, S.seq.h);
  for (const tid of [...videoIds()].reverse()){
    if (S.tracks[tid].hide) continue;
    const cur = S.clips.find(c => c.track === tid && !c.disabled && S.t >= c.start && S.t < cend(c));
    if (!cur) continue;
    const l = S.t - cur.start, e = cend(cur);
    if (cur.tIn && l < cur.tIn.dur){ const A = prevOf(cur); renderTrans(g, cur.tIn.type, l / cur.tIn.dur, A && !A.disabled ? A : null, cur); }
    else if (cur.tOut && !nextOf(cur) && e - S.t < cur.tOut.dur) renderTrans(g, cur.tOut.type, (e - S.t) / cur.tOut.dur, null, cur);
    else drawClip(g, cur, S.t);
  }
}
function renderTrans(g, type, k, A, B){
  const W = S.seq.w, H = S.seq.h, t = S.t;
  k = clamp(k, 0, 1);
  switch (type){
    case 'dissolve': if (A) drawClip(g, A, t); drawClip(g, B, t, {alpha:k}); break;
    case 'dipBlack': if (k < .5){ if (A) drawClip(g, A, t, {alpha:1 - 2*k}); } else drawClip(g, B, t, {alpha:2*k - 1}); break;
    case 'dipWhite': if (k < .5){ if (A) drawClip(g, A, t); overlayFill(g, '#fff', 2*k); } else { drawClip(g, B, t); overlayFill(g, '#fff', 2 - 2*k); } break;
    case 'wipe': if (A) drawClip(g, A, t); drawClip(g, B, t, {clip:[0, 0, W*k, H]}); break;
    case 'push': if (A) drawClip(g, A, t, {dx:-W*k}); drawClip(g, B, t, {dx:W*(1 - k)}); break;
    case 'slide': if (A) drawClip(g, A, t); drawClip(g, B, t, {dx:W*(1 - k)}); break;
    case 'iris': if (A) drawClip(g, A, t); drawClip(g, B, t, {circle:Math.hypot(W, H) / 2 * k}); break;
    default: drawClip(g, B, t);
  }
}
const fxOn = (c, type) => c.fx.find(f => f.on && f.type === type);
const fv = (c, f, p, t) => val(c, 'fx.' + f.id + '.' + p, t);
function drawClip(g, c, t, o = {}){
  const W = S.seq.w, H = S.seq.h, m = media(c.mediaId);
  g.save();
  if (o.clip){ g.beginPath(); g.rect(...o.clip); g.clip(); }
  if (o.circle != null){ g.beginPath(); g.arc(W/2, H/2, Math.max(.1, o.circle), 0, Math.PI*2); g.clip(); }
  g.globalAlpha = clamp(val(c, 'opacity', t) / 100 * (o.alpha ?? 1), 0, 1);
  g.translate(W/2 + val(c, 'x', t) + (o.dx || 0), H/2 + val(c, 'y', t));
  g.rotate(val(c, 'rotation', t) * Math.PI / 180);
  const k = val(c, 'scale', t) / 100;
  const hf = fxOn(c, 'hflip'), vf = fxOn(c, 'vflip');
  if (hf || vf) g.scale(hf ? -1 : 1, vf ? -1 : 1);
  if (c.kind === 'text'){ g.scale(k, k); drawText(g, c.props); g.restore(); return; }
  if (m && m.offline){
    g.fillStyle = '#5a0000'; g.fillRect(-W/2, -H/2, W, H);
    g.fillStyle = '#ff5b5b'; g.font = '600 56px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Medios sin conexión', 0, -20); g.font = '32px Inter, sans-serif'; g.fillText(m.name, 0, 40);
    g.restore(); return;
  }
  const r = elFor(c), el = r && r.el;
  const sw = el ? (el.videoWidth || el.naturalWidth) : 0, sh = el ? (el.videoHeight || el.naturalHeight) : 0;
  if (!el || !sw){ g.restore(); return; }
  // Mientras el vídeo busca (readyState < 2) se dibuja el último fotograma bueno en lugar de negro
  let src = el;
  if (el.tagName === 'VIDEO'){
    if (el.readyState >= 2){
      if (!S.playing || EXPORT || TICK % 3 === 0){
        if (!r.last) r.last = document.createElement('canvas');
        if (r.last.width !== sw || r.last.height !== sh){ r.last.width = sw; r.last.height = sh; }
        r.last.getContext('2d').drawImage(el, 0, 0);
      }
    } else if (r.last && r.last.width === sw) src = r.last;
    else { g.restore(); return; }
  }
  const fit = Math.min(W / sw, H / sh) * k, sc = CV.width / W, f = [];
  const lu = fxOn(c, 'lumetri');
  if (lu){
    const ex = fv(c, lu, 'exp', t), co = fv(c, lu, 'con', t), sa = fv(c, lu, 'sat', t);
    if (ex) f.push(`brightness(${(Math.pow(2, ex) * 100).toFixed(1)}%)`);
    if (co) f.push(`contrast(${100 + co}%)`);
    if (sa !== 100) f.push(`saturate(${sa}%)`);
  }
  const bc = fxOn(c, 'bc'); if (bc){ const b = fv(c, bc, 'b', t), cc = fv(c, bc, 'c', t); if (b) f.push(`brightness(${100 + b}%)`); if (cc) f.push(`contrast(${100 + cc}%)`); }
  const hue = fxOn(c, 'hue'); if (hue){ const h = fv(c, hue, 'hue', t), li = fv(c, hue, 'light', t), s2 = fv(c, hue, 'sat', t); if (h) f.push(`hue-rotate(${h}deg)`); if (li) f.push(`brightness(${100 + li}%)`); if (s2) f.push(`saturate(${100 + s2}%)`); }
  if (fxOn(c, 'bw')) f.push('grayscale(100%)');
  const se = fxOn(c, 'sepia'); if (se) f.push(`sepia(${fv(c, se, 'amount', t)}%)`);
  const inv = fxOn(c, 'invert'); if (inv) f.push(`invert(${100 - fv(c, inv, 'mix', t)}%)`);
  const ga = fxOn(c, 'gauss'); if (ga){ const a = fv(c, ga, 'amount', t); if (a > 0) f.push(`blur(${(a * .5 * sc).toFixed(2)}px)`); }
  const filt = f.length ? f.join(' ') : 'none';
  g.filter = filt;
  const cr = fxOn(c, 'crop'); let L = 0, T = 0, R = 0, B = 0;
  if (cr){ L = fv(c, cr, 'l', t) / 100; T = fv(c, cr, 't', t) / 100; R = fv(c, cr, 'r', t) / 100; B = fv(c, cr, 'b', t) / 100; }
  const sx = sw * L, sy = sh * T, sW = sw * (1 - L - R), sH = sh * (1 - T - B);
  if (sW > 1 && sH > 1){
    const x0 = -sw*fit/2 + sx*fit, y0 = -sh*fit/2 + sy*fit, dw = sW*fit, dh = sH*fit;
    const paint = (ctx, X, Y) => {
      const mo = fxOn(c, 'mosaic');
      if (mo){
        const bw = Math.max(1, Math.round(fv(c, mo, 'blocks', t))), bh = Math.max(1, Math.round(bw * sH / sW));
        OFF.width = bw; OFF.height = bh; OFF.getContext('2d').drawImage(src, sx, sy, sW, sH, 0, 0, bw, bh);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(OFF, X, Y, dw, dh); ctx.imageSmoothingEnabled = true;
      } else ctx.drawImage(src, sx, sy, sW, sH, X, Y, dw, dh);
      if (lu){
        ctx.filter = 'none';
        const temp = fv(c, lu, 'temp', t), vig = fv(c, lu, 'vig', t);
        if (temp){
          ctx.globalCompositeOperation = 'soft-light';
          ctx.fillStyle = temp > 0 ? `rgba(255,150,40,${Math.abs(temp) / 100 * .7})` : `rgba(40,130,255,${Math.abs(temp) / 100 * .7})`;
          ctx.fillRect(X, Y, dw, dh); ctx.globalCompositeOperation = 'source-over';
        }
        if (vig > 0){
          const cx = X + dw/2, cy = Y + dh/2, r1 = Math.hypot(dw, dh) / 2;
          const gr = ctx.createRadialGradient(cx, cy, r1 * (.75 - vig / 100 * .45), cx, cy, r1);
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${Math.min(1, vig / 100 * 1.1)})`);
          ctx.fillStyle = gr; ctx.fillRect(X, Y, dw, dh);
        }
      }
    };
    const masks = c.fx.filter(m => m.on && m.type === 'mask');
    const tint = lu && (fv(c, lu, 'temp', t) || fv(c, lu, 'vig', t));
    if (!masks.length && !tint) paint(g, x0, y0);
    else {
      // Máscaras de opacidad: se pinta el clip en un lienzo aparte y se recorta con la unión de las máscaras
      const pr = Math.max(.02, Math.min(sc, 4096 / Math.max(dw, dh)));
      const mw = Math.max(1, Math.ceil(dw * pr)), mh = Math.max(1, Math.ceil(dh * pr));
      if (MK.width !== mw || MK.height !== mh){ MK.width = mw; MK.height = mh; } else MK.getContext('2d').clearRect(0, 0, mw, mh);
      if (MM.width !== mw || MM.height !== mh){ MM.width = mw; MM.height = mh; } else MM.getContext('2d').clearRect(0, 0, mw, mh);
      const mg = MK.getContext('2d'); mg.setTransform(pr, 0, 0, pr, 0, 0); mg.filter = filt; paint(mg, 0, 0); mg.filter = 'none';
      const kg = MM.getContext('2d'); kg.setTransform(pr, 0, 0, pr, 0, 0); kg.globalCompositeOperation = 'source-over';
      const shape = (m, fill) => {
        const cx = dw/2 + fv(c, m, 'x', t) / 100 * dw, cy = dh/2 + fv(c, m, 'y', t) / 100 * dh;
        const rx = Math.max(.5, fv(c, m, 'w', t) / 200 * dw), ry = Math.max(.5, fv(c, m, 'h', t) / 200 * dh);
        const fe = fv(c, m, 'feather', t);
        kg.filter = fe > 0 ? `blur(${(fe * pr / 2).toFixed(2)}px)` : 'none';
        kg.fillStyle = `rgba(0,0,0,${clamp(fv(c, m, 'op', t) / 100, 0, 1)})`;
        kg.beginPath();
        if (m.p.shape === 'rect') kg.rect(cx - rx, cy - ry, rx * 2, ry * 2); else kg.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        kg.fill();
      };
      const pos = masks.filter(m => !m.p.invert), neg = masks.filter(m => m.p.invert);
      if (!pos.length){ kg.filter = 'none'; kg.fillStyle = '#000'; kg.fillRect(0, 0, dw, dh); }
      pos.forEach(m => shape(m));
      kg.globalCompositeOperation = 'destination-out'; neg.forEach(m => shape(m)); kg.globalCompositeOperation = 'source-over'; kg.filter = 'none';
      mg.setTransform(1, 0, 0, 1, 0, 0);
      if (masks.length){ mg.globalCompositeOperation = 'destination-in'; mg.drawImage(MM, 0, 0); mg.globalCompositeOperation = 'source-over'; }
      g.filter = 'none'; g.drawImage(MK, x0, y0, dw, dh);
    }
  }
  g.restore();
}
function textFont(p){ return `${p.italic ? 'italic ' : ''}${p.bold ? '700' : '400'} ${p.size}px "${p.font}", sans-serif`; }
function drawText(g, p){
  const lines = String(p.text ?? '').split('\n'), lh = p.size * 1.18;
  g.font = textFont(p); g.textAlign = p.align || 'center'; g.textBaseline = 'middle';
  const maxW = Math.max(0, ...lines.map(l => g.measureText(l).width));
  const h = lines.length * lh, y0 = -h/2 + lh/2;
  const ax = p.align === 'left' ? -maxW/2 : p.align === 'right' ? maxW/2 : 0;
  if (p.bg){ const pad = p.size * .3; g.save(); g.fillStyle = p.bgColor; g.globalAlpha *= .85; g.fillRect(-maxW/2 - pad, -h/2 - pad*.5, maxW + pad*2, h + pad); g.restore(); }
  if (p.shadow){ g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = p.size * .12; g.shadowOffsetY = p.size * .04; }
  if (p.stroke > 0){
    g.lineJoin = 'round'; g.lineWidth = p.stroke * 2; g.strokeStyle = p.strokeColor;
    lines.forEach((l, i) => g.strokeText(l, ax, y0 + i*lh));
    g.shadowColor = 'transparent';
  }
  g.fillStyle = p.color;
  lines.forEach((l, i) => g.fillText(l, ax, y0 + i*lh));
}
function textBox(p){
  const g = PG; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.font = textFont(p);
  const lines = String(p.text ?? '').split('\n');
  const w = Math.max(10, ...lines.map(l => g.measureText(l).width)); g.restore();
  return {w: w + (p.bg ? p.size * .6 : 0), h: lines.length * p.size * 1.18 + (p.bg ? p.size * .3 : 0)};
}
function clipBounds(c, t){
  const W = S.seq.w, H = S.seq.h, k = val(c, 'scale', t) / 100;
  let w, h;
  if (c.kind === 'text'){ const b = textBox(c.props); w = b.w * k; h = b.h * k; }
  else {
    const m = media(c.mediaId), r = ELS.get(c.id), el = r && r.el;
    const sw = (el && (el.videoWidth || el.naturalWidth)) || (m && m.w), sh = (el && (el.videoHeight || el.naturalHeight)) || (m && m.h);
    if (!sw || !sh) return null;
    const fit = Math.min(W / sw, H / sh) * k; w = sw * fit; h = sh * fit;
  }
  return {cx: W/2 + val(c, 'x', t), cy: H/2 + val(c, 'y', t), w, h, rot: val(c, 'rotation', t)};
}

/* ================================= reproducción ================================= */
let LAST = performance.now();
function play(){
  ensureAudio(); srcV.pause();
  const end = EXPORT ? EXPORT.end : seqEnd();
  if (end <= 0) return status('La secuencia está vacía');
  if (!EXPORT && S.t >= end - 1 / FPS) S.t = 0;
  S.rate = 1; S.playing = true; LAST = performance.now();
}
function pause(){ S.playing = false; S.rate = 1; }
function togglePlay(){ S.playing ? pause() : play(); }
function seek(t){ S.t = Math.max(0, q(t)); followPlayhead(); updatePlayhead(); }
function step(n){ pause(); seek(S.t + n / FPS); }
// J / K / L
function shuttle(dir){
  ensureAudio(); srcV.pause();
  if (dir === 0){ pause(); return; }
  if (!S.playing){
    if (dir > 0 && S.t >= seqEnd() - 1 / FPS) S.t = 0;
    S.rate = dir; S.playing = true; LAST = performance.now();
  } else S.rate = Math.sign(S.rate) === dir ? clamp(S.rate * 2, -8, 8) : dir;
  status(S.rate === 1 ? 'Reproduciendo' : `Reproducción ${S.rate > 0 ? '' : 'inversa '}${Math.abs(S.rate)}×`);
}

/* ================================ vúmetros ================================ */
const BUFS = new WeakMap();
function level(an){
  if (!an || !S.playing) return 0;
  let b = BUFS.get(an); if (!b){ b = new Float32Array(an.fftSize); BUFS.set(an, b); }
  an.getFloatTimeDomainData(b);
  let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  return clamp((20 * Math.log10(Math.sqrt(s / b.length) + 1e-9) + 60) / 60, 0, 1);
}
const MST = {lv:[], pk:[], pt:[]};
function drawMeter(cv, st, vals, labels){
  const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1; if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const n = vals.length, lw = labels ? 15 : 0, bw = Math.max(3, Math.floor((w - lw - (n - 1) * 2) / n));
  const grad = g.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, '#1f9d3a'); grad.addColorStop(.72, '#3ccf55'); grad.addColorStop(.86, '#e0c020'); grad.addColorStop(1, '#e03030');
  const now = performance.now();
  vals.forEach((v, i) => {
    st.lv[i] = Math.max(v, (st.lv[i] || 0) - .025);
    if (st.lv[i] >= (st.pk[i] || 0) || now - (st.pt[i] || 0) > 1500){ st.pk[i] = st.lv[i]; st.pt[i] = now; }
    const x = i * (bw + 2);
    g.fillStyle = '#0f0f0f'; g.fillRect(x, 0, bw, h);
    g.fillStyle = grad; g.fillRect(x, h - st.lv[i] * h, bw, st.lv[i] * h);
    if (st.pk[i] > .01){ g.fillStyle = '#e8e8e8'; g.fillRect(x, h - st.pk[i] * h, bw, 1); }
  });
  if (labels){
    g.fillStyle = '#6f6f6f'; g.font = '8px Inter, sans-serif'; g.textAlign = 'right';
    for (const db of [0,-6,-12,-18,-24,-30,-36,-42,-48,-54]){ const y = h - (db + 60) / 60 * h; g.fillText(String(db), w, clamp(y + 3, 7, h - 2)); }
  }
}

/* ================================== bucle ================================== */
function loop(now){
  const dt = Math.min(.25, (now - LAST) / 1000); LAST = now;
  if (S.playing){
    S.t += dt * S.rate;
    const end = EXPORT ? EXPORT.end : seqEnd();
    if (S.t >= end){ S.t = end; pause(); if (EXPORT) finishExport(); }
    else if (S.t <= 0 && S.rate < 0){ S.t = 0; pause(); }
    followPlayhead();
  }
  sync(); draw(); updatePlayhead();
  drawMeter($('#meterCv'), MST, [level(anL), level(anR)], true);
  tickPanels();
  if (EXPORT && EXPORT.bar){
    const f = clamp((S.t - EXPORT.start) / Math.max(1e-6, EXPORT.end - EXPORT.start), 0, 1);
    EXPORT.bar.style.width = f * 100 + '%';
    if (EXPORT.eta) EXPORT.eta.textContent = `${Math.round(f * 100)} % · ${tc(S.t - EXPORT.start)} de ${tc(EXPORT.end - EXPORT.start)}`;
  }
  requestAnimationFrame(loop);
}
