'use strict';
/* AuthenCut Pro · línea de tiempo: pistas, clips, regla e interacción con las herramientas */

const tracksEl = $('#tracks'), inner = $('#tracksInner'), RULER = $('#ruler');

/* ================================== pistas ================================== */
function buildTracks(){
  const heads = $('#heads'); heads.innerHTML = '';
  inner.querySelectorAll('.trow').forEach(n => n.remove());
  TRACKS.forEach((tr, i) => {
    const st = S.tracks[tr.id], v = isV(tr.id), sepa = tr.id === 'V1';
    const row = document.createElement('div');
    row.className = `trow ${v ? 'v' : 'a'}${sepa ? ' sepa' : ''}${st.lock ? ' lock' : ''}`;
    row.style.top = rowTop(i) + 'px'; row.style.height = rowH(i) + 'px';
    inner.prepend(row);
    const h = document.createElement('div'); h.className = 'head' + (sepa ? ' sepa' : ''); h.style.height = rowH(i) + 'px';
    h.innerHTML = `<button class="tb lk${st.lock ? ' on' : ''}" title="Alternar bloqueo de pista">${ICON.lock}</button><div class="tn">${tr.id}</div><span class="nm" title="${esc(st.name || '')}">${esc(st.name || (v ? 'Vídeo ' : 'Audio ') + tr.id.slice(1))}</span><span class="sp"></span>` +
      (v ? `<button class="tb ey${st.hide ? ' off' : ' on'}" title="Alternar salida de pista">${ICON.eye}</button>`
         : `<button class="tb mu${st.mute ? ' on' : ''}" title="Silenciar pista">M</button><button class="tb so${st.solo ? ' on' : ''}" title="Pista solo">S</button>`);
    h.querySelector('.lk').onclick = () => { st.lock = !st.lock; buildTracks(); renderTimeline(); };
    if (v) h.querySelector('.ey').onclick = () => { st.hide = !st.hide; buildTracks(); };
    else {
      h.querySelector('.mu').onclick = () => { st.mute = !st.mute; buildTracks(); buildMixer(); };
      h.querySelector('.so').onclick = () => { st.solo = !st.solo; buildTracks(); buildMixer(); };
    }
    const rz = document.createElement('div'); rz.className = 'rsz'; rz.title = 'Arrastra para cambiar la altura de la pista'; h.appendChild(rz);
    rz.onmousedown = e => {
      e.preventDefault(); e.stopPropagation(); const y0 = e.clientY, h0 = st.h || TH;
      const mv = ev => { st.h = clamp(Math.round(h0 + ev.clientY - y0), 30, 220); buildTracks(); renderTimeline(); };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); scheduleSave(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };
    h.ondblclick = e => { if (!e.target.closest('button')) setTrackHeight(tr.id, (st.h || TH) > TH ? TH : 100); };
    h.oncontextmenu = e => {
      e.preventDefault();
      ctxMenu(e.clientX, e.clientY, [
        ['Añadir pista de vídeo', '', () => addTracks(1, 0)], ['Añadir pista de audio', '', () => addTracks(0, 1)], ['Añadir pistas…', '', addTracksDialog], '-',
        ['Cambiar nombre…', '', () => renameTrack(tr.id)],
        [(st.h || TH) > TH ? 'Contraer pista' : 'Expandir pista', '', () => setTrackHeight(tr.id, (st.h || TH) > TH ? TH : 100)], '-',
        ['Eliminar pista', '', () => deleteTrack(tr.id)], ['Eliminar pistas vacías', '', deleteEmptyTracks]]);
    };
    heads.appendChild(h);
  });
  inner.style.height = rowTop(TRACKS.length) + 'px';
  scheduleSave();
}

