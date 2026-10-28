/**
 * PRESUPUESTO DE LA CAMPAÑA (v3.8)
 * ---------------------------------------------------------------------------------------------
 * Se carga UNA vez por campaña, al empezarla: cuánto se piensa gastar en cada rubro. Después no se modifica,
 * porque sirve para comparar lo gastado contra lo planeado ("¿En qué se gastó?" en Resultados).
 * Si hubo un error de tipeo, solo el Administrador lo corrige con el lapicito y queda en el historial de cambios.
 * Si la campaña todavía no existe, se crea en el mismo momento con las fechas que se escriban.
 */
var RUBROS_PRESUPUESTO = ['Alimentación', 'Sanidad', 'Mano de obra', 'Reposición de madres']; // los que aparecen siempre
var INGRESOS_PRESUPUESTO = ['Ventas', 'Otros ingresos'];
/** Directo o indirecto: los rubros conocidos tienen su clasificación; un gasto nuevo se clasifica por su nombre. */
function clasifGasto_(n) { return /alimen|ma[ií]z|raci[oó]n|balancead|suplement|sanidad|vacun|remedio|antiparas|veterin|flete|faena|comisi|esquila|semilla|fertiliz|rollo|fardo|pastura|forraj|mineral/i.test(String(n || '')) ? 'Directo' : 'Indirecto'; }
function clasifPresu_(tipo, rubro) { return tipo === 'Ingreso' ? 'Ingreso' : RUBROS[rubro] ? RUBROS[rubro].tipo : clasifGasto_(rubro); }

