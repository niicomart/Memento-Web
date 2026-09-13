// Memento (móvil) - Lógica principal (vanilla JS, sin frameworks)
// Misma lógica de UI que la versión de PC (src/renderer/app.js).
// Cambios respecto de la PC:
//   - Los datos se guardan/leen a través de window.mementoAPI (IndexedDB en navegador).
//   - La restauración usa un selector de archivos del dispositivo (contenido, no path).
//   - Aviso de backup pendiente (+20 días sin exportar).
//   - Pedido de almacenamiento persistente al iniciar.
let datos = { categorias: [], elementos: [] };
let categoriaSeleccionada = null;
let vistaActual = 'dashboard';
let ultimaMigracion = null;

const DIAS_AVISO_BACKUP = 20;

// Utilidades
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function hoyISO() { return new Date().toISOString().slice(0,10); }
function parseFecha(str) { if (!str) return null; const d = new Date(str + 'T00:00:00'); return isNaN(d) ? null : d; }
function formatFecha(str) { if (!str) return '-'; const d = parseFecha(str); if (!d) return str; return d.toLocaleDateString('es-AR'); }
function diasEntre(a,b) { return Math.round((b - a) / (1000*60*60*24)); }

// CÁLCULO DE ESTADOS — rojo vencido, amarillo próximo, verde al día
function calcularEstado(elemento) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const tipo = elemento.tipo_control;
  if (tipo === 'fecha_fija') {
    const venc = parseFecha(elemento.fecha_vencimiento);
    if (!venc) return { estado: 'aldia', texto: 'Sin fecha', diasRestantes: null };
    const diff = diasEntre(hoy, venc);
    if (diff < 0) return { estado: 'vencido', texto: `Vencido hace ${Math.abs(diff)} días`, diasRestantes: diff };
    const aviso = elemento.dias_antes_recordatorio ?? 15;
    if (diff <= aviso) return { estado: 'proximo', texto: `Vence en ${diff} días`, diasRestantes: diff };
    return { estado: 'aldia', texto: `Vence en ${diff} días`, diasRestantes: diff };
  }
  if (tipo === 'periodico') {
    let proximo = parseFecha(elemento.fecha_proximo_vencimiento);
    if (!proximo && elemento.fecha_ultima_realizacion && elemento.frecuencia_valor) {
      proximo = calcularProximoPeriodico(elemento.fecha_ultima_realizacion, elemento.frecuencia_valor, elemento.frecuencia_unidad);
    }
    if (!proximo) return { estado: 'aldia', texto: 'Sin fecha programada', diasRestantes: null };
    const diff = diasEntre(hoy, proximo);
    if (diff < 0) return { estado: 'vencido', texto: `Vencido hace ${Math.abs(diff)} días`, diasRestantes: diff };
    const aviso = elemento.dias_antes_recordatorio ?? 15;
    if (diff <= aviso) return { estado: 'proximo', texto: `Vence en ${diff} días`, diasRestantes: diff };
    return { estado: 'aldia', texto: `Vence en ${diff} días`, diasRestantes: diff };
  }
  if (tipo === 'por_uso') {
    const actual = Number(elemento.valor_actual) || 0;
    const ultimo = Number(elemento.valor_ultimo_mantenimiento) || 0;
    const intervalo = Number(elemento.intervalo_uso) || 0;
    if (intervalo <= 0) return { estado: 'aldia', texto: 'Sin intervalo', usoRestante: null };
    const usoDesdeUltimo = actual - ultimo;
    const usoRestante = intervalo - usoDesdeUltimo;
    const umbral = Number(elemento.umbral_aviso_uso) || 0;
    if (usoRestante <= 0) return { estado: 'vencido', texto: `Vencido por ${Math.abs(usoRestante)} ${elemento.unidad_uso || 'unids.'}`, usoRestante };
    if (usoRestante <= umbral) return { estado: 'proximo', texto: `Faltan ${usoRestante} ${elemento.unidad_uso || 'unids.'}`, usoRestante };
    return { estado: 'aldia', texto: `Faltan ${usoRestante} ${elemento.unidad_uso || 'unids.'}`, usoRestante };
  }
  return { estado: 'aldia', texto: 'Sin control', diasRestantes: null };
}
function calcularProximoPeriodico(fechaUltima, valor, unidad) {
  const base = parseFecha(fechaUltima);
  if (!base) return null;
  const d = new Date(base);
  const v = Number(valor);
  if (unidad === 'dias') d.setDate(d.getDate() + v);
  else if (unidad === 'semanas') d.setDate(d.getDate() + v*7);
  else if (unidad === 'meses') d.setMonth(d.getMonth() + v);
  else if (unidad === 'anios') d.setFullYear(d.getFullYear() + v);
  return d;
}
function textoDeVencimiento(el) {
  if (el.tipo_control === 'fecha_fija') return el.fecha_vencimiento ? formatFecha(el.fecha_vencimiento) : 'Sin fecha';
  if (el.tipo_control === 'periodico') {
    const prox = el.fecha_proximo_vencimiento ? formatFecha(el.fecha_proximo_vencimiento) : 'Sin fecha programada';
    return `${prox} · cada ${el.frecuencia_valor ?? 1} ${el.frecuencia_unidad || 'meses'}`;
  }
  if (el.tipo_control === 'por_uso') {
    const inter = Number(el.intervalo_uso) || 0;
    return inter > 0 ? `${el.valor_actual ?? 0}/${inter} ${el.unidad_uso || ''}`.trim() : `${el.valor_actual ?? 0} ${el.unidad_uso || ''}`.trim();
  }
  return '';
}

// Estado global de una categoría para el indicador sutil (rojo vencido > amarillo próximo > verde al día)
function estadoCategoria(catId) {
  const elems = datos.elementos.filter(e => e.categoria_id === catId);
  if (elems.length === 0) return null;
  let vencido = false, proximo = false;
  for (const el of elems) {
    const est = calcularEstado(el).estado;
    if (est === 'vencido') vencido = true;
    else if (est === 'proximo') proximo = true;
  }
  if (vencido) return { tipo: 'vencido', sim: '!', titulo: 'Hay algo vencido en esta categoría' };
  if (proximo) return { tipo: 'proximo', sim: '!', titulo: 'Hay algo por vencer en esta categoría' };
  return { tipo: 'aldia', sim: '✓', titulo: 'Todo en tiempo y forma' };
}
function htmlEstadoCategoria(catId) {
  const s = estadoCategoria(catId);
  return s ? `<span class="cat-estado cat-estado-${s.tipo}" title="${s.titulo}">${s.sim}</span>` : '';
}

