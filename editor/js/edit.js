'use strict';
/* AuthenCut Pro · operaciones de edición */

/* ============================ sobrescribir y dividir ============================ */
function overwrite(ids){
  const set = new Set(ids);
  for (const id of ids){
    const c = clip(id); if (!c) continue;
    const s = c.start, e = cend(c);
    for (const o of [...S.clips]){
      if (set.has(o.id) || o.track !== c.track) continue;
      const os = o.start, oe = cend(o);
      if (oe <= s + 1e-6 || os >= e - 1e-6) continue;
      if (os >= s - 1e-6 && oe <= e + 1e-6) S.clips = S.clips.filter(x => x !== o);
      else if (os < s && oe > e){
        const r = cloneClip(o); r.link = null;
        r.start = q(e); r.in = o.in + (e - os) * spd(o); r.dur = q(oe - e); shiftKf(r, -(e - os)); r.tIn = null;
        o.dur = q(s - os); o.tOut = null; clampTrans(o); clampTrans(r); S.clips.push(r);
      } else if (os < s){ o.dur = q(s - os); o.tOut = null; clampTrans(o); }
      else { o.in += (e - os) * spd(o); shiftKf(o, -(e - os)); o.dur = q(oe - e); o.start = q(e); o.tIn = null; clampTrans(o); }
    }
  }
}
function splitClipAt(c, t, linked = true, map = null){
  const parts = [c];
  if (linked && c.link) S.clips.forEach(o => { if (o !== c && o.link === c.link) parts.push(o); });
  const nl = nid('l'); let did = false;
  for (const p of parts){
    const e = cend(p);
    if (t <= p.start + 1e-6 || t >= e - 1e-6) continue;
    const r = cloneClip(p), off = t - p.start;
    r.start = q(t); r.in = p.in + off * spd(p); r.dur = q(e - t); shiftKf(r, -off); r.tIn = null;
    r.link = !p.link ? null : map ? (map[p.link] || (map[p.link] = nid('l'))) : (linked && parts.length > 1 ? nl : null);
    p.dur = q(off); p.tOut = null; clampTrans(p); clampTrans(r);
    S.clips.push(r); did = true;
  }
  return did;
}
function splitAllAt(t){ const map = {}; for (const c of [...S.clips]) if (!S.tracks[c.track].lock) splitClipAt(c, t, false, map); }
function splitAtPlayhead(all){
  const t = q(S.t);
  if (all || !S.sel.size) edit(() => splitAllAt(t), all ? 'Añadir edición a todas las pistas' : 'Añadir edición');
  else edit(() => { [...S.sel].map(clip).forEach(c => c && splitClipAt(c, t, true)); }, 'Añadir edición');
  status('Edición añadida en ' + tc(t));
}
function expandLinked(){
  if (!S.linkedSel) return;
  for (const id of [...S.sel]){ const c = clip(id); if (c && c.link) S.clips.forEach(o => { if (o.link === c.link) S.sel.add(o.id); }); }
}

/* ================================ borrar y huecos ================================ */
function del(){
  if (FOCUS === 'project' && S.projSel) return removeMedia(S.projSel);
  if (S.selTrans){
    const c = clip(S.selTrans.id), side = S.selTrans.side; S.selTrans = null;
    if (c) edit(() => { if (side === 'in') c.tIn = null; else c.tOut = null; }, 'Borrar transición');
    return;
  }
  if (S.gap && !S.sel.size) return rippleDeleteGap(S.gap);
  if (!S.sel.size) return;
  edit(() => { S.clips = S.clips.filter(c => !S.sel.has(c.id) || S.tracks[c.track].lock); S.sel.clear(); }, 'Borrar');
}
function rippleDel(){
  if (S.gap && !S.sel.size) return rippleDeleteGap(S.gap);
  if (!S.sel.size) return;
  edit(() => {
    const gone = S.clips.filter(c => S.sel.has(c.id) && !S.tracks[c.track].lock);
    S.clips = S.clips.filter(c => !gone.includes(c));
    // agrupa los rangos (un clip de vídeo y su audio vinculado cuentan una sola vez)
    const ranges = [];
    for (const g of gone){ const r = ranges.find(x => Math.abs(x.a - g.start) < 1e-6 && Math.abs(x.b - cend(g)) < 1e-6); if (r) r.tracks.add(g.track); else ranges.push({a:g.start, b:cend(g), tracks:new Set([g.track])}); }
    ranges.sort((x, y) => y.a - x.a);
    let warned = false;
    for (const r of ranges){
      const len = r.b - r.a;
      const blocked = S.clips.some(c => !r.tracks.has(c.track) && !S.tracks[c.track].lock && c.start < r.b - 1e-6 && cend(c) > r.a + 1e-6);
      if (blocked && !warned){ warned = true; toast('Hay clips en otras pistas en ese rango: solo se cierra el hueco en la pista del clip'); }
      for (const c of S.clips) if (!S.tracks[c.track].lock && (!blocked || r.tracks.has(c.track)) && c.start >= r.b - 1e-6) c.start = q(c.start - len);
    }
    S.sel.clear();
  }, 'Eliminar con ondulación');
}
function gapAt(track, t){
  if (t < 0) return null;
  const cs = S.clips.filter(c => c.track === track).sort((a, b) => a.start - b.start);
  let a = 0;
  for (const c of cs){
    if (t < c.start) return c.start - a > .5 / FPS ? {track, a, b:c.start} : null;
    a = Math.max(a, cend(c));
    if (t < a) return null;
  }
  return null;
}
function rippleDeleteGap(g){
  const len = g.b - g.a;
  const blocked = S.clips.some(c => c.track !== g.track && !S.tracks[c.track].lock && c.start < g.b - 1e-6 && cend(c) > g.a + 1e-6);
  if (blocked) return toast('No se puede eliminar el hueco: hay clips en otras pistas que lo atraviesan');
  edit(() => { for (const c of S.clips) if (!S.tracks[c.track].lock && c.start >= g.b - 1e-6) c.start = q(c.start - len); }, 'Eliminar hueco con ondulación');
  S.gap = null; renderTimeline();
}

