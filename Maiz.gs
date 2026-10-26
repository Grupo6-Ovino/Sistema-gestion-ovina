/**
 * UNIDAD MAÍZ INTEGRADA (v3.7)
 * ---------------------------------------------------------------------------------------------
 * El sistema pasa a ser del establecimiento, no solo de la unidad ovina: una sola base de datos (la planilla),
 * los mismos usuarios, roles, auditoría, historial y lapicito. La unidad Maíz usa las mismas tablas que diseñó
 * el grupo de Maíz en su planilla "taller_2_maiz.xlsx" (lotes, insumos, dosis, estándares de rinde y de costos,
 * consumos reales por lote, cosechas, ventas y gastos de almacén), con los nombres y la estructura de este sistema.
 *
 * Reglas:
 *  - Campañas: la misma tabla D_Campana, con la columna "Unidad" (vacío = Ovino). Las del maíz no se mezclan con las ovinas.
 *  - Subunidades: la misma tabla D_Subunidad (Producción y Almacén, de la unidad Maíz).
 *  - En las tablas de maíz la campaña se elige (no sale de la fecha), porque el grano se vende después del cierre
 *    de la campaña agrícola (así lo cargó el grupo de Maíz).
 *  - Venta de grano a terceros: la factura sale numerada sola, con la MISMA numeración que las ventas de corderos
 *    (un solo establecimiento, un solo punto de venta). La venta interna a Ganadería no lleva factura.
 */
var UNIDAD_OVINA = 'N1';

function unidadMaiz_() {
  var u = leer_('D_UnidadNeg').filter(function (x) { return activo_(x) && /^ma[ií]z$/i.test(String(x.Nombre).trim()); })[0];
  return u ? u.IdUnidad : '';
}
function campanasOvinas_() {
  return leer_('D_Campana').filter(function (x) { return activo_(x) && (!x.IdUnidad || String(x.IdUnidad) === UNIDAD_OVINA); });
}
function campanasMaiz_() {
  var m = unidadMaiz_();
  return leer_('D_Campana').filter(function (x) { return activo_(x) && m && String(x.IdUnidad) === m; })
    .sort(function (a, b) { return a.FechaDesde < b.FechaDesde ? -1 : 1; });
}

function calcularAgro_(tabla, o) {
  var r2 = function (x) { return Math.round(x * 100) / 100; }, r4 = function (x) { return Math.round(x * 10000) / 10000; };
  var lote = function () { return o.IdLote ? buscar_('D_Lote', o.IdLote) : null; };
  if (tabla === 'F_CostoEstAgro') o.CostoHaUSD = r2(Number(o.CantidadHa) * Number(o.PrecioUSD));
  if (tabla === 'F_ConsumoLote') { var l = lote(); o.Hectareas = Number(l.Hectareas); o.CantidadTotal = r4(Number(o.AplicacionHa) * o.Hectareas); o.CostoTotal = r2(o.CantidadTotal * Number(o.PrecioUnit)); }
  if (tabla === 'F_Cosecha') { var c = lote(); o.Hectareas = Number(c.Hectareas); o.Toneladas = r4(Number(o.KgTotal) / 1000); o.RindeKgHa = Math.round(Number(o.KgTotal) / o.Hectareas); }
  if (tabla === 'F_VentaGrano') { o.Neto = r2(Number(o.Toneladas) * Number(o.PrecioTn)); o.IVA = r2(o.Neto * Number(o.AlicuotaIVA || 0) / 100); o.Total = r2(o.Neto + o.IVA); }
  if (tabla === 'F_GastoAgro') o.Importe = r2(Number(o.Cantidad) * Number(o.PrecioUnit));
  return o;
}