// Persistencia
async function cargarDatos() {
  datos = await window.mementoAPI.leerDatos();
  if (!datos.categorias) datos.categorias = [];
  if (!datos.elementos) datos.elementos = [];
}
async function guardar() {
  await window.mementoAPI.guardarDatos(datos);
  renderTodo();
}
function renderTodo() {
  renderDashboard();
  renderCategorias();
  if (categoriaSeleccionada) renderElementos(categoriaSeleccionada.id);
  renderBackupsLista();
  renderBreadcrumbs();
}
function cambiarVista(nombre) {
  vistaActual = nombre;
  const grid = document.getElementById('gridCategorias');
  if(grid && grid.classList.contains('reordenando')){ grid.classList.remove('reordenando'); }
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + nombre);
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === nombre));
  if (nombre === 'busqueda') document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.documentElement.scrollTop = 0;
  const main = document.querySelector('.main');
  if (main) main.scrollTop = 0;
  renderBreadcrumbs();
}
function irNivelCategorias(){
  cambiarVista('categorias');
  resetNivelesCategorias();
}
function resetNivelesCategorias(){
  categoriaSeleccionada=null;
  const nivel1 = document.getElementById('nivelCategorias');
  if(nivel1) nivel1.classList.remove('hidden');
  document.getElementById('panelElementos').classList.add('hidden');
  renderCategorias();
  renderBreadcrumbs();
}
function irNivelElementosDeCategoria(catId){
  cambiarVista('categorias');
  seleccionarCategoria(catId);
}
function renderBreadcrumbs(){
  const bc = document.getElementById('breadcrumbs');
  if(!bc) return;
  const parts = [];
  parts.push(`<a href="#" onclick="cambiarVista('dashboard');return false" style="color:var(--muted);text-decoration:none">Dashboard</a>`);
  if(vistaActual==='categorias' || vistaActual==='busqueda'){
    parts.push(`<span style="opacity:.4">›</span> <a href="#" onclick="irNivelCategorias();return false" style="color:var(--muted);text-decoration:none">Categorías</a>`);
  }
  if(categoriaSeleccionada){
    parts.push(`<span style="opacity:.4">›</span> <span style="font-weight:700">${esc(categoriaSeleccionada.nombre)}</span>`);
  }
  if(vistaActual==='ajustes') parts.push(`<span style="opacity:.4">›</span> <span>Ajustes</span>`);
  if(vistaActual==='busqueda') parts.push(`<span style="opacity:.4">›</span> <span>Búsqueda</span>`);
  bc.innerHTML = parts.join(' ');
}

// Dashboard
function renderDashboard() {
  let vencidos=0, proximos=0;
  datos.elementos.forEach(el => {
    const est = calcularEstado(el).estado;
    if (est==='vencido') vencidos++;
    else if (est==='proximo') proximos++;
  });
  document.getElementById('countVencidos').textContent = vencidos;
  document.getElementById('countProximos').textContent = proximos;
  const conEstado = datos.elementos.map(el => ({ el, e: calcularEstado(el) }))
    .filter(({e}) => e.estado === 'vencido' || e.estado === 'proximo')
    .sort((a,b) => {
      const orden = { vencido:0, proximo:1 };
      if (orden[a.e.estado] !== orden[b.e.estado]) return orden[a.e.estado]-orden[b.e.estado];
      const av = a.e.diasRestantes ?? a.e.usoRestante ?? 9999;
      const bv = b.e.diasRestantes ?? b.e.usoRestante ?? 9999;
      return av - bv;
    });
  const cont = document.getElementById('listaProximos');
  cont.innerHTML = '';
  if (conEstado.length===0) cont.innerHTML = '<p style="color:var(--muted);font-size:13px">Sin pendientes. Todo al día.</p>';
  else {
    conEstado.slice(0,8).forEach(({el,e}) => cont.appendChild(crearCardElemento(el, e)));
    if (conEstado.length>8) {
      const more = document.createElement('p');
      more.style.cssText='font-size:12px;color:var(--muted);margin-top:10px;text-align:center';
      more.textContent = `Y ${conEstado.length-8} pendientes más — filtrá por categoría o usá el buscador`;
      cont.appendChild(more);
    }
  }
  renderAvisoBackup();
}

// Aviso chico no invasivo: recordar hacer una copia si pasaron más de 20 días
function renderAvisoBackup() {
  const av = document.getElementById('avisoBackup');
  if (!av) return;
  let fechaBruta = null;
  try { fechaBruta = window.mementoAPI.obtenerFechaUltimoBackup && window.mementoAPI.obtenerFechaUltimoBackup(); } catch (e) {}
  let dias = null;
  if (fechaBruta) {
    const t = new Date(fechaBruta).getTime();
    if (!isNaN(t)) dias = Math.floor((Date.now() - t) / (1000*60*60*24));
  }
  const mostrar = (dias === null) || (dias !== null && dias > DIAS_AVISO_BACKUP);
  if (!mostrar) { av.classList.add('hidden'); return; }
  av.classList.remove('hidden');
  const texto = dias === null
    ? 'Todavía no exportaste una copia de seguridad. Es gratis y te protege si algo pasa con el teléfono.'
    : `Pasaron más de ${DIAS_AVISO_BACKUP} días desde tu última copia de seguridad. Te conviene exportar una.`;
  av.innerHTML = `<span class="aviso-backup-texto">📦 ${esc(texto)}</span><button class="btn btn-small" id="btnIrAjustesBackup">Ir a Ajustes</button>`;
  const b = document.getElementById('btnIrAjustesBackup');
  if (b) b.onclick = () => cambiarVista('ajustes');
}

function crearCardElemento(elemento, estadoObj) {
  const e = estadoObj || calcularEstado(elemento);
  const cat = datos.categorias.find(c=>c.id===elemento.categoria_id);
  const div = document.createElement('div');
  div.className = 'elemento-card estado-' + e.estado;
  const badgeClass = e.estado==='vencido'?'badge-vencido': e.estado==='proximo'?'badge-proximo':'badge-aldia';
  const badgeText = e.estado==='vencido'?'Vencido': e.estado==='proximo'?'Próximo':'Al día';
  div.innerHTML = `
    <div class="card-main">
      <strong>${esc(elemento.nombre)}</strong>
      <div class="card-meta"><span>${cat?esc(cat.nombre):''}</span><span>·</span><span>${esc(e.texto)}</span><span>·</span><span>${esc(textoDeVencimiento(elemento))}</span></div>
    </div>
    <div class="card-actions">
      <span class="badge ${badgeClass}">${badgeText}</span>
      <button class="btn btn-small btn-primary" data-quick="ok" title="Marcar como realizado">✓</button>
      <button class="btn btn-small" data-quick="edit" title="Editar">✎</button>
      <button class="btn btn-small" data-quick="del" title="Eliminar">🗑</button>
    </div>
  `;
  div.querySelector('[data-quick="ok"]').onclick = (ev)=>{ ev.stopPropagation(); completarElemento(elemento.id); };
  div.querySelector('[data-quick="edit"]').onclick = (ev)=>{ ev.stopPropagation(); abrirModalElemento(elemento.id); };
  div.querySelector('[data-quick="del"]').onclick = async (ev)=>{ ev.stopPropagation(); await eliminarElemento(elemento.id, `¿Eliminar "${elemento.nombre}"?`); };
  div.onclick = ()=> abrirDetalleElemento(elemento.id);
  div.ondblclick = (ev)=>{ ev.stopPropagation(); abrirModalElemento(elemento.id); };
  return div;
}