/* ============================ portapapeles y selección ============================ */
function copy(){
  const cs = [...S.sel].map(clip).filter(Boolean); if (!cs.length) return;
  const t0 = Math.min(...cs.map(c => c.start));
  S.clipboard = cs.map(c => ({...JSON.parse(JSON.stringify(c)), start: c.start - t0}));
  status(cs.length + ' clip(s) copiado(s)');
}
function cut(){
  copy();
  if (S.sel.size) edit(() => { S.clips = S.clips.filter(c => !S.sel.has(c.id) || S.tracks[c.track].lock); S.sel.clear(); }, 'Cortar');
}
function paste(insert){
  if (!S.clipboard) return;
  const t = q(S.t), len = Math.max(...S.clipboard.map(c => c.start + c.dur));
  edit(() => {
    const map = {};
    const cs = S.clipboard.map(c => {
      const n = normalizeClip(JSON.parse(JSON.stringify(c))); n.id = nid(); n.start = q(t + c.start);
      if (n.link) n.link = map[n.link] || (map[n.link] = nid('l'));
      return n;
    }).filter(c => !S.tracks[c.track].lock);
    if (insert){ splitAllAt(t); for (const c of S.clips) if (!S.tracks[c.track].lock && c.start >= t - 1e-6) c.start = q(c.start + len); }
    S.clips.push(...cs); if (!insert) overwrite(cs.map(c => c.id));
    S.sel = new Set(cs.map(c => c.id)); S.selTrans = null;
  }, insert ? 'Pegar inserción' : 'Pegar');
  seek(t + len);
}
function selectAll(){ S.sel = new Set(S.clips.map(c => c.id)); S.selTrans = null; renderTimeline(); renderEffects(); }
function deselectAll(){ S.sel.clear(); S.selTrans = null; S.gap = null; renderTimeline(); renderEffects(); }
function toggleLink(){
  const cs = [...S.sel].map(clip).filter(Boolean); if (!cs.length) return;
  if (cs.some(c => c.link)) edit(() => cs.forEach(c => c.link = null), 'Desvincular');
  else if (cs.length > 1){ const l = nid('l'); edit(() => cs.forEach(c => c.link = l), 'Vincular'); }
}
function toggleEnable(){
  const cs = [...S.sel].map(clip).filter(c => c && !S.tracks[c.track].lock); if (!cs.length) return;
  const on = cs.some(c => c.disabled);
  edit(() => cs.forEach(c => c.disabled = !on), on ? 'Habilitar' : 'Deshabilitar');
}
function setColor(color){ edit(() => [...S.sel].map(clip).forEach(c => { if (c && !S.tracks[c.track].lock) c.color = color; }), 'Etiqueta'); }

/* ==================================== títulos ==================================== */
function addTitle(at, track, x, y, setup, label){
  const t = q(at ?? S.t);
  let tr = track && !S.tracks[track].lock ? track : null;
  const order = [...videoIds()].reverse(); if (order.length > 1) order.push(order.shift()); // V2, V3…, y V1 al final
  if (!tr) tr = order.find(id => !S.tracks[id].lock && !S.clips.some(c => c.track === id && t < cend(c) && t + 5 > c.start))
    || order.find(id => !S.tracks[id].lock);
  if (!tr){ toast('Todas las pistas de vídeo están bloqueadas'); return null; }
  let c = null;
  edit(() => {
    c = newClip('text', null, tr, t, 0, 5); c.props.x = Math.round(x || 0); c.props.y = Math.round(y || 0);
    if (setup) setup(c);
    S.clips.push(c); overwrite([c.id]); S.sel = new Set([c.id]); S.primary = c.id; S.selTrans = null;
  }, label || 'Nuevo título');
  setTab('fx'); setTool('select'); status('Título añadido en ' + tr);
  return c;
}

/* ================================== transiciones ================================== */
const VTRANS = {dissolve:'Disolución cruzada', dipBlack:'Pasar a negro', dipWhite:'Pasar a blanco', wipe:'Barrido', push:'Empujar', slide:'Deslizar', iris:'Iris redondo'};
const ATRANS = {power:'Potencia constante', gain:'Ganancia constante', expo:'Fundido exponencial'};
const TRANS_NAMES = {...VTRANS, ...ATRANS};
function applyTransition(c, side, type, dur){
  const isA = type in ATRANS;
  if (S.tracks[c.track].lock){ toast('La pista está bloqueada'); return null; }
  if (isA !== isAud(c)){ toast(isA ? 'Las transiciones de audio se aplican a clips de audio' : 'Las transiciones de vídeo se aplican a clips de vídeo, imágenes o títulos'); return null; }
  let target = c, s = side;
  if (side === 'out'){ const n = nextOf(c); if (n){ target = n; s = 'in'; } }
  const d = q(clamp(dur || 1, 1 / FPS, target.dur));
  edit(() => { if (s === 'in') target.tIn = {type, dur:d}; else target.tOut = {type, dur:d}; }, 'Aplicar ' + TRANS_NAMES[type]);
  S.selTrans = {id:target.id, side:s}; S.sel.clear(); renderTimeline(); renderEffects(true);
  return target;
}
function applyDefaultTransitions(mode){
  const want = c => mode === 'both' || (mode === 'a') === isAud(c);
  const def = c => ({type: isAud(c) ? 'power' : 'dissolve', dur: q(Math.min(1, c.dur))});
  const t = q(S.t); let n = 0;
  edit(() => {
    if (S.sel.size){
      for (const c of [...S.sel].map(clip)) if (c && want(c)){ if (!c.tIn){ c.tIn = def(c); n++; } if (!nextOf(c) && !c.tOut){ c.tOut = def(c); n++; } }
    } else {
      const pts = editPoints(); const best = pts.reduce((b, p) => Math.abs(p - t) < Math.abs(b - t) ? p : b, pts[0] ?? 0);
      for (const c of S.clips){
        if (S.tracks[c.track].lock || !want(c)) continue;
        if (Math.abs(c.start - best) < 1e-3){ c.tIn = def(c); n++; }
        else if (Math.abs(cend(c) - best) < 1e-3 && !nextOf(c)){ c.tOut = def(c); n++; }
      }
    }
  }, 'Aplicar transición predeterminada');
  status(n ? `Transición predeterminada aplicada (${n})` : 'No hay ningún punto de edición donde aplicarla');
}
function transDurDialog(){
  const st = S.selTrans; if (!st) return;
  const c = clip(st.id), tr = c && (st.side === 'in' ? c.tIn : c.tOut); if (!tr) return;
  modal('Establecer duración de la transición', `<label>Duración<input id="tdD" value="${tc(tr.dur)}"></label>`,
    [['Cancelar'], ['Aceptar', m => { const d = parseTCInput(m.querySelector('#tdD').value); if (d > 0) edit(() => { tr.dur = q(clamp(d, 1 / FPS, c.dur)); }, 'Duración de la transición'); }, true]]);
}

