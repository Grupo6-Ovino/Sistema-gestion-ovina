/**
 * PANEL DECISIONAL (v3.3) — clase "Business Intelligence y Business Analytics: paneles decisionales con IA".
 * ---------------------------------------------------------------------------------------------
 * 01 Resumen (KPI y semáforos) · 02 Etapas y unidades · 03 Rendimiento (estándar, real, desvío)
 * 04 Consumo (estimado, real, desvío) · 05 Escenarios y sensibilidad · 06 Asistente IA (Gemini)
 *
 * - Los escenarios se calculan en la pantalla a partir de una BASE que arma el servidor con datos reales y
 *   estándares; nunca modifican los datos reales ni los estándares.
 * - Historia: todos los días (con el activador del dólar, 19 h) se guarda una foto de los indicadores en
 *   F_HistoriaInd: es la copia analítica por lotes (una foto diaria de los indicadores).
 * - Asistente: la clave de Gemini vive en Propiedades del script (GEMINI_API_KEY), nunca en la página.
 *   A la IA se le mandan solo números del campo (sin emails ni nombres de personas).
 */

/* ---------- Historia (copia analítica diaria) ---------- */
function fotoIndicadores_() {
  var hoy = hoyStr_();
  try { if (leer_('F_HistoriaInd').some(function (x) { return x.Fecha === hoy; })) return 'Historia de indicadores: la foto de hoy ya estaba.'; }
  catch (e) { return 'Historia de indicadores: falta la hoja (se crea al entrar a la app).'; }
  var r = indicadoresDe_(''), n = 0;
  r.indicadores.forEach(function (i) {
    insertar_('F_HistoriaInd', { Fecha: hoy, IdCampana: r.campana.id, IdIndicador: i.id, Valor: i.valor === null ? '' : i.valor, Estado: i.estado }, 'sistema');
    n++;
  });
  return 'Historia de indicadores: foto del ' + hoy + ' (' + n + ' indicadores).';
}

