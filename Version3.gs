/**
 * ACTUALIZACIÓN AUTOMÁTICA A LA VERSIÓN 3.0 (octubre 2026)
 * ---------------------------------------------------------------------------------------------
 * Desde que el código se publica solo desde GitHub, nadie tiene que ejecutar nada a mano:
 * la primera vez que alguien entra a la aplicación con la versión nueva, asegurarVersion_()
 * crea las hojas y columnas que faltan y carga los datos nuevos. No borra ni pisa nada, y cada paso
 * queda marcado (Propiedades del script) para que nunca se repita.
 *
 * DATOS QUE CARGA (todos con fuente; los supuestos quedan marcados como tales):
 *  - Significado de C / M / N del plan de cuentas: hoja "Parametros" de GRUPO 6 Planillas de datos 4.
 *  - Cuentas 4.05.02.08 (Amortización de reproductores ovinos) y 4.05.02.09 (Reposición de madres ovinas):
 *    AGREGADAS POR EL GRUPO, no figuran en el Anexo I de la cátedra.
 *  - Dato del dueño (15/10/2026, informado por Exequiel Gallo): 47 ovejas, 37 corderos, 1 carnero; comienzo de parición 15/09/2026;
 *    maíz: 24 kg por día para la majada de 47 durante 40 días (500 g por cabeza por día, 20 kg por cabeza, 960 kg al año).
 *  - Precio del maíz: $286.000 por tonelada, Bolsa de Comercio de Rosario (Cámara Arbitral), 14/10/2026.
 *  - Precios de referencia de la hoja PRECIOS (GRUPO 6 Planillas de datos 4).
 *  - Diferencia de conteo (64 → 47 ovejas, 2 → 1 carnero): el grupo no sabe qué pasó; por pedido del grupo se registra
 *    como muerte con causa "No se sabe" y caravanas elegidas al azar. Queda aclarado en cada registro.
 */
/** Saca de un texto las referencias a material de clase (se pidió en la v3.8). */
function limpiarDiap_(t) {
  var D = 'd[a-z]{2}p[a-z]{7}s?'; // la palabra de las referencias a material de clase
  t = String(t === undefined || t === null ? '' : t);
  return t.replace(new RegExp('\\s*\\(semáforo de la ' + D + ' \\d+\\)', 'gi'), '').replace(new RegExp('Propuesta \\(' + D + ' \\d+\\):\\s*ajustable por el grupo', 'gi'), 'Propuesta del grupo (ajustable)')
    .replace(new RegExp(D + ' [\\d y]+ \\(meta de referencia (\\d+)\\s*%\\)', 'gi'), 'Meta de referencia del grupo: $1 %').replace(new RegExp(',\\s*' + D + ' [\\d y]+(:[^)]*)?\\)', 'gi'), ')')
    .replace(new RegExp('\\s*\\(' + D + ' [\\d y]+(:[^)]*)?\\)', 'gi'), '').replace(new RegExp('\\s*\\b' + D + ' \\d+( y \\d+)?', 'gi'), '').replace(/\s{2,}/g, ' ').trim();
}
var CARAVANAS_BAJA_V3 = [31, 32, 33, 43, 56, 58, 59, 61, 64, 67, 70, 72, 75, 83, 89, 93, 94]; // sorteadas (semilla 20261015)
var CARNERO_BAJA_V3 = 96;

/** v3.7: además de la versión, controla que existan todas las hojas (por si una actualización quedó a medias). */
function faltanHojas_() {
  var hay = {}; ss_().getSheets().forEach(function (sh) { hay[sh.getName()] = 1; });
  return Object.keys(SCHEMA).some(function (t) { return !hay[t]; });
}
function asegurarVersion_() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('VERSION_DATOS') === VERSION && !faltanHojas_()) return null;
  try {
    return conBloqueo_(function () {
      if (p.getProperty('VERSION_DATOS') === VERSION && !faltanHojas_()) return null;
      var antes = p.getProperty('VERSION_DATOS');
      invalidarTodo_();
      var log = migrarV3_();
      invalidarTodo_();
      p.setProperty('VERSION_DATOS', VERSION);
      if (antes === '3.7' || antes === '3.6' || antes === VERSION) return 'Sistema actualizado a la versión 3.8: se puede cargar sin señal (queda guardado en el teléfono y se envía solo), hay Presupuesto de la campaña, Resultados e Indicadores en listas desplegables y el sistema queda solo para ganadería: Bovinos está en Unidades del campo (en pausa hasta que el administrador lo active).';
      if (antes === '3.5') return 'Sistema actualizado a la versión 3.6: al tocar F5 la página espera en la misma sección (ya no pasa por el inicio) y el historial de cambios lo ve solo el administrador.';
      if (antes === '3.4') return 'Sistema actualizado a la versión 3.5: se quitó el rol Responsable de subunidad (quien lo tenía ahora es Operador de carga), cada registro muestra quién lo cargó y quién lo modificó, y hay un Historial de cambios en Administración.';
      if (antes === '3.3') return 'Sistema actualizado a la versión 3.4: ahora podés corregir datos con el lapicito (Cargar → Corregir un dato y en la ficha de cada animal).';
      if (antes === '3.2') return 'Sistema actualizado a la versión 3.3: nuevo Panel decisional (resumen, etapas, rendimiento, consumo, mejoras entre campañas y escenarios) y la ovejita del asistente con IA, abajo a la derecha.';
      if (antes === '3.1') return 'Sistema actualizado a la versión 3.2: más rápido, F5 sin perder la sesión en cualquier navegador, avisos al lado de cada botón y textos corregidos.';
      if (antes === '3.0') return 'Sistema actualizado a la versión ' + VERSION + ': pantalla renovada, la sesión ya no se cierra con F5 ni con la flecha de atrás, y el número de factura de venta sale solo. Se anularon las 2 ventas de prueba. El detalle quedó en Administración → Auditoría.';
      return 'Sistema actualizado a la versión ' + VERSION + ': menú lateral, indicadores, cotizaciones, impuestos, unidades del campo y los datos nuevos del dueño (rodeo de 47 ovejas, 1 carnero y 37 corderos; maíz). El detalle de cada cambio quedó en Administración → Auditoría.';
    });
  } catch (e) {
    // No frena el ingreso: lo que quedó hecho no se repite y lo que falta se reintenta la próxima vez que alguien entre.
    return 'ERROR en la actualización a la versión ' + VERSION + ': ' + e.message + ' (se va a reintentar en el próximo ingreso).';
  }
}

