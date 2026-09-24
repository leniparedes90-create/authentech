'use strict';
/* AuthenCut Pro · paneles: proyecto, origen, controles de efectos, efectos, marcadores, historial,
   información, mezclador de pistas de audio y superposición del monitor de programa */

/* ============================== pestañas y foco ============================== */
function setPanelTab(panelId, tab){
  const p = $('#' + panelId); if (!p) return;
  p.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
  p.querySelectorAll('.pbody[data-body]').forEach(b => b.classList.toggle('hidden', b.dataset.body !== tab));
  if (tab === 'fx') renderEffects(true);
  else if (tab === 'source') updateSrcUI();
  else if (tab === 'history') renderHistory();
  else if (tab === 'markers') renderMarkers();
  else if (tab === 'info') renderInfo();
  else if (tab === 'mixer') buildMixer();
}
const setTab = tab => setPanelTab('srcPanel', tab);
const setBotTab = tab => setPanelTab('projPanel', tab);
function focusUI(){
  $('#srcPanel').classList.toggle('focus', FOCUS === 'source' || FOCUS === 'fx');
  $('#prgPanel').classList.toggle('focus', FOCUS === 'program');
  $('#projPanel').classList.toggle('focus', FOCUS === 'project' || FOCUS === 'panel');
  $('#tl').classList.toggle('focus', FOCUS === 'timeline');
}
function tcEditable(el, get, set){
  el.addEventListener('click', () => {
    if (el.querySelector('input')) return;
    const inp = document.createElement('input'); inp.value = tc(get());
    el.textContent = ''; el.appendChild(inp); inp.focus(); inp.select();
    let fin = false;
    const done = ok => { if (fin) return; fin = true; const v = ok ? parseTCInput(inp.value) : null; inp.remove(); el.textContent = tc(get()); if (v != null) set(v); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
    inp.onblur = () => done(true);
  });
}

/* ================================== proyecto ================================== */
const TYPE_NAMES = {video:'Vídeo', audio:'Audio', image:'Imagen fija'};
function renderProject(){
  const el = $('#projList'), qy = $('#projSearch').value.trim().toLowerCase();
  $('#projCount').textContent = S.media.length + (S.media.length === 1 ? ' elemento' : ' elementos');
  el.innerHTML = '';
  if (!S.media.length){
    el.innerHTML = '<div class="empty" id="emptyImp"><b>Importa medios para comenzar</b><br>Haz clic aquí o arrastra archivos de vídeo,<br>audio o imagen a este panel</div>';
    $('#emptyImp').onclick = () => $('#fileIn').click(); return;
  }
  for (const m of S.media){
    if (qy && !m.name.toLowerCase().includes(qy)) continue;
    const d = document.createElement('div');
    d.className = 'pitem' + (S.projSel === m.id ? ' on' : '');
    d.draggable = !m.offline;
    d.title = `${m.name}\n${TYPE_NAMES[m.type]}${m.w ? ` · ${m.w}×${m.h}` : ''} · ${tc(srcDurOf(m))}`;
    d.innerHTML = `<div class="pthumb" style="${m.thumb ? `background-image:url(${m.thumb})` : ''}">${m.type === 'audio' ? ICON.wave : ''}${m.offline ? '<span class="off">Sin conexión</span>' : ''}<span class="pdur">${tc(srcDurOf(m))}</span></div><div class="pname"><span class="pbadge ${m.type}"></span>${esc(m.name)}</div>`;
    d.onmousedown = () => { S.projSel = m.id; FOCUS = 'project'; focusUI(); el.querySelectorAll('.pitem').forEach(x => x.classList.toggle('on', x === d)); renderInfo(); };
    d.ondblclick = () => openSource(m.id);
    d.ondragstart = e => { DRAGMEDIA = m.id; DRAGRANGE = null; e.dataTransfer.setData('text/plain', m.name); e.dataTransfer.effectAllowed = 'copy'; };
    d.ondragend = () => { DRAGMEDIA = null; $('#ghost').style.display = 'none'; };
    d.oncontextmenu = e => {
      e.preventDefault(); S.projSel = m.id; FOCUS = 'project'; renderProject();
      ctxMenu(e.clientX, e.clientY, [
        ['Abrir en el Monitor de origen', '', () => openSource(m.id), m.offline],
        ['Insertar en el cabezal', ',', () => { openSource(m.id); insertFromSource(false); }, m.offline],
        ['Sobrescribir en el cabezal', '.', () => { openSource(m.id); insertFromSource(true); }, m.offline], '-',
        ['Reconectar medios…', '', () => $('#fileIn').click(), !m.offline],
        ['Borrar', 'Supr', () => removeMedia(m.id)]]);
    };
    el.appendChild(d);
  }
}
function removeMedia(id){
  const m = media(id); if (!m) return;
  const used = S.clips.some(c => c.mediaId === id);
  if (used && !confirm(`"${m.name}" se usa en la secuencia. ¿Borrarlo y quitar sus clips?`)) return;
  if (used){ TRASH.set(m.id, m); edit(() => { S.clips = S.clips.filter(c => c.mediaId !== id); }, 'Borrar medio'); }
  S.media = S.media.filter(x => x !== m);
  if (S.src.id === id) closeSource();
  S.projSel = null; renderProject(); scheduleSave();
}

/* ============================== monitor de origen ============================== */
const srcV = $('#srcVideo'), srcImg = $('#srcImg');
function openSource(id, c){
  const m = media(id); if (!m) return;
  if (m.offline) return toast('Medio sin conexión: impórtalo de nuevo para reconectarlo');
  S.src = {id, in:null, out:null}; S.projSel = id;
  $('#srcPh').classList.add('hidden');
  if (m.type === 'image'){
    srcV.pause(); srcV.removeAttribute('src'); delete srcV.dataset.url; srcV.load(); srcV.classList.add('hidden');
    srcImg.src = m.url; srcImg.classList.remove('hidden');
  } else {
    srcImg.classList.add('hidden'); srcV.classList.remove('hidden');
    if (srcV.dataset.url !== m.url){ srcV.src = m.url; srcV.dataset.url = m.url; }
    let t0 = 0;
    if (c && mediaBased(c)){ S.src.in = q(c.in); S.src.out = q(c.in + c.dur * spd(c)); t0 = S.t >= c.start && S.t < cend(c) ? srcAt(c, S.t) : c.in; }
    srcV.currentTime = t0;
  }
  $('#srcName').textContent = m.name;
  FOCUS = 'source'; focusUI(); setTab('source'); renderProject(); updateSrcUI();
}
function closeSource(){
  S.src = {id:null, in:null, out:null}; srcV.pause(); srcV.removeAttribute('src'); delete srcV.dataset.url; srcV.load();
  srcImg.classList.add('hidden'); $('#srcPh').classList.remove('hidden'); $('#srcName').textContent = '(sin clip)'; updateSrcUI();
}
const srcTime = () => { const m = media(S.src.id); return m && m.type !== 'image' ? srcV.currentTime : 0; };
function srcRange(){
  const m = media(S.src.id); if (!m) return null;
  let a = S.src.in ?? 0, b = S.src.out ?? srcDurOf(m);
  if (b - a < 1 / FPS){ a = 0; b = srcDurOf(m); }
  return {m, in:a, out:b};
}
function updateSrcUI(){
  const m = media(S.src.id), bar = $('#srcBar'), hd = bar.querySelector('.hd'), rng = bar.querySelector('.rng');
  $('#srcPlayBtn').innerHTML = !srcV.paused ? ICON.pause : ICON.play;
  const tcEl = $('#srcTC');
  if (!m){ if (!tcEl.querySelector('input')) tcEl.textContent = tc(0); $('#srcDur').textContent = tc(0); hd.style.left = '8px'; rng.classList.add('hidden'); return; }
  const d = srcDurOf(m), w = bar.clientWidth - 16, t = srcTime(), r = srcRange();
  if (!tcEl.querySelector('input')) tcEl.textContent = tc(t);
  $('#srcDur').textContent = tc(r.out - r.in);
  hd.style.left = (8 + t / d * w) + 'px';
  if (S.src.in != null || S.src.out != null){ rng.classList.remove('hidden'); rng.style.left = (8 + r.in / d * w) + 'px'; rng.style.width = Math.max(2, (r.out - r.in) / d * w) + 'px'; }
  else rng.classList.add('hidden');
}
function srcMarkIn(){ if (!S.src.id) return; S.src.in = q(srcTime()); if (S.src.out != null && S.src.out <= S.src.in) S.src.out = null; updateSrcUI(); status('Entrada de origen: ' + tc(S.src.in)); }
function srcMarkOut(){ if (!S.src.id) return; S.src.out = q(srcTime()); if (S.src.in != null && S.src.in >= S.src.out) S.src.in = null; updateSrcUI(); status('Salida de origen: ' + tc(S.src.out)); }
function srcToggle(){ const m = media(S.src.id); if (!m || m.type === 'image') return; if (srcV.paused){ pause(); srcV.play(); } else srcV.pause(); }
function srcStep(n){ const m = media(S.src.id); if (!m || m.type === 'image') return; srcV.pause(); srcV.currentTime = clamp(srcV.currentTime + n / FPS, 0, m.duration); }
function srcGo(which){ const r = srcRange(); if (!r || r.m.type === 'image') return; srcV.pause(); srcV.currentTime = which === 'in' ? r.in : Math.max(0, r.out - 1 / FPS); }

/* ============================ controles de efectos ============================ */
const closedFx = new Set();
let fxKey = null, SCRUBS = [], ACTIVE_SCRUB = null;
const VOLFMT = {show: v => dbStr(v / 100), toUser: v => v <= .0001 ? -96 : 20 * Math.log10(v / 100), fromUser: d => d <= -96 ? 0 : 100 * Math.pow(10, d / 20), ustep: .1};
function primaryClip(){ if (S.primary && S.sel.has(S.primary)) return clip(S.primary); const f = [...S.sel][0]; return f ? clip(f) : null; }
function fxRow(left, lane){
  const r = document.createElement('div'); r.className = 'fxrow';
  const L = document.createElement('div'); L.className = 'fxl'; L.innerHTML = left;
  const R = document.createElement('div'); R.className = 'lane'; R.innerHTML = lane || '';
  r.append(L, R); return r;
}
function renderEffects(force){
  const c = S.selTrans ? clip(S.selTrans.id) : primaryClip();
  const key = S.selTrans ? `t:${S.selTrans.id}:${S.selTrans.side}` : (c ? c.id : null);
  if (!force && key === fxKey) return;
  fxKey = key; SCRUBS = [];
  const box = $('#fxBody'); box.innerHTML = '';
  if (!c){ box.innerHTML = '<div class="fxempty">(No hay clips seleccionados)<br><span class="dim">Selecciona un clip en la línea de tiempo para ver sus efectos</span></div>'; return; }
  if (S.selTrans) return renderTransControls(box, c, S.selTrans.side);
  const m = media(c.mediaId), name = c.kind === 'text' ? (c.props.text || 'Título').split('\n')[0] : (m ? m.name : 'Clip');
  const top = fxRow(`<span>Principal * <b>${esc(name)}</b></span><span class="dim">›</span><span>Secuencia 01 * <b>${esc(name)}</b></span>`, `<div class="lanebar">${esc(name)}</div>`);
  top.classList.add('fxtop');
  top.querySelector('.lane').addEventListener('mousedown', e => {
    const r = e.currentTarget.getBoundingClientRect(); pause();
    const f = ev => seek(c.start + clamp((ev.clientX - r.left) / r.width, 0, .9999) * c.dur);
    f(e); const up = () => { window.removeEventListener('mousemove', f); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', f); window.addEventListener('mouseup', up);
  });
  box.appendChild(top);
  const grp = fxRow(c.kind === 'audio' ? 'Efectos de audio' : 'Efectos de vídeo', ''); grp.classList.add('fxgrp'); box.appendChild(grp);
  if (c.kind === 'audio'){
    section(box, c, 'Volumen', [['Nivel', 'volume', 0, 400, 1, '', VOLFMT]]);
    section(box, c, 'Panoramizador', [['Balance', 'pan', -100, 100, 1, '']]);
  } else {
    if (c.kind === 'text') box.appendChild(textSection(c));
    section(box, c, 'Movimiento', [['Posición X', 'x', -5000, 5000, 1, ''], ['Posición Y', 'y', -5000, 5000, 1, ''], ['Escala', 'scale', 0, 1000, .1, ''], ['Rotación', 'rotation', -3600, 3600, .1, '°']]);
    section(box, c, 'Opacidad', [['Opacidad', 'opacity', 0, 100, .1, ' %']]);
  }
  if (c.kind !== 'text'){
    const s = section(box, c, 'Reasignación de tiempo', []);
    const row = fxRow(`<span class="swsp"></span><label>Velocidad</label><span class="scrub ro" title="Velocidad/duración (Ctrl+R)">${num(spd(c) * 100)} %</span><span class="rst"></span>`, '');
    row.querySelector('.scrub').onclick = speedDialog;
    s.querySelector('.fxrows').appendChild(row);
  }
  for (const f of c.fx) fxSection(box, c, f);
  const ph = document.createElement('div'); ph.id = 'fxPh'; box.appendChild(ph);
  positionFxPh();
}
function section(box, c, title, rows, extra){
  const s = document.createElement('div'); s.className = 'fxsec' + (closedFx.has(title) ? ' closed' : '');
  const h = fxRow(`<span class="tw"></span><i class="fxi">fx</i><b>${esc(title)}</b>${extra || ''}`, '');
  h.classList.add('fxh');
  h.querySelector('.fxl').addEventListener('click', e => {
    if (e.target.closest('button')) return;
    s.classList.toggle('closed'); closedFx.has(title) ? closedFx.delete(title) : closedFx.add(title); positionFxPh();
  });
  const body = document.createElement('div'); body.className = 'fxrows';
  for (const r of rows) body.appendChild(propRow(c, ...r));
  s.append(h, body); box.appendChild(s); return s;
}
function propRow(c, label, key, min, max, step, unit, fmt){
  const keyable = KEYABLE.has(key) || key.startsWith('fx.');
  const row = document.createElement('div'); row.className = 'fxrow';
  const L = document.createElement('div'); L.className = 'fxl';
  if (keyable){
    const sw = document.createElement('button'); sw.className = 'sw' + (hasKf(c, key) ? ' on' : ''); sw.title = 'Alternar animación'; sw.innerHTML = ICON.stopwatch;
    sw.onclick = () => toggleAnim(c, key); L.appendChild(sw);
  } else { const sp = document.createElement('span'); sp.className = 'swsp'; L.appendChild(sp); }
  const lb = document.createElement('label'); lb.textContent = label; L.appendChild(lb);
  L.appendChild(scrubber(c, key, min, max, step, unit, fmt, label));
  if (hasKf(c, key)){
    const nav = document.createElement('span'); nav.className = 'kfn';
    nav.innerHTML = '<button title="Ir al fotograma clave anterior">◀</button><button title="Añadir o quitar fotograma clave">◆</button><button title="Ir al siguiente fotograma clave">▶</button>';
    const [p, a, n] = nav.children; p.onclick = () => kfJump(c, key, -1); a.onclick = () => kfToggle(c, key); n.onclick = () => kfJump(c, key, 1);
    L.appendChild(nav);
  }
  const rs = document.createElement('button'); rs.className = 'rst'; rs.title = 'Restablecer parámetro'; rs.textContent = '↺'; rs.onclick = () => resetProp(c, key);
  L.appendChild(rs);
  const lane = document.createElement('div'); lane.className = 'lane';
  if (hasKf(c, key)) for (const k of c.kf[key]) lane.appendChild(kfDiamond(c, key, k));
  row.append(L, lane); return row;
}
const KF_EASE = {linear:'Lineal', ease:'Bézier (suave)', in:'Suavizar entrada', out:'Suavizar salida', hold:'Mantener'};
function kfDiamond(c, key, k){
  const d = document.createElement('i'); d.className = 'kd' + (k.e ? ' ' + k.e : ''); d.style.left = (k.t / c.dur * 100) + '%';
  d.title = tc(c.start + k.t) + ' · ' + (KF_EASE[k.e || 'linear']) + ' (clic derecho para cambiar)';
  d.oncontextmenu = e => {
    e.preventDefault(); e.stopPropagation();
    const setE = v => edit(() => { if (v === 'linear') delete k.e; else k.e = v; }, 'Interpolación: ' + KF_EASE[v]);
    ctxMenu(e.clientX, e.clientY, [
      ...Object.entries(KF_EASE).map(([v, n]) => [n, '', () => setE(v), false, (k.e || 'linear') === v]), '-',
      ['Borrar', '', () => edit(() => { c.kf[key] = c.kf[key].filter(x => x !== k); if (!c.kf[key].length){ delete c.kf[key]; setBase(c, key, k.v); } }, 'Borrar fotograma clave')]]);
  };
  d.onmousedown = e => {
    e.preventDefault(); e.stopPropagation();
    const r = d.parentElement.getBoundingClientRect(), before = snap(), t0 = k.t, x0 = e.clientX; let moved = false;
    const mv = ev => { if (Math.abs(ev.clientX - x0) > 2) moved = true; if (!moved) return; k.t = q(clamp(t0 + (ev.clientX - x0) / r.width * c.dur, 0, c.dur)); d.style.left = (k.t / c.dur * 100) + '%'; };
    const up = () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      if (moved){ c.kf[key].sort((a, b) => a.t - b.t); commit(before, 'Mover fotograma clave'); renderTimeline(); }
      else { pause(); seek(c.start + k.t); }
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  return d;
}
function toggleAnim(c, key){
  if (hasKf(c, key)){
    if (!confirm('Esta acción eliminará los fotogramas clave existentes. ¿Desea continuar?')) return;
    const v = val(c, key, S.t); edit(() => { delete c.kf[key]; setBase(c, key, v); }, 'Desactivar animación');
  } else {
    const l = clamp(q(S.t - c.start), 0, c.dur); edit(() => { c.kf[key] = [{t:l, v:baseVal(c, key)}]; }, 'Activar animación');
  }
}
function kfJump(c, key, dir){
  const l = S.t - c.start, ks = c.kf[key] || [];
  const k = dir > 0 ? ks.find(x => x.t > l + 1e-4) : [...ks].reverse().find(x => x.t < l - 1e-4);
  if (k){ pause(); seek(c.start + k.t); }
}
function kfToggle(c, key){
  const l = clamp(q(S.t - c.start), 0, c.dur), a = c.kf[key] || [], ex = a.find(k => Math.abs(k.t - l) < .5 / FPS);
  edit(() => {
    if (ex){ const v = val(c, key, S.t); c.kf[key] = a.filter(k => k !== ex); if (!c.kf[key].length){ delete c.kf[key]; setBase(c, key, v); } }
    else putKf(c, key, l, val(c, key, S.t));
  }, ex ? 'Quitar fotograma clave' : 'Añadir fotograma clave');
}
function defaultOf(c, key){
  if (key.startsWith('fx.')){ const [, id, p] = key.split('.'); const f = c.fx.find(f => f.id === id); const def = f && FXLIB[f.type].params.find(r => r[1] === p); return def ? def[6] : 0; }
  return defaultProps(c.kind)[key];
}
function resetProp(c, key){ edit(() => setVal(c, key, defaultOf(c, key)), 'Restablecer parámetro'); }
function scrubber(c, key, min, max, step, unit, fmt, label){
  const s = document.createElement('span'); s.className = 'scrub';
  const show = fmt ? fmt.show : v => num(v) + unit;
  const toU = fmt ? fmt.toUser : v => v, fromU = fmt ? fmt.fromUser : v => v, ustep = fmt ? fmt.ustep : step;
  const reg = {el:s, c, key, show, last:null}; SCRUBS.push(reg);
  s.textContent = show(val(c, key, S.t));
  s.onmousedown = e => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, u0 = toU(val(c, key, S.t)), before = snap(); let moved = false; ACTIVE_SCRUB = reg;
    const mv = ev => {
      const dx = ev.clientX - x0; if (Math.abs(dx) > 2) moved = true; if (!moved) return;
      const v = clamp(fromU(u0 + dx * ustep * (ev.shiftKey ? 10 : ev.ctrlKey ? .1 : 1)), min, max);
      setVal(c, key, v); s.textContent = show(v); renderTimeline();
    };
    const up = () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); ACTIVE_SCRUB = null;
      if (moved){ commit(before, 'Cambiar ' + (label || key)); if (hasKf(c, key)) renderEffects(true); return; }
      const inp = document.createElement('input'); inp.className = 'scrub-in';
      inp.value = String(Math.round(toU(val(c, key, S.t)) * 100) / 100).replace('.', ',');
      s.replaceWith(inp); inp.focus(); inp.select(); ACTIVE_SCRUB = reg;
      let fin = false;
      const done = ok => {
        if (fin) return; fin = true; ACTIVE_SCRUB = null;
        if (ok){ const u = parseFloat(inp.value.replace(',', '.')); if (!isNaN(u)){ const b = snap(); setVal(c, key, clamp(fromU(u), min, max)); commit(b, 'Cambiar ' + (label || key)); renderTimeline(); } }
        renderEffects(true);
      };
      inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); if (ev.key === 'Escape') done(false); };
      inp.onblur = () => done(true);
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  return s;
}
function refreshScrubs(){
  for (const r of SCRUBS){
    if (r === ACTIVE_SCRUB || !r.el.isConnected) continue;
    const v = val(r.c, r.key, S.t);
    if (r.last !== v){ r.last = v; r.el.textContent = r.show(v); }
  }
}
function positionFxPh(){
  const ph = $('#fxPh'), box = $('#fxBody'); if (!ph) return;
  const c = primaryClip(), lane = box.querySelector('.fxtop .lane');
  if (!c || !lane || S.selTrans){ ph.style.display = 'none'; return; }
  const f = (S.t - c.start) / c.dur;
  if (f < 0 || f > 1){ ph.style.display = 'none'; return; }
  ph.style.display = 'block'; ph.style.left = (lane.offsetLeft + f * lane.clientWidth) + 'px'; ph.style.height = box.scrollHeight + 'px';
}
const ALIGN_ICON = {
  left: P('<path d="M2 3h12v1.6H2zM2 7h8v1.6H2zM2 11h11v1.6H2z"/>'),
  center: P('<path d="M2 3h12v1.6H2zM4 7h8v1.6H4zM2.5 11h11v1.6h-11z"/>'),
  right: P('<path d="M2 3h12v1.6H2zM6 7h8v1.6H6zM3 11h11v1.6H3z"/>')
};
function textSection(c){
  const p = c.props, s = document.createElement('div'); s.className = 'fxsec' + (closedFx.has('Texto') ? ' closed' : '');
  const h = fxRow('<span class="tw"></span><i class="fxi">T</i><b>Texto</b>', ''); h.classList.add('fxh');
  h.querySelector('.fxl').onclick = () => { s.classList.toggle('closed'); closedFx.has('Texto') ? closedFx.delete('Texto') : closedFx.add('Texto'); positionFxPh(); };
  const body = document.createElement('div'); body.className = 'fxrows';
  const fonts = ['Montserrat','Inter','Bebas Neue','Playfair Display','Roboto Mono','Arial','Georgia','Impact','Times New Roman'];
  body.innerHTML = `<div class="fxtext">
    <textarea data-k="text" spellcheck="false">${esc(p.text)}</textarea>
    <div class="r2"><select data-k="font">${fonts.map(f => `<option${f === p.font ? ' selected' : ''}>${f}</option>`).join('')}</select>
      <span class="seg"><button data-b="bold" class="${p.bold ? 'on' : ''}" title="Negrita"><b>N</b></button><button data-b="italic" class="${p.italic ? 'on' : ''}" title="Cursiva"><i>K</i></button></span>
      <span class="seg">${['left','center','right'].map(a => `<button data-al="${a}" class="${p.align === a ? 'on' : ''}" title="${{left:'Alinear a la izquierda', center:'Centrar texto', right:'Alinear a la derecha'}[a]}">${ALIGN_ICON[a]}</button>`).join('')}</span></div>
    <div class="r2" data-size></div>
    <div class="r2"><label><input type="color" data-k="color" value="${p.color}"> Relleno</label>
      <label><input type="checkbox" data-c="stroke"${p.stroke > 0 ? ' checked' : ''}> Trazo</label><input type="color" data-k="strokeColor" value="${p.strokeColor}"></div>
    <div class="r2"><label><input type="checkbox" data-c="shadow"${p.shadow ? ' checked' : ''}> Sombra</label>
      <label><input type="checkbox" data-c="bg"${p.bg ? ' checked' : ''}> Fondo</label><input type="color" data-k="bgColor" value="${p.bgColor}"></div>
  </div>`;
  const sz = body.querySelector('[data-size]'), lbl = document.createElement('label'); lbl.textContent = 'Tamaño de fuente';
  sz.append(lbl, scrubber(c, 'size', 8, 800, 1, ' px', null, 'tamaño de fuente'));
  if (p.stroke > 0){ const l2 = document.createElement('label'); l2.textContent = 'Ancho del trazo'; sz.append(l2, scrubber(c, 'stroke', 1, 60, .2, ' px', null, 'ancho del trazo')); }
  let before = null;
  const begin = () => { if (!before) before = snap(); };
  const end = label => { if (before){ commit(before, label); before = null; } };
  const ta = body.querySelector('textarea');
  ta.addEventListener('focus', begin);
  ta.addEventListener('input', () => { begin(); p.text = ta.value; renderTimeline(); });
  ta.addEventListener('blur', () => end('Editar texto'));
  body.querySelector('[data-k=font]').onchange = e => { const b = snap(); p.font = e.target.value; commit(b, 'Fuente'); };
  body.querySelectorAll('input[type=color]').forEach(inp => {
    inp.addEventListener('input', () => { begin(); p[inp.dataset.k] = inp.value; });
    inp.addEventListener('change', () => end('Color'));
  });
  body.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { const bb = snap(); p[b.dataset.b] = !p[b.dataset.b]; b.classList.toggle('on', p[b.dataset.b]); commit(bb, 'Estilo de texto'); });
  body.querySelectorAll('[data-al]').forEach(b => b.onclick = () => { const bb = snap(); p.align = b.dataset.al; body.querySelectorAll('[data-al]').forEach(x => x.classList.toggle('on', x === b)); commit(bb, 'Alineación del texto'); });
  body.querySelectorAll('[data-c]').forEach(ck => ck.onchange = () => {
    const bb = snap(), k = ck.dataset.c;
    if (k === 'stroke') p.stroke = ck.checked ? 4 : 0; else p[k] = ck.checked;
    commit(bb, 'Apariencia del texto'); if (k === 'stroke') renderEffects(true);
  });
  s.append(h, body); return s;
}
function renderTransControls(box, c, side){
  const tr = side === 'in' ? c.tIn : c.tOut; if (!tr){ box.innerHTML = ''; return; }
  const isA = tr.type in ATRANS, list = isA ? ATRANS : VTRANS;
  const align = side === 'in' ? (prevOf(c) ? 'Comenzar en el corte' : 'Inicio del clip') : 'Fin del clip';
  box.innerHTML = `<div class="fxtr"><h4>${esc(TRANS_NAMES[tr.type])}</h4>
    ${isA ? '' : '<canvas id="trPrev" width="192" height="108"></canvas>'}
    <label>Transición<select id="trType">${Object.entries(list).map(([k, n]) => `<option value="${k}"${k === tr.type ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Duración<input id="trDur" value="${tc(tr.dur)}"></label>
    <label>Alineación<select disabled><option>${align}</option></select></label>
    <div><button class="btn" id="trDel">Borrar transición</button></div></div>`;
  box.querySelector('#trType').onchange = e => edit(() => { tr.type = e.target.value; }, 'Cambiar transición');
  const d = box.querySelector('#trDur');
  d.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') d.blur(); };
  d.onchange = () => { const v = parseTCInput(d.value); if (v > 0) edit(() => { tr.dur = q(clamp(v, 1 / FPS, c.dur)); }, 'Duración de la transición'); else d.value = tc(tr.dur); };
  box.querySelector('#trDel').onclick = () => { S.selTrans = {id:c.id, side}; del(); };
}
function drawTransPreview(cv, type, k){
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const card = (color, label, a, dx, clipFn) => {
    g.save(); if (clipFn){ g.beginPath(); clipFn(); g.clip(); }
    g.globalAlpha = a; g.fillStyle = color; g.fillRect(dx, 0, W, H);
    g.fillStyle = '#fff'; g.font = 'bold 54px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, dx + W/2, H/2);
    g.restore();
  };
  const A = (a = 1, dx = 0) => card('#2f6db3', 'A', a, dx), B = (a = 1, dx = 0, cf) => card('#b33d3d', 'B', a, dx, cf);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  switch (type){
    case 'dissolve': A(); B(k); break;
    case 'dipBlack': if (k < .5) A(1 - 2*k); else B(2*k - 1); break;
    case 'dipWhite': if (k < .5){ A(); g.fillStyle = `rgba(255,255,255,${2*k})`; g.fillRect(0, 0, W, H); } else { B(); g.fillStyle = `rgba(255,255,255,${2 - 2*k})`; g.fillRect(0, 0, W, H); } break;
    case 'wipe': A(); B(1, 0, () => g.rect(0, 0, W * k, H)); break;
    case 'push': A(1, -W * k); B(1, W * (1 - k)); break;
    case 'slide': A(); B(1, W * (1 - k)); break;
    case 'iris': A(); B(1, 0, () => g.arc(W/2, H/2, Math.max(.1, Math.hypot(W, H) / 2 * k), 0, Math.PI * 2)); break;
    default: B();
  }
}
function tickTransPreview(){
  const cv = $('#trPrev'); if (!cv || !S.selTrans) return;
  const c = clip(S.selTrans.id), tr = c && (S.selTrans.side === 'in' ? c.tIn : c.tOut); if (!tr) return;
  drawTransPreview(cv, tr.type, clamp(((performance.now() / 1600) % 1.4) / 1.2, 0, 1));
}
function fxSection(box, c, f){
  const d = FXLIB[f.type]; if (!d) return;
  const s = section(box, c, d.name, d.params.map(([label, p, min, max, step, unit]) => [label, 'fx.' + f.id + '.' + p, min, max, step, unit]),
    `<span class="fxsp"></span><button class="fxon${f.on ? ' on' : ''}" title="Activar o desactivar el efecto">fx</button><button class="fxdel" title="Borrar efecto">${ICON.trash}</button>`);
  s.querySelector('.fxon').onclick = () => edit(() => { f.on = !f.on; }, (f.on ? 'Desactivar ' : 'Activar ') + d.name);
  s.querySelector('.fxdel').onclick = () => removeEffect(c, f.id);
  if (f.type === 'mask'){
    const row = fxRow(`<span class="swsp"></span><label>Forma</label><span class="seg"><button data-sh="ellipse" class="${f.p.shape !== 'rect' ? 'on' : ''}">Elipse</button><button data-sh="rect" class="${f.p.shape === 'rect' ? 'on' : ''}">Rectángulo</button></span><label class="mkinv"><input type="checkbox"${f.p.invert ? ' checked' : ''}> Invertida</label>`, '');
    row.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => edit(() => { f.p.shape = b.dataset.sh; }, 'Forma de la máscara'));
    row.querySelector('.mkinv input').onchange = e => edit(() => { f.p.invert = e.target.checked; }, 'Invertir máscara');
    s.querySelector('.fxrows').prepend(row);
  }
}

/* ============================== panel de efectos ============================== */
const FX_TREE = [
  {name:'Plantillas de gráficos', items:Object.entries(GFX_TEMPLATES).map(([k, t]) => ['g:' + k, t.name])},
  {name:'Efectos de audio', items:[['e:amp','Amplificar']]},
  {name:'Transiciones de audio', sub:[{name:'Fundido cruzado', items:[['t:power','Potencia constante'],['t:gain','Ganancia constante'],['t:expo','Fundido exponencial']]}]},
  {name:'Efectos de vídeo', sub:[
    {name:'Ajuste de imagen', items:[['e:bc','Brillo y contraste'],['e:bw','Blanco y negro'],['e:sepia','Sepia']]},
    {name:'Canal', items:[['e:invert','Invertir']]},
    {name:'Corrección de color', items:[['e:lumetri','Color Lumetri'],['e:hue','Balance de color (HLS)']]},
    {name:'Desenfocar y enfocar', items:[['e:gauss','Desenfoque gaussiano']]},
    {name:'Estilizar', items:[['e:mosaic','Mosaico']]},
    {name:'Transformar', items:[['e:crop','Recortar'],['e:hflip','Voltear horizontal'],['e:vflip','Voltear vertical']]},
    {name:'Transparencia', items:[['e:mask','Máscara de opacidad']]}]},
  {name:'Transiciones de vídeo', sub:[
    {name:'Barrido', items:[['t:wipe','Barrido']]},
    {name:'Deslizar', items:[['t:push','Empujar'],['t:slide','Deslizar']]},
    {name:'Disolver', items:[['t:dissolve','Disolución cruzada'],['t:dipBlack','Pasar a negro'],['t:dipWhite','Pasar a blanco']]},
    {name:'Iris', items:[['t:iris','Iris redondo']]}]}
];
const fxOpen = new Set(['Plantillas de gráficos', 'Transiciones de vídeo', 'Disolver', 'Efectos de vídeo']);
function buildEffectsPanel(){
  const el = $('#fxLib'), qy = $('#fxSearch').value.trim().toLowerCase();
  el.innerHTML = '';
  const mk = node => {
    const items = (node.items || []).filter(([, n]) => !qy || n.toLowerCase().includes(qy));
    const subs = (node.sub || []).map(mk).filter(Boolean);
    if (qy && !items.length && !subs.length) return null;
    const f = document.createElement('div'); f.className = 'fold' + (qy || fxOpen.has(node.name) ? ' open' : '');
    f.innerHTML = `<div class="fh">${ICON.folder}<span>${esc(node.name)}</span></div><div class="fc"></div>`;
    f.firstChild.onclick = () => { f.classList.toggle('open'); fxOpen.has(node.name) ? fxOpen.delete(node.name) : fxOpen.add(node.name); };
    const fc = f.lastChild;
    subs.forEach(x => fc.appendChild(x));
    for (const [key, name] of items){
      const isT = key.startsWith('t:'), isG = key.startsWith('g:'), id = key.slice(2), isA = isT ? id in ATRANS : !!(FXLIB[id] && FXLIB[id].audio);
      const it = document.createElement('div');
      it.className = 'fxitem' + (key === 't:dissolve' || key === 't:power' ? ' def' : '');
      it.draggable = true;
      it.title = isG ? 'Arrástrala a una pista de vídeo o haz doble clic para añadirla en el cabezal' : isT ? 'Arrástrala a un extremo de un clip o haz doble clic para aplicarla al clip seleccionado' : 'Arrástralo a un clip o haz doble clic para aplicarlo a la selección';
      it.innerHTML = `<span class="ic${isG ? ' g' : isT ? '' : ' e'}${isA ? ' a' : ''}"></span>${esc(name)}`;
      it.ondragstart = e => { DRAGFX = key; e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'copy'; };
      it.ondragend = () => { DRAGFX = null; inner.querySelectorAll('.drop-fx').forEach(n => n.classList.remove('drop-fx')); };
      it.ondblclick = () => applyFromLibrary(key);
      fc.appendChild(it);
    }
    return f;
  };
  FX_TREE.forEach(n => { const f = mk(n); if (f) el.appendChild(f); });
  if (!el.children.length) el.innerHTML = '<div class="fxempty">No hay resultados</div>';
}
function applyFromLibrary(key){
  if (key.startsWith('g:')) return addTemplate(key.slice(2), S.t);
  const cs = [...S.sel].map(clip).filter(Boolean);
  if (!cs.length) return toast('Selecciona primero un clip en la línea de tiempo');
  const id = key.slice(2);
  if (key.startsWith('t:')){
    const isA = id in ATRANS, p = primaryClip();
    const c = p && (p.kind === 'audio') === isA ? p : cs.find(k => (k.kind === 'audio') === isA);
    if (!c) return toast(isA ? 'Selecciona un clip de audio' : 'Selecciona un clip de vídeo');
    applyTransition(c, 'in', id);
  } else {
    applyEffectMany(cs, id);
  }
}

/* ========================= marcadores, historial, información ========================= */
function renderMarkers(){
  const el = $('#mkList'); if (!el) return;
  if (!S.markers.length){ el.innerHTML = '<div class="fxempty">No hay marcadores.<br><span class="dim">Pulsa M para añadir uno en el cabezal.</span></div>'; return; }
  el.innerHTML = '';
  S.markers.forEach((mk, i) => {
    const r = document.createElement('div'); r.className = 'lrow' + (Math.abs(mk.t - S.t) < .5 / FPS ? ' on' : '');
    r.innerHTML = `<span class="mk" style="background:${mk.color}"></span><span>${esc(mk.name || 'Marcador ' + (i + 1))}</span><span class="tcs">${tc(mk.t)}</span><button class="x" title="Borrar marcador">×</button>`;
    r.onclick = e => { if (e.target.closest('.x')) return edit(() => { S.markers = S.markers.filter(m => m.id !== mk.id); }, 'Borrar marcador'); pause(); seek(mk.t); renderMarkers(); };
    r.ondblclick = e => { if (!e.target.closest('.x')) editMarker(mk.id); };
    el.appendChild(r);
  });
}
function renderHistory(){
  const el = $('#histList'); if (!el || el.closest('.hidden')) return;
  const rows = [['Abrir', 0], ...UNDO.map((u, i) => [u.label, i + 1]), ...[...REDO].reverse().map((r, i) => [r.label, UNDO.length + i + 1])];
  el.innerHTML = rows.map(([l, n]) => `<div class="lrow${n === UNDO.length ? ' on' : ''}${n > UNDO.length ? ' future' : ''}" data-n="${n}">${esc(l)}</div>`).join('');
  el.querySelectorAll('.lrow').forEach(r => r.onclick = () => historyGo(+r.dataset.n));
  const on = el.querySelector('.on'); if (on) on.scrollIntoView({block:'nearest'});
}
function renderInfo(){
  const el = $('#infoBox'); if (!el || el.closest('.hidden')) return;
  const row = (k, v) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
  const c = primaryClip(); let h = '';
  if (c){
    const m = media(c.mediaId);
    h += `<h6>${esc(c.kind === 'text' ? 'Gráfico: ' + (c.props.text || '').split('\n')[0] : m ? m.name : 'Clip')}</h6>`;
    h += row('Tipo', {video:'Vídeo', audio:'Audio', image:'Imagen fija', text:'Gráfico'}[c.kind]);
    if (m && m.w) h += row('Vídeo', `${m.w} × ${m.h}`);
    h += row('Pista', c.track) + row('Inicio', tc(c.start)) + row('Fin', tc(cend(c))) + row('Duración', tc(c.dur));
    if (mediaBased(c)) h += row('Entrada', tc(c.in)) + row('Salida', tc(c.in + c.dur * spd(c)));
    if (spd(c) !== 1) h += row('Velocidad', num(spd(c) * 100) + ' %');
  } else if (S.projSel && media(S.projSel)){
    const m = media(S.projSel);
    h += `<h6>${esc(m.name)}</h6>` + row('Tipo', TYPE_NAMES[m.type]) + (m.w ? row('Vídeo', `${m.w} × ${m.h}`) : '') + row('Duración', tc(srcDurOf(m)));
    if (m.size) h += row('Tamaño', (m.size / 1048576).toFixed(1).replace('.', ',') + ' MB');
  }
  h += '<h6>Secuencia 01</h6>' + row('Cabezal', tc(S.t)) + row('Duración', tc(seqEnd())) + row('Formato', `${S.seq.w} × ${S.seq.h} · ${FPS} fps`);
  if (S.seqIn != null || S.seqOut != null){ const {a, b} = seqRange(); h += row('Entrada', tc(a)) + row('Salida', tc(b)) + row('Duración E/S', tc(b - a)); }
  el.innerHTML = h;
}

/* ======================== mezclador de pistas de audio ======================== */
const MIXST = {};
function buildMixer(){
  const el = $('#mixer'); if (!el) return;
  el.innerHTML = '';
  for (const id of [...AROWS.map(i => TRACKS[i].id), 'M']){
    const isM = id === 'M', st = isM ? S.master : S.tracks[id];
    const d = document.createElement('div'); d.className = 'strip' + (isM ? ' master' : ''); d.dataset.id = id;
    d.innerHTML = (isM ? '<div class="pv"></div><div class="pv"></div><div class="mb"></div>'
        : `<input type="range" class="pan" min="-100" max="100" step="1" value="${Math.round(st.pan * 100)}" title="Panorámica (doble clic para centrar)"><div class="pv">${panStr(st.pan)}</div><div class="mb"><button class="tb mu${st.mute ? ' on' : ''}" title="Silenciar pista">M</button><button class="tb so${st.solo ? ' on' : ''}" title="Pista solo">S</button></div>`) +
      `<div class="fz"><canvas class="smeter"></canvas><input type="range" class="vf" min="0" max="200" step="1" value="${Math.round(st.vol * 100)}" title="Volumen (doble clic: 0 dB)"></div><div class="db">${dbStr(st.vol)}</div><div class="nm">${isM ? 'Mezcla' : (S.tracks[id].name || 'Audio ' + id.slice(1))}</div>`;
    const vf = d.querySelector('.vf');
    vf.oninput = () => { st.vol = vf.value / 100; d.querySelector('.db').textContent = dbStr(st.vol); scheduleSave(); };
    vf.ondblclick = () => { vf.value = 100; vf.oninput(); };
    if (!isM){
      const pan = d.querySelector('.pan');
      pan.oninput = () => { st.pan = pan.value / 100; d.querySelector('.pv').textContent = panStr(st.pan); scheduleSave(); };
      pan.ondblclick = () => { pan.value = 0; pan.oninput(); };
      d.querySelector('.mu').onclick = () => { st.mute = !st.mute; buildTracks(); buildMixer(); };
      d.querySelector('.so').onclick = () => { st.solo = !st.solo; buildTracks(); buildMixer(); };
    }
    MIXST[id] = MIXST[id] || {lv:[], pk:[], pt:[]};
    el.appendChild(d);
  }
}
function tickMixer(){
  $$('#mixer .strip').forEach(d => {
    const id = d.dataset.id, cv = d.querySelector('.smeter');
    drawMeter(cv, MIXST[id], id === 'M' ? [level(anL), level(anR)] : [level(TRK[id] && TRK[id].an)]);
  });
}

/* ================== monitor de programa: selección, cuadro delimitador ================== */
const OVL = $('#ovl');
function monitorGeom(){
  const view = $('#prgView'), vr = view.getBoundingClientRect(), cr = CV.getBoundingClientRect();
  const s = Math.min(cr.width / S.seq.w, cr.height / S.seq.h);
  return {s, ox: cr.left + (cr.width - S.seq.w * s) / 2, oy: cr.top + (cr.height - S.seq.h * s) / 2, vr, view};
}
function updateOverlay(){
  const c = primaryClip();
  const show = c && visual(c) && !S.playing && !EXPORT && S.mode === 'edit' && !c.disabled && !S.tracks[c.track].hide && S.t >= c.start && S.t < cend(c) && S.tool !== 'razor';
  const b = show && clipBounds(c, S.t);
  if (!b){ OVL.style.display = 'none'; return; }
  const {s, ox, oy, vr, view} = monitorGeom();
  OVL.style.display = 'block';
  OVL.style.left = (ox - vr.left + view.scrollLeft + (b.cx - b.w / 2) * s) + 'px';
  OVL.style.top = (oy - vr.top + view.scrollTop + (b.cy - b.h / 2) * s) + 'px';
  OVL.style.width = b.w * s + 'px'; OVL.style.height = b.h * s + 'px';
  OVL.style.transform = `rotate(${b.rot}deg)`;
  const mk = c.fx.find(f => f.on && f.type === 'mask'), mv = $('#movl');
  if (mk && !$('#fxBody').closest('.hidden')){
    // la máscara se dibuja sobre el área recortada y dentro del volteo del clip
    const cr = fxOn(c, 'crop'), L = cr ? fv(c, cr, 'l', S.t) / 100 : 0, R = cr ? fv(c, cr, 'r', S.t) / 100 : 0, T = cr ? fv(c, cr, 't', S.t) / 100 : 0, B = cr ? fv(c, cr, 'b', S.t) / 100 : 0;
    const fw = Math.max(.01, 1 - L - R), fh = Math.max(.01, 1 - T - B);
    let x = fv(c, mk, 'x', S.t), y = fv(c, mk, 'y', S.t); const w = fv(c, mk, 'w', S.t) * fw, h = fv(c, mk, 'h', S.t) * fh;
    let cx = (L + (.5 + x / 100) * fw) * 100, cy = (T + (.5 + y / 100) * fh) * 100;
    if (fxOn(c, 'hflip')) cx = 100 - cx; if (fxOn(c, 'vflip')) cy = 100 - cy;
    mv.style.display = 'block'; mv.style.left = (cx - w / 2) + '%'; mv.style.top = (cy - h / 2) + '%';
    mv.style.width = w + '%'; mv.style.height = h + '%'; mv.dataset.fw = fw; mv.dataset.fh = fh; mv.dataset.hf = fxOn(c, 'hflip') ? -1 : 1; mv.dataset.vf = fxOn(c, 'vflip') ? -1 : 1; mv.style.borderRadius = mk.p.shape === 'rect' ? '0' : '50%';
    mv.dataset.fx = mk.id;
  } else mv.style.display = 'none';
}
function startMaskDrag(e, corner){
  const c = primaryClip(), m = c && c.fx.find(f => f.id === $('#movl').dataset.fx); if (!m) return;
  const r = OVL.getBoundingClientRect(), W = OVL.offsetWidth || 1, H = OVL.offsetHeight || 1;
  const k = key => 'fx.' + m.id + '.' + key, x0 = e.clientX, y0 = e.clientY, before = snap();
  const v0 = {x:val(c, k('x'), S.t), y:val(c, k('y'), S.t), w:val(c, k('w'), S.t), h:val(c, k('h'), S.t)};
  let moved = false;
  const mv = ev => {
    moved = true;
    const ds = $('#movl').dataset, dx = (ev.clientX - x0) / W * 100 / +ds.fw, dy = (ev.clientY - y0) / H * 100 / +ds.fh;
    if (corner){ setVal(c, k('w'), clamp(v0.w + dx * 2, 1, 300)); setVal(c, k('h'), clamp(v0.h + dy * 2, 1, 300)); }
    else { setVal(c, k('x'), clamp(v0.x + dx * +ds.hf, -100, 100)); setVal(c, k('y'), clamp(v0.y + dy * +ds.vf, -100, 100)); }
  };
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (moved){ commit(before, corner ? 'Tamaño de la máscara' : 'Posición de la máscara'); renderEffects(true); } };
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
}
function hitTest(e){
  const {s, ox, oy} = monitorGeom(), x = (e.clientX - ox) / s, y = (e.clientY - oy) / s;
  for (const tid of videoIds()){
    if (S.tracks[tid].hide) continue;
    const c = S.clips.find(k => k.track === tid && !k.disabled && S.t >= k.start && S.t < cend(k)); if (!c) continue;
    const b = clipBounds(c, S.t); if (!b) continue;
    const a = -b.rot * Math.PI / 180, dx = x - b.cx, dy = y - b.cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return c;
  }
  return null;
}
function startOverlayDrag(e, c, corner){
  const {s} = monitorGeom(), before = snap(), x0 = e.clientX, y0 = e.clientY;
  const px = val(c, 'x', S.t), py = val(c, 'y', S.t), sc0 = val(c, 'scale', S.t);
  const r = OVL.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, d0 = Math.hypot(x0 - cx, y0 - cy) || 1;
  let moved = false;
  const mv = ev => {
    if (!moved && Math.abs(ev.clientX - x0) < 2 && Math.abs(ev.clientY - y0) < 2) return;
    moved = true;
    if (corner) setVal(c, 'scale', clamp(Math.round(sc0 * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0 * 10) / 10, 0, 1000));
    else { setVal(c, 'x', Math.round(px + (ev.clientX - x0) / s)); setVal(c, 'y', Math.round(py + (ev.clientY - y0) / s)); }
  };
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (moved){ commit(before, corner ? 'Escala' : 'Posición'); renderEffects(true); renderTimeline(); } };
  window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
}
function setMonZoom(v){
  S.monZoom = v; const view = $('#prgView');
  if (v === 'fit'){ view.classList.remove('zoomed'); CV.style.width = ''; CV.style.height = ''; }
  else { view.classList.add('zoomed'); CV.style.width = S.seq.w * +v + 'px'; CV.style.height = S.seq.h * +v + 'px'; }
}

/* =============================== visores Lumetri =============================== */
const SCS = document.createElement('canvas'); SCS.width = 160; SCS.height = 90;
function drawScopes(){
  const cv = $('#scopeCv'); if (!cv || cv.closest('.hidden')) return;
  const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1; if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, w, h);
  const sg = SCS.getContext('2d', {willReadFrequently:true}); sg.drawImage(CV, 0, 0, SCS.width, SCS.height);
  const d = sg.getImageData(0, 0, SCS.width, SCS.height).data, SW = SCS.width, SH = SCS.height;
  const mode = $('#scopeMode').value, pad = 26, gw = w - pad - 8, gh = h - 16;
  g.font = '9px Inter, sans-serif'; g.fillStyle = '#666'; g.strokeStyle = '#2a2a2a'; g.lineWidth = 1;
  if (mode === 'vector'){
    const R = Math.min(w, h) / 2 - 12, cx = w / 2, cy = h / 2;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    g.strokeStyle = '#6b4a2a'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(-2.15), cy + R * Math.sin(-2.15)); g.stroke();
    [['R',  .439, -.368, '#c33'], ['G', -.291, -.439, '#3c3'], ['B', -.148, .439, '#36c'], ['Cy', -.439, .071, '#3cc'], ['Mg', .291, .439, '#c3c'], ['Yl', .148, -.439, '#cc3']].forEach(([l, v, u, col]) => {
      const x = cx + u * R * 2 * .9, y = cy - v * R * 2 * .9; g.strokeStyle = col; g.strokeRect(x - 4, y - 4, 8, 8); g.fillStyle = col; g.fillText(l, x + 6, y + 3);
    });
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(120,255,140,.25)';
    for (let i = 0; i < d.length; i += 4){
      const r = d[i] / 255, gg = d[i+1] / 255, b = d[i+2] / 255;
      const u = -.147 * r - .289 * gg + .436 * b, v = .615 * r - .515 * gg - .1 * b;
      g.fillRect(cx + u * R * 2 * .9, cy - v * R * 2 * .9, 1.2, 1.2);
    }
  } else {
    for (const ire of [0, 25, 50, 75, 100]){ const y = 8 + gh - ire / 100 * gh; g.beginPath(); g.moveTo(pad, y + .5); g.lineTo(w - 8, y + .5); g.stroke(); g.fillText(String(ire), 4, y + 3); }
    g.globalCompositeOperation = 'lighter';
    const parade = mode === 'rgb', cols = parade ? [['rgba(255,70,70,.22)', 0], ['rgba(70,255,90,.22)', 1], ['rgba(80,130,255,.26)', 2]] : [['rgba(140,255,150,.2)', -1]];
    cols.forEach(([col, ch], n) => {
      g.fillStyle = col;
      const x0 = pad + (parade ? n * gw / 3 : 0), ww = parade ? gw / 3 - 4 : gw;
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++){
        const i = (y * SW + x) * 4, v = ch < 0 ? (.2126 * d[i] + .7152 * d[i+1] + .0722 * d[i+2]) : d[i + ch];
        g.fillRect(x0 + x / SW * ww, 8 + gh - v / 255 * gh, 1.4, 1.2);
      }
    });
  }
  g.globalCompositeOperation = 'source-over';
}

/* ================================ refresco por fotograma ================================ */
let TICK = 0;
function tickPanels(){
  TICK++;
  if (!srcV.paused) updateSrcUI();
  updateOverlay();
  if (!$('#mixer').closest('.hidden')) tickMixer();
  const fx = $('#fxBody');
  if (!fx.closest('.hidden')){ if (!ACTIVE_SCRUB) refreshScrubs(); positionFxPh(); if (S.selTrans) tickTransPreview(); }
  if (TICK % 4 === 0) drawScopes();
  if (TICK % 10 === 0){ const ib = $('#infoBox'); if (!ib.closest('.hidden')) renderInfo(); }
  if (S.mode === 'export') tickExportView();
}

function initPanels(){
  $$('.panel .tab[data-tab]').forEach(t => t.addEventListener('click', () => setPanelTab(t.closest('.panel').id, t.dataset.tab)));
  $('#srcPanel').addEventListener('mousedown', () => { const on = $('#srcPanel .tab.on'); FOCUS = on && on.dataset.tab === 'source' ? 'source' : 'fx'; focusUI(); });
  $('#prgPanel').addEventListener('mousedown', () => { FOCUS = 'program'; focusUI(); });
  $('#projPanel').addEventListener('mousedown', () => { const on = $('#projPanel .tab.on'); FOCUS = on && on.dataset.tab === 'project' ? 'project' : 'panel'; focusUI(); });
  // proyecto
  $('#projSearch').addEventListener('input', renderProject);
  $('#projList').addEventListener('dblclick', e => { if (!e.target.closest('.pitem')) $('#fileIn').click(); });
  // monitor de origen
  ['timeupdate','play','pause','loadedmetadata'].forEach(ev => srcV.addEventListener(ev, updateSrcUI));
  dragBar($('#srcBar'), f => { const m = media(S.src.id); if (!m || m.type === 'image') return; srcV.pause(); srcV.currentTime = f * m.duration; updateSrcUI(); });
  const sv = $('#srcPanel .mview'); sv.draggable = true;
  sv.addEventListener('dragstart', e => { if (!S.src.id){ e.preventDefault(); return; } DRAGMEDIA = S.src.id; DRAGRANGE = srcRange(); e.dataTransfer.setData('text/plain', media(S.src.id).name); e.dataTransfer.effectAllowed = 'copy'; });
  sv.addEventListener('dragend', () => { DRAGMEDIA = null; DRAGRANGE = null; $('#ghost').style.display = 'none'; });
  tcEditable($('#srcTC'), srcTime, v => { const m = media(S.src.id); if (m && m.type !== 'image'){ srcV.pause(); srcV.currentTime = clamp(v, 0, m.duration); } });
  tcEditable($('#prgTC'), () => S.t, v => { pause(); seek(v); });
  tcEditable($('#tlTC'), () => S.t, v => { pause(); seek(v); });
  // efectos
  $('#fxSearch').addEventListener('input', buildEffectsPanel);
  const fb = $('#fxBody');
  fb.addEventListener('dragover', e => { if (DRAGFX){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  fb.addEventListener('drop', e => {
    if (!DRAGFX) return; e.preventDefault(); const key = DRAGFX; DRAGFX = null;
    if (key.startsWith('g:')) return addTemplate(key.slice(2), S.t);
    const c = primaryClip(); if (!c) return toast('Selecciona primero un clip');
    if (key.startsWith('t:')) applyTransition(c, 'in', key.slice(2)); else applyEffect(c, key.slice(2));
  });
  // monitor de programa
  CV.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    FOCUS = 'program'; focusUI();
    if (S.tool === 'text'){ const {s, ox, oy} = monitorGeom(); addTitle(S.t, null, (e.clientX - ox) / s - S.seq.w / 2, (e.clientY - oy) / s - S.seq.h / 2); return; }
    if (S.playing) return;
    const c = hitTest(e); if (!c || S.tracks[c.track].lock) return;
    S.sel = new Set([c.id]); if (S.linkedSel && c.link) S.clips.forEach(o => { if (o.link === c.link) S.sel.add(o.id); });
    S.primary = c.id; S.selTrans = null; S.gap = null; renderTimeline(); renderEffects(true);
    e.preventDefault(); startOverlayDrag(e, c, false);
  });
  $('#movl').addEventListener('mousedown', e => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); FOCUS = 'program'; focusUI();
    startMaskDrag(e, e.target.tagName === 'I');
  });
  $('#scopeMode').onchange = () => drawScopes(true);
  OVL.addEventListener('mousedown', e => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); FOCUS = 'program'; focusUI();
    const c = primaryClip(); if (c) startOverlayDrag(e, c, e.target.tagName === 'I');
  });
  $('#monZoom').onchange = e => setMonZoom(e.target.value);
  $('#monRes').onchange = e => { S.res = +e.target.value; };
}
