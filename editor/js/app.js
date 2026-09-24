'use strict';
/* AuthenCut Pro · aplicación: menús, modos Importar/Editar/Exportar, espacios de trabajo, teclado e inicio */

/* ============================ espacios de trabajo ============================ */
const WORKSPACES = {
  'Edición':    {top:54, lc:50, pc:28, src:'source', bot:'project'},
  'Ensamblaje': {top:62, lc:40, pc:46, src:'source', bot:'project'},
  'Color':      {top:60, lc:36, pc:24, src:'scopes', bot:'effects'},
  'Efectos':    {top:56, lc:44, pc:28, src:'fx',     bot:'effects'},
  'Audio':      {top:52, lc:50, pc:28, src:'mixer',  bot:'project'},
  'Gráficos':   {top:56, lc:44, pc:24, src:'fx',     bot:'project', tool:'text'}
};
function setWorkspace(n){
  const w = WORKSPACES[n]; if (!w) return;
  S.ws = n;
  if (S.mode !== 'edit') setMode('edit');
  $('#main').style.setProperty('--top', w.top + '%');
  $('#topRow').style.setProperty('--lc', w.lc + '%');
  $('#botRow').style.setProperty('--pc', w.pc + '%');
  setTab(w.src); setBotTab(w.bot); setTool(w.tool || 'select');
  renderTimeline(); updateSrcUI(); status('Espacio de trabajo: ' + n);
}
function buildWsMenu(){
  const dd = $('#wsMenu .dd'); dd.innerHTML = '<div class="grp">Espacios de trabajo</div>';
  for (const n of Object.keys(WORKSPACES)){
    const b = document.createElement('button'); b.innerHTML = `<em>${S.ws === n ? '✓' : ''}</em>${n}`;
    b.onclick = () => { closeMenus(); setWorkspace(n); }; dd.appendChild(b);
  }
  dd.appendChild(document.createElement('hr'));
  const r = document.createElement('button'); r.innerHTML = '<em></em>Restablecer al diseño guardado';
  r.onclick = () => { closeMenus(); setWorkspace(S.ws); }; dd.appendChild(r);
}

