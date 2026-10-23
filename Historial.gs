/**
 * HISTORIAL DE CAMBIOS Y "QUIÉN LO HIZO" (v3.5)
 * ---------------------------------------------------------------------------------------------
 * Lee la auditoría (S_Auditoria), que ya registra cada alta, modificación, corrección y baja con el usuario,
 * la fecha y hora, el valor anterior y el nuevo, y la muestra entendible: qué campo cambió, de qué a qué.
 * La ven el Administrador y Consulta / auditoría (los demás ven quién cargó y quién modificó cada registro).
 */
var NOMBRES_TABLA_ = null;
function nombreUsuario_(email) {
  if (!email) return '';
  if (/^sistema/.test(email)) return 'Sistema (actualización automática)';
  var u = usuarioPorEmail_(email);
  return u && u.Nombre ? u.Nombre : email;
}
/** Quién cargó y quién modificó por última vez un registro (con nombre, no con email). */
function quien_(r) {
  return { cargo: nombreUsuario_(r.CreadoPor), cargoEl: String(r.CreadoEl || '').slice(0, 16),
    modifico: nombreUsuario_(r.ModificadoPor), modificoEl: String(r.ModificadoEl || '').slice(0, 16) };
}
function api_historial(token, f) {
  var u = sesion_(token);
  if (u.Rol !== 'Administrador' && u.Rol !== 'Consulta / auditoría') throw new Error('El historial lo ven el Administrador y Consulta / auditoría.');
  f = f || {};
  var desde = f.desde || '', hasta = f.hasta || '', tabla = f.tabla || '', quien = String(f.usuario || '').toLowerCase(), q = String(f.texto || '').toLowerCase();
  var tit = function (t) { return SCHEMA[t] ? SCHEMA[t].titulo : t; };
  var etiq = function (t, k) { var c = SCHEMA[t] && colDe(t, k); return c ? etq_(t, c) : k; };
  var nombres = {}; leer_('S_Usuarios').forEach(function (x) { nombres[String(x.Email).toLowerCase()] = x.Nombre; });
  var OCULTAR = { CreadoEl: 1, CreadoPor: 1, ModificadoEl: 1, ModificadoPor: 1, Sal: 1, ClaveHash: 1, _fila: 1 };
  var filas = leer_('S_Auditoria').filter(function (a) {
    var fh = String(a.FechaHora).slice(0, 10);
    if (desde && fh < desde) return false; if (hasta && fh > hasta) return false;
    if (tabla && a.Tabla !== tabla) return false;
    if (quien && String(a.Usuario).toLowerCase() !== quien) return false;
    if (!f.conIngresos && a.Accion === 'Ingreso') return false;
    return true;
  }).sort(function (a, b) { return String(a.FechaHora) < String(b.FechaHora) ? 1 : -1; });
  var out = [];
  for (var i = 0; i < filas.length && out.length < 300; i++) {
    var a = filas[i], antes = {}, desp = {};
    try { antes = a.ValorAnterior ? JSON.parse(String(a.ValorAnterior).replace(/…$/, '')) : {}; } catch (e) { antes = {}; }
    try { desp = a.ValorNuevo ? JSON.parse(String(a.ValorNuevo).replace(/…$/, '')) : {}; } catch (e) { desp = {}; }
    var cambios = [];
    if (a.ValorAnterior && a.ValorNuevo) {
      Object.keys(desp).forEach(function (k) { if (OCULTAR[k]) return; if (String(antes[k] === undefined ? '' : antes[k]) !== String(desp[k] === undefined ? '' : desp[k])) cambios.push({ campo: etiq(a.Tabla, k), antes: antes[k], despues: desp[k] }); });
    }
    var usuario = nombres[String(a.Usuario).toLowerCase()] || (/^sistema/.test(a.Usuario) ? 'Sistema' : a.Usuario);
    var item = { fecha: String(a.FechaHora).slice(0, 16), usuario: usuario, accion: a.Accion, tabla: tit(a.Tabla), idTabla: a.Tabla, registro: a.IdRegistro, cambios: cambios };
    if (q && JSON.stringify(item).toLowerCase().indexOf(q) < 0) continue;
    out.push(item);
  }
  var tablas = {}; filas.forEach(function (a) { tablas[a.Tabla] = tit(a.Tabla); });
  var usuarios = leer_('S_Usuarios').filter(activo_).map(function (x) { return { email: String(x.Email).toLowerCase(), nombre: x.Nombre }; });
  return { items: out, total: filas.length, tablas: Object.keys(tablas).map(function (k) { return { id: k, nombre: tablas[k] }; }), usuarios: usuarios };
}