function migrarV3_() {
  var ss = ss_(), props = PropertiesService.getScriptProperties();
  var QUIEN = 'sistema (actualización v3)';
  var log = estructuraV3_(ss);
  var paso = function (nombre, fn) {
    var k = 'MIG3_' + nombre;
    if (props.getProperty(k)) return;
    var r = fn(); if (r) log.push(r);
    props.setProperty(k, new Date().toISOString());
  };
  var cuentaId = function (cod) { var c = leer_('D_Cuenta').filter(function (x) { return activo_(x) && x.Codigo === cod; })[0]; return c ? c.IdCuenta : ''; };
  var umId = function (ab) { var u = leer_('D_UM').filter(function (x) { return activo_(x) && x.Abreviatura === ab; })[0]; return u ? u.IdUM : ''; };
  var subId = function (nom) { var s = leer_('D_Subunidad').filter(function (x) { return activo_(x) && String(x.Nombre).toLowerCase() === nom.toLowerCase(); })[0]; return s ? s.IdSubunidad : ''; };
  var catId = function (nom) { var s = leer_('D_Categoria').filter(function (x) { return activo_(x) && String(x.Nombre).toLowerCase() === nom.toLowerCase(); })[0]; return s ? s.IdCategoria : ''; };
  var insumoId = function (nom) { var s = leer_('D_Insumo').filter(function (x) { return activo_(x) && x.Nombre === nom; })[0]; return s ? s.IdInsumo : ''; };
  var fpId = function (nom) { var s = leer_('D_FormaPago').filter(function (x) { return activo_(x) && x.Nombre === nom; })[0]; return s ? s.IdFormaPago : ''; };
  var actualizarFila = function (tabla, fila, cambios, accion) {
    var o = JSON.parse(JSON.stringify(fila)); Object.keys(cambios).forEach(function (k) { o[k] = cambios[k]; });
    o.ModificadoEl = new Date(); o.ModificadoPor = QUIEN;
    reescribir_(tabla, fila._fila, o);
    auditar_(QUIEN, accion, tabla, fila[SCHEMA[tabla].pk], sinOcultos_(tabla, fila), sinOcultos_(tabla, o));
  };
  var CRIA = subId('Cría'), CAM25 = 'CAM-000001', CAM26 = '';
  try { CAM25 = campanaDeFecha_('2025-12-20'); } catch (e) {}
  try { CAM26 = campanaDeFecha_('2026-10-15'); } catch (e) {}

  // 1. Plan de cuentas: significado de C/M/N y dos cuentas nuevas agregadas por el grupo
  paso('cuentas', function () {
    var sig = { C: 'Colectiva', M: 'Monetaria', N: 'No monetaria' }, n = 0;
    leer_('D_Cuenta').forEach(function (c) {
      if (!sig[c.Tipo] || c.SignificadoTipo === sig[c.Tipo]) return;
      actualizarFila('D_Cuenta', c, { SignificadoTipo: sig[c.Tipo] }, 'Significado del tipo (hoja Parametros, Planillas de datos 4)'); n++;
    });
    var nuevas = [['4.05.02.08', 'Amortización de reproductores ovinos'], ['4.05.02.09', 'Reposición de madres ovinas']], m = 0;
    nuevas.forEach(function (c) {
      if (cuentaId(c[0])) return;
      insertar_('D_Cuenta', { Codigo: c[0], Nombre: c[1], Tipo: 'N', SignificadoTipo: 'No monetaria',
        Observaciones: 'AGREGADA POR EL GRUPO 6 (oct-2026): no figura en el Anexo I de la cátedra. Se creó para imputar este costo indirecto.' }, QUIEN); m++;
    });
    return 'Plan de cuentas: ' + n + ' significados de tipo (C = Colectiva, M = Monetaria, N = No monetaria) y ' + m + ' cuentas nuevas';
  });

  // 2. Insumos nuevos: maíz, amortización de carneros, reposición de madres
  paso('insumos', function () {
    var L = [['Maíz en grano', 'Alimentación', 'kg', ''], ['Amortización de carneros', 'Amortización', 'cab', ''], ['Reposición de madres', 'Reposición de madres', 'cab', '']], n = 0;
    L.forEach(function (x) {
      if (insumoId(x[0])) return;
      var r = RUBROS[x[1]];
      insertar_('D_Insumo', { Nombre: x[0], Rubro: x[1], IdUM: umId(x[2]), ContenidoEnvase: x[3], IdCuenta: cuentaId(r.cuenta), TipoCosto: r.tipo, Variabilidad: r.variab }, QUIEN); n++;
    });
    var maiz = insumoId('Maíz en grano');
    if (maiz && !leer_('F_PrecioIns').some(function (p) { return activo_(p) && p.IdInsumo === maiz && p.Fecha === '2026-10-14'; })) {
      insertar_('F_PrecioIns', { IdInsumo: maiz, Fecha: '2026-10-14', Precio: 286, IdMoneda: 'MON-000001',
        Fuente: 'Bolsa de Comercio de Rosario, Cámara Arbitral (pizarra) 14/10/2026: $286.000 por tonelada = $286 por kg. Confirmado por el dueño (15/10/2026).' }, QUIEN);
    }
    return n + ' insumos nuevos (maíz, amortización, reposición) y precio del maíz';
  });

  // 3. Costos: el maíz real reemplaza al supuesto de alimentación; se cargan amortización y reposición (supuestos)
  paso('costos', function () {
    var cos = leer_('F_Costos'), ins = {}; leer_('D_Insumo').forEach(function (i) { ins[i.IdInsumo] = i; });
    var log2 = [];
    var supAlim = cos.filter(function (x) { return activo_(x) && x.IdCampana === CAM25 && x.EsSupuesto === 'Sí' && (ins[x.IdInsumo] || {}).Rubro === 'Alimentación' && Number(x.Importe) === 310500; })[0];
    if (supAlim) { cambiarActivo_('F_Costos', supAlim, false, QUIEN, 'Baja: reemplazado por el dato del dueño (maíz, 15/10/2026)'); log2.push('baja del supuesto de alimentación $310.500'); }
    var maiz = insumoId('Maíz en grano'), amort = insumoId('Amortización de carneros'), repo = insumoId('Reposición de madres');
    var nuevo = function (fecha, insumo, cant, precio, sup, fuente) {
      if (!insumo) return;
      var o = { Fecha: fecha, Comprobante: '', IdTercero: '', IdInsumo: insumo, IdSubunidad: CRIA, Cantidad: cant, PrecioUnit: precio, AlicuotaIVA: 0, EsSupuesto: sup ? 'Sí' : 'No', Fuente: fuente };
      calcular_('F_Costos', o); insertar_('F_Costos', o, QUIEN);
    };
    var FMAIZ = 'Dueño del campo (15/10/2026): 24 kg de maíz por día para la majada de 47 durante 40 días = 960 kg al año. Precio: BCR 14/10/2026, $286.000/t.';
    var SUPIND = 'SUPUESTO del grupo (cuadro de costos 2da entrega, "entrar a este"): ';
    if (CAM25) {
      nuevo('2025-12-20', maiz, 960, 286, true, 'ESTIMADO para 2025 con el consumo y el precio informados en oct-2026 (no hay dato de 2025). ' + FMAIZ);
      nuevo('2025-12-20', amort, 2, 400000, true, SUPIND + '2 carneros × ($2.000.000 ÷ 5 años). Valor del carnero: productor La Punilla 01/09/2026; vida útil supuesta.');
      nuevo('2025-12-20', repo, 64, 1745454.55 / 64, true, SUPIND + '64 madres × ($150.000 por borrega ÷ 5,5 años de vida útil). Valor y vida útil supuestos.');
    }
    if (CAM26) {
      nuevo('2026-10-15', maiz, 960, 286, false, FMAIZ);
      nuevo('2026-10-15', amort, 1, 400000, true, SUPIND + '1 carnero (dato del dueño 15/10/2026) × ($2.000.000 ÷ 5 años). Vida útil supuesta.');
      nuevo('2026-10-15', repo, 47, 150000 / 5.5, true, SUPIND + '47 madres (dato del dueño 15/10/2026) × ($150.000 por borrega ÷ 5,5 años). Valor y vida útil supuestos.');
      // Mano de obra y mantenimiento: se repiten los supuestos anuales de 2025 para que la campaña 2026 sea comparable
      cos.filter(function (x) { return activo_(x) && x.IdCampana === CAM25 && x.EsSupuesto === 'Sí' && ['Mano de obra', 'Mantenimiento'].indexOf((ins[x.IdInsumo] || {}).Rubro) >= 0; }).forEach(function (x) {
        nuevo('2026-10-15', x.IdInsumo, Number(x.Cantidad), Number(x.PrecioUnit), true, 'SUPUESTO anual repetido de la campaña 2025 (' + x.IdCosto + ').');
      });
    }
    return 'Costos: ' + log2.concat(['maíz real 2026 $274.560', 'amortización y reposición (supuestos) 2025 y 2026']).join(', ');
  });

  // 4. Dosis técnica y consumo real de maíz (desvío de consumo)
  paso('maiz', function () {
    var maiz = insumoId('Maíz en grano'); if (!maiz || !CAM26 || !CRIA) return 'Maíz: faltan datos para cargar dosis y consumo';
    if (!leer_('F_Dosis').some(function (d) { return activo_(d) && d.IdInsumo === maiz && d.IdCampana === CAM26 && d.IdSubunidad === CRIA; }))
      insertar_('F_Dosis', { IdInsumo: maiz, IdSubunidad: CRIA, IdCampana: CAM26, DosisPorBase: 20, BaseCalculo: 'Cabeza',
        Fuente: 'Dueño del campo (15/10/2026): 500 g de maíz por cabeza por día durante 40 días = 20 kg por cabeza', FechaFuente: '2026-10-15' }, QUIEN);
    insertar_('F_Consumo', { Fecha: '2026-10-15', IdCampana: CAM26, IdSubunidad: CRIA, IdInsumo: maiz, CantidadReal: 960, BaseReal: 47, IdOrigen: '',
      Fuente: 'Dueño del campo (15/10/2026): 24 kg por día durante 40 días para la majada de 47 = 960 kg' }, QUIEN);
    return 'Maíz: dosis técnica 20 kg por cabeza y consumo real 960 kg (esperado 940 kg)';
  });

  // 5. Presupuesto 2026 (los supuestos del grupo funcionan como presupuesto)
  paso('presupuesto', function () {
    if (!CAM26) return '';
    [['Alimentación', 310500, 'Supuesto del grupo (14/09, "entrar a este 1"): $4.500 por cabeza × 69 cabezas'],
     ['Sanidad', 138000, 'Supuesto del grupo (14/09, "entrar a este 1"): $2.000 por cabeza × 69 cabezas']].forEach(function (p) {
      insertar_('F_Presupuesto', { IdCampana: CAM26, Rubro: p[0], IdSubunidad: CRIA, Importe: p[1], Fuente: p[2] }, QUIEN);
    });
    return 'Presupuesto 2026: alimentación $310.500 y sanidad $138.000';
  });

  // 6. Precios de referencia (hoja PRECIOS de Planillas de datos 4; los valores de esa hoja están en miles)
  paso('precios', function () {
    var PRO = 'PRO-000001';
    leer_('F_PrecioProd').forEach(function (p) {
      if (p.IdProducto === PRO && Number(p.Precio) === 3000 && !p.TipoPrecio) actualizarFila('F_PrecioProd', p, { TipoPrecio: 'Venta propia', Observaciones: 'Precio final con IVA incluido (10,5%), como se liquidó en la Entrega 1.' }, 'Tipo de precio');
    });
    var add = function (prod, fecha, precio, iva, fuente, obs) {
      insertar_('F_PrecioProd', { IdProducto: prod, Fecha: fecha, Precio: precio, IdMoneda: 'MON-000001', PrecioIncluyeIVA: iva, Fuente: fuente, TipoPrecio: 'Referencia de mercado', Observaciones: obs || '' }, QUIEN);
    };
    add(PRO, '2026-08-15', 4240, 'Sí', 'INTA, calculado en % con un productor de la zona (Rodeo Viejo) · hoja PRECIOS, Planillas de datos 4', 'Precio comparativo vivo para faena, $ por kg vivo, IVA incluido (confirmado por el grupo).');
    var prods = [['Cordero para genética (kg vivo)', 'kg', '4.01.05'], ['Borrego joven (kg vivo)', 'kg', '4.01.02'], ['Oveja reproductora (cabeza)', 'cab', '4.01.05'],
      ['Carnero reproductor (cabeza)', 'cab', '4.01.05'], ['Cordero Dorper genética F3 (cabeza)', 'cab', '4.01.05']];
    var ids = {};
    prods.forEach(function (p) {
      var ya = leer_('D_Producto').filter(function (x) { return activo_(x) && x.Nombre === p[0]; })[0];
      ids[p[0]] = ya ? ya.IdProducto : insertar_('D_Producto', { Nombre: p[0], IdUM: umId(p[1]), IdCuenta: cuentaId(p[2]), AlicuotaIVA: 10.5 }, QUIEN);
    });
    var LP = 'Productor "La Punilla" · hoja PRECIOS, Planillas de datos 4';
    add(ids['Cordero para genética (kg vivo)'], '2026-09-01', 20000, 'Sin dato', LP, 'En la planilla figura "20" (valores en miles).');
    add(ids['Borrego joven (kg vivo)'], '2026-09-01', 15000, 'Sin dato', LP, 'Mínimo del rango "15-20 mil" según tamaño.');
    add(ids['Borrego joven (kg vivo)'], '2026-09-01', 20000, 'Sin dato', LP, 'Máximo del rango "15-20 mil" según tamaño.');
    add(ids['Oveja reproductora (cabeza)'], '2026-09-01', 1000000, 'Sin dato', LP, 'Hembra reproductora: entre $1.000.000 y $2.000.000.');
    add(ids['Carnero reproductor (cabeza)'], '2026-09-01', 2000000, 'Sin dato', LP, 'Macho reproductor: entre $2.000.000 y $4.000.000.');
    add(ids['Cordero Dorper genética F3 (cabeza)'], '2026-09-01', 80000, 'Sin dato', 'Agroads, aviso clasi=643994 · hoja PRECIOS, Planillas de datos 4', 'F1 $20.000 (15/03/2023) · F2 $60.000 (21/07/2025) · F3 $80.000 (01/09/2026).');
    return 'Precios de referencia: faena $4.240/kg (con IVA) y 6 precios de genética y reproductores';
  });

  // 7. Cobro real de la venta de 2025 (Planilla financiera), para el indicador de plazo de cobranza
  paso('cobro2025', function () {
    var g = ventasPorComprobante_()['FAV 0003-000005858|TER-000001'];
    if (!g || cobradoVenta_('FAV 0003-000005858', 'TER-000001') > 0) return '';
    var mv = { Fecha: '2025-12-20', Tipo: 'Cobro', IdTipoComprobante: 'REC', Numero: '', IdTercero: 'TER-000001', IdFormaPago: fpId('Efectivo'),
      Importe: Math.round(g.Total * 100) / 100, IdCompra: '', ComprobanteVenta: 'FAV 0003-000005858', Observaciones: 'Cobro real en efectivo el 20/12/2025 según la Planilla financiera (GRUPO 6 Planillas de datos 4).' };
    calcular_('F_Tesoreria', mv); insertar_('F_Tesoreria', mv, QUIEN);
    return 'Recibo del cobro de la FAV 0003-000005858 ($' + fmtNum_(mv.Importe, 2) + ', 20/12/2025)';
  });

  // 8. Rodeo según el dueño (15/10/2026): 47 ovejas, 1 carnero, 37 corderos
  paso('rodeo', function () {
    var cats = {}; leer_('D_Categoria').forEach(function (c) { cats[c.IdCategoria] = String(c.Nombre).toLowerCase(); });
    var an = leer_('D_Animal').filter(activo_);
    var act = function (nom) { return an.filter(function (a) { return a.Estado === 'Activo' && cats[a.IdCategoria] === nom; }); };
    var OBS_BAJA = 'Baja por diferencia de conteo: el dueño informó 47 ovejas y 1 carnero el 15/10/2026 (el sistema tenía 64 y 2). No se sabe qué pasó: por pedido del grupo se registra como muerte, con caravana elegida al azar. SUPUESTO.';
    var muerte = function (a) {
      var o = { Fecha: '2026-10-15', Caravana: Number(a.Caravana), Causa: 'No se sabe', Observaciones: OBS_BAJA, IdSubunidad: CRIA };
      calcular_('F_Mortandad', o); insertar_('F_Mortandad', o, QUIEN);
      cambiarEstadoAnimal_(a.Caravana, 'Muerto', '2026-10-15', QUIEN, 'Baja por diferencia de conteo (dueño 15/10/2026)');
    };
    // Ovejas: bajar hasta 47 (primero las sorteadas, si alguna ya no está se sigue con las de número más alto)
    var ov = act('oveja'), sobran = ov.length - 47, bajasO = [];
    if (sobran > 0) {
      var orden = CARAVANAS_BAJA_V3.concat(ov.map(function (a) { return Number(a.Caravana); }).sort(function (a, b) { return b - a; }));
      orden.forEach(function (car) {
        if (bajasO.length >= sobran || bajasO.indexOf(car) >= 0) return;
        var a = ov.filter(function (x) { return Number(x.Caravana) === car; })[0]; if (!a) return;
        muerte(a); bajasO.push(car);
      });
    }
    // Carneros: bajar hasta 1
    var ca = act('carnero'), bajasC = [];
    if (ca.length > 1) {
      var ordenC = [CARNERO_BAJA_V3].concat(ca.map(function (a) { return Number(a.Caravana); }));
      ordenC.forEach(function (car) { if (act('carnero').length - bajasC.length <= 1 || bajasC.indexOf(car) >= 0) return; var a = ca.filter(function (x) { return Number(x.Caravana) === car; })[0]; if (a) { muerte(a); bajasC.push(car); } });
    }
    // Corderos 97-98-99: fecha de nacimiento = comienzo de la parición (pedido del grupo)
    var cambiadas = [];
    leer_('D_Animal').filter(function (a) { return activo_(a) && a.Estado === 'Activo' && [97, 98, 99].indexOf(Number(a.Caravana)) >= 0 && a.FechaNac !== '2026-09-15'; }).forEach(function (a) {
      actualizarFila('D_Animal', a, { FechaNac: '2026-09-15', Observaciones: 'Fecha de nacimiento estimada: comienzo de la parición (dueño, 15/10/2026). Antes figuraba 24/08/2026.' }, 'Fecha de nacimiento (dato del dueño)');
      cambiadas.push(a.Caravana);
    });
    // Corderos nuevos con caravanas consecutivas hasta llegar a 37
    an = leer_('D_Animal').filter(activo_);
    var corderos = act('cordero').length, faltan = 37 - corderos, nuevos = [];
    var max = leer_('D_Animal').reduce(function (m, a) { return Math.max(m, Number(a.Caravana) || 0); }, 0);
    var pesos = [4, 5, 6];
    for (var i = 0; i < faltan; i++) {
      var car = max + 1 + i;
      insertar_('D_Animal', { Caravana: car, IdCategoria: catId('Cordero'), FechaNac: '2026-09-15', PesoKg: pesos[i % 3], Sexo: '', Madre: '', Padre: '', EstadoRepro: 'No aplica', Estado: 'Activo', FechaBaja: '',
        Observaciones: 'Alta por conteo del dueño (15/10/2026: 37 corderos). Fecha de nacimiento y peso al nacer ESTIMADOS (parición desde el 15/09/2026). Sin vacunar.' }, QUIEN);
      nuevos.push(car);
    }
    return 'Rodeo: ' + bajasO.length + ' ovejas y ' + bajasC.length + ' carnero dados de baja por diferencia de conteo (' + bajasO.concat(bajasC).join(', ') + '), ' +
      cambiadas.length + ' corderos con fecha 15/09/2026 y ' + nuevos.length + ' corderos nuevos' + (nuevos.length ? ' (caravanas ' + nuevos[0] + ' a ' + nuevos[nuevos.length - 1] + ')' : '');
  });

  // 8b. Sexo de los adultos según su categoría (oveja = hembra, carnero = macho); los corderos quedan sin dato
  paso('sexo', function () {
    var cats = {}; leer_('D_Categoria').forEach(function (c) { cats[c.IdCategoria] = String(c.Nombre).toLowerCase(); });
    var sx = { oveja: 'Hembra', borrega: 'Hembra', carnero: 'Macho', borrego: 'Macho' }, n = 0;
    leer_('D_Animal').forEach(function (a) { var s = sx[cats[a.IdCategoria]]; if (activo_(a) && s && !a.Sexo) { actualizarFila('D_Animal', a, { Sexo: s }, 'Sexo según la categoría'); n++; } });
    return n + ' animales con el sexo completado según su categoría';
  });

  // 9. Indicadores del CMI (metas del CMI del grupo; las "propuestas" se pueden cambiar desde Administración)
  paso('indicadores', function () {
    var ya = {}; leer_('P_Indicador').forEach(function (x) { ya[x.IdIndicador] = 1; });
    var n = 0;
    INDICADORES_BASE_.forEach(function (d, i) { if (ya[d[0]]) return;
      insertar_('P_Indicador', { IdIndicador: d[0], Perspectiva: d[1], Objetivo: d[2], Nombre: d[3], Formula: d[4], Interpretacion: d[5], Unidad: d[6], Sentido: d[7],
        MetaVerde: d[8], MetaAmarillo: d[9], FuenteMeta: d[10], Periodicidad: d[11], Responsable: d[12], Decision: d[13], ValorManual: '', Orden: i + 1 }, QUIEN); n++; });
    return n + ' indicadores del CMI';
  });

  // 10. Cotizaciones: links de la planilla del grupo y precios de la BCR del 14/10/2026
  paso('cotizaciones', function () {
    [['Bolsa de Comercio de Rosario – granos', URL_BCR, 'Soja, maíz, trigo, girasol, sorgo ($/t)', 'Precio pizarra de la Cámara Arbitral. Se lee solo todos los días.'],
     ['Mercado Agroganadero de Cañuelas', 'http://www.mercadoagroganadero.com.ar', 'Hacienda bovina (INMAG, $/kg vivo)', 'Referencia de precios bovinos. Lectura automática experimental.'],
     ['Portal Ovino', 'https://portalovino.com.ar/', 'Ovinos', 'Fuente de la hoja "Precios estimados de venta" del grupo.'],
     ['MAGyP – Ovinos', 'https://www.magyp.gob.ar/sitio/areas/d_ovinos/', 'Ovinos', 'Fuente de la hoja "Precios estimados de venta" del grupo.'],
     ['Agroads', 'https://www.agroads.com.ar/', 'Hacienda y genética', 'Fuente de la hoja "Precios estimados de venta" del grupo.'],
     ['Agrofy', 'https://www.agrofy.com.ar/', 'Hacienda e insumos', 'Fuente de la hoja "Precios estimados de venta" del grupo.']].forEach(function (l) {
      if (leer_('D_LinkCotizacion').some(function (x) { return x.URL === l[1]; })) return;
      insertar_('D_LinkCotizacion', { Nombre: l[0], URL: l[1], Producto: l[2], Descripcion: l[3] }, QUIEN);
    });
    [['Maíz', 286000], ['Soja', 557000], ['Trigo', 346000]].forEach(function (g) {
      guardarCotizacion_({ Fecha: '2026-10-14', Producto: g[0], Mercado: 'Bolsa de Comercio de Rosario (Cámara Arbitral, pizarra)', Precio: g[1], Unidad: '$/t', Origen: 'Manual', Link: URL_BCR,
        Observaciones: 'Leído de la página de la BCR el 15/10/2026 (último día publicado: 14/10/2026).' }, QUIEN);
    });
    return 'Cotizaciones: 6 links y precios de la BCR del 14/10/2026';
  });

  // 11. Unidades de negocio, configuración e impuestos
  paso('unidades', function () {
    var url = ''; try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
    var desc = { N1: 'Rodeo Dorper (este sistema, Grupo 6)', N2: 'Bovinos: cría y engorde', N3: 'Porcinos', N4: 'Maíz para comercialización y consumo interno', N5: 'Soja para comercialización' };
    leer_('D_UnidadNeg').forEach(function (u) {
      var c = {}; if (!u.Descripcion && desc[u.IdUnidad]) c.Descripcion = desc[u.IdUnidad]; if (u.IdUnidad === 'N1' && !u.LinkApp && url) c.LinkApp = url;
      if (Object.keys(c).length) actualizarFila('D_UnidadNeg', u, c, 'Descripción y link');
    });
    if (!leer_('S_Config').some(function (x) { return x.Clave === 'CUIT_ESTABLECIMIENTO'; }))
      insertar_('S_Config', { Clave: 'CUIT_ESTABLECIMIENTO', Valor: '', Descripcion: 'CUIT del establecimiento (UNRC). Con la última cifra se calculan los vencimientos de impuestos "según terminación de CUIT".' }, QUIEN);
    if (!leer_('D_Impuesto').length)
      insertar_('D_Impuesto', { Nombre: 'IVA – declaración jurada mensual', Organismo: 'ARCA (nacional)', Periodicidad: 'Mensual', TipoVencimiento: 'Según terminación de CUIT',
        DiaFijo: '', MesesFijos: '', AvisarDiasAntes: 7, LinkConsulta: 'https://seti.afip.gob.ar/av/seleccionVencimientos.do',
        Descripcion: 'La venta de corderos se factura con IVA (10,5%), así que corresponde la DDJJ mensual. CONFIRMAR con el contador del campo. Las fechas se cargan en "Calendario de vencimientos de impuestos".' }, QUIEN);
    return 'Unidades con descripción, configuración (CUIT pendiente) e impuesto IVA';
  });

  paso('granos', function () { try { return actualizarGranos_(); } catch (e) { return 'BCR: ' + e.message; } });

  auditar_(QUIEN, 'Actualización a v' + VERSION, '(estructura y datos)', '', null, { pasos: log });
  // ---------- v3.1 ----------
  // 3.1.a Numeración automática de facturas de venta (pedido de la cátedra, 21/10/2026). Sigue desde la última real: FAV 0003-000005858.
  paso('factura31', function () {
    var cfg = leer_('S_Config'), n = 0;
    [['FACTURA_PREFIJO', 'FAV', 'Prefijo de las facturas de venta (FAV = factura de venta). Lo usa la numeración automática.'],
     ['FACTURA_PUNTO_VENTA', '0003', 'Punto de venta de las facturas de venta (4 cifras). Sale de la factura real FAV 0003-000005858.'],
     ['FACTURA_PROXIMO_NUMERO', '', 'Vacío = sigue sola desde la última factura cargada. Escribir un número solo si hay que saltar a otro (ej. 5900).']
    ].forEach(function (c) { if (!cfg.some(function (x) { return x.Clave === c[0]; })) { insertar_('S_Config', { Clave: c[0], Valor: c[1], Descripcion: c[2] }, QUIEN); n++; } });
    return 'Numeración automática de facturas de venta: ' + n + ' parámetros nuevos en Configuración';
  });
  // 3.1.b Ventas cargadas como prueba por el grupo (confirmado el 21/10/2026): se anulan y los animales vuelven al rodeo.
  paso('pruebas31', function () {
    var PRUEBAS = ['0003-00000012', 'Fav 003 8888'], n = 0, m = 0;
    leer_('F_Ingresos').filter(function (x) { return activo_(x) && PRUEBAS.indexOf(String(x.Comprobante).trim()) >= 0; }).forEach(function (x) {
      var an = buscar_('D_Animal', x.Caravana);
      if (an && an.Estado === 'Vendido') { cambiarEstadoAnimal_(x.Caravana, 'Activo', '', QUIEN, 'Anulación de venta de prueba ' + x.IdIngreso); m++; }
      cambiarActivo_('F_Ingresos', x, false, QUIEN, 'Baja: venta de prueba (confirmado por el grupo 21/10/2026)'); n++;
    });
    leer_('F_Tesoreria').filter(function (x) { return activo_(x) && PRUEBAS.indexOf(String(x.ComprobanteVenta).trim()) >= 0; }).forEach(function (x) {
      cambiarActivo_('F_Tesoreria', x, false, QUIEN, 'Baja: cobro de una venta de prueba');
    });
    return 'Ventas de prueba anuladas: ' + n + ' renglones; ' + m + ' animales volvieron al rodeo';
  });

  // ---------- v3.5 ----------
  // Se quita el rol "Responsable de subunidad" (pedido del grupo, 23/10/2026): quien lo tenía pasa a Operador de carga.
  paso('roles35', function () {
    var n = 0;
    leer_('S_Usuarios').forEach(function (x) {
      if (x.Rol !== 'Responsable de subunidad') return;
      actualizarFila('S_Usuarios', x, { Rol: 'Operador de carga', IdSubunidad: '' }, 'Rol cambiado: se eliminó "Responsable de subunidad" (v3.5)'); n++;
    });
    return 'Roles: ' + n + ' usuario(s) pasaron de Responsable de subunidad a Operador de carga';
  });


  // ---------- v3.7 ----------
  // La unidad Maíz se integra al sistema con las tablas y los datos de la planilla del grupo de Maíz (taller_2_maiz.xlsx).
  paso('maiz37', function () { return importarMaiz_('sistema (actualización v3.7)'); });
  paso('bovino37', function () { return importarBovino_('sistema (actualización v3.7)'); });
  paso('indicadores37', function () { return cargarIndicadoresUnidad_('sistema (actualización v3.7)'); });

  // ---------- v3.8 ----------
  // Indicadores de Ovinos: quedan los 7 que le importan al productor (pedido del grupo, 28/10/2026). Los otros 7 NO se borran:
  // se dan de baja y el administrador los puede reactivar en Administración → Indicadores (ver dados de baja).
  paso('indicadores38', function () {
    var OCULTAR = ['DESVIO_PRESUP', 'COBRANZA', 'SUPERVIVENCIA', 'PRENEZ', 'DESVIO_ALIM', 'COSTOS_REALES', 'FICHAS'], n = 0, t = 0;
    leer_('P_Indicador').forEach(function (x) {
      if (OCULTAR.indexOf(x.IdIndicador) >= 0 && activo_(x)) { cambiarActivo_('P_Indicador', x, false, QUIEN, 'Baja: indicador oculto por pedido del grupo (v3.8)'); n++; }
    });
    leer_('P_Indicador').forEach(function (x) {
      var c = {}; ['Objetivo', 'Formula', 'Interpretacion', 'FuenteMeta', 'Decision'].forEach(function (k) { var v = limpiarDiap_(x[k]); if (v !== String(x[k] === undefined ? '' : x[k])) c[k] = v; });
      if (Object.keys(c).length) { actualizarFila('P_Indicador', x, c, 'Textos de indicadores'); t++; }
    });
    return 'Indicadores: ' + n + ' ocultos (se pueden reactivar) y ' + t + ' textos actualizados';
  });
  // Solo ganadería (pedido de la cátedra): Maíz sale del sistema (sus datos quedan en la planilla, sin tocar) y vuelve a ser
  // una unidad con link; Bovinos queda en pausa hasta que el administrador lo active en Unidades del campo.
  paso('unidades38', function () {
    var n = [];
    leer_('D_UnidadNeg').forEach(function (u) {
      if (/^bovin/i.test(u.Nombre) && !u.Estado) { actualizarFila('D_UnidadNeg', u, { Estado: 'En pausa', Descripcion: 'Recría y engorde a corral' }, 'Bovinos en pausa (v3.8)'); n.push('Bovinos en pausa'); }
      if (/^ma[ií]z$/i.test(String(u.Nombre).trim())) { actualizarFila('D_UnidadNeg', u, { Descripcion: 'Maíz para comercialización y consumo interno', Estado: '' }, 'Maíz fuera de este sistema (v3.8)'); n.push('Maíz fuera del sistema'); }
    });
    return 'Unidades: ' + n.join(', ');
  });
  paso('presupuesto38', function () {
    var n = 0;
    leer_('F_Presupuesto').forEach(function (x) {
      if (x.Tipo && x.Clasificacion) return;
      var t = x.Tipo || (RUBROS[x.Rubro] ? 'Gasto' : 'Ingreso');
      actualizarFila('F_Presupuesto', x, { Tipo: t, Clasificacion: clasifPresu_(t, x.Rubro) }, 'Presupuesto: ingreso o gasto y clasificación'); n++;
    });
    return 'Presupuesto: ' + n + ' renglones clasificados';
  });

  return log;
}