/* ================================== menús ================================== */
function goSeqIn(){ pause(); seek(S.seqIn ?? 0); }
function goSeqOut(){ pause(); seek(S.seqOut ?? seqEnd()); }
function setRes(r){ S.res = r; $('#monRes').value = String(r); }
function setMonZoomUI(v){ $('#monZoom').value = v; setMonZoom(v); }
function editMarkerAtPlayhead(){ const mk = S.markers.find(m => Math.abs(m.t - S.t) < .5 / FPS); if (mk) editMarker(mk.id); else toast('No hay ningún marcador en el cabezal'); }
function toggleSnap(){ S.snap = !S.snap; $('#btnSnap').classList.toggle('on', S.snap); status('Ajustar en la línea de tiempo: ' + (S.snap ? 'activado' : 'desactivado')); }
const MENUS = {
  'Archivo': [
    ['Nuevo proyecto', 'Ctrl+Alt+N', newProject], ['Abrir proyecto…', 'Ctrl+O', openProjectFile], ['Guardar', 'Ctrl+S', saveProjectFile], '-',
    ['Importar…', 'Ctrl+I', () => $('#fileIn').click()], '-',
    ['Exportar medios…', 'Ctrl+M', () => setMode('export')], ['Exportación rápida', '', quickExport], ['Exportar fotograma', 'Ctrl+Mayús+E', exportFrame]],
  'Edición': [
    ['Deshacer', 'Ctrl+Z', undo], ['Rehacer', 'Ctrl+Mayús+Z', redo], '-',
    ['Cortar', 'Ctrl+X', cut], ['Copiar', 'Ctrl+C', copy], ['Pegar', 'Ctrl+V', () => paste(false)], ['Pegar inserción', 'Ctrl+Mayús+V', () => paste(true)],
    ['Borrar', 'Supr', del], ['Eliminar con ondulación', 'Mayús+Supr', rippleDel], '-',
    ['Seleccionar todo', 'Ctrl+A', selectAll], ['Anular la selección de todo', 'Ctrl+Mayús+A', deselectAll], '-',
    ['Métodos abreviados de teclado', 'Ctrl+Alt+K', showShortcuts]],
  'Clip': [
    ['Velocidad/duración…', 'Ctrl+R', speedDialog], '-',
    ['Insertar', ',', () => insertFromSource(false)], ['Sobrescribir', '.', () => insertFromSource(true)], '-',
    ['Habilitar / Deshabilitar', 'Mayús+E', toggleEnable], ['Vincular / Desvincular', 'Ctrl+L', toggleLink], '-',
    ['Ajustar al tamaño del fotograma', '', () => scaleToFrame(false)], ['Rellenar el fotograma', '', () => scaleToFrame(true)]],
  'Secuencia': [
    ['Ajustes de secuencia…', '', seqSettings], '-',
    ['Añadir edición', 'Ctrl+K', () => splitAtPlayhead(false)], ['Añadir edición a todas las pistas', 'Ctrl+Mayús+K', () => splitAtPlayhead(true)],
    ['Aplicar transición de vídeo', 'Ctrl+D', () => applyDefaultTransitions('v')], ['Aplicar transición de audio', 'Ctrl+Mayús+D', () => applyDefaultTransitions('a')],
    ['Aplicar transiciones predeterminadas a la selección', 'Mayús+D', () => applyDefaultTransitions('both')], '-',
    ['Levantar', ';', () => liftExtract(false)], ['Extraer', "'", () => liftExtract(true)], '-',
    ['Acercar', '=', () => zoomBy(1.4)], ['Alejar', '-', () => zoomBy(1 / 1.4)], ['Ajustar la secuencia a la ventana', '\\', zoomFit], '-',
    ['Ajustar en la línea de tiempo', 'S', toggleSnap], ['Ir al siguiente punto de edición', '↓', () => jumpEdit(1)], ['Ir al punto de edición anterior', '↑', () => jumpEdit(-1)]],
  'Marcadores': [
    ['Marcar entrada', 'I', markSeqIn], ['Marcar salida', 'O', markSeqOut], ['Ir a entrada', 'Mayús+I', goSeqIn], ['Ir a salida', 'Mayús+O', goSeqOut], ['Borrar entrada y salida', 'Ctrl+Mayús+X', clearSeqIO], '-',
    ['Añadir marcador', 'M', () => addMarker()], ['Ir al siguiente marcador', 'Mayús+M', () => jumpMarker(1)], ['Ir al marcador anterior', 'Ctrl+Mayús+M', () => jumpMarker(-1)],
    ['Editar marcador…', '', editMarkerAtPlayhead], ['Borrar todos los marcadores', '', clearMarkers]],
  'Gráficos y títulos': [['Nueva capa: Texto', 'Ctrl+T', () => addTitle()], ['Herramienta Texto', 'T', () => setTool('text')], '-',
    {grp:'Plantillas'}, ...Object.entries(GFX_TEMPLATES).map(([k, t]) => [t.name, '', () => addTemplate(k, S.t)])],
  'Ver': [
    {grp:'Resolución de reproducción'}, ['Completa', '', () => setRes(1)], ['1/2', '', () => setRes(2)], ['1/4', '', () => setRes(4)], '-',
    {grp:'Zoom del monitor de programa'}, ['Ajustar', '', () => setMonZoomUI('fit')], ['50 %', '', () => setMonZoomUI('0.5')], ['100 %', '', () => setMonZoomUI('1')]],
  'Ventana': [
    {grp:'Espacios de trabajo'}, ...Object.keys(WORKSPACES).map(n => [n, '', () => setWorkspace(n)]), '-',
    ['Proyecto', 'Mayús+1', () => setBotTab('project')], ['Monitor de origen', 'Mayús+2', () => setTab('source')], ['Controles de efectos', 'Mayús+5', () => setTab('fx')],
    ['Mezclador de pistas de audio', 'Mayús+6', () => setTab('mixer')], ['Visores Lumetri', '', () => setTab('scopes')], ['Efectos', 'Mayús+7', () => setBotTab('effects')],
    ['Marcadores', '', () => setBotTab('markers')], ['Historial', '', () => setBotTab('history')], ['Información', '', () => setBotTab('info')]],
  'Ayuda': [['Métodos abreviados de teclado', 'F1', showShortcuts], ['Acerca de AuthenCut Pro', '', about]]
};
function buildMenus(){
  const host = $('#menus');
  for (const [name, items] of Object.entries(MENUS)){
    const m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = `<button>${name}</button><div class="dd"></div>`;
    const dd = m.querySelector('.dd');
    for (const it of items){
      if (it === '-'){ dd.appendChild(document.createElement('hr')); continue; }
      if (it.grp){ const g = document.createElement('div'); g.className = 'grp'; g.textContent = it.grp; dd.appendChild(g); continue; }
      const b = document.createElement('button'); b.innerHTML = `<em></em>${esc(it[0])}<span>${it[1]}</span>`;
      b.onclick = () => { closeMenus(); it[2](); }; dd.appendChild(b);
    }
    m.firstChild.onclick = e => { e.stopPropagation(); const o = m.classList.contains('open'); closeMenus(); if (!o) m.classList.add('open'); };
    m.firstChild.onmouseenter = () => { if ($('#menus .menu.open') && !m.classList.contains('open')){ closeMenus(); m.classList.add('open'); } };
    host.appendChild(m);
  }
}
const closeMenus = () => $$('.menu.open').forEach(m => m.classList.remove('open'));