/* ==================================== efectos ==================================== */
// [etiqueta, parámetro, mín, máx, paso, unidad, valor por defecto]
const FXLIB = {
  lumetri: {name:'Color Lumetri', params:[['Exposición','exp',-4,4,.01,'',0],['Contraste','con',-100,100,.5,'',0],['Saturación','sat',0,200,.5,'',100],['Temperatura','temp',-100,100,.5,'',0],['Viñeta','vig',0,100,.5,'',0]]},
  bc: {name:'Brillo y contraste', params:[['Brillo','b',-100,100,.5,'',0],['Contraste','c',-100,100,.5,'',0]]},
  bw: {name:'Blanco y negro', params:[]},
  sepia: {name:'Sepia', params:[['Cantidad','amount',0,100,.5,' %',100]]},
  hue: {name:'Balance de color (HLS)', params:[['Tono','hue',-180,180,.5,'°',0],['Luminosidad','light',-100,100,.5,'',0],['Saturación','sat',-100,100,.5,'',0]]},
  invert: {name:'Invertir', params:[['Mezclar con el original','mix',0,100,.5,' %',0]]},
  gauss: {name:'Desenfoque gaussiano', params:[['Desenfoque','amount',0,300,.5,'',20]]},
  mosaic: {name:'Mosaico', params:[['Bloques horizontales','blocks',2,300,1,'',40]]},
  crop: {name:'Recortar', params:[['Izquierda','l',0,100,.1,' %',0],['Superior','t',0,100,.1,' %',0],['Derecha','r',0,100,.1,' %',0],['Inferior','b',0,100,.1,' %',0]]},
  hflip: {name:'Voltear horizontal', params:[]},
  vflip: {name:'Voltear vertical', params:[]},
  amp: {name:'Amplificar', audio:true, params:[['Ganancia','db',-24,24,.1,' dB',0]]},
  mask: {name:'Máscara de opacidad', opts:{shape:'ellipse', invert:false}, params:[['Centro X','x',-100,100,.1,' %',0],['Centro Y','y',-100,100,.1,' %',0],['Ancho','w',1,300,.1,' %',60],['Alto','h',1,300,.1,' %',60],['Desvanecimiento','feather',0,600,1,' px',40],['Opacidad de la máscara','op',0,100,.5,' %',100]]}
};
function applyEffect(c, type){
  const d = FXLIB[type]; if (!d || !c) return;
  if (S.tracks[c.track].lock) return toast('La pista está bloqueada');
  if (!!d.audio !== isAud(c)) return toast(d.audio ? 'Este efecto se aplica a clips de audio' : 'Este efecto se aplica a clips de vídeo, imágenes o títulos');
  edit(() => { const p = {...(d.opts || {})}; d.params.forEach(r => p[r[1]] = r[6]); c.fx.push({id:nid('f'), type, on:true, p}); }, 'Aplicar ' + d.name);
  S.sel = new Set([c.id]); S.primary = c.id; S.selTrans = null;
  setTab('fx'); renderTimeline(); renderEffects(true);
  status(`${d.name} aplicado`);
}
function applyEffectMany(cs, type){
  const d = FXLIB[type]; if (!d) return;
  const targets = cs.filter(c => c && !S.tracks[c.track].lock && !!d.audio === isAud(c));
  if (!targets.length) return toast(d.audio ? 'Selecciona un clip de audio' : 'Selecciona un clip de vídeo');
  if (targets.length === 1) return applyEffect(targets[0], type);
  edit(() => targets.forEach(c => { const p = {...(d.opts || {})}; d.params.forEach(r => p[r[1]] = r[6]); c.fx.push({id:nid('f'), type, on:true, p}); }), 'Aplicar ' + d.name);
  setTab('fx'); status(`${d.name} aplicado a ${targets.length} clips`);
}
function removeEffect(c, id){
  edit(() => { c.fx = c.fx.filter(f => f.id !== id); for (const k in c.kf) if (k.startsWith('fx.' + id + '.')) delete c.kf[k]; }, 'Borrar efecto');
}

/* =============================== velocidad/duración =============================== */
function speedDialog(){
  const cs = [...S.sel].map(clip).filter(c => c && !S.tracks[c.track].lock);
  if (!cs.length) return toast('Selecciona uno o más clips en la línea de tiempo');
  const c0 = cs[0], srcLen = c0.dur * spd(c0);
  let exact = null;
  const m = modal('Velocidad/duración del clip', `
    <div class="row"><label style="flex:1">Velocidad (%)<input id="spV" type="number" min="1" max="10000" step="1" value="${Math.round(spd(c0) * 100)}"></label>
    <label style="flex:1">Duración<input id="spD" value="${tc(c0.dur)}"></label></div>
    <label class="ck"><input type="checkbox" id="spP"${c0.keepPitch ? ' checked' : ''}> Mantener tono de audio</label>
    <label class="ck"><input type="checkbox" id="spR"> Edición de ondulación, desplazar los clips posteriores</label>`,
    [['Cancelar'], ['Aceptar', m => {
      const ns = exact ?? clamp((parseFloat(m.querySelector('#spV').value) || 100) / 100, .01, 100);
      const pitch = m.querySelector('#spP').checked, ripple = m.querySelector('#spR').checked;
      edit(() => {
        for (const c of [...cs].sort((a, b) => a.start - b.start)){
          const old = spd(c), oldEnd = cend(c), nd = Math.max(1 / FPS, q(c.dur * old / ns)), delta = nd - c.dur;
          scaleKf(c, nd / c.dur);
          c.speed = ns; c.keepPitch = pitch; c.dur = nd;
          if (c.tIn) c.tIn.dur = Math.min(c.tIn.dur, nd);
          if (c.tOut) c.tOut.dur = Math.min(c.tOut.dur, nd);
          if (ripple) for (const o of S.clips) if (o !== c && o.track === c.track && o.start >= oldEnd - 1e-6) o.start = q(o.start + delta);
        }
        if (!ripple) overwrite(cs.map(c => c.id));
      }, 'Velocidad/duración');
    }, true]]);
  const v = m.querySelector('#spV'), d = m.querySelector('#spD');
  v.oninput = () => { exact = null; const ns = (parseFloat(v.value) || 100) / 100; d.value = tc(srcLen / ns); };
  d.onchange = () => { const nd = parseTCInput(d.value); if (nd > 0){ exact = clamp(srcLen / nd, .01, 100); v.value = Math.round(exact * 100); d.value = tc(nd); } };
}

