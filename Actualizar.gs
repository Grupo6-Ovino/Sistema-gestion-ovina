/**
 * ACTUALIZACIÓN A LA VERSIÓN 2 / 2.1 — se ejecuta UNA vez desde el editor de Apps Script
 * (elegir la función "actualizar" arriba y apretar ▶ Ejecutar).
 *
 * No borra ni pisa nada: crea las hojas nuevas, agrega al final las columnas nuevas de las hojas
 * que ya existían y carga los catálogos nuevos. Si se ejecuta dos veces no duplica datos.
 *
 * Datos que agrega (todos con fuente):
 *  - Formas de pago y tipos de comprobante: hoja "Parametros" de GRUPO 6 Planillas de datos 3.
 *  - 5 productos veterinarios con su precio real: factura B 0002-00007401 del 05/09/2026
 *    (hoja "Precios estimatimos de venta" de la misma planilla).
 */
function actualizar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('S_Usuarios')) throw new Error('El sistema no está instalado en esta planilla: usá primero "Sistema Ovino > Instalar".');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  var email = Session.getEffectiveUser().getEmail().toLowerCase();
  var log = actualizarEstructura_(ss);
  log = log.concat(semillasV2_(ss, email));
  log.push(activarDolarDiario());
  try { log.push(actualizarDolar()); } catch (e) { log.push('No se pudo traer el dólar ahora (' + e.message + '). Se va a intentar solo esta noche.'); }
  ss.getSheetByName('S_Auditoria').appendRow(['AUD-' + ('000000' + ss.getSheetByName('S_Auditoria').getLastRow()).slice(-6), new Date(), email,
    'Actualización a v' + VERSION, '(estructura)', '', '', log.join(' | ')]);
  var txt = 'Actualización a la versión ' + VERSION + ' terminada.\n\n' + log.join('\n');
  try { SpreadsheetApp.getUi().alert(txt); } catch (e) { Logger.log(txt); }
  return txt;
}