/* =================================== clips =================================== */
function lighten(hex){ const n = parseInt(hex.slice(1), 16), f = v => Math.min(255, Math.round(v + (255 - v) * .28)); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; }
function transHTML(c, side){
  const tr = side === 'in' ? c.tIn : c.tOut;
  const on = S.selTrans && S.selTrans.id === c.id && S.selTrans.side === side;
  return `<div class="trans ${side}${on ? ' on' : ''}" data-side="${side}" style="width:${Math.max(5, tr.dur * S.zoom)}px" title="${esc(TRANS_NAMES[tr.type])} · ${tc(tr.dur)}">${esc(TRANS_NAMES[tr.type])}</div>`;
}
function renderTimeline(){
  const vw = tracksEl.clientWidth || 800;
  inner.style.width = Math.max(seqEnd() + 30, vw / S.zoom + 5) * S.zoom + 'px';
  inner.querySelectorAll('.clip,.gapsel').forEach(n => n.remove());
  $('#tlHint').style.display = S.clips.length ? 'none' : '';
  const frag = document.createDocumentFragment();
  for (const c of S.clips){
    const m = media(c.mediaId), row = rowOf(c.track), px = c.dur * S.zoom, sel = S.sel.has(c.id);
    const d = document.createElement('div');
    d.className = `clip k-${c.kind}${sel ? ' sel' : ''}${S.tracks[c.track].lock ? ' locked' : ''}${m && m.offline ? ' off' : ''}${c.disabled ? ' dis' : ''}`;
    d.dataset.id = c.id;
    d.style.left = c.start * S.zoom + 'px'; d.style.width = Math.max(3, px) + 'px'; d.style.top = rowTop(row) + 'px'; d.style.height = (rowH(row) - 2) + 'px';
    if (c.color) d.style.background = sel ? lighten(c.color) : c.color;
    const label = c.kind === 'text' ? (c.props.text || 'Título').split('\n')[0] : isNest(c) ? ((S.seqs.find(s => s.id === c.nestId) || {}).name || 'Secuencia') : (m ? m.name : 'Medio');
    const fxd = c.fx.length > 0 || Object.keys(c.kf).some(k => c.kf[k].length) || spd(c) !== 1;
    let html = `<div class="clabel"><span class="fxb${fxd ? ' on' : ''}">fx</span><span class="nmx">${c.link ? '<u>' : ''}${esc(label)}${c.link ? '</u>' : ''}${spd(c) !== 1 ? ` [${Math.round(spd(c) * 100)}%]` : ''}${m && m.offline ? ' (sin conexión)' : ''}</span></div>`;
    if ((c.kind === 'video' || c.kind === 'image') && m && m.thumb && px > 30) html += `<div class="cthumb" style="background-image:url(${m.thumb})"></div>`;
    if (c.tIn) html += transHTML(c, 'in');
    if (c.tOut && !nextOf(c)) html += transHTML(c, 'out');
    html += '<div class="ch l"></div><div class="ch r"></div>';
    d.innerHTML = html;
    if (isAud(c) && px > 4){ const cv = document.createElement('canvas'); drawWave(cv, c, m, px); d.appendChild(cv); }
    frag.appendChild(d);
  }
  if (S.gap){
    const g = document.createElement('div'); g.className = 'gapsel';
    g.style.left = S.gap.a * S.zoom + 'px'; g.style.width = (S.gap.b - S.gap.a) * S.zoom + 'px'; g.style.top = rowTop(rowOf(S.gap.track)) + 'px'; g.style.height = (rowH(rowOf(S.gap.track)) - 2) + 'px';
    frag.appendChild(g);
  }
  inner.appendChild(frag);
  const n = S.sel.size;
  $('#selInfo').textContent = S.selTrans ? 'Transición seleccionada' : S.gap ? `Hueco de ${tc(S.gap.b - S.gap.a)} seleccionado` : n ? `${n} clip${n > 1 ? 's' : ''} seleccionado${n > 1 ? 's' : ''}` : '';
  $('#seqInfo').textContent = `${S.seq.w}×${S.seq.h} · ${FPS} fps · Duración ${tc(seqEnd())}`;
  $('#prgDur').textContent = tc(seqEnd());
  renderEffects(); renderInfo(); updatePlayhead();
}
function drawWave(cv, c, m, px){
  const w = Math.min(Math.max(1, Math.round(px)), 6000), h = Math.max(10, rowH(rowOf(c.track)) - 18);
  cv.width = w; cv.height = h; cv.style.width = px + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d'), mid = h / 2, s = spd(c);
  if (m && m.peaks){
    g.fillStyle = 'rgba(205,255,220,.8)';
    for (let x = 0; x < w; x++){
      const t0 = c.in + (x / w) * c.dur * s, t1 = c.in + ((x + 1) / w) * c.dur * s;
      const a = Math.floor(t0 * m.pps), b = Math.max(a + 1, Math.floor(t1 * m.pps)); let mx = 0;
      for (let i = a; i < b && i < m.peaks.length; i++) if (m.peaks[i] > mx) mx = m.peaks[i];
      const y = Math.min(mid, mx * val(c, 'volume', c.start + (x / w) * c.dur) / 100 * mid);
      g.fillRect(x, mid - y, 1, Math.max(1, y * 2));
    }
  }
  // banda elástica del nivel de volumen
  const steps = hasKf(c, 'volume') ? Math.min(w, 400) : 1;
  g.strokeStyle = 'rgba(255,230,120,.9)'; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i <= steps; i++){
    const x = i / steps * w, y = h - clamp(val(c, 'volume', c.start + i / steps * c.dur) / 200, 0, 1) * h;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  if (hasKf(c, 'volume')){ g.fillStyle = '#ffe680'; for (const k of c.kf.volume) g.fillRect(k.t / c.dur * w - 2, h - clamp(k.v / 200, 0, 1) * h - 2, 4, 4); }
}