/* =================================== marcadores =================================== */
const MK_COLORS = ['#58b947','#d94e4e','#e39a3a','#cfc23a','#e0e0e0','#3fa3e0','#6f6fc9','#d9689f'];
function addMarker(t){
  const tt = q(t ?? S.t);
  if (S.markers.some(m => Math.abs(m.t - tt) < .5 / FPS)) return status('Ya hay un marcador en este punto');
  edit(() => { S.markers.push({id:nid('k'), t:tt, name:'', note:'', color:MK_COLORS[0]}); S.markers.sort((a, b) => a.t - b.t); }, 'Añadir marcador');
  status('Marcador añadido en ' + tc(tt));
}
function editMarker(id){
  const mk = S.markers.find(m => m.id === id); if (!mk) return;
  const md = modal('Marcador', `
    <label>Nombre<input id="mkN" value="${esc(mk.name)}" placeholder="Marcador"></label>
    <label>Entrada<input id="mkT" value="${tc(mk.t)}"></label>
    <label>Comentarios<textarea id="mkC" rows="3">${esc(mk.note || '')}</textarea></label>
    <div class="sws" style="padding:0">${MK_COLORS.map(c => `<i data-c="${c}" style="background:${c}" class="${c === mk.color ? 'on' : ''}"></i>`).join('')}</div>`,
    [['Borrar', () => { edit(() => { S.markers = S.markers.filter(m => m.id !== id); }, 'Borrar marcador'); }],
     ['Cancelar'],
     ['Aceptar', m => {
       const t = parseTCInput(m.querySelector('#mkT').value), on = m.querySelector('.sws i.on'), col = on ? on.dataset.c : mk.color;
       edit(() => {
         const k = S.markers.find(x => x.id === id); if (!k) return;
         k.name = m.querySelector('#mkN').value.trim(); k.note = m.querySelector('#mkC').value; if (t != null) k.t = q(t); k.color = col;
         S.markers.sort((a, b) => a.t - b.t);
       }, 'Editar marcador');
     }, true]]);
  md.querySelectorAll('.sws i').forEach(i => i.onclick = () => { md.querySelectorAll('.sws i').forEach(x => x.classList.remove('on')); i.classList.add('on'); });
}
function jumpMarker(dir){
  const t = q(S.t), ms = S.markers.map(m => m.t);
  const p = dir > 0 ? ms.find(x => x > t + 1e-6) : [...ms].reverse().find(x => x < t - 1e-6);
  if (p != null) seek(p); else status('No hay más marcadores');
}
function clearMarkers(){ if (S.markers.length) edit(() => { S.markers = []; }, 'Borrar todos los marcadores'); }

/* ============================ entrada/salida de secuencia ============================ */
function markSeqIn(){ edit(() => { S.seqIn = q(S.t); if (S.seqOut != null && S.seqOut <= S.seqIn) S.seqOut = null; }, 'Marcar entrada'); }
function markSeqOut(){ edit(() => { S.seqOut = q(S.t); if (S.seqIn != null && S.seqIn >= S.seqOut) S.seqIn = null; }, 'Marcar salida'); }
function clearSeqIO(){ if (S.seqIn != null || S.seqOut != null) edit(() => { S.seqIn = null; S.seqOut = null; }, 'Borrar entrada y salida'); }
function seqRange(){ const a = S.seqIn ?? 0, b = S.seqOut ?? seqEnd(); return b - a > 1 / FPS ? {a, b} : {a:0, b:seqEnd()}; }
function rangeRemove(a, b, ripple, label, clearIO){
  if (b - a < 1 / FPS) return;
  edit(() => {
    const m1 = {}, m2 = {};
    for (const c of [...S.clips]) if (!S.tracks[c.track].lock) splitClipAt(c, a, false, m1);
    for (const c of [...S.clips]) if (!S.tracks[c.track].lock) splitClipAt(c, b, false, m2);
    S.clips = S.clips.filter(c => S.tracks[c.track].lock || !(c.start >= a - 1e-6 && cend(c) <= b + 1e-6));
    if (ripple) for (const c of S.clips) if (!S.tracks[c.track].lock && c.start >= b - 1e-6) c.start = q(c.start - (b - a));
    if (clearIO){ S.seqIn = null; S.seqOut = null; }
    S.sel.clear();
  }, label);
  seek(a);
}
function liftExtract(extract){
  if (S.seqIn == null && S.seqOut == null) return toast('Marca primero una entrada y una salida en la secuencia (I y O)');
  const {a, b} = seqRange();
  rangeRemove(a, b, extract, extract ? 'Extraer' : 'Levantar', true);
}
// Q / W: recortar con ondulación la edición anterior / siguiente hasta el cabezal
function rippleTrimQW(prev){
  const t = q(S.t);
  const under = S.clips.filter(c => !S.tracks[c.track].lock && t > c.start + 1e-6 && t < cend(c) - 1e-6);
  if (!under.length) return status('No hay clips bajo el cabezal');
  if (prev){ const a = Math.max(...under.map(c => c.start)); rangeRemove(a, t, true, 'Recortar con ondulación la edición anterior'); seek(a); }
  else { const b = Math.min(...under.map(c => cend(c))); rangeRemove(t, b, true, 'Recortar con ondulación la edición siguiente'); seek(t); }
}

