/**
 * CORRECCIONES CON EL LAPICITO (v3.4)
 * ---------------------------------------------------------------------------------------------
 * Para arreglar errores comunes de carga (kilos, precios, fechas, pesos…) sin dar de baja y volver a cargar.
 * Quién puede: el Administrador, todo. Los demás, solo lo que ELLOS cargaron, dentro de los 7 días y de tablas
 * que su rol puede cargar (Consulta / auditoría no puede corregir nada). Cada corrección queda en la auditoría
 * con el valor anterior y el nuevo. El número de factura de venta no se corrige nunca.
 */
var CORREGIBLE = {
  F_Ingresos: ['Kg', 'PrecioKg', 'PrecioIncluyeIVA'],
  F_Costos: ['Fecha', 'IdSubunidad', 'Cantidad', 'PrecioUnit', 'AlicuotaIVA'],
  F_Compras: ['Fecha', 'Numero', 'Vencimiento'],
  D_Animal: ['PesoKg', 'Sexo', 'FechaNac', 'IdCategoria', 'Madre', 'Padre', 'Observaciones'],
  F_Sanidad: ['Fecha', 'Dosis', 'DiasCarencia', 'Responsable', 'Observaciones'],
  F_Mortandad: ['Fecha', 'Causa', 'Observaciones'],
  F_Tesoreria: ['Fecha', 'Numero', 'Observaciones']
};
var CORREGIR_DIAS = 7;

function puedeCorregir_(u, tabla, r) {
  if (!CORREGIBLE[tabla] || !r || !activo_(r)) return false;
  if (u.Rol === 'Administrador') return true;
  if (u.Rol === 'Consulta / auditoría') return false;
  if (!puede_(u, tabla, 'crear')) return false;
  if (String(r.CreadoPor || '').toLowerCase() !== u.Email) return false;
  var d = aFecha_(String(r.CreadoEl || '').slice(0, 10));
  if (!d || (new Date() - d) / 86400000 > CORREGIR_DIAS + 0.5) return false;
  if (u.Rol === 'Responsable de subunidad' && r.IdSubunidad && !miEtapa_(u, r.IdSubunidad)) return false;
  return true;
}

/** Lista de lo que este usuario puede corregir (para la pantalla "Corregir un dato"). */
function api_corregibles(token) {
  var u = sesion_(token), out = [];
  var lab = function (t, id) { var l = (listas_()[t] || []).filter(function (x) { return String(x.id) === String(id); })[0]; return l ? l.label : id; };
  Object.keys(CORREGIBLE).forEach(function (t) {
    var filas; try { filas = leer_(t); } catch (e) { return; }
    filas.filter(function (r) { return puedeCorregir_(u, t, r); }).forEach(function (r) {
      var pk = SCHEMA[t].pk, txt;
      if (t === 'F_Ingresos') txt = 'Venta ' + r.Comprobante + ' · caravana ' + r.Caravana + ' · ' + r.Kg + ' kg a $' + fmtNum_(r.PrecioKg, 2);
      else if (t === 'F_Costos') txt = 'Costo · ' + lab('D_Insumo', r.IdInsumo) + ' · ' + r.Cantidad + ' × $' + fmtNum_(r.PrecioUnit, 2) + (r.Comprobante ? ' · ' + r.Comprobante : '');
      else if (t === 'F_Compras') txt = 'Factura de compra ' + r.IdTipoComprobante + ' ' + r.Letra + ' ' + r.Numero + ' · ' + lab('D_Tercero', r.IdTercero);
      else if (t === 'D_Animal') txt = 'Animal · caravana ' + r.Caravana + ' · ' + lab('D_Categoria', r.IdCategoria) + (r.PesoKg !== '' ? ' · ' + r.PesoKg + ' kg' : '');
      else if (t === 'F_Sanidad') txt = 'Sanidad · caravana ' + r.Caravana + ' · ' + lab('D_Insumo', r.IdInsumo) + ' · dosis ' + r.Dosis;
      else if (t === 'F_Mortandad') txt = 'Muerte · caravana ' + r.Caravana + ' · ' + r.Causa;
      else txt = (r.Tipo || 'Movimiento') + ' · $' + fmtNum_(r.Importe, 2) + ' · ' + lab('D_Tercero', r.IdTercero);
      out.push({ tabla: t, id: r[pk], fecha: r.Fecha || String(r.CreadoEl).slice(0, 10), texto: txt, creado: String(r.CreadoEl).slice(0, 10), quien: quien_(r) });
    });
  });
  out.sort(function (a, b) { return String(a.fecha) < String(b.fecha) ? 1 : -1; });
  return { items: out.slice(0, 400), dias: CORREGIR_DIAS, admin: u.Rol === 'Administrador' };
}