/** Presupuesto de una campaña, sumado por rubro (los ingresos quedan en 'Ventas' y 'Otros ingresos'). */
function presupuestoDe_(idCampana) {
  var o = {}; if (!idCampana) return o;
  try { leer_('F_Presupuesto').filter(function (x) { return activo_(x) && x.IdCampana === idCampana; }).forEach(function (x) { o[x.Rubro] = (o[x.Rubro] || 0) + Number(x.Importe || 0); }); } catch (e) {}
  return o;
}
function api_presupuesto(token) {
  var u = sesion_(token);
  var P = leer_('F_Presupuesto').filter(activo_);
  var camps = campanasOvinas_().sort(function (a, b) { return a.FechaDesde < b.FechaDesde ? 1 : -1; });
  return {
    puedeCargar: u.Rol === 'Administrador', fijos: RUBROS_PRESUPUESTO, ingresos: INGRESOS_PRESUPUESTO,
    gastos: Object.keys(RUBROS).map(function (k) { return { rubro: k, tipo: RUBROS[k].tipo }; }).concat(Object.keys(P.reduce(function (o, x) { if ((x.Tipo || 'Gasto') === 'Gasto' && !RUBROS[x.Rubro]) o[x.Rubro] = 1; return o; }, {})).sort().map(function (k) { return { rubro: k, tipo: clasifGasto_(k) }; })),
    campanas: camps.map(function (c) {
      var items = P.filter(function (x) { return x.IdCampana === c.IdCampana; });
      return { id: c.IdCampana, nombre: c.Nombre, desde: c.FechaDesde, hasta: c.FechaHasta,
        items: items.map(function (x) { var t = x.Tipo || (RUBROS[x.Rubro] ? 'Gasto' : 'Ingreso');
          return { id: x.IdPresupuesto, tipo: t, rubro: x.Rubro, concepto: x.Concepto || '', clasif: x.Clasificacion || clasifPresu_(t, x.Rubro), importe: Number(x.Importe), quien: nombreUsuario_(String(x.CreadoPor || '').replace(/ \(.*\)$/, '')), cuando: String(x.CreadoEl || '').slice(0, 10), corregido: !!x.ModificadoPor && !/^sistema/.test(String(x.ModificadoPor)) }; }) };
    })
  };
}
/** d = { idCampana } o { nueva: { nombre, desde, hasta } }, items = [{ tipo, rubro, concepto, importe }] */
function api_guardarPresupuesto(token, d, items) {
  var u = sesion_(token);
  if (u.Rol !== 'Administrador') throw new Error('El presupuesto lo carga el Administrador.');
  return conBloqueo_(function () {
    d = d || {}; items = (items || []).filter(function (x) { return x && x.importe !== '' && x.importe !== null && x.importe !== undefined; });
    if (!items.length) throw new Error('Escribí el importe de al menos un renglón.');
    var clave = function (x) { return x.rubro + '|' + String(x.concepto || '').trim().toLowerCase(); }, vistos = {};
    items.forEach(function (x) {
      x.tipo = x.tipo === 'Ingreso' ? 'Ingreso' : 'Gasto'; x.concepto = String(x.concepto || '').trim().slice(0, 120);
      x.rubro = String(x.rubro || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (x.tipo === 'Ingreso' && INGRESOS_PRESUPUESTO.indexOf(x.rubro) < 0) throw new Error('Elegí un rubro válido para "' + (x.concepto || x.rubro || 'un renglón') + '".');
      if (x.tipo === 'Gasto' && !x.rubro) throw new Error('Escribí el nombre del gasto nuevo.');
      if (x.tipo === 'Gasto' && !RUBROS[x.rubro]) { // gasto nuevo: se suma como un rubro más (si ya existe con otra escritura, se usa el existente)
        var igual = Object.keys(RUBROS).concat(leer_('F_Presupuesto').map(function (y) { return y.Rubro; })).filter(function (k) { return String(k).toLowerCase() === x.rubro.toLowerCase(); })[0];
        x.rubro = igual || x.rubro.charAt(0).toUpperCase() + x.rubro.slice(1);
      }
      if (!(Number(x.importe) >= 0)) throw new Error(x.rubro + ': el importe tiene que ser un número mayor o igual a 0.');
      if (vistos[clave(x)]) throw new Error('Hay dos renglones iguales: ' + x.rubro + (x.concepto ? ' · ' + x.concepto : '') + '. Escribí un concepto distinto en cada uno.');
      vistos[clave(x)] = 1;
    });
    var id = d.idCampana;
    if (!id) {
      var n = d.nueva || {}, o = limpiar_('D_Campana', { Nombre: n.nombre, FechaDesde: n.desde, FechaHasta: n.hasta, IdUnidad: '', Estado: 'Activa' }, u);
      validar_('D_Campana', o, u);
      id = insertar_('D_Campana', o, u.Email);
    } else if (!campanasOvinas_().some(function (c) { return c.IdCampana === id; })) throw new Error('Elegí una campaña de Ovinos.');
    var ya = {}; leer_('F_Presupuesto').filter(function (x) { return activo_(x) && x.IdCampana === id; }).forEach(function (x) { ya[clave({ rubro: x.Rubro, concepto: x.Concepto })] = 1; });
    var rep = items.filter(function (x) { return ya[clave(x)]; });
    if (rep.length) throw new Error('Ya está cargado ' + rep.map(function (x) { return x.rubro + (x.concepto ? ' · ' + x.concepto : ''); }).join(', ') + ' para esa campaña. Lo cargado no se modifica: si hay un error, el Administrador lo corrige con el lapicito (Corregir un dato). Para sumar otro renglón del mismo rubro, escribí un concepto distinto.');
    items.forEach(function (x) { insertar_('F_Presupuesto', { IdCampana: id, Tipo: x.tipo, Rubro: x.rubro, Concepto: x.concepto, IdSubunidad: '', Importe: Number(x.importe), Clasificacion: clasifPresu_(x.tipo, x.rubro), Fuente: 'Presupuesto cargado por ' + u.Nombre }, u.Email); });
    return { ok: true, idCampana: id, mensaje: 'Presupuesto guardado: ' + items.length + (items.length === 1 ? ' renglón' : ' renglones') + '. Desde ahora queda fijo para comparar con lo real.' };
  });
}