/* ============================== colocar medios ============================== */
function makeClips(m, start, vT, aT, inP, outP){
  const a = inP || 0, dur = (outP ?? srcDurOf(m)) - a, res = [];
  const link = m.type === 'video' ? nid('l') : null;
  if (m.type === 'video' || m.type === 'image') res.push(newClip(m.type, m, vT, start, a, dur, link));
  if (m.type === 'video' || m.type === 'audio') res.push(newClip('audio', m, aT, start, a, dur, link));
  return res;
}
function insertFromSource(over){
  const r = srcRange(); if (!r) return toast('Abre primero un clip en el Monitor de origen');
  srcV.pause();
  const t = q(S.t), dur = q(r.out - r.in);
  edit(() => {
    const cs = makeClips(r.m, t, 'V1', 'A1', r.in, r.out).filter(c => !S.tracks[c.track].lock);
    if (!cs.length) return;
    if (!over){ splitAllAt(t); for (const c of S.clips) if (!S.tracks[c.track].lock && c.start >= t - 1e-6) c.start = q(c.start + dur); }
    S.clips.push(...cs); if (over) overwrite(cs.map(c => c.id));
    S.sel = new Set(cs.map(c => c.id)); S.primary = cs[0].id; S.selTrans = null;
    S.t = t + dur;
  }, over ? 'Sobrescribir' : 'Insertar');
  status(over ? 'Clip sobrescrito en la secuencia' : 'Clip insertado en la secuencia');
}
function placeMedia(mid, row, t, insert, range){
  if (String(mid).startsWith('seq:')) return placeSeq(mid.slice(4), row, t, insert);
  const m = media(mid); if (!m || m.offline) return;
  const n = TRACKS[clamp(row, 0, TRACKS.length - 1)].id.slice(1);
  const st = q(snapTime(Math.max(0, t), new Set()).t);
  const inP = range ? range.in : 0, outP = range ? range.out : null;
  edit(() => {
    const cs = makeClips(m, st, S.tracks['V' + n] ? 'V' + n : 'V1', S.tracks['A' + n] ? 'A' + n : 'A1', inP, outP).filter(c => !S.tracks[c.track].lock);
    if (!cs.length) return;
    if (insert){ const d = cs[0].dur; splitAllAt(st); for (const c of S.clips) if (!S.tracks[c.track].lock && c.start >= st - 1e-6) c.start = q(c.start + d); }
    S.clips.push(...cs); if (!insert) overwrite(cs.map(c => c.id));
    S.sel = new Set(cs.map(c => c.id)); S.primary = cs[0].id; S.selTrans = null; S.gap = null;
  }, insert ? 'Insertar' : 'Sobrescribir');
  status(`"${m.name}" añadido a la secuencia`);
}

/* =========================== ajuste (snap) y navegación =========================== */
function snapPoints(ex){
  const pts = [0, S.t];
  S.markers.forEach(m => pts.push(m.t));
  if (S.seqIn != null) pts.push(S.seqIn);
  if (S.seqOut != null) pts.push(S.seqOut);
  S.clips.forEach(c => { if (!ex.has(c.id)) pts.push(c.start, cend(c)); });
  return pts;
}
function snapTime(t, ex, edges){
  if (!S.snap) return {t, at:null};
  const thr = 9 / S.zoom, pts = snapPoints(ex || new Set());
  let best = null, at = null;
  for (const off of (edges || [0])) for (const p of pts){
    const d = p - (t + off);
    if (Math.abs(d) < thr && (best === null || Math.abs(d) < Math.abs(best))){ best = d; at = p; }
  }
  return best === null ? {t, at:null} : {t: t + best, at};
}
function editPoints(){ const s = new Set([0]); S.clips.forEach(c => { s.add(q(c.start)); s.add(q(cend(c))); }); return [...s].sort((a, b) => a - b); }
function jumpEdit(dir){
  const pts = editPoints(), t = q(S.t);
  const p = dir > 0 ? pts.find(x => x > t + 1e-6) : [...pts].reverse().find(x => x < t - 1e-6);
  if (p != null){ pause(); seek(p); }
}

/* ================================= secuencia ================================= */
const SEQ_PRESETS = [[1920,1080,'HD 1080p · 16:9 (1920×1080)'],[1080,1920,'Vertical 9:16 · Reels, TikTok, Shorts (1080×1920)'],[1080,1080,'Cuadrado 1:1 · Instagram (1080×1080)'],[1080,1350,'Vertical 4:5 · Instagram (1080×1350)'],[1280,720,'HD 720p · 16:9 (1280×720)'],[3840,2160,'4K UHD · 16:9 (3840×2160)']];
function setSeq(w, h){ S.seq = {w, h}; storeSeq(); draw(); setMonZoom(S.monZoom); renderTimeline(); scheduleSave(); }
function seqSettings(){
  modal('Ajustes de secuencia', `<label>Nombre de la secuencia<input id="seqN" value="${esc(seqName())}"></label><label>Tamaño del fotograma<select id="seqP">${SEQ_PRESETS.map(([w, h, l]) => `<option value="${w}x${h}"${S.seq.w === w && S.seq.h === h ? ' selected' : ''}>${l}</option>`).join('')}</select></label><div class="dim">Base de tiempo: ${FPS} fotogramas/segundo · Audio: 48 000 Hz estéreo</div>`,
    [['Cancelar'], ['Aceptar', m => { const n = m.querySelector('#seqN').value.trim(); if (n) curSeqObj().name = n; const [w, h] = m.querySelector('#seqP').value.split('x').map(Number); setSeq(w, h); renderSeqTabs(); renderProject(); toast(`${seqName()}: ${w}×${h}`); }, true]]);
}