/* =================================== regla =================================== */
function drawRuler(){
  const w = tracksEl.clientWidth, h = 30, dpr = devicePixelRatio || 1;
  if (!w) return;
  if (RULER.width !== Math.round(w * dpr) || RULER.height !== h * dpr){ RULER.width = Math.round(w * dpr); RULER.height = h * dpr; RULER.style.width = w + 'px'; RULER.style.height = h + 'px'; }
  const g = RULER.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#1f1f1f'; g.fillRect(0, 0, w, h);
  const sl = tracksEl.scrollLeft, z = S.zoom;
  const steps = [1/FPS, 2/FPS, 5/FPS, 10/FPS, 15/FPS, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3600];
  const stp = steps.find(s => s * z >= 95) || 3600;
  const nMinor = [10, 5, 2].find(n => stp * z / n >= 7) || 1;
  const endX = seqEnd() * z - sl; g.fillStyle = '#2a2a2a'; g.fillRect(0, h - 4, Math.max(0, endX), 4);
  if (S.seqIn != null || S.seqOut != null){
    const a = (S.seqIn ?? 0) * z - sl, b = (S.seqOut ?? seqEnd()) * z - sl;
    g.fillStyle = 'rgba(74,163,255,.2)'; g.fillRect(a, 0, b - a, h);
    g.fillStyle = '#4aa3ff'; if (S.seqIn != null) g.fillRect(a, 0, 2, h); if (S.seqOut != null) g.fillRect(b - 2, 0, 2, h);
  }
  g.strokeStyle = '#5a5a5a'; g.fillStyle = '#9a9a9a'; g.font = '10px "Roboto Mono", monospace'; g.lineWidth = 1;
  const i0 = Math.floor(sl / z / stp);
  g.beginPath();
  for (let i = i0; ; i++){
    const t = i * stp, x = Math.round(t * z - sl) + .5; if (x > w) break;
    g.moveTo(x, 12); g.lineTo(x, h); g.fillText(tc(t), x + 3, 10);
    for (let k = 1; k < nMinor; k++){ const xm = Math.round((t + k * stp / nMinor) * z - sl) + .5; g.moveTo(xm, h - (k === nMinor / 2 ? 9 : 5)); g.lineTo(xm, h); }
  }
  g.stroke();
  for (const mk of S.markers){
    const x = mk.t * z - sl; if (x < -10 || x > w + 10) continue;
    g.fillStyle = mk.color; g.beginPath(); g.moveTo(x - 5, 0); g.lineTo(x + 5, 0); g.lineTo(x + 5, 7); g.lineTo(x, 12); g.lineTo(x - 5, 7); g.closePath(); g.fill();
  }
  const px = S.t * z - sl;
  if (px >= -8 && px <= w + 8){
    g.fillStyle = '#2d8ceb';
    g.beginPath(); g.moveTo(px - 6, 13); g.lineTo(px + 6, 13); g.lineTo(px + 6, 21); g.lineTo(px, 27); g.lineTo(px - 6, 21); g.closePath(); g.fill();
    g.fillRect(px - .5, 27, 1, 3);
  }
}
function updatePlayhead(){
  $('#playhead').style.left = S.t * S.zoom + 'px';
  const t = tc(S.t);
  if (!$('#prgTC').querySelector('input')) $('#prgTC').textContent = t;
  if (!$('#tlTC').querySelector('input')) $('#tlTC').textContent = t;
  const end = Math.max(seqEnd(), 1), bar = $('#prgBar'), w = bar.clientWidth - 16;
  bar.querySelector('.hd').style.left = (8 + clamp(S.t / end, 0, 1) * w) + 'px';
  const rng = bar.querySelector('.rng');
  if (S.seqIn != null || S.seqOut != null){ const a = S.seqIn ?? 0, b = S.seqOut ?? seqEnd(); rng.classList.remove('hidden'); rng.style.left = (8 + a / end * w) + 'px'; rng.style.width = Math.max(2, (b - a) / end * w) + 'px'; }
  else rng.classList.add('hidden');
  $('#playBtn').innerHTML = S.playing ? ICON.pause : ICON.play;
  drawRuler();
}
function followPlayhead(){
  const x = S.t * S.zoom, sl = tracksEl.scrollLeft, w = tracksEl.clientWidth;
  if (x > sl + w - 30 || x < sl) tracksEl.scrollLeft = Math.max(0, x - 40);
}
function setZoom(z, anchorX){
  const old = S.zoom; S.zoom = clamp(z, 2, 900);
  const ax = anchorX ?? (S.t * old - tracksEl.scrollLeft);
  const tAt = (tracksEl.scrollLeft + ax) / old;
  renderTimeline();
  tracksEl.scrollLeft = Math.max(0, tAt * S.zoom - ax);
  $('#zoom').value = Math.round(Math.log(S.zoom / 2) / Math.log(450) * 1000);
  $('#zoomLbl').textContent = S.zoom >= 100 ? num(S.zoom / FPS) + ' px/fotograma' : Math.round(S.zoom) + ' px/s';
  drawRuler(); scheduleSave();
}
const zoomBy = f => setZoom(S.zoom * f);
function zoomFit(){ setZoom((tracksEl.clientWidth - 40) / Math.max(seqEnd(), 5)); tracksEl.scrollLeft = 0; }