/* ---------- Base para escenarios ---------- */
function baseEscenario_(c) {
  var fuentes = {}, b = {};
  var ventas = function (L) { var kg = sumar_(L, 'Kg'), neto = sumar_(L, 'ImporteNeto'), n = L.length; return { kg: kg, neto: neto, n: n }; };
  // Si la campaña elegida todavía no tiene ventas, se toma la última campaña que sí tuvo.
  var vC = ventas(c.ing), campVentas = c.camp.Nombre || c.id, prodRef = c.ing.length ? c.ing[0].IdProducto : '';
  if (!vC.n) {
    var ant = c.campanas.filter(function (x) { return x.FechaHasta < c.camp.FechaDesde; }).reverse();
    for (var i = 0; i < ant.length; i++) {
      var L = leer_('F_Ingresos').filter(function (x) { return activo_(x) && x.IdCampana === ant[i].IdCampana; });
      if (L.length) { vC = ventas(L); campVentas = ant[i].Nombre || ant[i].IdCampana; prodRef = L[0].IdProducto; break; }
    }
  }
  b.madres = c.ovejasBase; fuentes.madres = 'Real: ' + c.ovejasBaseTxt;
  var cpm = CALC_IND.CORDEROS_MADRE(c).valor;
  b.corderosPorMadre = cpm ? r2_(cpm / 100) : (vC.n && c.ovejasBase ? r2_(vC.n / c.ovejasBase) : 1);
  fuentes.corderosPorMadre = cpm ? 'Real: corderos señalados ÷ madres de la campaña' : 'Estimado con las ventas de ' + campVentas;
  var sup = CALC_IND.SUPERVIVENCIA(c).valor;
  b.supervivencia = sup !== null && sup !== undefined ? r2_(sup) : 100; fuentes.supervivencia = sup !== null && sup !== undefined ? 'Real: supervivencia de corderos de la campaña' : 'Supuesto: sin muertes registradas';
  b.kgPorCordero = vC.n ? r2_(vC.kg / vC.n) : 30; fuentes.kgPorCordero = vC.n ? 'Real: promedio de las ventas de ' + campVentas : 'Supuesto (sin ventas cargadas)';
  b.precioKg = vC.kg ? r2_(vC.neto / vC.kg) : 0; fuentes.precioKg = vC.kg ? 'Real: precio neto sin IVA de las ventas de ' + campVentas : 'Falta: cargá un precio';
  var ref = (c.precios || []).filter(function (p) { return p.TipoPrecio === 'Referencia de mercado' && p.IdProducto === (prodRef || 'PRO-000001'); }).sort(function (a, b) { return a.Fecha < b.Fecha ? 1 : -1; })[0];
  if (ref) { b.precioRef = r2_(Number(ref.Precio) / (ref.PrecioIncluyeIVA === 'Sí' ? 1.105 : 1)); fuentes.precioRef = 'Referencia de mercado ' + ref.Fecha + ' (sin IVA)'; }
  // Maíz: dosis técnica de la campaña (kg por cabeza) y días de suplementación del dato del dueño
  var maiz = Object.keys(c.insumos).map(function (k) { return c.insumos[k]; }).filter(function (x) { return /ma[ií]z/i.test(x.Nombre); })[0];
  var dosis = maiz ? c.dos.filter(function (d) { return d.IdInsumo === maiz.IdInsumo; })[0] : null;
  b.dias = Number(config_('SUPLEMENTACION_DIAS')) || 40; fuentes.dias = config_('SUPLEMENTACION_DIAS') ? 'Configuración' : 'Dato del dueño (15/10/2026): 40 días';
  b.maizKgDia = dosis ? r2_(Number(dosis.DosisPorBase) / b.dias * 1000) / 1000 : 0.5; fuentes.maizKgDia = dosis ? 'Estándar: dosis técnica ' + dosis.DosisPorBase + ' kg por cabeza ÷ ' + b.dias + ' días' : 'Dato del dueño: 0,5 kg por cabeza por día';
  var pIns = maiz ? leer_('F_PrecioIns').filter(function (x) { return activo_(x) && x.IdInsumo === maiz.IdInsumo; }).sort(function (a, b) { return a.Fecha < b.Fecha ? 1 : -1; })[0] : null;
  b.precioMaiz = pIns ? Number(pIns.Precio) : 286; fuentes.precioMaiz = pIns ? 'Real: ' + pIns.Fuente + ' (' + pIns.Fecha + ')' : 'BCR 14/10/2026';
  var dir = c.cos.filter(function (x) { return tipoCosto_(c, x) === 'Directo'; }), ind = c.cos.filter(function (x) { return tipoCosto_(c, x) !== 'Directo'; });
  var dirMaiz = maiz ? sumar_(dir.filter(function (x) { return x.IdInsumo === maiz.IdInsumo; }), 'Importe') : 0;
  b.otrosDirectosPorMadre = c.ovejasBase ? r2_((sumar_(dir, 'Importe') - dirMaiz) / c.ovejasBase) : 0; fuentes.otrosDirectosPorMadre = 'Real: costos directos de la campaña sin el maíz ÷ madres';
  b.indirectos = r2_(sumar_(ind, 'Importe')); fuentes.indirectos = 'Real: costos indirectos de la campaña (incluye supuestos marcados)';
  var defMB = (leer_('P_Indicador').filter(function (x) { return activo_(x) && x.IdIndicador === 'MB_MADRE'; })[0] || {});
  b.metaMBMadre = defMB.MetaVerde !== '' && defMB.MetaVerde !== undefined ? Number(defMB.MetaVerde) : null;
  var real = { ingresos: r2_(sumar_(c.ing, 'ImporteNeto')), directos: r2_(sumar_(dir, 'Importe')), indirectos: b.indirectos };
  real.mb = r2_(real.ingresos - real.directos); real.resultado = r2_(real.mb - real.indirectos);
  return { base: b, fuentes: fuentes, real: real, conVentas: c.ing.length > 0 };
}