/* ============================ plantillas de gráficos ============================ */
const GFX_TEMPLATES = {
  title: {name:'Título principal', props:{text:'TÍTULO PRINCIPAL', font:'Bebas Neue', size:190, bold:false, shadow:true}},
  lower: {name:'Tercio inferior', props:{text:'Nombre Apellido\nCargo o descripción', font:'Montserrat', size:58, bold:true, align:'left', bg:true, bgColor:'#16325f', shadow:false, x:-520, y:360}},
  sub: {name:'Subtítulo', props:{text:'Escribe aquí el subtítulo', font:'Inter', size:54, bold:false, bg:true, bgColor:'#000000', shadow:false, y:430}},
  quote: {name:'Cita destacada', props:{text:'«Una frase que\nmerece destacarse»', font:'Playfair Display', size:96, bold:false, italic:true, shadow:true}},
  end: {name:'Créditos finales', props:{text:'Gracias por ver\n\nEditado con AuthenCut Pro', font:'Montserrat', size:72, bold:true, shadow:true}},
  cta: {name:'Llamada a la acción', props:{text:'¡SUSCRÍBETE!', font:'Montserrat', size:110, bold:true, bg:true, bgColor:'#d62839', stroke:0, shadow:true}}
};
function addTemplate(key, at, track){
  const tp = GFX_TEMPLATES[key]; if (!tp) return;
  const c = addTitle(at, track, 0, 0, k => {
    Object.assign(k.props, tp.props);
    const scale = Math.min(1, S.seq.w / 1920);
    if (scale < 1){ k.props.size = Math.round(k.props.size * scale); k.props.x = Math.round((k.props.x || 0) * scale); k.props.y = Math.round((k.props.y || 0) * scale); }
    k.tIn = {type:'dissolve', dur:q(.5)}; k.tOut = {type:'dissolve', dur:q(.5)};
  }, 'Plantilla: ' + tp.name);
  if (!c) return;
  status('Plantilla añadida: ' + tp.name);
}

/* ============================ escala y desplazamiento ============================ */
function frameScale(c, fill){
  const m = media(c.mediaId); if (!m || !m.w || !m.h) return 100;
  const fit = Math.min(S.seq.w / m.w, S.seq.h / m.h), cover = Math.max(S.seq.w / m.w, S.seq.h / m.h);
  return fill ? Math.round(cover / fit * 1000) / 10 : 100;
}
function scaleToFrame(fill){
  const cs = [...S.sel].map(clip).filter(c => c && (c.kind === 'video' || c.kind === 'image'));
  if (!cs.length) return toast('Selecciona un clip de vídeo o imagen');
  edit(() => cs.forEach(c => { setVal(c, 'scale', frameScale(c, fill)); if (!fill){ setVal(c, 'x', 0); setVal(c, 'y', 0); } }), fill ? 'Rellenar el fotograma' : 'Ajustar al fotograma');
}
function nudge(n){
  const cs = [...S.sel].map(clip).filter(c => c && !S.tracks[c.track].lock);
  if (!cs.length) return;
  const d = n / FPS, minS = Math.min(...cs.map(c => c.start));
  if (minS + d < 0) return;
  edit(() => { cs.forEach(c => c.start = q(c.start + d)); overwrite(cs.map(c => c.id)); }, 'Desplazar clip');
}

/* ================================ pistas ================================ */
function addTracks(nv, na){
  if (!(nv > 0 || na > 0)) return;
  edit(() => {
    let v = VROWS.length, a = AROWS.length;
    for (let i = 0; i < nv; i++) S.tracks['V' + (++v)] = TRACK_DEF();
    for (let i = 0; i < na; i++) S.tracks['A' + (++a)] = TRACK_DEF();
    layoutTracks();
  }, 'Añadir pistas');
  buildTracks(); buildMixer(); renderTimeline();
  status(`Pistas: ${VROWS.length} de vídeo, ${AROWS.length} de audio`);
}
function addTracksDialog(){
  modal('Añadir pistas', `<div class="row"><label style="flex:1">Pistas de vídeo<input id="atV" type="number" min="0" max="20" value="1"></label><label style="flex:1">Pistas de audio<input id="atA" type="number" min="0" max="20" value="0"></label></div>`,
    [['Cancelar'], ['Aceptar', m => addTracks(clamp(+m.querySelector('#atV').value || 0, 0, 20), clamp(+m.querySelector('#atA').value || 0, 0, 20)), true]]);
}
// Renumera las pistas de un tipo según `keep` (lista de números antiguos en orden) y mueve sus clips
function renumberTracks(p, keep){
  const old = {}; keep.forEach(n => old[n] = S.tracks[p + n]);
  const map = {}; keep.forEach((n, i) => map[p + n] = p + (i + 1));
  for (const k of Object.keys(S.tracks)) if (k[0] === p) delete S.tracks[k];
  keep.forEach((n, i) => S.tracks[p + (i + 1)] = old[n]);
  S.clips.forEach(c => { if (map[c.track]) c.track = map[c.track]; });
  layoutTracks();
}
function deleteTrack(id){
  const p = id[0], nums = (p === 'V' ? VROWS : AROWS).map(i => +TRACKS[i].id.slice(1)).sort((a, b) => a - b);
  if (nums.length <= 1) return toast('Debe quedar al menos una pista de ' + (p === 'V' ? 'vídeo' : 'audio'));
  const used = S.clips.filter(c => c.track === id).length;
  if (used && !confirm(`La pista ${id} tiene ${used} clip(s). ¿Eliminarla junto con sus clips?`)) return;
  edit(() => {
    S.clips = S.clips.filter(c => c.track !== id);
    renumberTracks(p, nums.filter(n => n !== +id.slice(1)));
    S.sel = new Set([...S.sel].filter(x => clip(x)));
  }, 'Eliminar pista');
  buildTracks(); buildMixer(); renderTimeline();
}
function deleteEmptyTracks(){
  edit(() => {
    for (const p of ['V', 'A']){
      const nums = (p === 'V' ? VROWS : AROWS).map(i => +TRACKS[i].id.slice(1)).sort((a, b) => a - b);
      let keep = nums.filter(n => S.clips.some(c => c.track === p + n));
      if (!keep.length) keep = [nums[0]];
      renumberTracks(p, keep);
    }
  }, 'Eliminar pistas vacías');
  buildTracks(); buildMixer(); renderTimeline();
}
function renameTrack(id){
  const st = S.tracks[id]; if (!st) return;
  modal('Cambiar nombre de la pista', `<label>Nombre<input id="rtN" value="${esc(st.name || '')}" placeholder="${isV(id) ? 'Vídeo' : 'Audio'} ${id.slice(1)}"></label>`,
    [['Cancelar'], ['Aceptar', m => { st.name = m.querySelector('#rtN').value.trim(); buildTracks(); scheduleSave(); }, true]]);
}
function setTrackHeight(id, h){ const st = S.tracks[id]; if (!st) return; st.h = clamp(Math.round(h), 30, 220); buildTracks(); renderTimeline(); scheduleSave(); }