/* ================================ interacción ================================ */
let drag = null;
function posFrom(e){ const r = inner.getBoundingClientRect(); return {row: rowAt(e.clientY - r.top), t: (e.clientX - r.left) / S.zoom}; }
function linkedIds(c, e){
  const ids = [c.id];
  if (c.link && !e.altKey && S.linkedSel) S.clips.forEach(o => { if (o.link === c.link && o !== c) ids.push(o.id); });
  return ids;
}
function onTracksDown(e){
  if (e.button !== 0) return;
  ensureAudio(); FOCUS = 'timeline'; focusUI(); closeCtx();
  const {row, t} = posFrom(e), tool = S.tool;
  if (tool === 'hand'){ drag = {mode:'hand', x0:e.clientX, y0:e.clientY, sl:tracksEl.scrollLeft, st:tracksEl.scrollTop}; return; }
  if (tool === 'zoom'){ const r = tracksEl.getBoundingClientRect(); setZoom(S.zoom * (e.altKey ? 1 / 1.6 : 1.6), e.clientX - r.left); return; }
  if (tool === 'text'){ const tr = TRACKS[row]; addTitle(Math.max(0, t), tr && isV(tr.id) && !S.tracks[tr.id].lock ? tr.id : null); return; }
  const cEl = e.target.closest('.clip'), trEl = e.target.closest('.trans');
  if (trEl && cEl && tool !== 'razor'){
    const c = clip(cEl.dataset.id), side = trEl.dataset.side, tr = side === 'in' ? c.tIn : c.tOut;
    S.selTrans = {id:c.id, side}; S.sel.clear(); S.gap = null; renderTimeline(); renderEffects(true); setTab('fx');
    drag = {mode:'transDur', x0:e.clientX, c, side, d0:tr.dur, before:snap(), moved:false};
    return;
  }
  if (tool === 'trackfwd'){
    const trk = TRACKS[row] && TRACKS[row].id;
    S.sel = new Set(S.clips.filter(c => !S.tracks[c.track].lock && cend(c) > t + 1e-6 && (!e.shiftKey || c.track === trk)).map(c => c.id));
    S.selTrans = null; S.gap = null;
    if (!S.sel.size){ renderTimeline(); return; }
    const anchor = cEl ? cEl.dataset.id : [...S.sel].map(clip).sort((a, b) => a.start - b.start)[0].id;
    S.primary = anchor; startMove(e, anchor); renderTimeline(); renderEffects(); return;
  }
  if (!cEl){
    if (!e.shiftKey){ S.sel.clear(); S.selTrans = null; }
    const tr = TRACKS[row]; S.gap = tr && tool === 'select' ? gapAt(tr.id, t) : null;
    renderTimeline(); renderEffects(); return;
  }
  const c = clip(cEl.dataset.id);
  if (!c || S.tracks[c.track].lock) return;
  S.gap = null;
  if (tool === 'razor'){
    const tt = q(snapTime(t, new Set()).t);
    if (e.shiftKey) edit(() => splitAllAt(tt), 'Cuchilla en todas las pistas');
    else edit(() => splitClipAt(c, tt, !e.altKey), 'Cuchilla');
    status('Cortado en ' + tc(tt)); return;
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey){
    if (S.sel.has(c.id)){ linkedIds(c, e).forEach(id => S.sel.delete(id)); if (S.primary === c.id) S.primary = null; renderTimeline(); renderEffects(); return; }
    S.sel.add(c.id);
  }
  else if (!S.sel.has(c.id)){ S.sel.clear(); S.sel.add(c.id); }
  S.selTrans = null;
  if (!e.altKey) expandLinked();
  S.primary = c.id;
  const cls = e.target.classList, edge = cls.contains('l') ? 'l' : cls.contains('r') ? 'r' : null;
  if (e.detail === 2 && !edge && isNest(c)){ switchSeq(c.nestId); return; }
  if (e.detail === 2 && !edge && c.mediaId){ openSource(c.mediaId, c); renderTimeline(); renderEffects(); return; }
  if (tool === 'slip') startSlip(e, c);
  else if (edge && tool === 'rolling') startRoll(e, c, edge);
  else if (edge && tool === 'ripple') startTrim(e, c, edge, 'ripple');
  else if (edge && tool === 'rate') startTrim(e, c, edge, 'rate');
  else if (edge) startTrim(e, c, edge, 'trim');
  else if (tool === 'select'){
    if (isAud(c) && !hasKf(c, 'volume') && onVolLine(e, cEl, c)) drag = {mode:'vol', x0:e.clientX, y0:e.clientY, c, v0:c.props.volume, before:snap(), moved:false};
    else startMove(e, c.id);
  }
  renderTimeline(); renderEffects();
}
function startMove(e, anchorId){
  const ids = [...S.sel].filter(id => { const k = clip(id); return k && !S.tracks[k.track].lock; });
  drag = {mode:'move', x0:e.clientX, y0:e.clientY, before:snap(), anchor:anchorId, moved:false,
    orig: ids.map(id => { const k = clip(id); return {id, start:k.start, track:k.track}; })};
}
function startTrim(e, c, edge, kind){
  const ids = linkedIds(c, e);
  const orig = ids.map(id => { const k = clip(id); return {id, start:k.start, in:k.in, dur:k.dur, speed:spd(k), kf:JSON.stringify(k.kf)}; });
  const followers = {};
  if (kind === 'ripple') for (const o of orig){ const k = clip(o.id); followers[o.id] = S.clips.filter(x => x.track === k.track && !ids.includes(x.id) && x.start >= o.start + o.dur - 1e-6).map(x => ({id:x.id, start:x.start})); }
  drag = {mode:'trim', kind, edge, x0:e.clientX, y0:e.clientY, before:snap(), anchor:c.id, moved:false, orig, followers};
}
function startRoll(e, c, edge){
  const A = edge === 'r' ? c : prevOf(c), B = edge === 'r' ? nextOf(c) : c;
  if (!A || !B) return startTrim(e, c, edge, 'trim');
  const pairs = [[A, B]];
  if (!e.altKey && S.linkedSel && A.link) S.clips.forEach(o => { if (o.link === A.link && o !== A){ const nb = nextOf(o); if (nb) pairs.push([o, nb]); } });
  drag = {mode:'roll', x0:e.clientX, y0:e.clientY, before:snap(), moved:false, anchor:A.id,
    pairs: pairs.map(([a, b]) => ({a:a.id, b:b.id, aDur:a.dur, bStart:b.start, bIn:b.in, bDur:b.dur, bKf:JSON.stringify(b.kf)}))};
}
function startSlip(e, c){
  drag = {mode:'slip', x0:e.clientX, y0:e.clientY, before:snap(), moved:false, anchor:c.id,
    orig: linkedIds(c, e).map(id => ({id, in:clip(id).in}))};
}
function onVolLine(e, cEl, c){
  const r = cEl.getBoundingClientRect(), h = Math.max(10, rowH(rowOf(c.track)) - 18), y = e.clientY - r.top - 15;
  return Math.abs(y - (h - clamp(c.props.volume / 200, 0, 1) * h)) < 5;
}
function dragAlive(){
  if (!drag) return false;
  const ids = drag.orig ? drag.orig.map(o => o.id) : drag.pairs ? drag.pairs.flatMap(p => [p.a, p.b]) : drag.c ? [drag.c.id] : [];
  if (ids.some(id => !clip(id))){ drag = null; $('#snapLine').style.display = 'none'; renderTimeline(); return false; }
  return true;
}
function onMove(e){
  if (!dragAlive()) return;
  if (drag.mode === 'hand'){ tracksEl.scrollLeft = drag.sl - (e.clientX - drag.x0); tracksEl.scrollTop = drag.st - (e.clientY - drag.y0); return; }
  if (!drag.moved && Math.abs(e.clientX - drag.x0) < 3 && Math.abs(e.clientY - drag.y0 || 0) < 5) return;
  drag.moved = true;
  let d = (e.clientX - drag.x0) / S.zoom, snapAt = null;
  switch (drag.mode){
    case 'move': snapAt = dragMove(e, d); break;
    case 'trim': snapAt = dragTrim(d); break;
    case 'roll': snapAt = dragRoll(d); break;
    case 'slip': dragSlip(d); break;
    case 'vol': { const h = Math.max(10, rowH(rowOf(drag.c.track)) - 18); drag.c.props.volume = clamp(Math.round(drag.v0 - (e.clientY - drag.y0) / h * 200), 0, 400); status('Nivel de volumen: ' + dbStr(drag.c.props.volume / 100)); break; }
    case 'transDur': { if (S.tracks[drag.c.track].lock) break; const c = drag.c, tr = drag.side === 'in' ? c.tIn : c.tOut; if (tr){ tr.dur = q(clamp(drag.d0 + (drag.side === 'in' ? d : -d), 1 / FPS, c.dur)); status('Duración de la transición: ' + tc(tr.dur)); } break; }
  }
  const sl = $('#snapLine');
  if (snapAt != null){ sl.style.display = 'block'; sl.style.left = snapAt * S.zoom + 'px'; } else sl.style.display = 'none';
  renderTimeline();
}
function dragMove(e, d){
  const ids = new Set(drag.orig.map(o => o.id)), a = drag.orig.find(o => o.id === drag.anchor) || drag.orig[0];
  if (!a) return null;
  const r = snapTime(a.start + d, ids, [0, clip(a.id).dur]); d = r.t - a.start;
  const minS = Math.min(...drag.orig.map(o => o.start)); if (minS + d < 0) d = -minS;
  const ir = inner.getBoundingClientRect(); let dRow = rowAt(e.clientY - ir.top) - rowAt(drag.y0 - ir.top);
  const aType = isV(a.track);
  for (const o of drag.orig){ if (isV(o.track) !== aType) continue; const rows = aType ? VROWS : AROWS, r0 = rowOf(o.track); dRow = clamp(dRow, rows[0] - r0, rows[rows.length - 1] - r0); }
  for (const o of drag.orig){
    const k = clip(o.id); k.start = q(o.start + d);
    if (isV(o.track) === aType){ const nt = TRACKS[rowOf(o.track) + dRow].id; k.track = S.tracks[nt].lock ? o.track : nt; }
  }
  status(`Desplazamiento: ${d >= 0 ? '+' : '-'}${tc(Math.abs(d))}`);
  return r.at;
}
function dragTrim(d){
  const a = drag.orig.find(o => o.id === drag.anchor) || drag.orig[0];
  const L = drag.edge === 'l', kind = drag.kind, ids = new Set(drag.orig.map(o => o.id));
  let r;
  if (L){ r = kind === 'ripple' ? {t:a.start + d, at:null} : snapTime(a.start + d, ids); d = r.t - a.start; }
  else { r = snapTime(a.start + a.dur + d, ids); d = r.t - a.start - a.dur; }
  let lo = -Infinity, hi = Infinity;
  for (const o of drag.orig){
    const k = clip(o.id), m = media(k.mediaId), s = o.speed;
    if (kind === 'rate'){
      const srcLen = o.dur * s, minD = Math.max(1 / FPS, srcLen / 100), maxD = srcLen / .01;
      if (L){ lo = Math.max(lo, o.dur - maxD, -o.start); hi = Math.min(hi, o.dur - minD); }
      else { lo = Math.max(lo, minD - o.dur); hi = Math.min(hi, maxD - o.dur); }
    } else if (L){
      if (hasSrc(k)) lo = Math.max(lo, -o.in / s);
      if (kind !== 'ripple') lo = Math.max(lo, -o.start);
      hi = Math.min(hi, o.dur - 1 / FPS);
    } else {
      lo = Math.max(lo, -(o.dur - 1 / FPS));
      { const mx = srcMax(k); if (mx != null) hi = Math.min(hi, (mx - o.in) / s - o.dur); }
    }
  }
  d = lo > hi ? 0 : clamp(d, lo, hi);
  for (const o of drag.orig){
    const k = clip(o.id), s = o.speed;
    k.kf = JSON.parse(o.kf);
    if (kind === 'rate'){
      const nd = q(L ? o.dur - d : o.dur + d);
      k.speed = o.dur * s / nd; k.dur = nd; if (L) k.start = q(o.start + d);
      scaleKf(k, nd / o.dur);
    } else if (L){
      k.in = hasSrc(k) ? Math.max(0, o.in + d * s) : 0; k.dur = q(o.dur - d); shiftKf(k, -d);
      if (kind !== 'ripple') k.start = q(o.start + d);
    } else k.dur = q(o.dur + d);
    if (k.tIn && k.tIn.dur > k.dur) k.tIn.dur = k.dur;
    if (k.tOut && k.tOut.dur > k.dur) k.tOut.dur = k.dur;
    if (kind === 'ripple'){ const delta = L ? -d : d; for (const f of drag.followers[o.id]){ const x = clip(f.id); if (x) x.start = q(f.start + delta); } }
  }
  const k = clip(drag.anchor);
  status(kind === 'rate' ? `Ajuste de velocidad: ${Math.round(spd(k) * 100)} % · ${tc(k.dur)}` : `${kind === 'ripple' ? 'Edición de ondulación' : 'Recortar'} · Duración ${tc(k.dur)}`);
  return r.at;
}
function dragRoll(d){
  const p0 = drag.pairs[0], A0 = clip(p0.a);
  const r = snapTime(A0.start + p0.aDur + d, new Set(drag.pairs.flatMap(p => [p.a, p.b])));
  d = r.t - A0.start - p0.aDur;
  let lo = -Infinity, hi = Infinity;
  for (const p of drag.pairs){
    const A = clip(p.a), B = clip(p.b), mA = media(A.mediaId);
    lo = Math.max(lo, -(p.aDur - 1 / FPS));
    { const mx = srcMax(A); if (mx != null) hi = Math.min(hi, (mx - A.in) / spd(A) - p.aDur); }
    hi = Math.min(hi, p.bDur - 1 / FPS);
    if (hasSrc(B)) lo = Math.max(lo, -p.bIn / spd(B));
  }
  d = lo > hi ? 0 : clamp(d, lo, hi);
  for (const p of drag.pairs){
    const A = clip(p.a), B = clip(p.b);
    A.dur = q(p.aDur + d); clampTrans(A);
    B.start = q(p.bStart + d); B.in = hasSrc(B) ? Math.max(0, p.bIn + d * spd(B)) : 0; B.dur = q(p.bDur - d);
    B.kf = JSON.parse(p.bKf); shiftKf(B, -d); clampTrans(B);
  }
  status(`Edición de rodillo: ${d >= 0 ? '+' : '-'}${tc(Math.abs(d))}`);
  return r.at;
}
function dragSlip(d){
  let lo = -Infinity, hi = Infinity;
  for (const o of drag.orig){
    const k = clip(o.id), mx = srcMax(k), s = spd(k);
    if (!hasSrc(k) || mx == null) continue;
    hi = Math.min(hi, o.in / s); lo = Math.max(lo, (o.in - (mx - k.dur * s)) / s);
  }
  d = lo > hi ? 0 : clamp(d, lo, hi);
  for (const o of drag.orig){ const k = clip(o.id); if (hasSrc(k)) k.in = Math.max(0, o.in - d * spd(k)); }
  const k = clip(drag.anchor);
  status(`Desplazar · Entrada ${tc(k.in)} · Salida ${tc(k.in + k.dur * spd(k))}`);
}
function onUp(){
  if (!dragAlive()) return;
  $('#snapLine').style.display = 'none';
  const labels = {move:'Mover', roll:'Edición de rodillo', slip:'Desplazar', vol:'Nivel de volumen', transDur:'Duración de la transición'};
  if (drag.moved && drag.mode !== 'hand'){
    const label = drag.mode === 'trim' ? {trim:'Recortar', ripple:'Edición de ondulación', rate:'Ajuste de velocidad'}[drag.kind] : labels[drag.mode];
    if (drag.mode === 'move' || (drag.mode === 'trim' && drag.kind !== 'ripple')) overwrite(drag.orig.map(o => o.id));
    cleanLinks(); commit(drag.before, label); refresh(true);
  }
  drag = null;
}