/** Controles propios del maíz (además de los generales: obligatorios, números, listas). */
function validarAgro_(tabla, o) {
  var m = unidadMaiz_();
  if (o.IdSubunidad) { var s = leer_('D_Subunidad').filter(function (x) { return x.IdSubunidad === o.IdSubunidad; })[0]; if (s && String(s.IdUnidad) !== m) throw new Error('Elegí una subunidad de Maíz (Producción o Almacén).'); }
  if (o.IdCampana) { var c = leer_('D_Campana').filter(function (x) { return x.IdCampana === o.IdCampana; })[0]; if (c && String(c.IdUnidad) !== m) throw new Error('Elegí una campaña de Maíz.'); }
  if (o.IdLote && o.IdCampana) { var l = leer_('D_Lote').filter(function (x) { return x.IdLote === o.IdLote; })[0]; if (l && tabla !== 'D_Lote' && l.IdCampana !== o.IdCampana) { var cl = leer_('D_Campana').filter(function (x) { return x.IdCampana === l.IdCampana; })[0]; throw new Error(l.Nombre + ' es de la campaña ' + (cl ? cl.Nombre : l.IdCampana) + '. Elegí esa campaña o un lote de la campaña elegida.'); } }
  if (tabla === 'F_VentaGrano' && o.Destino === 'Terceros' && !o.IdTercero) throw new Error('Para una venta a terceros elegí el cliente.');
  if (tabla === 'F_VentaGrano' && o.Destino !== 'Terceros') o.IdTercero = '';
}

/** Alta masiva (importación): un solo setValues por tabla y un renglón de auditoría por tabla. */
function insertarVarios_(tabla, objs, quien, motivo) {
  if (!objs.length) return [];
  var s = SCHEMA[tabla], existentes = leer_(tabla).slice(), ahora = new Date(), filas = [], ids = [];
  objs.forEach(function (o) {
    if (!s.pkManual) o[s.pk] = nuevoId_(tabla, existentes);
    if (s.agro) calcularAgro_(tabla, o);
    if (s.bov) calcularBov_(tabla, o);
    o.CreadoEl = ahora; o.CreadoPor = quien; o.ModificadoEl = ''; o.ModificadoPor = ''; o.Activo = 'Sí';
    existentes.push(o); filas.push(aFila_(tabla, o)); ids.push(o[s.pk]);
  });
  var sh = hoja_(tabla);
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
  invalidar_(tabla);
  auditar_(quien, 'Alta (' + motivo + ')', tabla, ids[0] + (ids.length > 1 ? ' … ' + ids[ids.length - 1] : ''), null, { registros: ids.length });
  return ids;
}