/* ================================ herramientas ================================ */
const TOOLS = [['select','Herramienta Selección (V)'],['trackfwd','Herramienta Seleccionar pista hacia delante (A)'],['ripple','Herramienta Edición de ondulación (B)'],['rolling','Herramienta Edición de rodillo (N)'],['rate','Herramienta Ajuste de velocidad (R)'],['razor','Herramienta Cuchilla (C)'],['slip','Herramienta Desplazar (Y)'],['hand','Herramienta Mano (H)'],['zoom','Herramienta Zoom (Z)'],['text','Herramienta Texto (T)']];
function buildTools(){
  const t = $('#tools');
  TOOLS.forEach(([id, tip]) => { const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = id; b.title = tip; b.innerHTML = ICON[id]; b.onclick = () => setTool(id); t.appendChild(b); });
}
function setTool(id){
  S.tool = id;
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
  [...document.body.classList].filter(c => c.startsWith('t-')).forEach(c => document.body.classList.remove(c));
  if (id !== 'select') document.body.classList.add('t-' + id);
  const t = TOOLS.find(x => x[0] === id); if (t) status(t[1]);
}

/* ============================ modos de la cabecera ============================ */
function setMode(mode){
  S.mode = mode;
  $$('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('#main').classList.toggle('hidden', mode !== 'edit');
  $('#importView').classList.toggle('hidden', mode !== 'import');
  $('#exportView').classList.toggle('hidden', mode !== 'export');
  if (mode === 'import') renderImportView();
  else if (mode === 'export') openExportView();
  else { renderTimeline(); updateSrcUI(); }
}

/* ------------------------------- vista Importar ------------------------------- */
const ivSel = new Set();
function renderImportView(){
  if (document.activeElement !== $('#ivName')) $('#ivName').value = $('#projName').value;
  $('#ivSeq').innerHTML = SEQ_PRESETS.map(([w, h, l]) => `<option value="${w}x${h}"${S.seq.w === w && S.seq.h === h ? ' selected' : ''}>${l}</option>`).join('');
  const g = $('#ivGrid'); g.innerHTML = '';
  for (const m of S.media){
    const on = ivSel.has(m.id), d = document.createElement('div'); d.className = 'iv-item' + (on ? ' on' : '');
    d.innerHTML = `<div class="pthumb" style="${m.thumb ? `background-image:url(${m.thumb})` : ''}">${m.type === 'audio' ? ICON.wave : ''}${m.offline ? '<span class="off">Sin conexión</span>' : ''}<span class="pdur">${tc(srcDurOf(m))}</span><span class="ivck">${on ? '✓' : ''}</span></div><div class="pname"><span class="pbadge ${m.type}"></span>${esc(m.name)}</div>`;
    d.onclick = () => { on ? ivSel.delete(m.id) : ivSel.add(m.id); renderImportView(); };
    g.appendChild(d);
  }
  const n = [...ivSel].filter(id => media(id)).length;
  $('#ivSum').innerHTML = `${S.media.length} medio(s) en el proyecto<br>${n} seleccionado(s) para la secuencia`;
  $('#ivGo').textContent = n ? 'Crear' : 'Ir a Editar';
}
async function ivImport(files){ const ms = await importFiles(files); ms.forEach(m => ivSel.add(m.id)); renderImportView(); }
function ivCreate(){
  $('#projName').value = $('#ivName').value.trim() || 'Proyecto sin título'; syncName();
  const [w, h] = $('#ivSeq').value.split('x').map(Number);
  if (w !== S.seq.w || h !== S.seq.h) setSeq(w, h);
  const ids = S.media.filter(m => ivSel.has(m.id) && !m.offline).map(m => m.id);
  if ($('#ivAuto').checked && ids.length){
    edit(() => {
      let t = q(seqEnd());
      for (const id of ids){ const m = media(id); const cs = makeClips(m, t, 'V1', 'A1', 0, null).filter(c => !S.tracks[c.track].lock); S.clips.push(...cs); t = q(t + srcDurOf(m)); }
    }, 'Crear secuencia');
    ivSel.clear();
  }
  setMode('edit'); zoomFit(); scheduleSave();
}

/* ------------------------------- vista Exportar ------------------------------- */
function mimeOptions(){
  if (!window.MediaRecorder) return {};
  const ok = t => { try { return MediaRecorder.isTypeSupported(t); } catch(e){ return false; } };
  return {
    mp4: ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'].find(ok),
    webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(ok)
  };
}
function openExportView(){
  const {mp4, webm} = mimeOptions(), f = $('#exFmt'), prev = f.value;
  f.innerHTML = (mp4 ? `<option value="${mp4}">H.264 (.mp4)</option>` : '') + (webm ? `<option value="${webm}">WebM · VP9 (.webm)</option>` : '');
  if ([...f.options].some(o => o.value === prev)) f.value = prev;
  if (!$('#exName').value) $('#exName').value = projName();
  $('#exRes').textContent = `${S.seq.w} × ${S.seq.h}`;
  $('#exRange').value = (S.seqIn != null || S.seqOut != null) ? 'io' : 'all';
  const ev = $('#evCv'); ev.width = 960; ev.height = Math.round(960 * S.seq.h / S.seq.w);
  updateExportSummary();
}
function exportSettings(){
  const range = $('#exRange').value === 'io' ? seqRange() : {a:0, b:seqEnd()};
  return {name: $('#exName').value.trim() || projName(), mime: $('#exFmt').value, vbps: +$('#exBr').value, abps: +$('#exAbr').value, a: range.a, b: range.b};
}
function updateExportSummary(){
  const s = exportSettings(), dur = Math.max(0, s.b - s.a), mp4 = s.mime && s.mime.includes('mp4');
  const size = (s.vbps + s.abps) * dur / 8 / 1048576;
  $('#exAc').textContent = mp4 ? 'AAC' : 'Opus';
  $('#evSum').innerHTML = `<dt>Formato</dt><dd>${s.mime ? (mp4 ? 'H.264 (.mp4)' : 'WebM (.webm)') : 'No disponible en este navegador'}</dd>
    <dt>Vídeo</dt><dd>${S.seq.w}×${S.seq.h} · ${FPS} fps · ${s.vbps / 1e6} Mbps</dd>
    <dt>Audio</dt><dd>${mp4 ? 'AAC' : 'Opus'} · 48 kHz · ${s.abps / 1000} kbps</dd>
    <dt>Rango</dt><dd>${tc(s.a)} → ${tc(s.b)}</dd>
    <dt>Duración</dt><dd>${tc(dur)}</dd>
    <dt>Tamaño estimado</dt><dd>${size.toFixed(1).replace('.', ',')} MB</dd>
    <dt>Archivo</dt><dd>${esc(s.name)}${mp4 ? '.mp4' : '.webm'}</dd>`;
  $('#evDur').textContent = tc(dur);
  $('#evGo').disabled = !s.mime || dur <= 0;
}
function tickExportView(){
  const ev = $('#evCv'); ev.getContext('2d').drawImage(CV, 0, 0, ev.width, ev.height);
  $('#evTC').textContent = tc(S.t);
  const s = exportSettings(), bar = $('#evBar');
  bar.querySelector('.hd').style.left = (8 + clamp((S.t - s.a) / Math.max(1e-6, s.b - s.a), 0, 1) * (bar.clientWidth - 16)) + 'px';
}
async function startExport(s){
  if (EXPORT) return;
  if (!s.mime || !CV.captureStream) return toast('Tu navegador no permite exportar vídeo. Usa Chrome o Edge.');
  if (s.b - s.a <= 0) return toast('La secuencia está vacía: añade clips antes de exportar');
  ensureAudio(); pause(); srcV.pause();
  EXPORT = {start:s.a, end:s.b, cancelled:false};
  S.t = s.a; draw();
  const stream = CV.captureStream(FPS);
  if (recDest) recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  let rec;
  try { rec = new MediaRecorder(stream, {mimeType:s.mime, videoBitsPerSecond:s.vbps, audioBitsPerSecond:s.abps}); }
  catch(e){ EXPORT = null; return toast('No se pudo iniciar la exportación: ' + e.message); }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const m = modal('Codificando', `<div>Exportando <b>${esc(s.name)}</b></div><div class="prog"><i></i></div><div class="dim" id="exEta">Preparando…</div><div class="dim">La exportación se procesa en tiempo real. No cambies de pestaña mientras dura.</div>`, [['Cancelar', () => { cancelExport(); return false; }]]);
  Object.assign(EXPORT, {rec, bar:m.querySelector('.prog i'), eta:m.querySelector('#exEta'), modal:m});
  rec.onstop = () => {
    const ex = EXPORT; EXPORT = null; if (ex && ex.modal) ex.modal.remove();
    stream.getVideoTracks().forEach(t => t.stop());
    if (!ex || ex.cancelled) return toast('Exportación cancelada');
    const blob = new Blob(chunks, {type: s.mime.split(';')[0]});
    const file = s.name + (s.mime.includes('mp4') ? '.mp4' : '.webm');
    download(blob, file);
    toast(`Exportación completa · ${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB`); status('Exportado: ' + file);
  };
  sync(); await new Promise(r => setTimeout(r, 500));
  if (!EXPORT || EXPORT.cancelled) return;
  rec.start(250); play();
}
function finishExport(){ const ex = EXPORT; if (ex && ex.rec && ex.rec.state !== 'inactive') setTimeout(() => { if (ex.rec.state !== 'inactive') ex.rec.stop(); }, 150); }
function cancelExport(){
  const ex = EXPORT; if (!ex) return;
  ex.cancelled = true; pause();
  if (ex.rec && ex.rec.state !== 'inactive') ex.rec.stop();
  else { EXPORT = null; if (ex.modal) ex.modal.remove(); toast('Exportación cancelada'); }
}
function quickExport(){ openExportView(); startExport(exportSettings()); }
function exportFrame(){
  const r = S.res; S.res = 1; draw();
  CV.toBlob(b => { download(b, `${projName()}_${tc(S.t).replace(/:/g, '-')}.png`); toast('Fotograma exportado'); }, 'image/png');
  S.res = r;
}

/* ============================ inicio, ayuda, paneles ============================ */
function homeScreen(){
  const m = modal('Inicio', `<div class="homeg">
    <button data-a="new">${ICON.home}<span><b>Nuevo proyecto</b><small>Empieza desde cero</small></span></button>
    <button data-a="open">${ICON.folder}<span><b>Abrir proyecto…</b><small>Archivo .acproj guardado en tu equipo</small></span></button>
    <button data-a="import">${ICON.import}<span><b>Importar medios</b><small>Vídeo, audio e imágenes</small></span></button>
    <button data-a="cont">${ICON.play}<span><b>Continuar: ${esc($('#projName').value)}</b><small>${S.media.length} medio(s) · duración ${tc(seqEnd())}</small></span></button></div>`, [['Cerrar']]);
  const acts = {new:newProject, open:openProjectFile, import:() => setMode('import'), cont:() => setMode('edit')};
  m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { m.remove(); acts[b.dataset.a](); });
}
function about(){ modal('AuthenCut Pro', '<div style="line-height:1.7;max-width:420px">Editor de vídeo no lineal para el navegador, con flujo de trabajo profesional: línea de tiempo multipista, herramientas de edición, fotogramas clave, transiciones, efectos, mezclador de audio y exportación.<br><br>Todo se procesa en tu equipo: tus archivos nunca se suben a ningún servidor.</div>'); }
function showShortcuts(){
  const G = [
    ['Reproducción', [['Espacio','Reproducir / Detener'],['J / K / L','Retroceder / Detener / Avanzar (pulsa varias veces para más velocidad)'],['← / →','Fotograma anterior / siguiente (Mayús: 5 fotogramas)'],['↑ / ↓','Punto de edición anterior / siguiente'],['Inicio / Fin','Ir al inicio / al final']]],
    ['Herramientas', [['V','Selección'],['A','Seleccionar pista hacia delante'],['B','Edición de ondulación'],['N','Edición de rodillo'],['R','Ajuste de velocidad'],['C','Cuchilla (Mayús+clic: todas las pistas)'],['Y','Desplazar'],['H','Mano'],['Z','Zoom (Alt+clic: alejar)'],['T','Texto']]],
    ['Edición', [['Ctrl+K','Añadir edición (Ctrl+Mayús+K: todas las pistas)'],['Q / W','Recortar con ondulación la edición anterior / siguiente'],['Supr','Borrar'],['Mayús+Supr','Eliminar con ondulación'],['Alt+arrastrar','Mover o recortar sin el clip vinculado'],['Alt+← / →','Desplazar los clips seleccionados un fotograma (Mayús: 5)'],['Ctrl+arrastrar','Insertar al soltar un medio'],['Ctrl+C / X / V','Copiar / Cortar / Pegar (Ctrl+Mayús+V: pegar inserción)'],['Ctrl+Z / Ctrl+Mayús+Z','Deshacer / Rehacer'],['Ctrl+L','Vincular / Desvincular'],['Mayús+E','Habilitar / Deshabilitar clip'],['Ctrl+R','Velocidad/duración'],['Ctrl+D','Transición de vídeo (Ctrl+Mayús+D: audio; Mayús+D: ambas)']]],
    ['Marcas', [['I / O','Marcar entrada / salida'],['Mayús+I / Mayús+O','Ir a entrada / salida'],['Ctrl+Mayús+X','Borrar entrada y salida'],['; / \'','Levantar / Extraer'],[', / .','Insertar / Sobrescribir desde el origen'],['M','Añadir marcador (Mayús+M: siguiente)']]],
    ['Vista y archivo', [['= / - / \\','Acercar / Alejar / Ajustar la secuencia'],['Alt+rueda','Zoom en la línea de tiempo'],['S','Ajustar en la línea de tiempo'],['º (`)','Maximizar el panel activo'],['Mayús+1…7','Proyecto, Origen, Línea de tiempo, Programa, Controles de efectos, Mezclador, Efectos'],['Ctrl+I','Importar'],['Ctrl+T','Nuevo título'],['Ctrl+M','Exportar medios'],['Ctrl+Mayús+E','Exportar fotograma'],['Ctrl+S','Guardar proyecto']]]
  ];
  modal('Métodos abreviados de teclado', `<div class="kbd">${G.map(([t, rows]) => `<h6>${t}</h6>` + rows.map(([a, b]) => `<kbd>${esc(a)}</kbd><span>${esc(b)}</span>`).join('')).join('')}</div>`);
}
function maximizePanel(){
  const cur = $('.panel.maxed');
  if (cur){ cur.classList.remove('maxed'); renderTimeline(); return; }
  const id = {source:'srcPanel', fx:'srcPanel', program:'prgPanel', project:'projPanel', panel:'projPanel', timeline:'tl'}[FOCUS];
  if (id){ $('#' + id).classList.add('maxed'); renderTimeline(); }
}
function splitter(el, axis, varName, container, min, max){
  el.addEventListener('mousedown', e => {
    e.preventDefault(); const r = container.getBoundingClientRect();
    const mv = ev => { const p = axis === 'y' ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width; container.style.setProperty(varName, clamp(p * 100, min, max) + '%'); renderTimeline(); updateSrcUI(); };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  });
}