/* ============================ arrastrar y soltar ============================ */
function onDragOver(e){
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  if (DRAGFX){
    const el = document.elementFromPoint(e.clientX, e.clientY), cEl = el && el.closest('.clip');
    inner.querySelectorAll('.drop-fx').forEach(n => { if (n !== cEl) n.classList.remove('drop-fx'); });
    if (cEl) cEl.classList.add('drop-fx');
    return;
  }
  const {row, t} = posFrom(e), m = media(DRAGMEDIA), gh = $('#ghost'), sqd = String(DRAGMEDIA || '').startsWith('seq:') ? seqEndOf(seqById(DRAGMEDIA.slice(4))) : null;
  const st = snapTime(Math.max(0, t), new Set()).t;
  const dur = DRAGRANGE ? DRAGRANGE.out - DRAGRANGE.in : sqd != null ? sqd : m ? srcDurOf(m) : 5;
  gh.style.display = 'block'; gh.style.left = st * S.zoom + 'px'; gh.style.width = dur * S.zoom + 'px'; const gr = clamp(row, 0, TRACKS.length - 1); gh.style.top = rowTop(gr) + 1 + 'px'; gh.style.height = (rowH(gr) - 2) + 'px';
}
async function onDrop(e){
  e.preventDefault(); $('#ghost').style.display = 'none';
  inner.querySelectorAll('.drop-fx').forEach(n => n.classList.remove('drop-fx'));
  if (DRAGFX){
    const key = DRAGFX; DRAGFX = null;
    if (key.startsWith('g:')){ const {row, t} = posFrom(e), tr = TRACKS[row]; return addTemplate(key.slice(2), Math.max(0, q(snapTime(t, new Set()).t)), tr && isV(tr.id) && !S.tracks[tr.id].lock ? tr.id : null); }
    const el = document.elementFromPoint(e.clientX, e.clientY), cEl = el && el.closest('.clip');
    const c = cEl && clip(cEl.dataset.id); if (!c) return toast('Suelta el efecto sobre un clip');
    if (key.startsWith('t:')){ const r = cEl.getBoundingClientRect(); applyTransition(c, e.clientX - r.left < r.width / 2 ? 'in' : 'out', key.slice(2)); }
    else applyEffect(c, key.slice(2));
    return;
  }
  const {row, t} = posFrom(e); let mid = DRAGMEDIA; const range = DRAGRANGE; DRAGMEDIA = null; DRAGRANGE = null;
  if (!mid && e.dataTransfer.files.length){ const ms = await importFiles(e.dataTransfer.files); mid = ms[0] && ms[0].id; }
  if (mid) placeMedia(mid, row, t, e.ctrlKey || e.metaKey, range);
}

