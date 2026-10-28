/**
 * INDICADORES CON SEMÁFORO DE MAÍZ Y BOVINOS (v3.7)
 * ---------------------------------------------------------------------------------------------
 * Misma tabla de metas que Ovinos (P_Indicador), con la columna Unidad. Mismo semáforo.
 * Los valores salen solos de los datos cargados. Las metas solo se cargan cuando tienen fuente:
 *  - Maíz · rinde: estándar de 8.500 kg/ha cargado por el grupo de Maíz (F_RindeEstAgro).
 *  - El resto queda "Sin meta" hasta que el administrador la cargue (no se inventan metas).
 */
var CALC_UNI = {
  // ----- Maíz -----
  MZ_MARGEN_HA: function (d) { return { valor: d.margenHa, detalle: 'Margen bruto $ ' + fmtNum_(d.margen, 0) + ' ÷ ' + fmtNum_(d.ha, 1) + ' ha.' }; },
  MZ_COSTO_T: function (d) { return { valor: d.costoT || null, detalle: 'Costo de producción $ ' + fmtNum_(d.costoProd, 0) + ' ÷ ' + fmtNum_(d.t, 2) + ' t cosechadas.' }; },
  MZ_PRECIO_REL: function (d) {
    var b = d.interno && d.interno.bcr; if (!b || !d.precioT) return { valor: null, detalle: 'Falta el precio de venta o la cotización de la Bolsa de Rosario.' };
    return { valor: d.precioT / b.precio * 100, detalle: 'Precio promedio de venta $ ' + fmtNum_(d.precioT, 0) + '/t ÷ Bolsa de Comercio de Rosario $ ' + fmtNum_(b.precio, 0) + '/t (' + fd_(b.fecha) + ').', nota: 'La cotización es de la fecha de la última actualización, no de la fecha de la venta.' };
  },
  MZ_RINDE: function (d) { return { valor: d.pctEst, detalle: 'Rinde real ' + fmtNum_(d.rinde, 0) + ' kg/ha ÷ estándar ' + fmtNum_(d.rindeEst, 0) + ' kg/ha.' }; },
  MZ_DESVIO_DOSIS: function (d) {
    var v = d.dosis.filter(function (x) { return x.desvio !== null; }); if (!v.length) return { valor: null, detalle: 'No hay dosis planificadas con aplicaciones para comparar.' };
    var p = v.reduce(function (s, x) { return s + Math.abs(x.desvio); }, 0) / v.length;
    return { valor: p, detalle: 'Promedio del desvío (en valor absoluto) de ' + v.length + ' dosis planificadas contra lo aplicado por hectárea.' };
  },
  MZ_LOTES_REG: function (d) {
    var ok = d.lotes.filter(function (l) { return l.kg > 0 && l.costo > 0; }).length;
    return { valor: d.lotes.length ? ok / d.lotes.length * 100 : null, detalle: ok + ' de ' + d.lotes.length + ' lotes con cosecha y aplicaciones registradas.' };
  },
  // ----- Bovinos -----
  BV_INGRESO_KG: function (d) {
    var c = d.cargas.filter(function (x) { return x.vendidos; }), kg = c.reduce(function (s, x) { return s + x.kgVendidos; }, 0), imp = c.reduce(function (s, x) { return s + x.importe; }, 0);
    return imp ? { valor: imp / kg, detalle: '$ ' + fmtNum_(imp, 0) + ' ÷ ' + fmtNum_(kg, 0) + ' kg vendidos.' } : { valor: null, detalle: 'Las ventas no tienen precio cargado: las planillas del grupo de Bovinos no lo traen.' };
  },
  BV_PESO_VENTA: function (d) {
    var c = d.cargas.filter(function (x) { return x.vendidos; }), n = c.reduce(function (s, x) { return s + x.vendidos; }, 0), kg = c.reduce(function (s, x) { return s + x.kgVendidos; }, 0);
    return { valor: n ? kg / n : null, detalle: fmtNum_(kg, 0) + ' kg ÷ ' + n + ' animales vendidos.' };
  },
  BV_ADPV_ENG: function (d) {
    var c = ultimaCarga_(d); if (!c) return { valor: null, detalle: 'No hay cargas de engorde con pesadas.' };
    return { valor: c.adpv, detalle: c.nombre + ': ' + fmtNum_(c.kgGanados, 0) + ' kg ganados ÷ ' + c.animales + ' animales ÷ ' + c.dias + ' días. Con desbaste ' + c.desbaste + ' %: ' + fmtNum_(c.adpvDesbaste, 2) + ' kg/día.' };
  },
  BV_ICA: function (d) {
    var c = ultimaCarga_(d); if (!c || !c.conversion) return { valor: null, detalle: 'Falta el alimento o las pesadas de la carga.' };
    return { valor: c.conversion, detalle: c.nombre + ': kg de alimento (maíz, soja y minerales) ÷ ' + fmtNum_(c.kgGanados, 0) + ' kg ganados.' };
  },
  BV_ADPV_RECRIA: function (d) {
    var t = d.recria.controles.filter(function (x) { return x.adpv !== null; }), u = t[t.length - 1];
    return u ? { valor: u.adpv, detalle: 'Entre ' + (u.desde === 'nacimiento' ? 'el nacimiento' : 'el ' + fd_(u.desde)) + ' y el control del ' + fd_(u.fecha) + ' (' + u.conAdpv + ' animales).' } : { valor: null, detalle: 'Faltan controles de peso.' };
  },
  BV_MORTANDAD: function (d) { return { valor: d.recria.mortandadPct, detalle: (d.muertos + d.faltantes) + ' muertos o faltantes ÷ ' + d.recria.nacidos + ' nacidos en la recría.' }; },
  BV_FICHAS: function (d) {
    var a = leer_('D_Bovino').filter(activo_), ok = a.filter(function (x) { return x.FechaNac && Number(x.PesoNac) > 0; }).length;
    return { valor: a.length ? ok / a.length * 100 : null, detalle: ok + ' de ' + a.length + ' animales con fecha de nacimiento y peso al nacer.' };
  }
};
function fd_(s) { s = String(s || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s; }
function ultimaCarga_(d) { var c = d.cargas.filter(function (x) { return x.adpv !== null; }); return c.length ? c[c.length - 1] : null; }

function api_indicadoresUnidad(token, q, idCampana) {
  sesion_(token);
  var uid = q === 'maiz' ? unidadMaiz_() : unidadBovina_();
  var defs = leer_('P_Indicador').filter(function (x) { return activo_(x) && uid && String(x.IdUnidad) === String(uid); })
    .sort(function (a, b) { return (PERSPECTIVAS.indexOf(a.Perspectiva) - PERSPECTIVAS.indexOf(b.Perspectiva)) || (Number(a.Orden) || 99) - (Number(b.Orden) || 99); });
  var d, campana, campanas;
  if (q === 'maiz') {
    d = maizDatos_(idCampana);
    if (!d.campanas.length) throw new Error('Todavía no hay campañas de Maíz.');
    campana = { id: d.campana.id, nombre: d.campana.nombre, desde: d.campana.desde, hasta: d.campana.hasta, actual: d.campana.desde <= hoyStr_() && hoyStr_() <= d.campana.hasta };
    campanas = d.campanas.map(function (x) { return { id: x.id, nombre: x.nombre }; });
  } else {
    d = bovinoDatos_(); var cb = campanasBov_();
    campana = { id: '', nombre: 'Todo lo cargado', desde: cb.length ? cb[0].FechaDesde : '', hasta: cb.length ? cb[cb.length - 1].FechaHasta : '', actual: false };
    campanas = [{ id: '', nombre: 'Recría 2025/2026 y cargas de engorde' }];
  }
  var cuenta = { Verde: 0, Amarillo: 0, Rojo: 0, 'Sin datos': 0, 'Sin meta': 0 };
  var lista = defs.map(function (x) {
    var r; try { r = CALC_UNI[x.IdIndicador] ? CALC_UNI[x.IdIndicador](d) : (x.ValorManual !== '' ? { valor: Number(x.ValorManual), detalle: 'Valor cargado a mano por el administrador.' } : { valor: null, detalle: 'Sin cálculo automático.' }); }
    catch (e) { r = { valor: null, detalle: 'No se pudo calcular: ' + e.message }; }
    var v = r.valor === null || r.valor === undefined || isNaN(r.valor) ? null : Math.round(r.valor * 100) / 100, est = semaforo_(v, x); cuenta[est]++;
    return { id: x.IdIndicador, perspectiva: x.Perspectiva, objetivo: x.Objetivo, nombre: x.Nombre, formula: x.Formula, interpretacion: x.Interpretacion, unidad: x.Unidad, sentido: x.Sentido,
      metaVerde: x.MetaVerde, metaAmarillo: x.MetaAmarillo, fuenteMeta: x.FuenteMeta, periodicidad: x.Periodicidad, responsable: x.Responsable, decision: x.Decision,
      valor: v, estado: est, detalle: r.detalle || '', nota: r.nota || '', automatico: !!CALC_UNI[x.IdIndicador] };
  });
  return { unidad: q, campana: campana, campanas: campanas, indicadores: lista, cuenta: cuenta };
}

// [código, perspectiva, objetivo, indicador, fórmula, cómo se interpreta, unidad, sentido, meta verde, alerta amarillo, fuente de la meta, periodicidad, responsable, qué hacer si empeora]
var SIN_META_ = 'Sin meta: la carga el administrador cuando el grupo la defina (no hay una fuente en los datos)';
var INDICADORES_MAIZ_ = [
  ['MZ_MARGEN_HA', 'Financiera', 'Que cada hectárea deje margen', 'Margen bruto por hectárea', '(Ventas netas − costo de producción − gastos de almacén y comercialización) ÷ hectáreas', 'Cuánto deja cada hectárea de maíz antes de los costos de estructura. Sirve para comparar campañas aunque cambie la superficie.', '$ por ha', 'Mayor es mejor', '', '', SIN_META_, 'Por campaña', 'Encargado de la unidad Maíz', 'Revisar qué rubro subió en "¿En qué se fue el costo?" y el precio de venta.'],
  ['MZ_COSTO_T', 'Financiera', 'Producir cada tonelada más barata', 'Costo de producción por tonelada', 'Costo de producción ÷ toneladas cosechadas', 'Lo que costó producir cada tonelada. Es el costo por kilo producido que pide la cátedra.', '$ por t', 'Menor es mejor', '', '', SIN_META_, 'Por campaña', 'Encargado de la unidad Maíz', 'Comparar lotes: ver cuál tuvo más costo por tonelada y por qué.'],
  ['MZ_PRECIO_REL', 'Clientes', 'Vender el grano a un precio cercano al de mercado', 'Precio de venta frente a la Bolsa de Rosario', 'Precio promedio de venta ÷ precio de la Bolsa de Comercio de Rosario × 100', '100 % = se vendió al precio de pizarra. Incluye la venta interna a Ganadería.', '%', 'Mayor es mejor', '', '', SIN_META_, 'Por venta', 'Encargado de la unidad Maíz', 'Revisar el canal de venta y el momento.'],
  ['MZ_RINDE', 'Procesos internos', 'Lograr el rinde planificado', 'Rinde frente al estándar', 'Rinde real (kg/ha) ÷ rinde estándar (kg/ha) × 100', '100 % = se cosechó lo planificado. Debajo de 100 % se cosechó menos de lo esperado.', '%', 'Mayor es mejor', 100, '', 'Rinde estándar de 8.500 kg/ha cargado por el grupo de Maíz (campaña 2024-2025)', 'Por campaña', 'Encargado de la unidad Maíz', 'Ver qué lote quedó debajo del estándar y comparar híbrido, fecha de siembra y dosis.'],
  ['MZ_DESVIO_DOSIS', 'Procesos internos', 'Aplicar lo planificado', 'Desvío de dosis', 'Promedio de |dosis aplicada ÷ dosis técnica − 1| × 100', 'Cuánto se apartó lo aplicado por hectárea de la dosis técnica. 0 % = se aplicó exactamente lo planificado.', '%', 'Cerca de cero es mejor', '', '', SIN_META_, 'Por aplicación', 'Encargado de la unidad Maíz', 'Ver en el Resumen qué insumo y qué lote tienen el desvío.'],
  ['MZ_LOTES_REG', 'Aprendizaje y desarrollo', 'Registrar todo lo que pasa en cada lote', '% de lotes con datos completos', 'Lotes con cosecha y aplicaciones cargadas ÷ lotes de la campaña × 100', 'Sin cosecha o sin aplicaciones no se puede calcular el costo ni el rinde del lote.', '%', 'Mayor es mejor', '', '', SIN_META_, 'Por campaña', 'Encargado de la unidad Maíz', 'Cargar lo que falta del lote.']
];
var INDICADORES_BOVINO_ = [
  ['BV_INGRESO_KG', 'Financiera', 'Saber cuánto deja cada kilo vendido', 'Ingreso por kg vendido', 'Importe de las ventas ÷ kg vendidos', 'Precio promedio obtenido por kilo vivo. Se calcula cuando las ventas tienen precio.', '$ por kg', 'Mayor es mejor', '', '', SIN_META_, 'Por venta', 'Encargado de la unidad Bovina', 'Cargar el precio de cada venta.'],
  ['BV_PESO_VENTA', 'Clientes', 'Vender con el peso que pide el comprador', 'Peso promedio de venta', 'Kg vendidos ÷ animales vendidos', 'Peso vivo promedio con el que salieron los animales.', 'kg', 'Mayor es mejor', '', '', SIN_META_, 'Por carga', 'Encargado de la unidad Bovina', 'Revisar días de engorde y ganancia diaria.'],
  ['BV_ADPV_ENG', 'Procesos internos', 'Que los novillos ganen peso en el engorde', 'Ganancia diaria de peso en engorde', 'Kg ganados ÷ animales ÷ días (última carga con pesadas)', 'Cuántos kilos gana por día cada animal en el engorde a corral, sin desbaste.', 'kg/día', 'Mayor es mejor', '', '', SIN_META_, 'Por carga', 'Encargado de la unidad Bovina', 'Revisar la dieta y la sanidad de la carga.'],
  ['BV_ICA', 'Procesos internos', 'Usar bien el alimento', 'Índice de conversión alimenticia (ICA)', 'Kg de alimento consumido ÷ kg de ganancia de peso', 'Kilos de alimento que hacen falta para ganar un kilo de peso. Cuanto más bajo, mejor.', 'kg', 'Menor es mejor', '', '', SIN_META_, 'Por carga', 'Encargado de la unidad Bovina', 'Revisar la ración y el desperdicio.'],
  ['BV_ADPV_RECRIA', 'Procesos internos', 'Que los terneros crezcan en la recría', 'Ganancia diaria de peso en la recría', 'Promedio de (peso del control − peso del control anterior) ÷ días', 'Cuántos kilos ganó por día cada animal entre los dos últimos controles de peso.', 'kg/día', 'Mayor es mejor', '', '', SIN_META_, 'En cada control de peso', 'Encargado de la unidad Bovina', 'Revisar pasturas y suplementación.'],
  ['BV_MORTANDAD', 'Procesos internos', 'Reducir las muertes', 'Mortandad de la recría', '(Muertos + faltantes) ÷ nacidos × 100', 'Qué parte de los terneros nacidos se perdió.', '%', 'Menor es mejor', '', '', SIN_META_, 'Por campaña', 'Encargado de la unidad Bovina', 'Revisar las causas de muerte y la sanidad.'],
  ['BV_FICHAS', 'Aprendizaje y desarrollo', 'Tener la ficha de cada animal completa', '% de fichas completas', 'Animales con fecha de nacimiento y peso al nacer ÷ animales × 100', 'Sin estos datos no se puede calcular la ganancia de peso desde el nacimiento.', '%', 'Mayor es mejor', '', '', SIN_META_, 'Mensual', 'Encargado de la unidad Bovina', 'Completar las fichas que faltan.']
];
function cargarIndicadoresUnidad_(quien) {
  var hay = {}; leer_('P_Indicador').forEach(function (x) { hay[x.IdIndicador] = 1; });
  var filas = [], arm = function (L, uid) { L.forEach(function (r, i) { if (hay[r[0]] || !uid) return;
    filas.push({ IdIndicador: r[0], Perspectiva: r[1], Objetivo: r[2], Nombre: r[3], Formula: r[4], Interpretacion: r[5], Unidad: r[6], Sentido: r[7], MetaVerde: r[8], MetaAmarillo: r[9],
      FuenteMeta: r[10], Periodicidad: r[11], Responsable: r[12], Decision: r[13], ValorManual: '', Orden: i + 1, IdUnidad: uid }); }); };
  arm(INDICADORES_MAIZ_, unidadMaiz_()); arm(INDICADORES_BOVINO_, unidadBovina_());
  insertarVarios_('P_Indicador', filas, quien, 'indicadores de Maíz y Bovinos');
  return 'Indicadores: ' + filas.length + ' nuevos para Maíz y Bovinos';
}