// Categorías
let dragEstado=null;
function renderCategorias() {
  const grid = document.getElementById('gridCategorias');
  grid.innerHTML='';
  const reordenando = grid.classList.contains('reordenando');
  datos.categorias.forEach(cat=>{
    const countElem = datos.elementos.filter(e=>e.categoria_id===cat.id).length;
    const card = document.createElement('div');
    card.className='cat-card';
    card.dataset.dragId=cat.id;
    card.style.borderLeftColor = cat.color||'#0ea5e9';
    card.innerHTML = `<div class="cat-icon" style="background:${cat.color}14;border-color:${cat.color}30">${cat.icono||'📁'}${htmlEstadoCategoria(cat.id)}</div><div class="cat-nombre">${esc(cat.nombre)}</div><div class="cat-count">${countElem} elementos</div><div class="cat-actions"><button class="mini-btn" title="Editar" data-act="edit">✎</button><button class="mini-btn" title="Eliminar" data-act="del">🗑</button></div>`;
    card.onclick = ()=>{ if(reordenando) return; seleccionarCategoria(cat.id); };
    card.ondblclick = (e)=>{ e.stopPropagation(); if(reordenando) return; abrirModalCategoria(cat.id); };
    card.querySelector('[data-act="edit"]').onclick=(e)=>{ e.stopPropagation(); if(reordenando) return; abrirModalCategoria(cat.id); };
    card.querySelector('[data-act="del"]').onclick=async(e)=>{ e.stopPropagation(); if(reordenando) return; await eliminarCategoria(cat.id, `¿Eliminar "${cat.nombre}"?`); };
    grid.appendChild(card);
  });
  const btn = document.getElementById('btnReordenar');
  if(btn){
    if(reordenando){
      btn.textContent='✓ Listo (guardar orden)';
      btn.style.display='inline-flex';
      btn.classList.add('btn-primary');
    } else {
      btn.textContent='☰ Reordenar';
      btn.style.display = datos.categorias.length>1 ? 'inline-flex' : 'none';
      btn.classList.remove('btn-primary');
    }
  }
  if(!grid.dataset.pointerInit){
    grid.dataset.pointerInit='1';
    grid.addEventListener('pointerdown', (e)=>{
      if(!grid.classList.contains('reordenando')) return;
      if(e.button!==0 && e.pointerType==='mouse') return;
      const card = e.target.closest('.cat-card');
      if(!card || e.target.closest('.mini-btn')) return;
      e.preventDefault();
      dragEstado={ id:card.dataset.dragId, el:card, startY:e.clientY, startX:e.clientX, moved:false };
      card.classList.add('dragging');
      try{ grid.setPointerCapture(e.pointerId); }catch{}
    });
    grid.addEventListener('pointermove', (e)=>{
      if(!dragEstado){ return; }
      if(Math.abs(e.clientY - dragEstado.startY) > 6 || Math.abs(e.clientX - dragEstado.startX) > 6) dragEstado.moved=true;
      const dragEl = dragEstado.el;
      const cards=[...grid.querySelectorAll('.cat-card')];
      cards.forEach(c=>c.classList.remove('drag-over'));
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = under ? under.closest('.cat-card') : null;
      if(target && target!==dragEl && target.closest('#gridCategorias')){
        const rect=target.getBoundingClientRect();
        const after = (e.clientY + e.clientX*0.0001 - rect.top) > rect.height/2;
        grid.insertBefore(dragEl, after ? target.nextSibling : target);
        target.classList.add('drag-over');
      }
    });
    grid.addEventListener('pointerup', ()=>{
      if(!dragEstado) return;
      const g = dragEstado.el.closest('#gridCategorias') || grid;
      dragEstado=null;
      g.querySelectorAll('.cat-card').forEach(c=>{ c.classList.remove('dragging'); c.classList.remove('drag-over'); });
      const order=[...g.querySelectorAll('.cat-card')].map(el=>el.dataset.dragId);
      const map=new Map(datos.categorias.map(c=>[c.id,c]));
      datos.categorias = order.map(id=>map.get(id)).filter(Boolean);
      guardar();
    });
    grid.addEventListener('pointercancel', ()=>{
      if(!dragEstado) return;
      dragEstado=null;
      grid.querySelectorAll('.cat-card').forEach(c=>{ c.classList.remove('dragging'); c.classList.remove('drag-over'); });
    });
  }
}
function toggleReordenar() {
  const grid = document.getElementById('gridCategorias');
  grid.classList.toggle('reordenando');
  renderCategorias();
}
function seleccionarCategoria(catId) {
  categoriaSeleccionada = datos.categorias.find(c=>c.id===catId) || null;
  if (!categoriaSeleccionada) { resetNivelesCategorias(); return; }
  const nivel1 = document.getElementById('nivelCategorias');
  if(nivel1) nivel1.classList.add('hidden');
  document.getElementById('panelElementos').classList.remove('hidden');
  document.getElementById('tituloCategoriaSeleccionada').textContent = `${categoriaSeleccionada.icono||'📁'} ${categoriaSeleccionada.nombre}`;
  renderElementos(catId);
  renderBreadcrumbs();
}
function renderElementos(catId) {
  const lista = document.getElementById('listaElementos');
  lista.innerHTML='';
  const elems = datos.elementos.filter(e=>e.categoria_id===catId);
  if (elems.length===0) lista.innerHTML='<p style="font-size:13px;color:var(--muted);background:var(--border-soft);border:1px dashed var(--border);border-radius:12px;padding:14px;text-align:center">Sin elementos. Agregá uno con ＋ Elemento.</p>';
  const sorted = elems.map(el=>({el, e:calcularEstado(el)})).sort((a,b)=>{
    const ord={vencido:0,proximo:1,aldia:2}; if(ord[a.e.estado]!==ord[b.e.estado]) return ord[a.e.estado]-ord[b.e.estado];
    return (a.e.diasRestantes??a.e.usoRestante??9999)-(b.e.diasRestantes??b.e.usoRestante??9999);
  });
  sorted.forEach(({el,e})=> lista.appendChild(crearCardElemento(el,e)));
}

