/* Memento (móvil) — Capa de datos.
 *
 * Reemplaza el puente de Electron de la versión de PC por la API del navegador.
 * Expone EXACTAMENTE las mismas funciones en window.mementoAPI (misma firma)
 * para que app.js funcione sin cambios estructurales:
 *   leerDatos / guardarDatos / getInfoMigracion / getPaths /
 *   exportarBackup / listarBackups / seleccionarArchivoRestaurar / restaurarBackup
 *
 * Los datos viven en IndexedDB (solo en este dispositivo, sin servidor ni red).
 * El formato JSON de exportación/restauración es idéntico al de la versión de PC:
 *   { categorias: [...], elementos: [...] }
 */
(function () {
  'use strict';

  var DB_NOMBRE = 'memento-movil';
  var DB_VERSION = 1;
  var STORE = 'estado';
  var CLAVE_DATOS = 'datos';
  var CLAVE_ULTIMO_BACKUP = 'memento-ultimo-backup';
  var ultimaMigracion = null;

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------------------------------------------------------
  // IndexedDB (promisificado, sin librerías)
  // ---------------------------------------------------------
  var promesaDB = null;

  function abrirDB() {
    if (promesaDB) return promesaDB;
    promesaDB = new Promise(function (resolve, reject) {
      var req;
      try {
        req = indexedDB.open(DB_NOMBRE, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        promesaDB = null;
        reject(req.error || new Error('No se pudo abrir IndexedDB'));
      };
    });
    return promesaDB;
  }

  function transaccion(modo, fn) {
    return abrirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx;
        try {
          tx = db.transaction(STORE, modo);
        } catch (e) {
          reject(e);
          return;
        }
        var store = tx.objectStore(STORE);
        var resultado = fn(store);
        tx.oncomplete = function () { resolve(resultado); };
        tx.onerror = function () { reject(tx.error || new Error('Error en IndexedDB')); };
        tx.onabort = function () { reject(tx.error || new Error('Transacción abortada')); };
      });
    });
  }

  function guardarClave(clave, valor) {
    return transaccion('readwrite', function (store) {
      store.put(valor, clave);
    });
  }

  function leerClave(clave) {
    return transaccion('readonly', function (store) {
      return new Promise(function (resP, rejP) {
        var req = store.get(clave);
        req.onsuccess = function () { resP(req.result); };
        req.onerror = function () { rejP(req.error); };
      });
    });
  }

  // ---------------------------------------------------------
  // Datos de arranque (mismos default que la versión de PC)
  // ---------------------------------------------------------
  function datosIniciales() {
    var categorias = [
      { id: genId(), nombre: 'Vehículos', icono: '🚗', color: '#3498db', orden: 0 },
      { id: genId(), nombre: 'Propiedades', icono: '🏠', color: '#27ae60', orden: 1 },
      { id: genId(), nombre: 'Documentación', icono: '📄', color: '#8e44ad', orden: 2 },
      { id: genId(), nombre: 'Seguros', icono: '🛡️', color: '#e67e22', orden: 3 }
    ];
    return { categorias: categorias, elementos: [] };
  }

  // ---------------------------------------------------------
  // API pública (igual a la del preload de la versión de PC)
  // ---------------------------------------------------------
  function leerDatos() {
    return leerClave(CLAVE_DATOS).then(function (valor) {
      if (!valor) {
        var inicial = datosIniciales();
        return guardarClave(CLAVE_DATOS, inicial).then(function () { return inicial; });
      }
      if (!Array.isArray(valor.categorias)) valor.categorias = [];
      if (!Array.isArray(valor.elementos)) valor.elementos = [];
      return valor;
    });
  }

  function guardarDatos(datos) {
    var d = datos || { categorias: [], elementos: [] };
    if (!Array.isArray(d.categorias)) d.categorias = [];
    if (!Array.isArray(d.elementos)) d.elementos = [];
    return guardarClave(CLAVE_DATOS, d).then(function () { return { ok: true }; });
  }

  function getInfoMigracion() {
    return Promise.resolve(ultimaMigracion);
  }

  function getPaths() {
    return Promise.resolve({
      baseDir: 'Almacenamiento del navegador (IndexedDB)',
      dataPath: 'IndexedDB: ' + DB_NOMBRE + ' → ' + STORE + '.' + CLAVE_DATOS,
      backupsDir: 'Descargas del dispositivo',
      isPackaged: false,
      execPath: location.href
    });
  }

  // ---------------------------------------------------------
  // Export / import (formato idéntico a la versión de PC)
  // ---------------------------------------------------------
  function nombreBackup() {
    return 'memento-backup-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.json';
  }

  function descargarArchivo(nombre, contenido, mime) {
    var blob = new Blob([contenido], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);
  }

  function exportarBackup(datos) {
    var nombre = nombreBackup();
    var contenido = JSON.stringify(datos || { categorias: [], elementos: [] }, null, 2);
    try {
      descargarArchivo(nombre, contenido, 'application/json');
    } catch (e) {
      return Promise.resolve({ ok: false, error: e.message });
    }
    registrarExportacion(nombre);
    return Promise.resolve({ ok: true, nombre: nombre });
  }

  function registrarExportacion(nombre) {
    try {
      localStorage.setItem(CLAVE_ULTIMO_BACKUP, new Date().toISOString());
      var historial = [];
      try {
        historial = JSON.parse(localStorage.getItem('memento-historial-backups') || '[]');
      } catch (e) { historial = []; }
      if (!Array.isArray(historial)) historial = [];
      historial.unshift({ nombre: nombre, fecha: new Date().toISOString() });
      historial = historial.slice(0, 10);
      localStorage.setItem('memento-historial-backups', JSON.stringify(historial));
    } catch (e) { /* sin localStorage no pasa nada grave */ }
  }

  function listarBackups() {
    // En móvil no hay carpeta de backups en disco. Devolvemos el historial de
    // exportaciones recientes (informativo) y [] si no existe.
    try {
      var historial = JSON.parse(localStorage.getItem('memento-historial-backups') || '[]');
      if (Array.isArray(historial)) return Promise.resolve(historial);
    } catch (e) { /* ignorar */ }
    return Promise.resolve([]);
  }

  function seleccionarArchivoRestaurar() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = function () {
        var file = input.files && input.files[0];
        input.remove();
        if (!file) { resolve({ canceled: true }); return; }
        var reader = new FileReader();
        reader.onload = function () {
          resolve({ canceled: false, contenido: String(reader.result), nombre: file.name });
        };
        reader.onerror = function () { resolve({ canceled: true }); };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // Validación + migración de estructura vieja (misma lógica que src/migracion.js de PC)
  function esEstructuraVieja(d) {
    if (!d || typeof d !== 'object') return false;
    if ('registros' in d) return true;
    if (Array.isArray(d.elementos)) {
      return d.elementos.some(function (e) { return e && !('tipo_control' in e); });
    }
    return false;
  }

  function migrarDatos(d) {
    var categorias = (d && Array.isArray(d.categorias)) ? d.categorias : [];
    var elementosViejos = (d && Array.isArray(d.elementos)) ? d.elementos : [];
    var registros = (d && Array.isArray(d.registros)) ? d.registros : [];
    var historialGlobal = (d && Array.isArray(d.historial)) ? d.historial : [];
    var idsViejos = {};
    elementosViejos.forEach(function (e) { if (e && e.id) idsViejos[e.id] = true; });
    var historialPorRegistro = {};
    historialGlobal.forEach(function (h) {
      if (!h) return;
      var key = h.registro_id != null ? String(h.registro_id) : 'huerfano';
      if (!historialPorRegistro[key]) historialPorRegistro[key] = [];
      historialPorRegistro[key].push({
        id: h.id,
        fecha_de_completado: h.fecha_de_completado,
        valor_uso_en_ese_momento: h.valor_uso_en_ese_momento,
        nota: h.nota
      });
    });
    var elementosNuevos = [];
    var vaciosConvertidos = 0;
    var registrosHuerfanos = 0;
    elementosViejos.forEach(function (eo) {
      var regs = registros.filter(function (r) { return r && r.elemento_id === eo.id; });
      if (regs.length === 0) {
        elementosNuevos.push({
          id: (eo && eo.id) || genId(),
          categoria_id: (eo && eo.categoria_id) || null,
          nombre: (eo && eo.nombre) || 'Elemento',
          tipo_control: 'fecha_fija',
          fecha_vencimiento: '',
          frecuencia_valor: null,
          frecuencia_unidad: null,
          fecha_ultima_realizacion: null,
          fecha_proximo_vencimiento: null,
          unidad_uso: '',
          valor_actual: 0,
          valor_ultimo_mantenimiento: 0,
          intervalo_uso: 0,
          umbral_aviso_uso: 0,
          notas: (eo && eo.notas != null) ? eo.notas : '',
          dias_antes_recordatorio: 15,
          historial: []
        });
        vaciosConvertidos++;
      } else {
        regs.forEach(function (r) {
          elementosNuevos.push({
            id: (r && r.id) || genId(),
            categoria_id: (eo && eo.categoria_id) || null,
            nombre: ((eo && eo.nombre) || 'Elemento') + ' - ' + ((r && r.nombre) || 'Vencimiento'),
            tipo_control: (r && r.tipo_control) || 'fecha_fija',
            fecha_vencimiento: (r && r.fecha_vencimiento != null) ? r.fecha_vencimiento : '',
            frecuencia_valor: (r && r.frecuencia_valor != null) ? r.frecuencia_valor : null,
            frecuencia_unidad: (r && r.frecuencia_unidad != null) ? r.frecuencia_unidad : null,
            fecha_ultima_realizacion: (r && r.fecha_ultima_realizacion != null) ? r.fecha_ultima_realizacion : null,
            fecha_proximo_vencimiento: (r && r.fecha_proximo_vencimiento != null) ? r.fecha_proximo_vencimiento : null,
            unidad_uso: (r && r.unidad_uso != null) ? r.unidad_uso : '',
            valor_actual: (r && r.valor_actual != null) ? r.valor_actual : 0,
            valor_ultimo_mantenimiento: (r && r.valor_ultimo_mantenimiento != null) ? r.valor_ultimo_mantenimiento : 0,
            intervalo_uso: (r && r.intervalo_uso != null) ? r.intervalo_uso : 0,
            umbral_aviso_uso: (r && r.umbral_aviso_uso != null) ? r.umbral_aviso_uso : 0,
            notas: (r && r.notas != null) ? r.notas : '',
            dias_antes_recordatorio: (r && r.dias_antes_recordatorio != null) ? r.dias_antes_recordatorio : 15,
            historial: historialPorRegistro[String(r.id)] || []
          });
        });
      }
    });
    registros.forEach(function (r) {
      if (r && !idsViejos[String(r.elemento_id)]) registrosHuerfanos++;
    });
    return {
      data: { categorias: categorias, elementos: elementosNuevos },
      resumen: {
        categoriasViejas: categorias.length,
        elementosViejos: elementosViejos.length,
        registrosViejos: registros.length,
        elementosNuevos: elementosNuevos.length,
        elementosVaciosConvertidos: vaciosConvertidos,
        registrosHuerfanos: registrosHuerfanos
      }
    };
  }

  function restaurarBackup(opciones) {
    var contenido = opciones && (opciones.contenido != null)
      ? opciones.contenido
      : (opciones && opciones.path != null ? opciones.path : null);
    return new Promise(function (resolve) {
      var parsed, estructuraOk;
      try {
        parsed = typeof contenido === 'string' ? JSON.parse(contenido) : contenido;
      } catch (e) {
        resolve({ ok: false, error: 'El archivo tiene JSON inválido: ' + e.message });
        return;
      }
      estructuraOk = parsed && typeof parsed === 'object' &&
        Array.isArray(parsed.categorias) &&
        (Array.isArray(parsed.elementos) || Array.isArray(parsed.registros));
      if (!estructuraOk) {
        resolve({ ok: false, error: 'El archivo no tiene el formato esperado (faltan colecciones)' });
        return;
      }
      if (esEstructuraVieja(parsed)) {
        var resultado = migrarDatos(parsed);
        ultimaMigracion = {
          categoriasViejas: resultado.resumen.categoriasViejas,
          elementosViejos: resultado.resumen.elementosViejos,
          registrosViejos: resultado.resumen.registrosViejos,
          elementosNuevos: resultado.resumen.elementosNuevos,
          elementosVaciosConvertidos: resultado.resumen.elementosVaciosConvertidos,
          registrosHuerfanos: resultado.resumen.registrosHuerfanos,
          desdeRestauracion: true,
          fecha: new Date().toISOString()
        };
        guardarDatos(resultado.data).then(function () {
          resolve({ ok: true, datos: resultado.data });
        });
        return;
      }
      guardarDatos(parsed).then(function () {
        resolve({ ok: true, datos: parsed });
      });
    });
  }

  // ---------------------------------------------------------
  // Almacenamiento persistente (mitigación iOS Safari)
  // ---------------------------------------------------------
  function solicitarAlmacenamientoPersistente() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().then(function (concedido) {
        return { persistente: concedido };
      }).catch(function () {
        return { persistente: false };
      });
    }
    return Promise.resolve({ persistente: false });
  }

  function obtenerFechaUltimoBackup() {
    try {
      var v = localStorage.getItem(CLAVE_ULTIMO_BACKUP);
      return v ? v : null;
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------
  window.mementoAPI = {
    leerDatos: leerDatos,
    guardarDatos: guardarDatos,
    getInfoMigracion: getInfoMigracion,
    getPaths: getPaths,
    exportarBackup: exportarBackup,
    listarBackups: listarBackups,
    seleccionarArchivoRestaurar: seleccionarArchivoRestaurar,
    restaurarBackup: restaurarBackup,
    solicitarAlmacenamientoPersistente: solicitarAlmacenamientoPersistente,
    obtenerFechaUltimoBackup: obtenerFechaUltimoBackup
  };
})();