/* ============================ pegar / eliminar atributos ============================ */
const ATTR_GROUPS = [
  ['motion', 'Movimiento', ['x','y','scale','rotation'], true],
  ['opacity', 'Opacidad', ['opacity'], true],
  ['volume', 'Volumen y panoramizador', ['volume','pan'], false],
  ['fx', 'Efectos', null, null],
  ['speed', 'Velocidad (reasignación de tiempo)', null, null],
  ['text', 'Estilo de texto', null, true]
];
function attrDialog(title, src, onOk){
  const vis = src ? visual(src) : [...S.sel].map(clip).some(c => c && visual(c));
  const groups = ATTR_GROUPS.filter(([id, , , v]) => v === null || v === vis || (id === 'text' && (!src || src.kind === 'text')));
  modal(title, groups.map(([id, n]) => `<label class="ck"><input type="checkbox" data-g="${id}" checked> ${n}</label>`).join(''),
    [['Cancelar'], ['Aceptar', m => onOk(new Set([...m.querySelectorAll('[data-g]:checked')].map(i => i.dataset.g))), true]]);
}
function pasteAttributes(){
  const src = S.clipboard && S.clipboard[0];
  if (!src) return toast('Copia primero un clip (Ctrl+C)');
  const cs = [...S.sel].map(clip).filter(c => c && !S.tracks[c.track].lock && visual(c) === visual(src));
  if (!cs.length) return toast('Selecciona los clips de destino en la línea de tiempo');
  attrDialog('Pegar atributos', src, g => edit(() => {
    for (const c of cs){
      for (const [id, , keys] of ATTR_GROUPS) if (keys && g.has(id)) for (const k of keys){
        c.props[k] = src.props[k];
        if (src.kf[k]) c.kf[k] = src.kf[k].map(x => ({...x, t: x.t * (c.dur / src.dur)})); else delete c.kf[k];
      }
      if (g.has('fx')){
        for (const f of src.fx){
          const nf = JSON.parse(JSON.stringify(f)); nf.id = nid('f'); c.fx.push(nf);
          for (const k in src.kf) if (k.startsWith('fx.' + f.id + '.')) c.kf['fx.' + nf.id + k.slice(3 + f.id.length)] = src.kf[k].map(x => ({...x, t: x.t * (c.dur / src.dur)}));
        }
      }
      if (g.has('speed') && hasSrc(c) === hasSrc(src)){
        const nd = Math.max(1 / FPS, q(c.dur * spd(c) / spd(src)));
        scaleKf(c, nd / c.dur); c.speed = spd(src); c.dur = nd; clampTrans(c);
      }
      if (g.has('text') && c.kind === 'text' && src.kind === 'text') for (const k in TEXT_DEFAULTS) if (k !== 'text') c.props[k] = src.props[k];
    }
    overwrite(cs.map(c => c.id));
  }, 'Pegar atributos'));
}
function removeAttributes(){
  const cs = [...S.sel].map(clip).filter(c => c && !S.tracks[c.track].lock);
  if (!cs.length) return toast('Selecciona uno o más clips');
  attrDialog('Eliminar atributos', null, g => edit(() => {
    for (const c of cs){
      const def = defaultProps(c.kind);
      for (const [id, , keys] of ATTR_GROUPS) if (keys && g.has(id)) for (const k of keys){ c.props[k] = def[k]; delete c.kf[k]; }
      if (g.has('fx')){ for (const k in c.kf) if (k.startsWith('fx.')) delete c.kf[k]; c.fx = []; }
      if (g.has('speed') && spd(c) !== 1){ const nd = Math.max(1 / FPS, q(c.dur * spd(c))); scaleKf(c, nd / c.dur); c.speed = 1; c.dur = nd; clampTrans(c); }
      if (g.has('text') && c.kind === 'text') for (const k in TEXT_DEFAULTS) if (k !== 'text') c.props[k] = TEXT_DEFAULTS[k];
    }
    overwrite(cs.map(c => c.id));
  }, 'Eliminar atributos'));
}