/* ============================== menú contextual ============================== */
function onTracksCtx(e){
  e.preventDefault(); FOCUS = 'timeline'; focusUI();
  const cEl = e.target.closest('.clip'), trEl = e.target.closest('.trans');
  if (trEl && cEl){
    S.selTrans = {id:cEl.dataset.id, side:trEl.dataset.side}; S.sel.clear(); renderTimeline(); renderEffects(true);
    return ctxMenu(e.clientX, e.clientY, [['Establecer duración de la transición…', '', transDurDialog], ['Borrar', 'Supr', del]]);
  }
  if (!cEl){
    const {row, t} = posFrom(e), tr = TRACKS[row], g = tr && gapAt(tr.id, t);
    if (g){ S.gap = g; S.sel.clear(); renderTimeline(); }
    return ctxMenu(e.clientX, e.clientY, [['Eliminar con ondulación', '', () => g && rippleDeleteGap(g), !g], '-', ['Pegar', 'Ctrl+V', () => paste(false), !S.clipboard], ['Pegar inserción', 'Ctrl+Mayús+V', () => paste(true), !S.clipboard]]);
  }
  const c = clip(cEl.dataset.id); if (!c) return;
  if (!S.sel.has(c.id)){ S.sel.clear(); S.sel.add(c.id); expandLinked(); S.primary = c.id; }
  S.selTrans = null; S.gap = null; renderTimeline(); renderEffects();
  const linked = [...S.sel].some(id => { const k = clip(id); return k && k.link; });
  ctxMenu(e.clientX, e.clientY, [
    ['Cortar', 'Ctrl+X', cut], ['Copiar', 'Ctrl+C', copy], ['Pegar', 'Ctrl+V', () => paste(false), !S.clipboard],
    ['Pegar atributos…', 'Ctrl+Alt+V', pasteAttributes, !S.clipboard], ['Eliminar atributos…', '', removeAttributes],
    ['Borrar', 'Supr', del], ['Eliminar con ondulación', 'Mayús+Supr', rippleDel], '-',
    ['Habilitar', 'Mayús+E', toggleEnable, false, !c.disabled],
    [linked ? 'Desvincular' : 'Vincular', 'Ctrl+L', toggleLink, !linked && S.sel.size < 2], '-',
    ['Velocidad/duración…', 'Ctrl+R', speedDialog], ['Anidar…', '', nestSelection],
    ...(isNest(c) ? [['Abrir secuencia anidada', '', () => switchSeq(c.nestId)]] : []),
    ['Ajustar al tamaño del fotograma', '', () => scaleToFrame(false), !(c.kind === 'video' || c.kind === 'image')],
    ['Rellenar el fotograma', '', () => scaleToFrame(true), !(c.kind === 'video' || c.kind === 'image')],
    ['Aplicar transición predeterminada', 'Ctrl+D', () => applyDefaultTransitions(isAud(c) ? 'a' : 'v')], '-',
    ['Mostrar en el proyecto', '', () => { S.projSel = c.mediaId; setBotTab('project'); renderProject(); }, !c.mediaId],
    ['Abrir en el Monitor de origen', '', () => openSource(c.mediaId, c), !c.mediaId], '-',
    {swatches: setColor}
  ]);
}