/** Paso de la actualización v3.7: crea la unidad Maíz completa con los datos de la planilla del grupo de Maíz. */
function importarMaiz_(quien) {
  if (leer_('D_Lote').length) return 'Maíz: ya estaba cargado';
  var D = DATOS_MAIZ_, FUENTE = 'Planilla del grupo de Maíz (taller_2_maiz.xlsx)';
  var filas = function (t) { return D[t].f.map(function (f) { var o = {}; D[t].c.forEach(function (k, i) { o[k] = f[i] === null ? '' : f[i]; }); return o; }); };
  var mot = 'importación Maíz';
  // Unidad
  var um = unidadMaiz_();
  if (!um) um = insertar_('D_UnidadNeg', { Nombre: 'Maíz', TipoActividad: 'Agrícola', Descripcion: '', LinkApp: '' }, quien);
  var un = buscar_('D_UnidadNeg', um);
  reescribir_('D_UnidadNeg', un._fila, Object.assign({}, un, { Descripcion: 'Maíz para comercialización y consumo interno (integrado a este sistema desde la v3.7)', LinkApp: '', ModificadoEl: new Date(), ModificadoPor: quien }));
  // Campañas y subunidades
  var mapC = {}, mapS = {}, mapI = {}, mapL = {};
  var cIds = insertarVarios_('D_Campana', filas('D_CAMPAÑA').map(function (c) { return { Nombre: 'Maíz ' + String(c.nombre_campaña).replace(/^Campaña\s*/i, ''), FechaDesde: c.fecha_inicio, FechaHasta: c.fecha_fin, IdUnidad: um, Estado: c.estado }; }), quien, mot);
  filas('D_CAMPAÑA').forEach(function (c, i) { mapC[c.id_campaña] = cIds[i]; });
  var desc = { 'Producción': 'Lotes de maíz: siembra, pulverización, fertilización y cosecha', 'Almacén': 'Acopio en silobolsa y comercialización del grano' };
  var sIds = insertarVarios_('D_Subunidad', filas('D_SUBUNIDAD').map(function (s) { return { IdUnidad: um, Nombre: s.subunidad, Descripcion: desc[s.subunidad] || '' }; }), quien, mot);
  filas('D_SUBUNIDAD').forEach(function (s, i) { mapS[s.id_subunidad] = sIds[i]; });
  // Insumos (+ las labores contratadas, que en la planilla de Maíz figuran sin insumo)
  var ins = filas('D_INSUMO');
  var labores = ['Labor de pulverización', 'Labor de siembra', 'Labor de refertilización', 'Labor de cosecha'];
  var iIds = insertarVarios_('D_InsumoAgro', ins.map(function (i) { return { Nombre: i.nombre_insumo, Categoria: i.categoria, Tipo: i.tipo_insumo, Unidad: i.unidad_medida }; })
    .concat(labores.map(function (n) { return { Nombre: n, Categoria: 'Labores', Tipo: 'Labor contratada', Unidad: 'ha' }; })), quien, mot);
  ins.forEach(function (i, k) { mapI[i.id_insumo] = iIds[k]; });
  var labor = function (txt) { for (var k = 0; k < labores.length; k++) if (String(txt).indexOf(labores[k]) === 0) return iIds[ins.length + k]; return ''; };
  // Lotes
  var lotes = filas('D_LOTE');
  var lIds = insertarVarios_('D_Lote', lotes.map(function (l) { return { Nombre: l.nombre_lote, Hectareas: l.hectareas, IdCampana: mapC[l.id_campaña], Cultivo: l.cultivo, Variedad: l.variedad, SistemaSiembra: l.sistema_siembra, Observaciones: l.observaciones }; }), quien, mot);
  lotes.forEach(function (l, k) { mapL[l.id_lote] = lIds[k]; });
  // Parámetros
  insertarVarios_('F_DosisAgro', filas('F_DOSIS').map(function (x) { return { IdCampana: mapC[x.id_campaña], IdLote: mapL[x.id_lote], IdSubunidad: mapS[x.id_subunidad], IdInsumoAgro: mapI[x.id_insumo], DosisHa: x.dosis_tecnica, Unidad: x.unidad }; }), quien, mot);
  insertarVarios_('F_RindeEstAgro', filas('F_ESTANDAR_RINDE').map(function (x) { return { IdCampana: mapC[x.id_campaña], IdSubunidad: mapS[x.id_subunidad], RindeEsperado: x.rinde_esperado, Unidad: x.unidad_rinde }; }), quien, mot);
  insertarVarios_('F_CostoEstAgro', filas('F_ESTANDAR_COSTOS').map(function (x) { return { IdCampana: mapC[x.id_campaña], IdSubunidad: mapS[x.id_subunidad], Rubro: x.rubro_costo, Concepto: x.concepto, Unidad: x.unidad, CantidadHa: x.cantidad_est_ha, PrecioUSD: x.precio_est_usd }; }), quien, mot);
  // Hechos
  var cons = insertarVarios_('F_ConsumoLote', filas('F_CONSUMO_REAL').map(function (x) {
    return { Fecha: x.fecha, IdCampana: mapC[x.id_campaña], IdSubunidad: mapS[x.id_subunidad], IdLote: mapL[x.id_lote], IdInsumoAgro: x.id_insumo ? mapI[x.id_insumo] : labor(x.observaciones),
      UnidadAplicacion: x.unidad_aplicacion, AplicacionHa: x.aplicacion_por_ha, PrecioUnit: x.precio_unitario_real, Observaciones: x.observaciones + ' · ' + FUENTE }; }), quien, mot);
  var cos = insertarVarios_('F_Cosecha', filas('F_COSECHA').map(function (x) { return { Fecha: x.fecha_cosecha, IdCampana: mapC[x.id_campaña], IdSubunidad: mapS[x.id_subunidad], IdLote: mapL[x.id_lote], KgTotal: x.produccion_total_kg, Observaciones: FUENTE }; }), quien, mot);
  // Cliente del grano vendido a terceros
  var cli = 'Acopio / exportador', ter = leer_('D_Tercero').filter(function (t) { return activo_(t) && String(t.RazonSocial).trim().toLowerCase() === cli.toLowerCase(); })[0];
  var idTer = ter ? ter.IdTercero : insertar_('D_Tercero', { RazonSocial: cli, Tipo: 'Cliente', CUIT: '', CondicionIVA: '', Rubro: 'Compra de maíz', Telefono: '', Localidad: '', Observaciones: 'Nombre genérico de la planilla de Maíz: falta la razón social y el CUIT reales.' }, quien);
  var ven = insertarVarios_('F_VentaGrano', filas('F_VENTAS').map(function (x) {
    var interno = /interno/i.test(x.cliente);
    return { Fecha: x.fecha, IdCampana: mapC[x.id_campaña], IdSubunidad: mapS[x.id_subunidad], Destino: interno ? 'Interno: Ganadería' : 'Terceros', IdTercero: interno ? '' : idTer,
      Comprobante: interno ? 'Transferencia interna' : 'Sin comprobante en la planilla de Maíz', Toneladas: x.cantidad, PrecioTn: x.precio_unitario, AlicuotaIVA: x.iva || 0, Observaciones: x.observaciones + ' · ' + FUENTE }; }), quien, mot);
  var rub = function (t) { return /silo/i.test(t) ? 'Almacenamiento' : /flete/i.test(t) ? 'Flete' : /comisi/i.test(t) ? 'Comisión' : 'Otros'; };
  var gas = insertarVarios_('F_GastoAgro', filas('F_COMPRAS').map(function (x) { return { Fecha: x.fecha, IdCampana: mapC[x.id_campaña], IdSubunidad: mapS[x.id_subunidad], Rubro: rub(x.concepto), Concepto: x.concepto, IdTercero: '', Cantidad: x.cantidad, Unidad: x.unidad_medida, PrecioUnit: x.precio_unitario, Observaciones: x.observaciones + ' · ' + FUENTE }; }), quien, mot);
  return 'Maíz: unidad integrada con ' + lIds.length + ' lotes, ' + iIds.length + ' insumos y labores, ' + cons.length + ' aplicaciones, ' + cos.length + ' cosechas, ' + ven.length + ' ventas y ' + gas.length + ' gastos de almacén';
}

