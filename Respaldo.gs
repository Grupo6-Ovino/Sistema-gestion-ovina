/**
 * RESPALDO AUTOMÁTICO DE LA BASE DE DATOS — Sistema de Gestión Ovina (Grupo 6, Taller de Práctica II, FCE UNRC)
 * ---------------------------------------------------------------------------------------------
 * Archivo independiente: no modifica Codigo.gs, Index.html, Instalar.gs ni Actualizar.gs.
 *
 * Qué hace: todos los días, a la madrugada, Google hace una COPIA COMPLETA de la planilla (todas las
 * tablas) dentro de la carpeta de Drive "Respaldos Sistema Ovino". Guarda las últimas 30 copias;
 * las más viejas van a la papelera de Drive (y se pueden recuperar durante 30 días más).
 * Cada respaldo queda anotado en la hoja S_Auditoria.
 *
 * Cómo se activa (UNA sola vez): en el editor de Apps Script elegir la función "activarRespaldoDiario"
 * y apretar ▶ Ejecutar. Hace el primer respaldo en el momento y deja programados los siguientes.
 * Para hacer un respaldo extra en cualquier momento: ejecutar "respaldarAhora".
 */
var RESPALDO_CARPETA = 'Respaldos Sistema Ovino';
var RESPALDO_CONSERVAR = 30;
var RESPALDO_TZ = 'America/Argentina/Buenos_Aires';

function respaldarAhora() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  var carpeta = respaldoCarpeta_();
  var cuando = Utilities.formatDate(new Date(), RESPALDO_TZ, 'yyyy-MM-dd HH.mm');
  var nombre = 'Respaldo ' + cuando + ' · ' + ss.getName();
  var copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);

  // Conservar solo las últimas RESPALDO_CONSERVAR copias (las demás van a la papelera, no se borran del todo)
  var lista = [], it = carpeta.getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf('Respaldo ') === 0 && !f.isTrashed()) lista.push(f); }
  lista.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  var aPapelera = lista.slice(RESPALDO_CONSERVAR);
  aPapelera.forEach(function (f) { f.setTrashed(true); });

  // Dejarlo registrado en la auditoría del sistema
  var aud = ss.getSheetByName('S_Auditoria');
  if (aud) {
    aud.appendRow(['AUD-' + ('000000' + aud.getLastRow()).slice(-6), new Date(), 'sistema (respaldo automático)', 'Respaldo de la base de datos',
      '(toda la planilla)', copia.getId(), '', nombre + ' · carpeta "' + RESPALDO_CARPETA + '"' + (aPapelera.length ? ' · ' + aPapelera.length + ' respaldo(s) viejo(s) a la papelera' : '')]);
  }
  var txt = 'Respaldo hecho: "' + nombre + '" en la carpeta "' + RESPALDO_CARPETA + '" de Drive. Respaldos guardados: ' + Math.min(lista.length, RESPALDO_CONSERVAR) + '.';
  Logger.log(txt);
  return txt;
}

/** Programa el respaldo diario (entre las 3 y las 4 de la mañana) y hace el primero en el momento. */
function activarRespaldoDiario() {
  var ya = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'respaldarAhora'; });
  var txt = ya.length ? 'El respaldo diario ya estaba activado.' : 'Listo: la planilla se va a respaldar sola todos los días a la madrugada.';
  if (!ya.length) ScriptApp.newTrigger('respaldarAhora').timeBased().everyDays(1).atHour(3).inTimezone(RESPALDO_TZ).create();
  txt += '\n' + respaldarAhora();
  try { SpreadsheetApp.getUi().alert(txt); } catch (e) { Logger.log(txt); }
  return txt;
}

function respaldoCarpeta_() {
  var it = DriveApp.getFoldersByName(RESPALDO_CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(RESPALDO_CARPETA);
}