// Detalle
function abrirDetalleElemento(elemId) {
  const el = datos.elementos.find(x=>x.id===elemId);
  if (!el) return;
  const cat = datos.categorias.find(c=>c.id===el.categoria_id);
  const estado = calcularEstado(el);
  const historial = (el.historial||[]).slice().sort((a,b)=> (b.fecha_de_completado||'').localeCompare(a.fecha_de_completado||''));
  document.getElementById('detalleTitulo').textContent = el.nombre;
  const badgeClass = estado.estado==='vencido'?'badge-vencido': estado.estado==='proximo'?'badge-proximo':'badge-aldia';
  const badgeText = estado.estado==='vencido'?'Vencido': estado.estado==='proximo'?'Próximo':'Al día';
  let tipoInfo='';
  if (el.tipo_control==='fecha_fija') tipoInfo = `<div class="detalle-campo"><label>Fecha vencimiento</label><div>${formatFecha(el.fecha_vencimiento)}</div></div><div class="detalle-campo"><label>Recordatorio</label><div>${el.dias_antes_recordatorio} días antes</div></div>`;
  else if (el.tipo_control==='periodico') tipoInfo = `<div class="detalle-campo"><label>Frecuencia</label><div>Cada ${el.frecuencia_valor} ${el.frecuencia_unidad}</div></div><div class="detalle-campo"><label>Última realización</label><div>${formatFecha(el.fecha_ultima_realizacion)}</div></div><div class="detalle-campo"><label>Próximo vencimiento</label><div>${formatFecha(el.fecha_proximo_vencimiento)}</div></div><div class="detalle-campo"><label>Recordatorio</label><div>${el.dias_antes_recordatorio} días antes</div></div>`;
  else if (el.tipo_control==='por_uso') tipoInfo = `<div class="detalle-campo"><label>Unidad</label><div>${esc(el.unidad_uso||'-')}</div></div><div class="detalle-campo"><label>Valor actual</label><div>${el.valor_actual}</div></div><div class="detalle-campo"><label>Último mantenimiento</label><div>${el.valor_ultimo_mantenimiento}</div></div><div class="detalle-campo"><label>Intervalo</label><div>${el.intervalo_uso}</div></div><div class="detalle-campo"><label>Umbral aviso</label><div>${el.umbral_aviso_uso}</div></div>`;
  const body = document.getElementById('detalleBody');
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap">
      <span class="badge ${badgeClass}">${badgeText} · ${esc(estado.texto)}</span>
      <span style="font-size:12px;color:var(--muted)">${cat?esc(cat.nombre):''}</span>
    </div>
    <div class="detalle-grid">
      <div class="detalle-campo"><label>Tipo control</label><div>${el.tipo_control}</div></div>
      ${tipoInfo}
    </div>
    ${el.notas?`<div class="detalle-campo" style="margin-bottom:12px"><label>Más detalles</label><div>${esc(el.notas)}</div></div>`:''}
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-primary" id="btnCompletar">✓ Marcar como realizado</button>
      <button class="btn" id="btnEditarElementoDetalle">✎ Editar</button>
      <button class="btn btn-danger" id="btnEliminarElementoDetalle">🗑 Eliminar</button>
    </div>
    <h4>Historial (${historial.length})</h4>
    <div id="contHistorial">${historial.length===0?'<p style="font-size:13px;color:var(--muted)">Sin historial aún.</p>': historial.map(h=>`<div class="historial-item"><strong>${formatFecha((h.fecha_de_completado||'').slice(0,10))}</strong> ${h.valor_uso_en_ese_momento?`· valor: ${h.valor_uso_en_ese_momento}`:''}<div style="color:var(--muted)">${esc(h.nota||'')}</div></div>`).join('')}</div>
  `;
  document.getElementById('modalDetalle').classList.remove('hidden');
  sincronizarScroll();
  document.getElementById('btnCompletar').onclick = ()=> completarElemento(el.id);
  document.getElementById('btnEditarElementoDetalle').onclick = ()=> { cerrarDetalle(); abrirModalElemento(el.id); };
  document.getElementById('btnEliminarElementoDetalle').onclick = async ()=> {
    if (!await confirmarAccion(`¿Eliminar el elemento "${el.nombre}"?`, { esEliminar:true })) return;
    await eliminarElemento(el.id);
    cerrarDetalle();
  };
}
function cerrarDetalle(){ document.getElementById('modalDetalle').classList.add('hidden'); sincronizarScroll(); }
async function completarElemento(elemId) {
  const el = datos.elementos.find(x=>x.id===elemId);
  if (!el) return;
  if (!Array.isArray(el.historial)) el.historial = [];
  const hoy = hoyISO();
  let notaExtra='';
  const detalleAbierto = !document.getElementById('modalDetalle').classList.contains('hidden');
  if(detalleAbierto) cerrarDetalle();
  if (el.tipo_control==='por_uso') {
    const nuevoValor = await pedirDatoRapido({
      titulo: `Marcar "${el.nombre}" como realizado`,
      label: `Valor actual de '${el.unidad_uso||'uso'}' (anterior: ${el.valor_ultimo_mantenimiento ?? 0})`,
      tipo:'number',
      valorInicial: String(el.valor_actual ?? 0),
      validarTexto:(v)=>{
        if(v==='') return 'Ingresá un valor';
        if(isNaN(Number(v))) return 'Valor no numérico';
        if(Number(v)<0) return 'El valor no puede ser negativo';
        return null;
      },
      convertir:(v)=>Number(v)
    });
    if (nuevoValor===null){ if(detalleAbierto) abrirDetalleElemento(el.id); return; }
    const anterior = el.valor_ultimo_mantenimiento;
    el.valor_actual = nuevoValor;
    el.valor_ultimo_mantenimiento = nuevoValor;
    el.historial.push({ id: genId(), fecha_de_completado: new Date().toISOString(), valor_uso_en_ese_momento: nuevoValor, nota: `Mantenimiento. Anterior: ${anterior}.` });
    await guardar();
    abrirDetalleElemento(el.id);
    return;
  }
  if (el.tipo_control==='periodico') {
    const valor = Number(el.frecuencia_valor)||1;
    const unidad = el.frecuencia_unidad||'meses';
    const proximo = calcularProximoPeriodico(hoy, valor, unidad);
    const proximoISO = proximo ? proximo.toISOString().slice(0,10) : '';
    el.fecha_ultima_realizacion = hoy;
    el.fecha_proximo_vencimiento = proximoISO;
    notaExtra = `Periódico: próxima ${proximoISO}`;
  } else if (el.tipo_control==='fecha_fija') {
    const nueva = await pedirDatoRapido({
      titulo: `Marcar "${el.nombre}" como realizado`,
      label: 'Nueva fecha de vencimiento',
      tipo:'date',
      valorInicial: el.fecha_vencimiento || hoy,
      validarTexto:(v)=>{
        if(v==='') return 'Ingresá una fecha';
        if(!parseFecha(v)) return 'Fecha inválida';
        return null;
      },
      convertir:(v)=>v
    });
    if (nueva===null){ if(detalleAbierto) abrirDetalleElemento(el.id); return; }
    el.fecha_vencimiento = nueva;
  }
  el.historial.push({ id: genId(), fecha_de_completado: new Date().toISOString(), valor_uso_en_ese_momento: el.valor_actual||0, nota: notaExtra || 'Completado' });
  await guardar();
  abrirDetalleElemento(el.id);
}

// Búsqueda
function ejecutarBusqueda(q) {
  q = q.trim().toLowerCase();
  if (!q) { cambiarVista(vistaActual==='busqueda'?'dashboard':vistaActual); return; }
  const resultados = [];
  datos.categorias.forEach(c=>{ if(c.nombre.toLowerCase().includes(q)) resultados.push({tipo:'categoria', obj:c}); });
  datos.elementos.forEach(el=>{ if(el.nombre.toLowerCase().includes(q) || (el.notas||'').toLowerCase().includes(q)) resultados.push({tipo:'elemento', obj:el}); });
  const cont = document.getElementById('resultadosBusqueda');
  cont.innerHTML='';
  document.getElementById('textoBusqueda').textContent = `"${q}" — ${resultados.length} resultados`;
  if (resultados.length===0) cont.innerHTML='<p style="color:var(--muted)">Sin resultados</p>';
  resultados.forEach(item=>{
    if(item.tipo==='elemento') cont.appendChild(crearCardElemento(item.obj));
    else {
      const div=document.createElement('div');
      div.className='cat-card';
      div.innerHTML=`<div class="cat-icon">${item.obj.icono||'📁'}</div><div class="cat-nombre">Categoría: ${esc(item.obj.nombre)}</div>`;
      div.onclick=()=>{ cambiarVista('categorias'); seleccionarCategoria(item.obj.id); };
      cont.appendChild(div);
    }
  });
  cambiarVista('busqueda');
}

// Modal (diálogos de confirmación/aviso)
let modalCallback=null;
let modalResolucionPendiente=null;
function abrirModal(titulo, html, onConfirm, confirmText='Guardar') {
  const gridR = document.getElementById('gridCategorias');
  if(gridR) gridR.classList.remove('reordenando');
  document.getElementById('modalTitulo').textContent=titulo;
  document.getElementById('modalBody').innerHTML=html;
  document.getElementById('modalConfirmar').textContent=confirmText;
  const mod=document.getElementById('modal');
  mod.classList.remove('hidden');
  modalCallback=onConfirm;
  sincronizarScroll();
  const toggleDet = document.getElementById('btnToggleDetalles');
  if(toggleDet) toggleDet.onclick = (e)=>{ e.preventDefault(); toggleMasDetalles(); };
  const focusFirst = ()=>{
    const nombre = document.getElementById('field_nombre');
    if(nombre){ nombre.focus(); return true; }
    const first = document.querySelector('#modalBody input:not([type="color"]):not([type="date"]):not([type="number"]), #modalBody textarea')
               || document.querySelector('#modalBody input, #modalBody select, #modalBody textarea');
    if(first){ first.focus(); return true; }
    return false;
  };
  focusFirst();
  requestAnimationFrame(()=>{ if(!document.activeElement || document.activeElement===document.body) focusFirst(); });
  setTimeout(focusFirst, 80);
}
function cerrarModal(){
  document.getElementById('modal').classList.add('hidden');
  modalCallback=null;
  const pend = modalResolucionPendiente;
  modalResolucionPendiente = null;
  if(pend) pend();
  sincronizarScroll();
}

// Hoja completa (full-screen sheet) para los formularios de crear/editar.
// Encabezado arriba, cuerpo con scroll propio, barra Guardar/Cancelar abajo.
// Se adapta al teclado virtual (visualViewport) sin mover "recuadros".
let sheetCallback=null;
function abrirFormulario(titulo, html, onGuardar, guardarText='Guardar'){
  const gridR = document.getElementById('gridCategorias');
  if(gridR) gridR.classList.remove('reordenando');
  document.getElementById('sheetTitulo').textContent=titulo;
  document.getElementById('sheetBody').innerHTML=html;
  document.getElementById('sheetGuardar').textContent=guardarText;
  const sheet=document.getElementById('sheet');
  sheet.classList.remove('hidden');
  sheetCallback=onGuardar;
  document.getElementById('sheetGuardar').onclick = onGuardar ? (()=>onGuardar()) : (()=>cerrarFormulario());
  document.getElementById('sheetCancelar').onclick=()=>cerrarFormulario();
  document.getElementById('sheetCerrar').onclick=()=>cerrarFormulario();
  ajustarAlturaSheet();
  sincronizarScroll();
  const toggleDet = document.getElementById('btnToggleDetalles');
  if(toggleDet) toggleDet.onclick = (e)=>{ e.preventDefault(); toggleMasDetalles(); };
  const focusFirst = ()=>{
    const nombre = document.getElementById('field_nombre');
    if(nombre){ nombre.focus(); return; }
    const first = document.querySelector('#sheetBody input:not([type="color"]):not([type="date"]):not([type="number"]), #sheetBody textarea')
               || document.querySelector('#sheetBody input, #sheetBody select, #sheetBody textarea');
    if(first) first.focus();
  };
  focusFirst();
  requestAnimationFrame(()=>{ if(!document.activeElement || document.activeElement===document.body) focusFirst(); });
  setTimeout(focusFirst, 120);
}
function cerrarFormulario(){
  const sheet=document.getElementById('sheet');
  if(!sheet) return;
  sheet.classList.add('hidden');
  sheetCallback=null;
  sincronizarScroll();
}

// Ajusta la altura del sheet al área visible (visualViewport).
// En Android el meta viewport con interactive-widget=resizes-content ya hace
// que la página se redimensione y el sheet (fixed) la siga solo; este refuerzo
// es lo que hace falta en iOS/Safari, donde el teclado NO redimensiona la página.
function ajustarAlturaSheet(){
  const sheet=document.getElementById('sheet');
  if(!sheet || sheet.classList.contains('hidden')) return;
  const vv=window.visualViewport;
  if(!vv){ return; }
  const visible = vv.height>0 && Math.abs(vv.height - window.innerHeight) > 2;
  if(visible){
    sheet.style.top = Math.round(vv.offsetTop)+'px';
    sheet.style.height = Math.round(vv.height)+'px';
  } else {
    sheet.style.top='';
    sheet.style.height='';
  }
}

// Scroll de fondo fijo mientras haya un modal o la hoja abierta (evita saltos de tamaño en la página)
function sincronizarScroll(){
  const hayAbierto = !document.getElementById('modal').classList.contains('hidden')
    || !document.getElementById('modalDetalle').classList.contains('hidden')
    || !document.getElementById('sheet').classList.contains('hidden');
  document.body.classList.toggle('no-scroll', hayAbierto);
}

// Adaptación de la hoja completa (y de los formularios) al teclado virtual.
// 1) Si llega un focus a un campo, lo pone a la vista con scroll suave (tras un
//    tick, cuando el teclado ya terminó de mostrarse).
// 2) Reacciona al visualViewport (importante en iOS/Safari): al cambiar el área
//    visible, ajusta la altura de la hoja a esa área.
function initTeclado(){
  const sheet=document.getElementById('sheet');
  const actualizarVentana=()=>{ ajustarAlturaSheet(); };
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', actualizarVentana);
    window.visualViewport.addEventListener('scroll', actualizarVentana);
  }
  window.addEventListener('orientationchange', actualizarVentana);
  sheet.addEventListener('focusin', (e)=>{
    const t=e.target;
    setTimeout(()=>{
      try{
        if(t && typeof t.scrollIntoView==='function'){
          t.scrollIntoView({ behavior:'smooth', block:'center' });
        }
      }catch(err){}
    }, 140);
  });
}

// Cableado por defecto del modal genérico (restaurable por los diálogos propios)
function modalConfirmarDefault(){ if(modalCallback) modalCallback(); }
function modalCancelarDefault(){ cerrarModal(); }
function modalCerrarDefault(){ cerrarModal(); }
function modalBackdropDefault(e){ if(e.target.id==='modal') cerrarModal(); }
function restaurarCableadoModal(){
  modalResolucionPendiente=null;
  const mC = document.getElementById('modalConfirmar');
  mC.className='btn btn-primary';
  mC.textContent='Guardar';
  mC.onclick=modalConfirmarDefault;
  document.getElementById('modalCancelar').onclick=modalCancelarDefault;
  document.getElementById('modalCancelar').style.display='';
  document.getElementById('modalCerrar').onclick=modalCerrarDefault;
  document.getElementById('modal').onclick=modalBackdropDefault;
}

// Confirmación propio — reemplaza el confirm() nativo (evita el bug de foco)
function confirmarAccion(mensaje, config={}){
  return new Promise(resolve=>{
    const { titulo='Confirmar', textoConfirmar='Confirmar', esEliminar=false, soloInfo=false } = config;
    document.getElementById('modalTitulo').textContent = soloInfo ? (titulo==='Confirmar' ? 'Aviso' : titulo) : titulo;
    const body=document.getElementById('modalBody');
    body.innerHTML='';
    const p=document.createElement('p');
    p.style.margin='0'; p.style.fontSize='14px'; p.style.lineHeight='1.6';
    p.textContent=mensaje;
    body.appendChild(p);
    const mC=document.getElementById('modalConfirmar');
    mC.textContent = soloInfo ? 'Aceptar' : textoConfirmar;
    mC.className = (esEliminar && !soloInfo) ? 'btn btn-danger' : 'btn btn-primary';
    document.getElementById('modalCancelar').style.display = soloInfo ? 'none' : '';
    document.getElementById('modal').classList.remove('hidden');
    let finalizado=false;
    const finalizar=(valor)=>{
      if(finalizado) return;
      finalizado=true;
      restaurarCableadoModal();
      cerrarModal();
      resolve(valor);
    };
    const onConfirmar=()=>finalizar(true);
    const onCancelar=()=>finalizar(false);
    modalResolucionPendiente=onCancelar;
    modalCallback=onConfirmar;
    mC.onclick=onConfirmar;
    document.getElementById('modalCancelar').onclick=onCancelar;
    document.getElementById('modalCerrar').onclick=onCancelar;
    document.getElementById('modal').onclick=(e)=>{ if(e.target.id==='modal') onCancelar(); };
  });
}

// Pedido de un valor en un formulario propio (reemplaza prompt() nativo)
function pedirDatoRapido(opciones){
  const { titulo='Ingresá un valor', label='Valor', tipo='text', valorInicial='', placeholder='', validarTexto=null, convertir=(v)=>v } = opciones;
  return new Promise(resolve=>{
    const html=`
      <div class="form-group">
        <label>${esc(label)}</label>
        <input id="field_rapido" type="${tipo}" value="${escAttr(valorInicial)}" ${tipo==='number'?'step="any" min="0"':''} ${placeholder?`placeholder="${escAttr(placeholder)}"`:''} autocomplete="off">
      </div>`;
    abrirFormulario(titulo, html, null, 'Guardar');
    const input=document.getElementById('field_rapido');
    let finalizado=false;
    const finalizar=(valor)=>{
      if(finalizado) return;
      finalizado=true;
      cerrarFormulario();
      resolve(valor);
    };
    const onConfirmar=()=>{
      const texto = input.value.trim();
      const err = validarTexto ? validarTexto(texto) : null;
      if(err){ mostrarErrorModal(err); input.focus(); return; }
      finalizar(convertir(texto));
    };
    const onCancelar=()=>finalizar(null);
    document.getElementById('sheetGuardar').onclick=onConfirmar;
    document.getElementById('sheetCancelar').onclick=onCancelar;
    document.getElementById('sheetCerrar').onclick=onCancelar;
    input.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); onConfirmar(); } });
    const enfocar=()=>{ input.focus(); try{ input.select(); }catch{} };
    enfocar();
    requestAnimationFrame(enfocar);
    setTimeout(enfocar,120);
  });
}

// Mensaje de error visible dentro del formulario abierto (reemplaza alert() de validación)
function mostrarErrorModal(mensaje){
  const sheet=document.getElementById('sheet');
  const esSheet = sheet && !sheet.classList.contains('hidden');
  const body=document.getElementById(esSheet?'sheetBody':'modalBody');
  if(!body) return;
  const existente=document.getElementById('modalError');
  if(!mensaje){
    if(existente) existente.style.display='none';
    return;
  }
  let el=existente;
  if(!el){
    el=document.createElement('div');
    el.id='modalError';
    el.className='msg error';
    body.insertBefore(el, body.firstChild);
  }
  el.textContent=mensaje;
  el.style.display='block';
}

// Borrado en cascada (compartido entre tarjetas, dashboard y paneles)
async function eliminarCategoria(catId, textoConfirmacion){
  if(!await confirmarAccion(textoConfirmacion, { esEliminar:true })) return false;
  datos.categorias = datos.categorias.filter(c=>c.id!==catId);
  datos.elementos = datos.elementos.filter(e=>e.categoria_id!==catId);
  if(categoriaSeleccionada?.id===catId) categoriaSeleccionada=null;
  await guardar();
  return true;
}
async function eliminarElemento(elemId, textoConfirmacion){
  if(textoConfirmacion && !await confirmarAccion(textoConfirmacion, { esEliminar:true })) return false;
  datos.elementos = datos.elementos.filter(e=>e.id!==elemId);
  await guardar();
  return true;
}

// CRUD Categoría
function abrirModalCategoria(catId=null){
  const cat = catId? datos.categorias.find(c=>c.id===catId):null;
  const esEdicion = !!cat;
  const html=`
    <div class="form-group"><label>Nombre</label><input id="field_nombre" autofocus tabindex="0" autocomplete="off" value="${escAttr(cat?.nombre||'')}" placeholder="Ej: Vehículos, Casa..."></div>
    <div class="form-row">
      <div class="form-group"><label>Icono</label><input id="field_icono" value="${escAttr(cat?.icono||'📁')}" placeholder="📁"></div>
      <div class="form-group"><label>Color</label><input type="color" id="field_color" value="${cat?.color||'#0ea5e9'}"></div>
    </div>
  `;
  abrirFormulario(esEdicion?'Editar categoría':'Nueva categoría', html, async ()=>{
    const nombre=document.getElementById('field_nombre').value.trim();
    if(!nombre){ mostrarErrorModal('Nombre requerido'); document.getElementById('field_nombre').focus(); return; }
    const icono=document.getElementById('field_icono').value.trim()||'📁';
    const color=document.getElementById('field_color').value;
    if(esEdicion){ cat.nombre=nombre; cat.icono=icono; cat.color=color; delete cat.orden; }
    else { datos.categorias.push({id:genId(), nombre, icono, color}); }
    await guardar();
    cerrarFormulario();
  });
}
function abrirModalElemento(elemId=null){
  const el = elemId? datos.elementos.find(e=>e.id===elemId):null;
  const esEdicion=!!el;
  if(datos.categorias.length===0){ confirmarAccion('Primero creá una categoría.', { soloInfo:true }); return; }
  const catOptions = datos.categorias.map(c=>`<option value="${c.id}" ${ (el?el.categoria_id: categoriaSeleccionada?.id)===c.id?'selected':''}>${esc(c.nombre)}</option>`).join('');

  const html=`
    <div class="form-group"><label>Categoría</label><select id="field_categoria">${catOptions}</select></div>
    <div class="form-group"><label>Nombre</label><input id="field_nombre" value="${escAttr(el?.nombre||'')}" placeholder="Ej: Seguro del auto, VTV..."></div>
    <div class="form-group"><label>Fecha de vencimiento</label><input type="date" id="field_fecha_venc" value="${el?.fecha_vencimiento || hoyISO()}"></div>
    <div class="form-group"><label>Anticipación del aviso (días)</label><input type="number" id="field_dias_aviso" value="${el?.dias_antes_recordatorio??15}" min="0"></div>
    <div class="mas-detalles-toggle"><button type="button" class="btn btn-small" id="btnToggleDetalles">＋ Más detalles</button></div>
    <div class="mas-detalles" id="masDetalles" style="display:none">
      <div class="form-group"><label>Más detalles</label><textarea id="field_notas" placeholder="Escribí cualquier información adicional...">${esc(el?.notas||'')}</textarea></div>
    </div>
  `;
  abrirFormulario(esEdicion?'Editar elemento':'Nuevo elemento', html, async ()=>{
    const nombre=document.getElementById('field_nombre').value.trim();
    if(!nombre){ mostrarErrorModal('Nombre requerido'); document.getElementById('field_nombre').focus(); return; }
    const categoria_id=document.getElementById('field_categoria').value;
    const fecha_vencimiento = document.getElementById('field_fecha_venc').value || '';
    const dias_antes = Number(document.getElementById('field_dias_aviso').value)||15;
    const notas = document.getElementById('field_notas').value;

    let base = esEdicion ? el : { id: genId(), categoria_id, historial: [] };
    base.categoria_id = categoria_id;
    base.nombre = nombre;
    base.tipo_control = 'fecha_fija';
    base.fecha_vencimiento = fecha_vencimiento;
    base.dias_antes_recordatorio = dias_antes;
    base.notas = notas;
    base.historial = Array.isArray(base.historial) ? base.historial : [];
    base.frecuencia_valor=null; base.frecuencia_unidad=null; base.fecha_ultima_realizacion=null; base.fecha_proximo_vencimiento=null;
    base.unidad_uso=''; base.valor_actual=0; base.valor_ultimo_mantenimiento=0; base.intervalo_uso=0; base.umbral_aviso_uso=0;

    if(!esEdicion) datos.elementos.push(base);
    await guardar();
    cerrarFormulario();
    if(categoria_id) seleccionarCategoria(categoria_id);
  });
}

function toggleMasDetalles(){
  const cont = document.getElementById('masDetalles');
  const btn = document.getElementById('btnToggleDetalles');
  if(!cont) return;
  const hidden = cont.style.display === 'none';
  cont.style.display = hidden ? 'block' : 'none';
  if(btn) btn.textContent = hidden ? '− Ocultar detalles' : '＋ Más detalles';
}

// Backups (en móvil no hay lista de archivos en disco; el flujo es exportar/restaurar por archivo)
async function renderBackupsLista(){
  const lista = document.getElementById('listaBackups');
  if(!lista) return;
  const backups = await window.mementoAPI.listarBackups();
  lista.innerHTML='';
  if(backups.length===0) lista.innerHTML='<p style="font-size:12px;color:var(--muted)">No hay copias aún.</p>';
  backups.forEach(b=>{
    const div=document.createElement('div');
    div.className='backup-item';
    const fecha = new Date(b.fecha).toLocaleString('es-AR');
    div.innerHTML=`<div><strong>${esc(b.nombre)}</strong><div style="font-size:11px;color:var(--muted)">${fecha}</div></div><button class="btn btn-small">Restaurar</button>`;
    div.querySelector('button').onclick= async ()=>{
      const msg=document.getElementById('msgBackupRestore');
      if(!await confirmarAccion(`¿Restaurar "${b.nombre}"? Elegí el archivo descargado en el dispositivo.`, { esEliminar:true })) return;
      const sel = await window.mementoAPI.seleccionarArchivoRestaurar();
      if(sel.canceled) return;
      const res = await window.mementoAPI.restaurarBackup({contenido: sel.contenido});
      if(res.ok){ datos=res.datos; resetNivelesCategorias(); renderTodo(); msg.textContent='Restaurado'; msg.className='msg ok'; }
      else { msg.textContent='Error: '+res.error; msg.className='msg error'; }
    };
    lista.appendChild(div);
  });
}
function esc(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s){ return esc(s).replace(/'/g,'&#39;'); }

// Aviso de migración (estructura vieja convertida a la nueva)
function renderAvisoMigracion(){
  const av = document.getElementById('avisoMigracion');
  if(!av) return;
  if(!ultimaMigracion){ av.classList.add('hidden'); return; }
  const m = ultimaMigracion;
  let texto = `Tus datos se migraron de 3 niveles a 2: ${m.categoriasViejas} categorías → ${m.elementosNuevos} elementos nuevos (desde ${m.elementosViejos} elementos y ${m.registrosViejos} anotaciones de la estructura vieja).`;
  if(m.elementosVaciosConvertidos>0) texto += ` ${m.elementosVaciosConvertidos} elemento(s) vacío(s) se conservaron como están.`;
  if(m.desdeRestauracion) texto += ` (Generado al restaurar una copia vieja.)`;
  av.classList.remove('hidden');
  av.innerHTML = `<span>${esc(texto)}</span><button class="modal-close" id="btnCerrarAvisoMigracion" title="Cerrar">×</button>`;
  document.getElementById('btnCerrarAvisoMigracion').onclick=()=>{ av.classList.add('hidden'); };
}

// Tema claro/oscuro — solo visual, se guarda en localStorage del equipo
function aplicarTema(tema){
  if(tema==='dark') document.documentElement.dataset.theme='dark';
  else document.documentElement.removeAttribute('data-theme');
  const btn=document.getElementById('btnTema');
  if(btn){
    const oscuro = tema==='dark';
    btn.textContent = oscuro ? '☀' : '☾';
    btn.title = oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  }
  try{ localStorage.setItem('memento-tema', tema); }catch{}
}
function temaInicial(){
  try{
    const guardado=localStorage.getItem('memento-tema');
    if(guardado==='dark'||guardado==='light') return guardado;
  }catch{}
  try{
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  }catch{}
  return 'light';
}

// Información de almacenamiento + persistencia (Ajustes)
function renderInfoAlmacenamiento(){
  const el = document.getElementById('infoAlmacenamiento');
  if(!el) return;
  Promise.resolve(window.mementoAPI.solicitarAlmacenamientoPersistente()).then((r)=>{
    let ultimo = 'Nunca exportaste';
    let fechaBruta = null;
    try { fechaBruta = window.mementoAPI.obtenerFechaUltimoBackup(); } catch(e){}
    if(fechaBruta && !isNaN(new Date(fechaBruta).getTime())) ultimo = formatFecha(hora(fechaBruta));
    el.innerHTML =
      `<p><strong>Guardado en:</strong> este dispositivo (IndexedDB)</p>` +
      `<p><strong>Almacenamiento persistente:</strong> ${r && r.persistente ? 'concedido ✓' : 'no concedido'}</p>` +
      `<p><strong>Última copia exportada:</strong> ${esc(ultimo)}</p>` +
      `<p style="color:var(--muted)">En iOS Safari los datos del navegador pueden borrarse si la app pasa mucho tiempo sin abrirse. El almacenamiento persistente reduce ese riesgo. Exportar una copia periódicamente es la mejor protección.</p>`;
  }).catch(()=>{
    el.innerHTML = '<p>Cargando…</p>';
  });
}
function hora(iso){
  const d = new Date(iso);
  return d.toISOString().slice(0,10);
}

// Init
document.addEventListener('DOMContentLoaded', async ()=>{
  aplicarTema(temaInicial());
  // Pedido de almacenamiento persistente (mitigación iOS Safari)
  Promise.resolve(window.mementoAPI.solicitarAlmacenamientoPersistente()).catch(()=>{});
  await cargarDatos();
  try{
    ultimaMigracion = await window.mementoAPI.getInfoMigracion();
  }catch{ ultimaMigracion = null; }
  renderAvisoMigracion();
  try{
    const paths = await window.mementoAPI.getPaths();
    const rutaEl = document.getElementById('rutaDatosInfo');
    if(rutaEl) rutaEl.textContent = paths.dataPath;
    const infoEl = document.getElementById('infoRutas');
    if(infoEl) infoEl.innerHTML = `<strong>Ruta datos:</strong> <code>${esc(paths.dataPath)}</code><br><strong>Base:</strong> <code>${esc(paths.baseDir)}</code><br><small>Datos solo en este dispositivo.</small>`;
  }catch{}
  renderTodo();
  renderInfoAlmacenamiento();
  document.querySelectorAll('.nav-btn').forEach(btn=> btn.onclick=()=>{
    if(btn.dataset.view==='categorias'){ irNivelCategorias(); }
    else { cambiarVista(btn.dataset.view); }
  });
  const btnTema=document.getElementById('btnTema');
  if(btnTema) btnTema.onclick=()=>{
    const oscuro=document.documentElement.dataset.theme!=='dark';
    aplicarTema(oscuro?'dark':'light');
  };
  // botones principales
  document.getElementById('btnNuevaCategoria').onclick=()=> abrirModalCategoria(null);
  const btnReordenar=document.getElementById('btnReordenar');
  if(btnReordenar) btnReordenar.onclick=()=> toggleReordenar();
  document.getElementById('btnNuevoElemento').onclick=()=> abrirModalElemento(null);
  document.getElementById('btnEditarCategoria').onclick=()=> { if(categoriaSeleccionada) abrirModalCategoria(categoriaSeleccionada.id); };
  document.getElementById('btnEliminarCategoria').onclick= async ()=>{
    if(!categoriaSeleccionada) return;
    const catId=categoriaSeleccionada.id;
    if(await eliminarCategoria(catId, `¿Eliminar "${categoriaSeleccionada.nombre}"?`)) resetNivelesCategorias();
  };
  document.getElementById('btnCerrarPanelElementos').onclick=()=> resetNivelesCategorias();
  restaurarCableadoModal();
  initTeclado();
  document.getElementById('detalleCerrar').onclick=cerrarDetalle;
  document.getElementById('detalleCerrar2').onclick=cerrarDetalle;
  document.getElementById('modalDetalle').onclick=(e)=>{ if(e.target.id==='modalDetalle') cerrarDetalle(); };
  const buscador=document.getElementById('buscadorGlobal');
  let timer=null;
  buscador.addEventListener('input', ()=>{ clearTimeout(timer); timer=setTimeout(()=> ejecutarBusqueda(buscador.value), 220); });
  buscador.addEventListener('keydown', (e)=>{ if(e.key==='Enter') ejecutarBusqueda(buscador.value); if(e.key==='Escape'){ buscador.value=''; cambiarVista('dashboard'); } });
  document.getElementById('btnCerrarBusqueda').onclick=()=>{ buscador.value=''; cambiarVista('dashboard'); };
  document.getElementById('btnExportarBackup').onclick= async ()=>{
    const res = await window.mementoAPI.exportarBackup(datos);
    const msg=document.getElementById('msgBackupExport');
    if(res.ok){ msg.textContent=`Copia guardada: ${res.nombre}`; msg.className='msg ok'; renderTodo(); }
    else { msg.textContent='Error: '+res.error; msg.className='msg error'; }
  };
  document.getElementById('btnRestaurarBackup').onclick= async ()=>{
    const sel = await window.mementoAPI.seleccionarArchivoRestaurar();
    if(sel.canceled) return;
    if(!await confirmarAccion(`¿Restaurar desde "${sel.nombre}"? Se sobrescribirán todos los datos actuales de este dispositivo.`, { esEliminar:true })) return;
    const res = await window.mementoAPI.restaurarBackup({contenido: sel.contenido});
    const msg=document.getElementById('msgBackupRestore');
    if(res.ok){ datos=res.datos; resetNivelesCategorias(); renderTodo(); msg.textContent='Restaurado'; msg.className='msg ok'; renderInfoAlmacenamiento(); }
    else { msg.textContent='Error: '+res.error; msg.className='msg error'; }
  };
  // FAB
  const fab=document.getElementById('fabQuick');
  const fabMenu=document.getElementById('fabMenu');
  if(fab){
    fab.onclick=()=> fabMenu.classList.toggle('hidden');
    document.getElementById('fabAddCat').onclick=()=>{ fabMenu.classList.add('hidden'); abrirModalCategoria(null); };
    document.getElementById('fabAddElem').onclick=()=>{ fabMenu.classList.add('hidden'); if(!categoriaSeleccionada && datos.categorias[0]) seleccionarCategoria(datos.categorias[0].id); abrirModalElemento(null); };
    document.addEventListener('click',(e)=>{ if(!fab.contains(e.target) && !fabMenu.contains(e.target)) fabMenu.classList.add('hidden'); });
  }
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ cerrarModal(); cerrarFormulario(); cerrarDetalle(); const fm=document.getElementById('fabMenu'); if(fm) fm.classList.add('hidden'); }
    if(e.key==='n' && (e.ctrlKey||e.metaKey)){ e.preventDefault(); if(categoriaSeleccionada) abrirModalElemento(null); else abrirModalCategoria(null); }
    if(e.key==='Enter' && !e.shiftKey && document.getElementById('modal') && !document.getElementById('modal').classList.contains('hidden')){
      const ae=document.activeElement;
      const editable = ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.tagName==='SELECT');
      if(!editable){ e.preventDefault(); if(modalCallback) modalCallback(); }
    }
  });
  window.__mementoListo = true;
});