/** Crea las hojas que faltan y agrega al final las columnas que faltan (sin mover las existentes). */
function actualizarEstructura_(ss) {
  var colores = { 'Maestras': '#dbe8f6', 'Parámetros': '#fff2cc', 'Hechos': '#d9ead3', 'Control': '#e6e6e6' };
  var log = [];
  Object.keys(SCHEMA).forEach(function (t) {
    var h = headersDe(t);
    var sh = ss.getSheetByName(t);
    if (!sh) {
      sh = ss.insertSheet(t);
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground(colores[SCHEMA[t].grupo]);
      sh.setFrozenRows(1);
      log.push('Hoja nueva: ' + t);
      return;
    }
    var n = sh.getLastColumn();
    var actuales = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
    var faltan = h.filter(function (c) { return actuales.indexOf(c) < 0; });
    if (faltan.length) {
      sh.getRange(1, actuales.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold').setBackground(colores[SCHEMA[t].grupo]);
      log.push(t + ': columnas nuevas ' + faltan.join(', '));
    }
  });
  HEAD_ = {}; CACHE_ = {};
  return log;
}

/** Carga catálogos nuevos solo si todavía no están. */
function semillasV2_(ss, email) {
  var log = [];
  var aud = function () { return { CreadoEl: new Date(), CreadoPor: email + ' (actualización v2)', ModificadoEl: '', ModificadoPor: '', Activo: 'Sí' }; };
  var agregar = function (tabla, o) { var a = aud(); Object.keys(a).forEach(function (k) { if (o[k] === undefined) o[k] = a[k]; }); ss.getSheetByName(tabla).appendRow(aFila_(tabla, o)); delete CACHE_[tabla]; };
  var existe = function (tabla, campo, valor) { return leer_(tabla).some(function (x) { return String(x[campo]).trim().toLowerCase() === String(valor).trim().toLowerCase(); }); };

  // Formas de pago (hoja Parametros, "Catalogo Forma de pago")
  ['Efectivo', 'Transferencia', 'Cheque', 'Echeq', 'Cuenta corriente'].forEach(function (n) {
    if (existe('D_FormaPago', 'Nombre', n)) return;
    agregar('D_FormaPago', { IdFormaPago: nuevoId_('D_FormaPago', leer_('D_FormaPago')), Nombre: n });
    log.push('Forma de pago: ' + n);
  });
  // Tipos de comprobante (hoja Parametros, columnas Idmov / Tipo de movimiento / Tipo)
  [['FAV', 'Factura de venta', 'Venta', 1], ['FAC', 'Factura de compra', 'Compra', 1], ['NDC', 'Nota de débito de compra', 'Compra', 1],
   ['NCC', 'Nota de crédito de compra', 'Compra', -1], ['REC', 'Recibo por cobro', 'Cobro', 1], ['REP', 'Recibo por pago', 'Pago', 1]].forEach(function (c) {
    if (existe('D_TipoComprobante', 'Codigo', c[0])) return;
    agregar('D_TipoComprobante', { Codigo: c[0], Nombre: c[1], Circuito: c[2], Signo: c[3] });
    log.push('Comprobante: ' + c[0]);
  });
  // Unidad "Dosis" (la vacuna clostridial viene por 60 dosis)
  if (!existe('D_UM', 'Abreviatura', 'ds')) { agregar('D_UM', { IdUM: nuevoId_('D_UM', leer_('D_UM')), Nombre: 'Dosis', Abreviatura: 'ds' }); log.push('Unidad: Dosis'); }

  // Rubro de los insumos que ya estaban
  var rubroDe = { 'INS-000001': 'Alimentación', 'INS-000002': 'Sanidad', 'INS-000003': 'Faena', 'INS-000004': 'Flete', 'INS-000005': 'Mano de obra', 'INS-000006': 'Mantenimiento' };
  leer_('D_Insumo').forEach(function (x) {
    if (x.Rubro || !rubroDe[x.IdInsumo]) return;
    var o = JSON.parse(JSON.stringify(x)); o.Rubro = rubroDe[x.IdInsumo];
    ss.getSheetByName('D_Insumo').getRange(x._fila, 1, 1, headersHoja_('D_Insumo').length).setValues([aFila_('D_Insumo', o)]);
    delete CACHE_['D_Insumo'];
  });

  // Productos veterinarios con precio real (factura B 0002-00007401, 05/09/2026)
  var um = {}; leer_('D_UM').forEach(function (u) { um[u.Abreviatura] = u.IdUM; });
  var cta = leer_('D_Cuenta').filter(function (c) { return c.Codigo === RUBROS['Sanidad'].cuenta; })[0];
  var FUENTE = 'Factura B 0002-00007401 del 05/09/2026 (consumidor final, precio con IVA incluido). GRUPO 6 Planillas de datos 3, hoja Precios.';
  [['Closantel 12,5% x 250 mL (Lab. Inmunovet)', 'mL', 250, 40000], ['Clostridial 10 P x 60 dosis (Tecnovax)', 'ds', 60, 41000],
   ['Bactrovet Plata AM aerosol 260 g / 420 mL (König)', 'mL', 420, 7700], ['Coopermicina LA x 250 mL (MSD)', 'mL', 250, 29500],
   ['Metaxona x 100 mL (Weizur)', 'mL', 100, 5600]].forEach(function (p) {
    if (existe('D_Insumo', 'Nombre', p[0])) return;
    var id = nuevoId_('D_Insumo', leer_('D_Insumo'));
    agregar('D_Insumo', { IdInsumo: id, Nombre: p[0], Rubro: 'Sanidad', IdUM: um[p[1]], ContenidoEnvase: p[2], IdCuenta: cta ? cta.IdCuenta : '',
      TipoCosto: RUBROS['Sanidad'].tipo, Variabilidad: RUBROS['Sanidad'].variab });
    agregar('F_PrecioIns', { IdPrecioIns: nuevoId_('F_PrecioIns', leer_('F_PrecioIns')), IdInsumo: id, Fecha: '2026-09-05', Precio: p[3], IdMoneda: 'MON-000001', Fuente: FUENTE });
    log.push('Producto con precio: ' + p[0]);
  });
  return log;
}

/**
 * Crea (una sola vez) el activador que hace que Google ejecute actualizarDolar() todos los días a las 19 h,
 * aunque nadie tenga la página abierta ni la computadora prendida.
 */
function activarDolarDiario() {
  var ya = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'actualizarDolar'; });
  if (ya.length) return 'El dólar ya se actualiza solo todos los días.';
  ScriptApp.newTrigger('actualizarDolar').timeBased().everyDays(1).atHour(19).inTimezone(TZ).create();
  return 'Listo: el dólar se va a actualizar solo todos los días a las 19 h.';
}