/** Trae el registro y qué campos se pueden corregir. */
function api_paraCorregir(token, tabla, id) {
  var u = sesion_(token), r = buscar_(tabla, id);
  if (!puedeCorregir_(u, tabla, r)) throw new Error('No podés corregir este registro' + (u.Rol === 'Administrador' ? '.' : ': solo lo que cargaste vos en los últimos ' + CORREGIR_DIAS + ' días. Pedíselo al administrador.'));
  return { tabla: tabla, id: id, campos: CORREGIBLE[tabla].map(function (k) { var c = colDe(tabla, k); return { n: k, l: etq_(tabla, c), t: c.t || '', opts: c.opts || null, fk: c.fk || '', valor: r[k] }; }) };
}

function api_corregir(token, tabla, id, cambios) {
  var u = sesion_(token);
  return conBloqueo_(function () {
    var actual = buscar_(tabla, id);
    if (!puedeCorregir_(u, tabla, actual)) throw new Error('No podés corregir este registro.');
    var permitidos = CORREGIBLE[tabla], o = JSON.parse(JSON.stringify(actual)), hubo = [];
    var limpio = limpiar_(tabla, Object.assign({}, actual, cambios || {}), u);
    permitidos.forEach(function (k) {
      if (!cambios || cambios[k] === undefined) return;
      if (String(limpio[k]) !== String(actual[k])) { o[k] = limpio[k]; hubo.push(etq_(tabla, colDe(tabla, k))); }
    });
    if (!hubo.length) return { ok: true, mensaje: 'No cambiaste nada.' };
    validar_(tabla, o, u, id);
    calcular_(tabla, o);
    if (tabla === 'D_Animal') {
      o.Estado = actual.Estado; o.FechaBaja = actual.FechaBaja;
      if (/estimad/i.test(String(o.Observaciones || '')) && (String(o.PesoKg) !== String(actual.PesoKg) || String(o.FechaNac) !== String(actual.FechaNac) || String(o.Sexo) !== String(actual.Sexo)))
        o.Observaciones = String(o.Observaciones).replace(/[^.]*estimad[^.]*\.?/gi, '').replace(/\s+/g, ' ').trim();
    }
    if (tabla === 'F_Costos') o.IdCompra = actual.IdCompra;
    if (tabla === 'F_Ingresos') o.Comprobante = actual.Comprobante; // el número de factura no se toca
    o[SCHEMA[tabla].pk] = actual[SCHEMA[tabla].pk];
    AUDIT_COLS.forEach(function (k) { o[k] = actual[k]; });
    o.ModificadoEl = new Date(); o.ModificadoPor = u.Email;
    reescribir_(tabla, actual._fila, o);
    auditar_(u.Email, 'Corrección (lapicito): ' + hubo.join(', '), tabla, id, sinOcultos_(tabla, actual), sinOcultos_(tabla, o));
    if (tabla === 'F_Costos' && o.IdCompra) recalcularCompra_(o.IdCompra, u.Email);
    if (tabla === 'F_Compras') recalcularCompra_(id, u.Email);
    if (tabla === 'F_Ingresos') recalcEstadoVenta_(o.Comprobante, o.IdTercero, u.Email);
    return { ok: true, mensaje: 'Corregido: ' + hubo.join(', ') + '. Quedó registrado en la auditoría.' };
  });
}