/* ---------- Hallazgos automáticos (reglas, sin IA) ---------- */
function hallazgos_(ind, rep, hist) {
  var H = [];
  ind.indicadores.filter(function (i) { return i.estado === 'Rojo'; }).forEach(function (i) { H.push({ tipo: 'Rojo', titulo: i.nombre + ': ' + i.valor + (i.unidad === '%' ? ' %' : ' ' + (i.unidad || '')), texto: i.decision || i.detalle }); });
  (rep.consumoTotal || []).forEach(function (c) { if (c.esperado) c.desvioPct = r2_((c.real - c.esperado) / c.esperado * 100); if (c.desvioPct !== undefined && c.desvioPct !== null && Math.abs(c.desvioPct) >= 5) H.push({ tipo: 'Amarillo', titulo: 'Consumo de ' + c.insumo + ': ' + (c.desvioPct > 0 ? '+' : '') + c.desvioPct + ' %', texto: 'Se consumió distinto de lo que indica la dosis técnica. Revisar si fue más animales, más días o desperdicio.' }); });
  (rep.rinde || []).forEach(function (r) { if (r.desvioPct !== null && r.desvioPct <= -10) H.push({ tipo: 'Amarillo', titulo: 'Rinde de ' + r.nombre + ': ' + r.desvioPct + ' % contra el estándar', texto: 'Produjo menos kilos por cabeza que la referencia (' + r.fuente + ').' }); });
  // Cambios fuertes contra la foto anterior de la historia
  var porInd = {};
  hist.forEach(function (h) { (porInd[h.IdIndicador] = porInd[h.IdIndicador] || []).push(h); });
  ind.indicadores.forEach(function (i) {
    var L = (porInd[i.id] || []).filter(function (h) { return h.Valor !== '' && h.Fecha < hoyStr_(); }).sort(function (a, b) { return a.Fecha < b.Fecha ? -1 : 1; });
    var ult = L[L.length - 1];
    if (ult && i.valor !== null && Number(ult.Valor) !== 0) {
      var d = (i.valor - Number(ult.Valor)) / Math.abs(Number(ult.Valor)) * 100;
      if (Math.abs(d) >= 10) H.push({ tipo: 'Cambio', titulo: i.nombre + ' cambió ' + (d > 0 ? '+' : '') + r2_(d) + ' % desde el ' + fecha_(ult.Fecha), texto: 'Antes ' + ult.Valor + ', ahora ' + i.valor + '.' });
    }
  });
  return H;
}
function fecha_(s) { var p = String(s).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s; }

/* ---------- API del panel ---------- */
function api_panel(token, idCampana) {
  var u = sesion_(token);
  try { fotoIndicadores_(); } catch (e) {}
  var ind = indicadoresDe_(idCampana || '');
  var rep = api_reportes(token, ind.campana.id);
  var hist = []; try { hist = leer_('F_HistoriaInd').filter(function (x) { return x.IdCampana === ind.campana.id; }); } catch (e) {}
  var c = ctxIndicadores_(ind.campana.id);
  var esc = []; try { esc = leer_('F_Escenario').filter(activo_).map(function (x) { return { id: x.IdEscenario, nombre: x.Nombre, campana: x.IdCampana, supuestos: x.Supuestos, fecha: String(x.CreadoEl).slice(0, 10), por: x.CreadoPor === u.Email ? 'vos' : 'otro usuario' }; }); } catch (e) {}
  return {
    indicadores: ind, reportes: rep, escenario: baseEscenario_(c), hallazgos: hallazgos_(ind, rep, hist),
    historia: hist.map(function (h) { return { f: h.Fecha, id: h.IdIndicador, v: h.Valor === '' ? null : Number(h.Valor), e: h.Estado }; }),
    escenarios: esc, unidades: leer_('D_UnidadNeg').filter(activo_).map(function (x) { return { nombre: x.Nombre, tipo: x.TipoActividad, link: x.LinkApp || '' }; }),
    comparacion: ind.campanas.map(function (x) {
      var r = x.id === ind.campana.id ? ind : indicadoresDe_(x.id);
      return { id: x.id, nombre: x.nombre, ind: r.indicadores.map(function (i) { return { id: i.id, valor: i.valor, estado: i.estado }; }) };
    }),
    iaLista: !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')
  };
}