/** Resumen de la unidad Maíz para una campaña (todo calculado desde las tablas, nada pegado a mano). */
function api_maiz(token, idCampana) { sesion_(token); return maizDatos_(idCampana); }
function maizDatos_(idCampana) {
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var act = function (t) { return leer_(t).filter(activo_); };
  var camps = campanasMaiz_();
  if (!camps.length) return { campanas: [] };
  var cos = act('F_Cosecha');
  if (!idCampana) { var con = camps.filter(function (c) { return cos.some(function (x) { return x.IdCampana === c.IdCampana; }); }); idCampana = (con.length ? con[con.length - 1] : camps[camps.length - 1]).IdCampana; }
  var de = function (t) { return act(t).filter(function (x) { return x.IdCampana === idCampana; }); };
  var subs = {}; leer_('D_Subunidad').forEach(function (s) { subs[s.IdSubunidad] = s.Nombre; });
  var ins = {}; leer_('D_InsumoAgro').forEach(function (i) { ins[i.IdInsumoAgro] = i; });
  var lotes = act('D_Lote').filter(function (l) { return l.IdCampana === idCampana; });
  var consumos = de('F_ConsumoLote'), cosechas = de('F_Cosecha'), ventas = de('F_VentaGrano'), gastos = de('F_GastoAgro');
  var rindeEst = de('F_RindeEstAgro').filter(function (x) { return /kg\/ha/i.test(x.Unidad); })[0];
  var est = rindeEst ? Number(rindeEst.RindeEsperado) : 0;
  var sum = function (a, k) { return a.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0); };
  var porLote = lotes.map(function (l) {
    var c = consumos.filter(function (x) { return x.IdLote === l.IdLote; }), h = cosechas.filter(function (x) { return x.IdLote === l.IdLote; });
    var ha = Number(l.Hectareas), kg = sum(h, 'KgTotal'), costo = sum(c, 'CostoTotal');
    return { id: l.IdLote, nombre: l.Nombre, ha: ha, variedad: l.Variedad, siembra: l.Observaciones, kg: kg, t: r2(kg / 1000), rinde: ha ? Math.round(kg / ha) : 0,
      pctEst: est && ha && kg ? Math.round(kg / ha / est * 1000) / 10 : null, costo: r2(costo), costoHa: ha ? Math.round(costo / ha) : 0, costoT: kg ? Math.round(costo / (kg / 1000)) : null };
  });
  var ha = sum(lotes, 'Hectareas'), kg = sum(cosechas, 'KgTotal'), costoProd = sum(consumos, 'CostoTotal'), costoGas = sum(gastos, 'Importe');
  var GRUPO = { 'Labores': 'Labores contratadas', 'Fertilizar': 'Fertilizantes', 'Pulverizar': 'Agroquímicos', 'Maíz a sembrar': 'Semilla', 'Otros / Servicios': 'Otros' };
  var rub = {}; consumos.forEach(function (x) { var i = ins[x.IdInsumoAgro] || {}; var g = GRUPO[i.Categoria] || 'Otros'; rub[g] = (rub[g] || 0) + Number(x.CostoTotal || 0); });
  var gRub = {}; gastos.forEach(function (x) { gRub[x.Rubro] = (gRub[x.Rubro] || 0) + Number(x.Importe || 0); });
  var vDest = {}; ventas.forEach(function (x) { var d = vDest[x.Destino] = vDest[x.Destino] || { t: 0, neto: 0 }; d.t += Number(x.Toneladas); d.neto += Number(x.Neto); });
  var ventasNeto = sum(ventas, 'Neto'), tVend = sum(ventas, 'Toneladas');
  var margen = ventasNeto - costoProd - costoGas;
  // Estándar (en US$, como lo cargó el grupo de Maíz) y desvío de dosis: lo planificado contra lo aplicado en cada lote
  var cest = de('F_CostoEstAgro'), estRub = {}; cest.forEach(function (x) { var k = subs[x.IdSubunidad] === 'Almacén' ? 'Almacén (US$ por t)' : x.Rubro; estRub[k] = (estRub[k] || 0) + Number(x.CostoHaUSD || 0); });
  var dosis = de('F_DosisAgro').map(function (d) {
    var real = consumos.filter(function (x) { return x.IdLote === d.IdLote && x.IdInsumoAgro === d.IdInsumoAgro; });
    var ap = sum(real, 'AplicacionHa');
    return { lote: (lotes.filter(function (l) { return l.IdLote === d.IdLote; })[0] || {}).Nombre || d.IdLote, insumo: (ins[d.IdInsumoAgro] || {}).Nombre || d.IdInsumoAgro, unidad: d.Unidad,
      plan: Number(d.DosisHa), real: real.length ? r2(ap) : null, desvio: real.length && Number(d.DosisHa) ? Math.round((ap / Number(d.DosisHa) - 1) * 1000) / 10 : null };
  });
  var interno = vDest['Interno: Ganadería'];
  var bcr = act('F_Cotizacion').filter(function (x) { return /ma[ií]z/i.test(x.Producto) && /\/t/i.test(x.Unidad); }).sort(function (a, b) { return String(a.Fecha) < String(b.Fecha) ? 1 : -1; })[0];
  var c = camps.filter(function (x) { return x.IdCampana === idCampana; })[0];
  return {
    campanas: camps.map(function (x) { return { id: x.IdCampana, nombre: x.Nombre, estado: x.Estado || '' }; }), campana: { id: c.IdCampana, nombre: c.Nombre, desde: c.FechaDesde, hasta: c.FechaHasta, estado: c.Estado || '' },
    ha: ha, lotes: porLote, kg: kg, t: r2(kg / 1000), rinde: ha ? Math.round(kg / ha) : 0, rindeEst: est, pctEst: est && ha && kg ? Math.round(kg / ha / est * 1000) / 10 : null,
    fechasCosecha: cosechas.map(function (x) { return x.Fecha; }).sort(),
    costoProd: r2(costoProd), costoHa: ha ? Math.round(costoProd / ha) : 0, costoT: kg ? Math.round(costoProd / (kg / 1000)) : 0,
    rubros: Object.keys(rub).map(function (k) { return { nombre: k, importe: r2(rub[k]) }; }).sort(function (a, b) { return b.importe - a.importe; }),
    gastos: Object.keys(gRub).map(function (k) { return { nombre: k, importe: r2(gRub[k]) }; }).sort(function (a, b) { return b.importe - a.importe; }), costoGas: r2(costoGas),
    ventas: Object.keys(vDest).map(function (k) { return { destino: k, t: r2(vDest[k].t), neto: r2(vDest[k].neto) }; }), ventasNeto: r2(ventasNeto), tVendidas: r2(tVend),
    precioT: tVend ? Math.round(ventasNeto / tVend) : 0, margen: r2(margen), margenHa: ha ? Math.round(margen / ha) : 0, margenPct: ventasNeto ? Math.round(margen / ventasNeto * 1000) / 10 : null,
    stockT: r2(kg / 1000 - tVend),
    estandar: { porRubro: Object.keys(estRub).map(function (k) { return { nombre: k, usd: r2(estRub[k]) }; }), produccionUsdHa: r2(cest.filter(function (x) { return subs[x.IdSubunidad] !== 'Almacén'; }).reduce(function (s, x) { return s + Number(x.CostoHaUSD || 0); }, 0)) },
    dosis: dosis,
    interno: interno ? { t: r2(interno.t), precioT: Math.round(interno.neto / interno.t), bcr: bcr ? { precio: Number(bcr.Precio), fecha: bcr.Fecha, mercado: bcr.Mercado } : null } : null
  };
}
var DATOS_MAIZ_ = {"D_LOTE":{"c":["id_lote","nombre_lote","hectareas","id_campaña","cultivo","variedad","sistema_siembra","observaciones"],"f":[["LOTE-01","Lote 1",23.0,"CAMP-2024-2025","Maíz","ACA (Densidad 60.000 pl/ha)","Directa","Siembra: 11/12/2024"],["LOTE-04","Lote 4",12.5,"CAMP-2024-2025","Maíz","Nidera 7784 (Densidad 60.000 pl/ha)","Directa","Siembra: 16/10/2024"],["LOTE-05","Lote 5",16.5,"CAMP-2024-2025","Maíz","AG 7004, Brevant 8421, Nidera AG","Directa","Siembra: 24/10/2024"]]},"D_INSUMO":{"c":["id_insumo","nombre_insumo","categoria","tipo_insumo","unidad_medida"],"f":[["INS-001","Glifosato","Pulverizar","Herbicida","L"],["INS-002","2,4-D","Pulverizar","Herbicida","L"],["INS-003","Dicamba","Pulverizar","Herbicida","L"],["INS-004","Aceite (Metilado / Mineral)","Pulverizar","Coadyuvante","L"],["INS-005","Preside","Pulverizar","Herbicida","L"],["INS-006","Break Thru","Pulverizar","Tensioactivo","L"],["INS-007","Atrazina","Pulverizar","Herbicida","kg"],["INS-008","Picloram","Pulverizar","Herbicida","L"],["INS-009","Haloxifop","Pulverizar","Graminicida","L"],["INS-010","Cletodim","Pulverizar","Graminicida","L"],["INS-011","Dual / S-Metolacloro","Pulverizar","Herbicida","L"],["INS-012","Sulfato de Amonio","Pulverizar","Coadyuvante","L"],["INS-013","Diclosulam","Pulverizar","Herbicida","g"],["INS-014","Paraquat","Pulverizar","Herbicida","L"],["INS-015","Sulfentrazone","Pulverizar","Herbicida","L"],["INS-016","U10","Pulverizar","Coadyuvante","L"],["INS-017","Fomesafen","Pulverizar","Herbicida","L"],["INS-018","Fosfato Diamónico (DAP)","Fertilizar","Fertilizante","kg"],["INS-019","Urea","Fertilizar","Fertilizante","kg"],["INS-020","Fosfato Monoamónico (MAP)","Fertilizar","Fertilizante","kg"],["INS-021","Superfosfato Simple (SPS)","Fertilizar","Fertilizante","kg"],["INS-022","Amoníaco","Fertilizar","Fertilizante","kg"],["INS-023","Semilla Maíz ACA","Maíz a sembrar","Semilla híbrida","bolsa"],["INS-024","Semilla Maíz AG 7004","Maíz a sembrar","Semilla híbrida","bolsa"],["INS-025","Semilla Maíz BREVANT 8421","Maíz a sembrar","Semilla híbrida","bolsa"],["INS-026","Semilla Maíz NIDERA AG","Maíz a sembrar","Semilla híbrida","bolsa"],["INS-027","Semilla Maíz NIDERA 7784","Maíz a sembrar","Semilla híbrida","bolsa"],["INS-028","Manta Silobolsa (75m)","Otros / Servicios","Acopio","tn"],["INS-029","Combustible Ha","Otros / Servicios","Combustible","ha"],["INS-030","Mano de Obra Directa","Otros / Servicios","RHHD","ha"]]},"F_DOSIS":{"c":["id_campaña","id_lote","id_subunidad","id_insumo","dosis_tecnica","unidad"],"f":[["CAMP-2024-2025","LOTE-01","SUB-01","INS-019",170.0,"kg/ha"],["CAMP-2024-2025","LOTE-01","SUB-01","INS-018",80.0,"kg/ha"],["CAMP-2024-2025","LOTE-01","SUB-01","INS-001",3.8,"L/ha"],["CAMP-2024-2025","LOTE-04","SUB-01","INS-020",83.0,"kg/ha"],["CAMP-2024-2025","LOTE-04","SUB-01","INS-019",105.0,"kg/ha"],["CAMP-2024-2025","LOTE-05","SUB-01","INS-019",110.0,"kg/ha"]]},"F_ESTANDAR_RINDE":{"c":["id_campaña","id_subunidad","rinde_esperado","unidad_rinde"],"f":[["CAMP-2024-2025","SUB-01",8500.0,"kg/ha"],["CAMP-2024-2025","SUB-02",100.0,"% conservación"]]},"F_ESTANDAR_COSTOS":{"c":["id_campaña","id_subunidad","rubro_costo","concepto","unidad","cantidad_est_ha","precio_est_usd"],"f":[["CAMP-2024-2025","SUB-01","Siembra","Semilla Maíz (Bolsa 60k sem)","bolsa",1.0,165.0],["CAMP-2024-2025","SUB-01","Fertilizante","Amoníaco","kg",80.0,0.95],["CAMP-2024-2025","SUB-01","Fertilizante","Urea de Siembra","kg",70.0,0.58],["CAMP-2024-2025","SUB-01","Fertilizante","Urea de Refertilización","kg",100.0,0.58],["CAMP-2024-2025","SUB-01","Fumigación","Glifosato","L",3.8,5.5],["CAMP-2024-2025","SUB-01","Fumigación","Dicamba","L",0.2,7.9],["CAMP-2024-2025","SUB-01","Fumigación","Cletodim","L",1.0,6.9],["CAMP-2024-2025","SUB-01","Fumigación","Break Thru","L",0.2,20.0],["CAMP-2024-2025","SUB-01","Fumigación","Dual","L",2.0,9.5],["CAMP-2024-2025","SUB-01","Fumigación","Aceite","L",1.0,3.0],["CAMP-2024-2025","SUB-01","Combustible","Combustible Ha (4.5L)","ha",4.5,2.2],["CAMP-2024-2025","SUB-01","RHHD","Mano de Obra Directa","ha",1.0,1000.0],["CAMP-2024-2025","SUB-02","Almacenamiento","Manta Silobolsa (75m)","tn",1.0,505.78]]},"F_CONSUMO_REAL":{"c":["id_campaña","id_subunidad","id_lote","fecha","id_insumo","unidad_aplicacion","aplicacion_por_ha","precio_unitario_real","observaciones"],"f":[["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-001","L/ha",1.8,10075.0,"Glifosato - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04",null,"ha",1.0,138979.7,"Labor de pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-004","L/ha",1.8,620.0,"Aceite agrícola - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-007","kg/ha",1.0,620.0,"Atrazina - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-008","L/ha",0.1,14725.0,"Picloram - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-009","L/ha",0.4,14725.0,"Haloxifop - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-002","L/ha",0.8,620.0,"2,4-D - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-001","L/ha",2.0,10075.0,"Glifosato - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-07-04","INS-003","L/ha",0.2,10075.0,"Dicamba - Pulverización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-10-16","INS-027","bolsa/ha",0.75,14725.0,"Semilla Maíz NIDERA 7784 - Siembra Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-10-16",null,"ha",1.0,177239.32504,"Labor de siembra Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-10-16","INS-020","kg/ha",83.0,1550.0,"Fosfato monoamónico (MAP) - Fertilización Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-17","INS-001","L/ha",2.0,10075.0,"Glifosato - Pulverización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-17",null,"ha",1.0,138979.69999999998,"Labor de pulverización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-17","INS-007","kg/ha",2.0,620.0,"Atrazina - Pulverización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-17","INS-011","L/ha",1.0,10075.0,"Dual (S-Metolacloro) - Pulverización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-17","INS-002","L/ha",1.0,620.0,"2,4-D - Pulverización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-17","INS-004","L/ha",1.0,620.0,"Aceite agrícola - Pulverización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-17","INS-006","L/ha",0.2,620.0,"Break Thru - Pulverización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-24","INS-024","bolsa/ha",0.75,14725.0,"Semilla Maíz AG 7004 - Siembra Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-10-24",null,"ha",1.0,177239.32503030304,"Labor de siembra Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-10-26","INS-007","kg/ha",2.0,620.0,"Atrazina - Pulverización Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-10-26",null,"ha",1.0,138979.7,"Labor de pulverización Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-10-26","INS-011","L/ha",1.0,10075.0,"Dual (S-Metolacloro) - Pulverización Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-10-26","INS-002","L/ha",0.8,620.0,"2,4-D - Pulverización Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-04","2024-11-20","INS-019","kg/ha",100.0,899.0,"Urea - Fertilización Lote 4"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-11-22","INS-019","kg/ha",110.0,899.0,"Urea - Fertilización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-05","2024-11-22",null,"ha",1.0,18600.0,"Labor de refertilización Lote 5"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-12-11","INS-023","bolsa/ha",0.75,14725.0,"Semilla Maíz ACA - Siembra Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-12-11",null,"ha",1.0,177239.32499999998,"Labor de siembra Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-12-11","INS-019","kg/ha",70.0,899.0,"Urea - Fertilización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-01","2024-12-11","INS-018","kg/ha",80.0,1472.5,"Fosfato diamónico (DAP) - Fertilización Lote 1"],["CAMP-2024-2025","SUB-01","LOTE-05","2025-03-06",null,"ha",1.0,153252.0,"Labor de cosecha Lote 5 (82.42424242 qq/ha)"],["CAMP-2024-2025","SUB-01","LOTE-04","2025-06-12",null,"ha",1.0,186120.0,"Labor de cosecha Lote 4 (107 qq/ha)"],["CAMP-2024-2025","SUB-01","LOTE-01","2025-06-14",null,"ha",1.0,147028.0,"Labor de cosecha Lote 1 (80 qq/ha)"]]},"F_COSECHA":{"c":["id_campaña","id_subunidad","id_lote","fecha_cosecha","produccion_total_kg"],"f":[["CAMP-2024-2025","SUB-01","LOTE-01","2025-06-14",184000.0],["CAMP-2024-2025","SUB-01","LOTE-04","2025-06-12",133750.0],["CAMP-2024-2025","SUB-01","LOTE-05","2025-06-13",136000.0]]},"F_VENTAS":{"c":["fecha","concepto","cliente","cantidad","precio_unitario","iva","id_campaña","id_subunidad","observaciones"],"f":[["2025-09-12","Consumo interno (ganadería): venta de maíz al sector ganadero","Sector Ganadería (interno)",200.0,278000.0,0.0,"CAMP-2024-2025","SUB-02","2.000 QQ × $ 27.800/QQ"],["2025-09-12","Comercialización de maíz a terceros","Acopio / exportador",253.75,278000.0,0.0,"CAMP-2024-2025","SUB-02","2.537,50 QQ × $ 27.800/QQ (bruto; flete y comisión en compras de almacén)"]]},"F_COMPRAS":{"c":["fecha","concepto","cantidad","unidad_medida","precio_unitario","id_campaña","id_subunidad","observaciones"],"f":[["2025-09-12","Bolsón silobolsa 75 m (3 unidades)",3.0,"unidad",647900.0,"CAMP-2024-2025","SUB-02","75 m × 3 × USD 418 (planilla de almacén)"],["2025-09-12","Flete de comercialización a terceros (2.537,50 QQ)",2537.5,"QQ",7262.041,"CAMP-2024-2025","SUB-02","Tarifa de flete por QQ (estado de resultado)"],["2025-09-12","Comisión de comercialización (2.537,50 QQ)",2537.5,"QQ",556.0,"CAMP-2024-2025","SUB-02","Comisión 2% sobre $ 27.800/QQ (estado de resultado)"]]},"D_CAMPAÑA":{"c":["id_campaña","nombre_campaña","fecha_inicio","fecha_fin","estado"],"f":[["CAMP-2024-2025","Campaña 2024-2025","2024-04-01","2025-07-31","Activa"],["CAMP-2025-2026","Campaña 2025-2026","2025-08-01","2026-07-31","Planificación"]]},"D_SUBUNIDAD":{"c":["id_subunidad","subunidad"],"f":[["SUB-01","Producción"],["SUB-02","Almacén"]]}};