/** Crea las hojas nuevas y agrega al final las columnas nuevas (no mueve ni borra nada). */
function estructuraV3_(ss) {
  var colores = { 'Maestras': '#dbe8f6', 'Parámetros': '#fff2cc', 'Hechos': '#d9ead3', 'Control': '#e6e6e6' };
  var log = [];
  Object.keys(SCHEMA).forEach(function (t) {
    var h = headersDe(t), sh = ss.getSheetByName(t);
    if (!sh) {
      sh = ss.insertSheet(t);
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground(colores[SCHEMA[t].grupo]);
      sh.setFrozenRows(1);
      log.push('hoja nueva ' + t);
      return;
    }
    var n = sh.getLastColumn(), act = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
    var faltan = h.filter(function (c) { return act.indexOf(c) < 0; });
    if (faltan.length) { sh.getRange(1, act.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold').setBackground(colores[SCHEMA[t].grupo]); log.push(t + ': ' + faltan.join(', ')); }
  });
  HEAD_ = {}; CACHE_ = {};
  return log.length ? ['Estructura: ' + log.join('; ')] : [];
}

// [código, perspectiva, objetivo, indicador, fórmula, cómo se interpreta, unidad, sentido, meta verde, alerta amarillo, fuente de la meta, periodicidad, responsable, qué hacer si empeora]
var INDICADORES_BASE_ = [
  ['COBERTURA', 'Financiera', 'Reducir la pérdida de la unidad y acercarla al punto de equilibrio', 'Cobertura del costo total',
    'Ingresos sin IVA ÷ costo total (directos + indirectos) × 100',
    'Qué parte del costo total pagan las ventas. 100% = punto de equilibrio: ni gana ni pierde. Debajo de 100% la unidad pierde plata.',
    '%', 'Mayor es mejor', 85, 80, 'CMI del Grupo 6', 'Anual (cierre de campaña) con revisión trimestral de costos', 'Administración del campo (UNRC)',
    'Ver qué rubro explica el desvío en "Resultados → ¿En qué se gastó?". Los indirectos (reposición de madres y amortización de carneros) son la mayor parte del costo: revisar esos supuestos antes de recortar sanidad, que afecta la señalada.'],
  ['MB_MADRE', 'Financiera', 'Que cada madre deje margen sobre sus costos directos', 'Margen bruto por madre',
    '(Ingresos sin IVA − costos directos) ÷ ovejas en servicio',
    'Cuánto deja cada oveja después de pagar sus costos directos (alimento, sanidad, faena). Sirve para comparar campañas aunque cambie el tamaño del rodeo. No incluye los costos indirectos.',
    '$ por madre', 'Mayor es mejor', '', '', 'A definir por el grupo (cargar la meta en Administración)', 'Por campaña', 'Encargado de la unidad ovina',
    'Si baja: revisar qué costo directo subió (alimento, sanidad) y si bajaron los corderos o los kilos por madre.'],
  ['DESVIO_PRESUP', 'Financiera', 'Gastar lo presupuestado en cada rubro', 'Desvío presupuestario',
    '(Costo real − costo presupuestado) ÷ costo presupuestado × 100 (solo rubros con gasto real)',
    'Positivo: se gastó MÁS de lo previsto. Negativo: se gastó menos. Avisa durante la campaña, antes de ver el resultado final (indicador adelantado).',
    '%', 'Menor es mejor', 0, 5, 'Propuesta del grupo (ajustable)', 'Mensual', 'Administración del campo',
    'Ver qué rubro explica el desvío (alimento, sanidad, insumos, combustible) y si fue por precio o por cantidad.'],
  ['PRECIO_REL', 'Clientes', 'Vender el cordero en un canal que pague un precio cercano al de referencia', 'Precio relativo frente a la referencia',
    'Precio obtenido por kg ÷ precio de referencia por kg × 100 (los dos con IVA)',
    'Si da 100% vendimos al precio del mercado; menos de 100% vendimos más barato. Hay que comparar productos y fechas equivalentes: con inflación, una referencia muy posterior a la venta agranda la brecha.',
    '%', 'Mayor es mejor', 85, 80, 'CMI del Grupo 6', 'En cada venta', 'Encargado de comercialización',
    'Juntar un lote más grande para justificar el flete a una planta habilitada, o sumar compradores para no depender solo de La Campana.'],
  ['COBRANZA', 'Clientes', 'Cobrar las ventas a tiempo', 'Plazo promedio de cobranza',
    'Días entre la venta y el cobro, ponderados por importe (las ventas sin cobrar cuentan hasta hoy)',
    'Cuántos días tarda en entrar la plata de una venta. Cuanto menos, mejor: la plata cobrada antes pierde menos valor con la inflación.',
    'días', 'Menor es mejor', 30, 45, 'Propuesta: ajustable por el grupo', 'Mensual', 'Administración del campo',
    'Si sube: llamar a los clientes con saldo, pedir seña o cobro contra entrega, y evaluar si conviene seguir vendiéndole al que paga tarde.'],
  ['CORDEROS_MADRE', 'Procesos internos', 'Aumentar los corderos logrados por cada madre', '% de corderos logrados por madre (señalada)',
    'Corderos logrados en la campaña (nacidos − muertos) ÷ ovejas en servicio × 100',
    'Cuántos corderos produce cada 100 ovejas. Es la palanca principal del resultado: más corderos por madre = más kilos para vender con el mismo rodeo.',
    '%', 'Mayor es mejor', 85, 80, 'CMI del Grupo 6', 'Por campaña (control en parición y destete)', 'Encargado de la unidad ovina',
    'Analizar las causas de muerte y reforzar el plan sanitario preparto (vacuna clostridial, antiparasitario) y la vigilancia en la parición.'],
  ['SUPERVIVENCIA', 'Procesos internos', 'Que sobrevivan los corderos que nacen', 'Supervivencia de corderos',
    'Corderos vivos o vendidos ÷ corderos nacidos en la campaña × 100',
    'De cada 100 corderos que nacen, cuántos llegan al destete o a la venta.',
    '%', 'Mayor es mejor', 85, 80, 'Meta de referencia del grupo: 85 %', 'Por campaña', 'Encargado de la unidad ovina',
    'Revisar las causas en las muertes registradas y reforzar el control en la parición (abrigo, calostro, predadores).'],
  ['KG_MADRE', 'Procesos internos', 'Producir más kilos por madre', 'Kg de cordero vendidos por madre',
    'Kg vendidos en la campaña ÷ ovejas en servicio',
    'Junta en un número la cantidad de corderos y su peso de venta. Si es bajo, o nacen pocos corderos o se venden livianos.',
    'kg por madre', 'Mayor es mejor', 16, 15, 'CMI del Grupo 6', 'Por campaña', 'Encargado de la unidad ovina',
    'Revisar el peso al destete y el momento de venta.'],
  ['PRENEZ', 'Procesos internos', 'Lograr que las ovejas queden preñadas', '% de preñez',
    'Ovejas preñadas ÷ ovejas en el rodeo × 100',
    'Anticipa los corderos de la próxima parición (indicador adelantado). Depende de que el estado reproductivo de cada oveja esté actualizado.',
    '%', 'Mayor es mejor', 90, 85, 'CMI del Grupo 6', 'Por servicio', 'Encargado de la unidad ovina',
    'Revisar la condición corporal de las ovejas y la fertilidad de los carneros.'],
  ['MORTALIDAD', 'Procesos internos', 'Reducir las muertes del rodeo', 'Mortalidad del rodeo',
    'Muertes en la campaña ÷ animales que estuvieron en el rodeo en la campaña × 100',
    'Qué parte del rodeo se perdió. Una mortalidad alta pega en todos los demás indicadores: menos madres, menos corderos, menos kilos.',
    '%', 'Menor es mejor', 3, 5, 'Propuesta: ajustable por el grupo', 'Mensual', 'Encargado de la unidad ovina',
    'Investigar las causas (enfermedad, predador, clima) y revisar el plan sanitario. Si es diferencia de conteo, hacer un recuento con caravanas.'],
  ['DESVIO_ALIM', 'Procesos internos', 'Dar de comer lo planificado', 'Desvío de consumo de alimento',
    '(Consumo real − dosis técnica × cabezas) ÷ consumo esperado × 100',
    'Positivo: se dio más alimento del previsto. Negativo: menos. Cerca de cero es lo ideal (desvío de consumo pedido por la cátedra).',
    '%', 'Cerca de cero es mejor', 5, 10, 'Propuesta: ajustable por el grupo', 'Por período de suplementación', 'Capataz',
    'Si se come más de lo esperado: revisar desperdicio en comederos y si la dosis técnica sigue siendo la correcta. Si se come menos: revisar el estado corporal.'],
  ['SANIDAD_REG', 'Aprendizaje y desarrollo', 'Registrar la sanidad animal por animal, con fecha, producto y dosis', '% de animales con sanidad registrada',
    'Animales del rodeo con algún tratamiento registrado en el último año ÷ animales del rodeo × 100',
    'Mide si el plan sanitario se está registrando. Sin registro no se puede controlar la carencia ni saber qué funcionó.',
    '%', 'Mayor es mejor', 95, 85, 'CMI del Grupo 6 (en registros se exige casi el 100%)', 'Mensual', 'Capataz (carga) y encargado de la unidad ovina (revisión)',
    'Cargar cada vacunación en "Vacuné o traté animales" y capacitar al capataz en la carga. Prioridad: vacunar y registrar los corderos nuevos.'],
  ['COSTOS_REALES', 'Aprendizaje y desarrollo', 'Trabajar con datos reales, no supuestos', '% de costos cargados con dato real',
    'Renglones de costo reales ÷ renglones de costo cargados × 100',
    'Cuánto del resultado se apoya en datos reales. Con muchos supuestos, los demás indicadores son orientativos.',
    '%', 'Mayor es mejor', 90, 70, 'CMI del Grupo 6', 'Mensual', 'Administración del campo',
    'Cargar las facturas reales de insumos en "Cargué una compra" y dar de baja los supuestos que reemplazan.'],
  ['FICHAS', 'Aprendizaje y desarrollo', 'Tener la ficha de cada animal completa', '% de fichas completas',
    'Animales con sexo, peso y fecha real cargados ÷ animales del rodeo × 100',
    'Calidad de los datos del rodeo. Sin sexo ni peso no se pueden medir la ganancia de peso ni la reposición.',
    '%', 'Mayor es mejor', 95, 85, 'Propuesta: ajustable por el grupo', 'Mensual', 'Capataz',
    'Completar sexo y peso de cada animal en su ficha, sobre todo de los corderos nuevos.']
];