/* ================================== teclado ================================== */
function onKey(e){
  if (e.target.closest && e.target.closest('input,textarea,select')) return;
  if (EXPORT){ if (e.key === 'Escape') cancelExport(); e.preventDefault(); return; }
  if ($('.modal')){ if (e.key === 'Escape') $('.modal').remove(); return; }
  if ($('#ctx') && e.key === 'Escape'){ closeCtx(); return; }
  const k = e.key, K = k.length === 1 ? k.toLowerCase() : k, ctrl = e.ctrlKey || e.metaKey, sh = e.shiftKey, alt = e.altKey;
  if (ctrl){
    if (alt){ if (K === 'n') newProject(); else if (K === 'k') showShortcuts(); else return; e.preventDefault(); return; }
    switch (K){
      case 'z': sh ? redo() : undo(); break;
      case 'y': redo(); break;
      case 'k': splitAtPlayhead(sh); break;
      case 'c': copy(); break;
      case 'x': sh ? clearSeqIO() : cut(); break;
      case 'v': paste(sh); break;
      case 'a': sh ? deselectAll() : selectAll(); break;
      case 'i': $('#fileIn').click(); break;
      case 'o': openProjectFile(); break;
      case 'm': sh ? jumpMarker(-1) : setMode('export'); break;
      case 's': saveProjectFile(); break;
      case 't': addTitle(); break;
      case 'l': toggleLink(); break;
      case 'r': speedDialog(); break;
      case 'd': applyDefaultTransitions(sh ? 'a' : 'v'); break;
      case 'e': if (sh) exportFrame(); else return; break;
      default: return;
    }
    e.preventDefault(); return;
  }
  if (S.mode !== 'edit'){
    if (S.mode === 'export' && [' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)){
      if (k === ' ') togglePlay(); else if (k === 'Home') seek(exportSettings().a); else if (k === 'End') seek(exportSettings().b); else step(k === 'ArrowLeft' ? -1 : 1);
      e.preventDefault();
    }
    return;
  }
  if (sh && /^Digit[1-7]$/.test(e.code)){
    const acts = {1:() => setBotTab('project'), 2:() => setTab('source'), 3:() => { FOCUS = 'timeline'; focusUI(); }, 4:() => { FOCUS = 'program'; focusUI(); }, 5:() => setTab('fx'), 6:() => setTab('mixer'), 7:() => setBotTab('effects')};
    acts[e.code.slice(5)](); e.preventDefault(); return;
  }
  const src = FOCUS === 'source';
  switch (K){
    case ' ': src ? srcToggle() : togglePlay(); break;
    case 'l': src ? srcToggle() : shuttle(1); break;
    case 'k': src ? srcV.pause() : shuttle(0); break;
    case 'j': src ? srcStep(-FPS) : shuttle(-1); break;
    case 'v': setTool('select'); break;
    case 'a': setTool('trackfwd'); break;
    case 'b': setTool('ripple'); break;
    case 'n': setTool('rolling'); break;
    case 'r': setTool('rate'); break;
    case 'c': setTool('razor'); break;
    case 'y': setTool('slip'); break;
    case 'h': setTool('hand'); break;
    case 'z': setTool('zoom'); break;
    case 't': setTool('text'); break;
    case 'd': if (sh) applyDefaultTransitions('both'); else return; break;
    case 'e': if (sh) toggleEnable(); else return; break;
    case 'Delete': case 'Backspace': if (FOCUS === 'fx' || FOCUS === 'panel') return; sh ? rippleDel() : del(); break;
    case 'ArrowLeft': if (alt){ nudge(sh ? -5 : -1); break; } src ? srcStep(sh ? -5 : -1) : step(sh ? -5 : -1); break;
    case 'ArrowRight': if (alt){ nudge(sh ? 5 : 1); break; } src ? srcStep(sh ? 5 : 1) : step(sh ? 5 : 1); break;
    case 'ArrowUp': jumpEdit(-1); break;
    case 'ArrowDown': jumpEdit(1); break;
    case 'Home': pause(); seek(0); break;
    case 'End': pause(); seek(seqEnd()); break;
    case 'i': if (sh){ src ? srcGo('in') : goSeqIn(); } else { src ? srcMarkIn() : markSeqIn(); } break;
    case 'o': if (sh){ src ? srcGo('out') : goSeqOut(); } else { src ? srcMarkOut() : markSeqOut(); } break;
    case 'm': sh ? jumpMarker(1) : addMarker(); break;
    case 'q': rippleTrimQW(true); break;
    case 'w': rippleTrimQW(false); break;
    case ',': insertFromSource(false); break;
    case '.': insertFromSource(true); break;
    case ';': liftExtract(false); break;
    case "'": liftExtract(true); break;
    case '=': case '+': zoomBy(1.4); break;
    case '-': zoomBy(1 / 1.4); break;
    case '\\': zoomFit(); break;
    case 's': toggleSnap(); break;
    case '`': case 'º': maximizePanel(); break;
    case 'F1': showShortcuts(); break;
    case 'Escape': closeMenus(); closeCtx(); if ($('.panel.maxed')) maximizePanel(); else deselectAll(); break;
    default: return;
  }
  e.preventDefault();
}

/* =================================== inicio =================================== */
function bindUI(){
  $$('[data-ic]').forEach(b => { b.innerHTML = ICON[b.dataset.ic] || ''; });
  const acts = {
    srcIn: srcMarkIn, srcOut: srcMarkOut, srcGoIn: () => srcGo('in'), srcGoOut: () => srcGo('out'), srcBack: () => srcStep(-1), srcFwd: () => srcStep(1), srcPlay: srcToggle,
    insert: () => insertFromSource(false), overwrite: () => insertFromSource(true),
    marker: () => addMarker(), seqIn: markSeqIn, seqOut: markSeqOut, goIn: goSeqIn, goOut: goSeqOut,
    back: () => step(-1), play: togglePlay, fwd: () => step(1), lift: () => liftExtract(false), extract: () => liftExtract(true), frame: exportFrame,
    import: () => $('#fileIn').click(), title: () => addTitle()
  };
  $$('[data-act]').forEach(b => b.addEventListener('click', () => { ensureAudio(); const f = acts[b.dataset.act]; if (f) f(); }));
  $('#btnHome').innerHTML = ICON.home; $('#btnHome').onclick = homeScreen;
  $('#btnQuick').innerHTML = ICON.quick; $('#btnQuick').onclick = quickExport;
  $('#btnWs').innerHTML = ICON.grid;
  $('#btnWs').onclick = e => { e.stopPropagation(); const m = $('#wsMenu'), o = m.classList.contains('open'); closeMenus(); if (!o){ buildWsMenu(); m.classList.add('open'); } };
  $('#btnFull').innerHTML = ICON.full;
  $('#btnFull').onclick = () => { const v = $('#prgView'); if (document.fullscreenElement) document.exitFullscreen(); else if (v.requestFullscreen) v.requestFullscreen(); };
  $$('.mode').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('#btnSnap').innerHTML = ICON.magnet; $('#btnSnap').onclick = toggleSnap;
  $('#btnLink').innerHTML = ICON.link;
  $('#btnLink').onclick = () => { S.linkedSel = !S.linkedSel; $('#btnLink').classList.toggle('on', S.linkedSel); status('Selección vinculada ' + (S.linkedSel ? 'activada' : 'desactivada')); };
  $('#btnMk').innerHTML = ICON.marker; $('#btnMk').onclick = () => addMarker();
  $('#fileIn').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; if (S.mode === 'import') ivImport(fs); else importFiles(fs); };
  $('#projIn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { if (!load(JSON.parse(await f.text()))) throw 0; toast('Proyecto abierto'); } catch(err){ toast('El archivo de proyecto no es válido'); }
  };
  $('#projName').addEventListener('input', () => { syncName(); scheduleSave(); });
  $('#projName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  const pl = $('#projList');
  document.addEventListener('dragover', e => { if (DRAGMEDIA || DRAGFX) return; e.preventDefault(); if (S.mode === 'import') $('#ivDrop').classList.add('drop'); else pl.classList.add('drop'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget){ pl.classList.remove('drop'); $('#ivDrop').classList.remove('drop'); } });
  document.addEventListener('drop', e => {
    pl.classList.remove('drop'); $('#ivDrop').classList.remove('drop');
    if (DRAGMEDIA || DRAGFX || tracksEl.contains(e.target)) return;
    e.preventDefault();
    if (e.dataTransfer.files.length){ if (S.mode === 'import') ivImport(e.dataTransfer.files); else importFiles(e.dataTransfer.files); }
  });
  document.addEventListener('mousedown', e => { if (!e.target.closest('.menu')) closeMenus(); if (!e.target.closest('.ctx')) closeCtx(); });
  document.addEventListener('keydown', onKey);
  $('#ivDrop').onclick = () => $('#fileIn').click();
  $('#ivGo').onclick = ivCreate;
  $('#exPreset').onchange = () => { $('#exBr').value = String({high:12e6, match:20e6, yt:8e6, social:4e6, max:35e6}[$('#exPreset').value]); updateExportSummary(); };
  ['exName','exFmt','exBr','exAbr','exRange'].forEach(id => { $('#' + id).addEventListener('input', updateExportSummary); $('#' + id).addEventListener('change', updateExportSummary); });
  $('#evGo').onclick = () => startExport(exportSettings());
  dragBar($('#evBar'), f => { const s = exportSettings(); seek(s.a + f * (s.b - s.a)); }, () => pause());
  splitter($('#spMid'), 'y', '--top', $('#main'), 20, 80);
  splitter($('#spTop'), 'x', '--lc', $('#topRow'), 15, 85);
  splitter($('#spBot'), 'x', '--pc', $('#botRow'), 10, 60);
  window.addEventListener('resize', () => { renderTimeline(); updateSrcUI(); });
}
function init(){
  buildMenus(); buildTools(); bindUI(); initTimeline(); initPanels(); buildEffectsPanel(); buildTracks(); buildMixer();
  let restored = false;
  try {
    const d = JSON.parse(localStorage.getItem('authencut.project') || 'null');
    if (d && Array.isArray(d.clips) && (d.clips.length || (d.media || []).length)) restored = load(d);
  } catch(e){ console.warn('No se pudo restaurar el proyecto', e); }
  if (!restored){ renderProject(); refresh(true); setZoom(40); }
  syncName(); focusUI(); setTool('select');
  status('Listo · Importa medios con Ctrl+I o arrastrándolos · F1: métodos abreviados de teclado');
  requestAnimationFrame(loop);
}
init();