/* ============================ secuencias y anidamiento ============================ */
function switchSeq(id){
  if (id === S.curSeq) return;
  const o = S.seqs.find(s => s.id === id); if (!o) return;
  pause(); storeSeq(); activateSeq(o);
  buildTracks(); buildMixer(); refresh(true); setZoom(S.zoom); tracksEl.scrollLeft = o.scroll || 0; renderSeqTabs(); renderProject(); setMonZoom(S.monZoom);
  status('Secuencia abierta: ' + o.name);
}
function nextSeqName(base){ let n = S.seqs.length + 1, name; do { name = `${base} ${String(n).padStart(2, '0')}`; n++; } while (S.seqs.some(s => s.name === name)); return name; }
function newSequence(name, w, h){
  storeSeq();
  const o = makeSeqObj(name || nextSeqName('Secuencia'), w || S.seq.w, h || S.seq.h);
  S.seqs.push(o); switchSeq(o.id); scheduleSave();
  return o;
}
function newSequenceDialog(){
  modal('Nueva secuencia', `<label>Nombre de la secuencia<input id="nsN" value="${esc(nextSeqName('Secuencia'))}"></label><label>Tamaño del fotograma<select id="nsP">${SEQ_PRESETS.map(([w, h, l]) => `<option value="${w}x${h}"${S.seq.w === w && S.seq.h === h ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`,
    [['Cancelar'], ['Aceptar', m => { const [w, h] = m.querySelector('#nsP').value.split('x').map(Number); newSequence(m.querySelector('#nsN').value.trim(), w, h); }, true]]);
}
function renameSeq(id){
  const o = S.seqs.find(s => s.id === id); if (!o) return;
  modal('Cambiar nombre de la secuencia', `<label>Nombre<input id="rsN" value="${esc(o.name)}"></label>`,
    [['Cancelar'], ['Aceptar', m => { const n = m.querySelector('#rsN').value.trim(); if (n){ o.name = n; renderSeqTabs(); renderProject(); renderTimeline(); scheduleSave(); } }, true]]);
}
function duplicateSeq(id){
  const o = seqById(id); if (!o) return;
  const d = JSON.parse(JSON.stringify(o)); d.id = nid('s'); d.name = o.name + ' copia';
  d.clips.forEach(c => c.id = nid());
  S.seqs.push(d); renderProject(); scheduleSave(); toast('Secuencia duplicada: ' + d.name);
}
function deleteSeq(id){
  if (S.seqs.length <= 1) return toast('El proyecto debe tener al menos una secuencia');
  const users = S.seqs.filter(s => s.id !== id && seqById(s.id).clips.some(c => isNest(c) && c.nestId === id));
  if (users.length) return toast('No se puede borrar: se usa anidada en ' + users.map(s => s.name).join(', '));
  const o = S.seqs.find(s => s.id === id);
  if (!confirm(`¿Borrar la secuencia "${o.name}"? Esta acción no se puede deshacer.`)) return;
  if (id === S.curSeq) switchSeq(S.seqs.find(s => s.id !== id).id);
  S.seqs = S.seqs.filter(s => s.id !== id); S.openSeqs = S.openSeqs.filter(x => x !== id);
  UNDO.splice(0, UNDO.length, ...UNDO.filter(u => JSON.parse(u.s).s !== id)); REDO.length = 0;
  renderSeqTabs(); renderProject(); renderHistory(); scheduleSave();
}
function closeSeqTab(id){
  if (S.openSeqs.length <= 1) return;
  S.openSeqs = S.openSeqs.filter(x => x !== id);
  if (id === S.curSeq) switchSeq(S.openSeqs[S.openSeqs.length - 1]);
  renderSeqTabs(); scheduleSave();
}
function makeNestClips(sq, start, vT, aT){
  const dur = seqEndOf(sq); if (dur <= 0) return [];
  const hasVid = sq.clips.some(c => visual(c)), hasAud = sq.clips.some(c => isAud(c));
  const link = hasVid && hasAud ? nid('l') : null, res = [];
  if (hasVid){ const c = newClip('nest', null, vT, start, 0, dur, link); c.nestId = sq.id; res.push(c); }
  if (hasAud){ const c = newClip('nesta', null, aT, start, 0, dur, link); c.nestId = sq.id; res.push(c); }
  return res;
}
function placeSeq(id, row, t, insert){
  const sq = seqById(id); if (!sq) return;
  if (containsSeq(id, S.curSeq)) return toast('No se puede anidar una secuencia dentro de sí misma');
  if (seqEndOf(sq) <= 0) return toast('La secuencia está vacía');
  const n = TRACKS[clamp(row, 0, TRACKS.length - 1)].id.slice(1);
  const st = q(snapTime(Math.max(0, t), new Set()).t);
  edit(() => {
    const cs = makeNestClips(sq, st, S.tracks['V' + n] ? 'V' + n : 'V1', S.tracks['A' + n] ? 'A' + n : 'A1').filter(c => !S.tracks[c.track].lock);
    if (!cs.length) return;
    if (insert){ const d = cs[0].dur; splitAllAt(st); for (const c of S.clips) if (!S.tracks[c.track].lock && c.start >= st - 1e-6) c.start = q(c.start + d); }
    S.clips.push(...cs); if (!insert) overwrite(cs.map(c => c.id));
    S.sel = new Set(cs.map(c => c.id)); S.primary = cs[0].id; S.selTrans = null;
  }, 'Anidar secuencia');
  status(`"${sq.name}" añadida como secuencia anidada`);
}
// Clip > Anidar: los clips seleccionados pasan a una secuencia nueva que los sustituye
function nestSelection(){
  const cs = [...S.sel].map(clip).filter(c => c && !S.tracks[c.track].lock);
  if (!cs.length) return toast('Selecciona los clips que quieres anidar');
  storeSeq();
  const t0 = Math.min(...cs.map(c => c.start));
  const sq = makeSeqObj(nextSeqName('Secuencia anidada'), S.seq.w, S.seq.h);
  sq.tracks = {}; for (const k in S.tracks) sq.tracks[k] = Object.assign(TRACK_DEF(), {h:S.tracks[k].h});
  sq.clips = cs.map(c => { const n = JSON.parse(JSON.stringify(c)); n.id = nid(); n.start = q(c.start - t0); return n; });
  const lm = {}; sq.clips.forEach(c => { if (c.link) c.link = lm[c.link] || (lm[c.link] = nid('l')); });
  const vNums = cs.filter(visual).map(c => +c.track.slice(1)), aNums = cs.filter(isAud).map(c => +c.track.slice(1));
  const vT = 'V' + (vNums.length ? Math.min(...vNums) : 1), aT = 'A' + (aNums.length ? Math.min(...aNums) : 1);
  S.seqs.push(sq); if (!S.openSeqs.includes(sq.id)) S.openSeqs.push(sq.id);
  edit(() => {
    const ids = new Set(cs.map(c => c.id));
    S.clips = S.clips.filter(c => !ids.has(c.id));
    const ns = makeNestClips(sq, t0, vT, aT);
    S.clips.push(...ns); overwrite(ns.map(c => c.id));
    S.sel = new Set(ns.map(c => c.id)); S.primary = ns[0] && ns[0].id;
  }, 'Anidar');
  renderProject(); renderSeqTabs();
  status(`Clips anidados en "${sq.name}" (doble clic para abrirla)`);
}