/* ============================== regla y barras ============================== */
function dragArea(el, fn, start){
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return; e.preventDefault(); if (start) start(); fn(e);
    const mv = ev => fn(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });
}
function dragBar(el, fn, start){ dragArea(el, e => { const r = el.getBoundingClientRect(); fn(clamp((e.clientX - r.left - 8) / (r.width - 16), 0, 1)); }, start); }
function initRuler(){
  RULER.addEventListener('mousedown', e => {
    if (e.button !== 0) return; e.preventDefault(); pause(); FOCUS = 'timeline'; focusUI();
    const r = RULER.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, sl = tracksEl.scrollLeft;
    const mk = y < 14 ? S.markers.find(m => Math.abs(m.t * S.zoom - sl - x) < 6) : null;
    if (mk){
      if (e.detail === 2) return editMarker(mk.id);
      seek(mk.t);
      const before = snap(), x0 = e.clientX, t0 = mk.t; let moved = false;
      const mv = ev => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (!moved) return; mk.t = q(Math.max(0, t0 + (ev.clientX - x0) / S.zoom)); drawRuler(); };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (moved){ S.markers.sort((a, b) => a.t - b.t); commit(before, 'Mover marcador'); renderMarkers(); } };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      return;
    }
    const f = ev => { let t = (ev.clientX - r.left + tracksEl.scrollLeft) / S.zoom; if (ev.shiftKey) t = snapTime(t, new Set()).t; seek(Math.max(0, t)); };
    f(e);
    const up = () => { window.removeEventListener('mousemove', f); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', f); window.addEventListener('mouseup', up);
  });
}
function initTimeline(){
  tracksEl.addEventListener('mousedown', onTracksDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  tracksEl.addEventListener('scroll', () => { $('#heads').scrollTop = tracksEl.scrollTop; drawRuler(); });
  tracksEl.addEventListener('wheel', e => {
    if (e.altKey || e.ctrlKey || e.metaKey){ e.preventDefault(); const r = tracksEl.getBoundingClientRect(); setZoom(S.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left); }
    else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)){ e.preventDefault(); tracksEl.scrollLeft += e.deltaY; }
  }, {passive:false});
  $('#heads').addEventListener('wheel', e => { tracksEl.scrollTop += e.deltaY; }, {passive:true});
  tracksEl.addEventListener('dragover', onDragOver);
  tracksEl.addEventListener('dragleave', e => { if (!tracksEl.contains(e.relatedTarget)){ $('#ghost').style.display = 'none'; inner.querySelectorAll('.drop-fx').forEach(n => n.classList.remove('drop-fx')); } });
  tracksEl.addEventListener('drop', onDrop);
  tracksEl.addEventListener('contextmenu', onTracksCtx);
  initRuler();
  dragBar($('#prgBar'), f => seek(f * Math.max(seqEnd(), 1)), () => pause());
  $('#zoom').addEventListener('input', e => setZoom(2 * Math.pow(450, e.target.value / 1000)));
}