/* ---------- Asistente IA (Gemini) ---------- */
var IA_POR_DIA = 40; // consultas por usuario por día (cuida el nivel gratuito)
function api_asistente(token, pregunta, idCampana, escenario, unidad, historial) {
  var u = sesion_(token);
  pregunta = String(pregunta || '').trim().slice(0, 600);
  if (pregunta.length < 3) throw new Error('Escribí una pregunta.');
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Falta la clave de Gemini: el administrador la guarda en Apps Script → Configuración del proyecto → Propiedades (GEMINI_API_KEY).');
  var cache = CacheService.getScriptCache(), kc = 'ia_' + u.Email + '_' + hoyStr_(), usadas = Number(cache.get(kc) || 0);
  if (usadas >= IA_POR_DIA) throw new Error('Llegaste al límite de ' + IA_POR_DIA + ' preguntas por hoy. Mañana se renueva.');
  var ind = indicadoresDe_(idCampana || '');
  var rep = api_reportes(token, ind.campana.id);
  var c = ctxIndicadores_(ind.campana.id), base = baseEscenario_(c);
  // Contexto: SOLO números del campo (sin emails, nombres de personas ni datos de clientes)
  var ctx = {
    establecimiento: 'Pozo del Carril – La Aguada, unidad ovina (Dorper). Moneda: pesos argentinos.',
    campana: ind.campana, rodeoHoy: { activos: c.activos.length, ovejas: c.activos.filter(function (a) { return c.cat(a) === 'oveja'; }).length,
      carneros: c.activos.filter(function (a) { return c.cat(a) === 'carnero'; }).length, corderos: c.activos.filter(function (a) { return c.cat(a) === 'cordero'; }).length },
    indicadores: ind.indicadores.map(function (i) { return { nombre: i.nombre, perspectiva: i.perspectiva, valor: i.valor, unidad: i.unidad, estado: i.estado, meta_verde: i.metaVerde, meta_amarilla: i.metaAmarillo, sentido: i.sentido, calculo: i.detalle, decision_sugerida_por_el_grupo: i.decision }; }),
    resultados: { consolidado: pick_(rep.consolidado, ['ingresos', 'kg', 'cabezas', 'costosDirectos', 'directosSupuestos', 'indirectos', 'margenBruto']),
      por_etapa: (rep.porSub || []).map(function (s) { return pick_(s, ['nombre', 'ingresos', 'costosDirectos', 'margenBruto', 'muertes']); }),
      costos_por_rubro: (rep.costosRubro || []).map(function (r) { return pick_(r, ['rubro', 'tipo', 'reales', 'supuestos']); }) },
    rendimiento: (rep.rinde || []).map(function (r) { return pick_(r, ['nombre', 'real', 'estandar', 'desvioPct', 'descripcion']); }),
    consumo: (rep.consumoTotal || []).map(function (r) { return pick_(r, ['insumo', 'um', 'real', 'esperado', 'desvio']); }),
    base_escenarios: base, escenario_en_pantalla: escenario || null
  };
  // v3.7: lo que se ve en el inicio y en Cotizaciones, las otras unidades y dónde está cada cosa en la aplicación
  try { var tc = leer_('F_TipoCambio').filter(activo_).sort(function (a, b) { return String(a.Fecha) < String(b.Fecha) ? 1 : -1; })[0];
    if (tc) ctx.dolar_oficial_bna = { fecha: tc.Fecha, comprador: tc.Comprador, vendedor: tc.Vendedor, fuente: tc.Fuente }; } catch (e) {}
  try { var ult = {}; leer_('F_Cotizacion').filter(activo_).forEach(function (x) { var k = x.Producto + ' · ' + x.Mercado; if (!ult[k] || String(x.Fecha) > String(ult[k].Fecha)) ult[k] = x; });
    ctx.ultimas_cotizaciones = Object.keys(ult).map(function (k) { var x = ult[k]; return { producto: x.Producto, mercado: x.Mercado, fecha: x.Fecha, precio: x.Precio, unidad: x.Unidad }; }); } catch (e) {}
  try { if (!bovinoActivo_()) throw 0; var bv = bovinoDatos_(); ctx.unidad_bovina = { activos: bv.activos, vendidos: bv.vendidos, muertos: bv.muertos, faltantes: bv.faltantes, categorias: bv.categorias, recria: bv.recria, maiz_consumido_kg: bv.maizKg,
    cargas: bv.cargas.map(function (x) { return pick_(x, ['nombre', 'estado', 'inicio', 'fin', 'animales', 'dias', 'pesoIni', 'pesoFin', 'kgGanados', 'adpv', 'adpvDesbaste', 'conversion', 'alimento', 'kgVendidos']); }), aclaracion: 'Las planillas de Bovinos no traen precios: no hay resultados en pesos.' }; } catch (e) {}
  ctx.unidad_en_pantalla = { ovino: 'Ovinos', bovino: 'Bovinos' }[unidad] || 'Ovinos';
  ctx.mapa_de_la_aplicacion = {
    'Inicio': 'muestra el rodeo de hoy, lo que hay que atender y el dólar oficial BNA del día (el administrador lo actualiza tocándolo)',
    'Ovinos': 'Cargar: Vacunas y tratamientos, Nació un cordero, Murió un animal, Cargar una compra, Vender animales (la factura sale numerada sola), Cobros y pagos, Corregir un dato. Consultar: Los animales (fichas), Proveedores y clientes, Resultados, Indicadores, Panel decisional (escenarios), Cotizaciones, Impuestos, Unidades del campo, Presupuesto',
    'Unidades del campo': 'las demás unidades del establecimiento con el link a su sistema; Bovinos está dentro de este sistema y el administrador lo activa o lo pone en pausa desde ahí',
    'Bovinos (si está activo)': 'Cargar: Pesé animales (toda la manga junta), Nació un ternero, Alimento de las cargas, Venta, muerte o faltante. Consultar: Resumen de Bovinos, Indicadores, Los animales, Cargas de engorde, Todas las pesadas',
    'Cotizaciones': 'precios de granos de la Bolsa de Comercio de Rosario (automáticos), hacienda de Cañuelas, carga manual e historial',
    'Administración': 'solo el Administrador: tablas, usuarios, metas de indicadores e Historial de cambios'
  };
  var sistema = 'Sos la ovejita asistente del Sistema de Gestión de Pozo del Carril (ganadería: unidad Ovina y, si está activa, Bovina), usado por estudiantes de Ciencias Económicas y por el dueño del campo. ' +
    'Respondé en español rioplatense, cálido y directo. Contestá EXACTAMENTE lo que te preguntan y nada más: no agregues datos, análisis ni recomendaciones que no te pidieron. ' +
    'Usá SOLO los datos del contexto JSON; si un dato no está, decilo en una frase y no lo inventes. ' +
    'Elegí el largo según la pregunta: ' +
    '(1) si piden un dato (por ejemplo "¿cuál es el último dólar?", "¿cuántas ovejas hay?"), respondé en una o dos oraciones con el número, la fecha y la fuente; ' +
    '(2) si preguntan dónde está algo o cómo se hace en la aplicación, explicalo en pocos pasos usando el mapa de la aplicación; ' +
    '(3) si saludan o charlan, respondé breve y ofrecé ayuda; ' +
    '(4) solo si piden analizar, explicar por qué pasó algo, comparar o qué conviene hacer, usá tres partes con estos títulos exactos, cada uno solo en su renglón: "Hechos", "Cálculos" (mostrando la cuenta) e "Hipótesis y acciones a validar" (aclarando que hay que verificarlas), en hasta 200 palabras. ' +
    'Si la pregunta es de una unidad, usá los datos de esa unidad; si no aclara, usá la unidad en pantalla. Cuando un costo es supuesto, aclaralo. No des consejos financieros de inversión. ' +
    'Formato: texto plano, viñetas "- " solo si hay una lista, sin tablas ni markdown (sin asteriscos ni numerales).';
  var previas = (Array.isArray(historial) ? historial : []).slice(-4).map(function (h) { return 'Pregunta anterior: ' + String(h.q || '').slice(0, 300) + '\nRespuesta anterior: ' + String(h.r || '').slice(0, 600); }).join('\n\n');
  var cuerpo = { systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: 'user', parts: [{ text: 'Contexto (JSON):\n' + JSON.stringify(ctx) + (previas ? '\n\nConversación anterior (para entender preguntas de seguimiento):\n' + previas : '') + '\n\nPregunta: ' + pregunta }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1200 } };
  var modelos = [config_('GEMINI_MODELO'), 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter(Boolean), ultimo = '', ocupados = 0;
  for (var i = 0; i < modelos.length; i++) {
    if (i > 0 && ocupados) Utilities.sleep(800);
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + modelos[i] + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(cuerpo), muteHttpExceptions: true });
    var code = res.getResponseCode(), txt = res.getContentText();
    if (code === 200) {
      var j = JSON.parse(txt), cand = j.candidates && j.candidates[0], partes = cand && cand.content && cand.content.parts || [];
      var resp = partes.map(function (p) { return p.text || ''; }).join('').trim();
      if (!resp) throw new Error('La IA no devolvió respuesta (' + (cand && cand.finishReason || 'sin motivo') + '). Probá reformular la pregunta.');
      cache.put(kc, String(usadas + 1), 86400);
      conBloqueo_(function () { auditar_(u.Email, 'Pregunta al asistente IA', 'Panel', modelos[i], null, { pregunta: pregunta }); });
      return { respuesta: resp, modelo: modelos[i], quedan: IA_POR_DIA - usadas - 1 };
    }
    ultimo = code + ' ' + txt.slice(0, 200);
    if (code === 429) throw new Error('Se alcanzó el límite gratuito de Gemini por ahora. Probá en unos minutos.');
    if (code === 400 && /API key/i.test(txt)) throw new Error('La clave de Gemini no es válida. Revisala en Propiedades del script (GEMINI_API_KEY).');
    if (code === 503 || code === 500 || code === 504) { ocupados++; continue; } // modelo saturado: se prueba otro
    if (code !== 404) break; // 404 = ese modelo no existe: se prueba el siguiente
  }
  if (ocupados) throw new Error('Gemini está con mucha demanda en este momento (no es un error del sistema). Probá de nuevo en uno o dos minutos.');
  throw new Error('No se pudo consultar a la IA (' + ultimo + ').');
}
function pick_(o, ks) { var r = {}; (ks || []).forEach(function (k) { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; }

function r2_(x) { return Math.round(Number(x) * 100) / 100; }

/** El administrador guarda la clave de Gemini desde la app (queda en Propiedades del script, nunca en la planilla ni en la página). */
function api_guardarClaveIA(token, clave) {
  var u = sesion_(token);
  if (u.Rol !== 'Administrador') throw new Error('Solo el administrador puede guardar la clave.');
  clave = String(clave || '').trim();
  if (!/^AIza[0-9A-Za-z_\-]{20,}$/.test(clave)) throw new Error('Eso no parece una clave de Gemini: tiene que empezar con "AIza" y no llevar espacios.');
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': clave }, muteHttpExceptions: true });
  if (res.getResponseCode() === 400 || res.getResponseCode() === 403) throw new Error('Google rechazó la clave. Copiala de nuevo desde aistudio.google.com/apikey.');
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', clave);
  conBloqueo_(function () { auditar_(u.Email, 'Guardó la clave de Gemini', 'Panel', 'GEMINI_API_KEY', null, null); });
  return { ok: true, mensaje: 'Clave guardada. Ya podés preguntarle a la oveja.' };
}
