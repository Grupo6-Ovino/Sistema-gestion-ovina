/**
 * INSTALACIÓN — crea todas las tablas y carga los datos REALES del rodeo (planilla "GRUPO 6 Planillas de datos 3").
 * Se ejecuta una sola vez desde el menú "Sistema Ovino > Instalar" de la planilla.
 * Los únicos datos que no son reales son 5 costos SUPUESTOS del trabajo del 14/09, marcados con EsSupuesto = Sí.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Sistema Ovino')
    .addItem('Instalar (crear tablas y cargar datos)', 'instalar')
    .addItem('Ver link de la aplicación', 'verLink')
    .addToUi();
}

function verLink() {
  var url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(url ? 'Link de la aplicación:\n\n' + url : 'Todavía no está implementada como aplicación web (paso "Implementar" de la guía).');
}

// ----- DATOS REALES (fuente: GRUPO 6 Planillas de datos 3.xlsx) -----
// Planilla de existencias: caravana | fecha nac. | categoría | estado reproductivo | peso kg | fecha de venta
var DATOS_ANIMALES = '1|2025-08-24|Cordero|Optimo|16|2025-12-20;2|2025-08-25|Cordero|Optimo|21|2025-12-20;3|2025-08-26|Cordero|Optimo|16|2025-12-20;4|2025-08-27|Cordero|Optimo|17|2025-12-20;5|2025-08-28|Cordero|Optimo|19|2025-12-20;6|2025-08-29|Cordero|Optimo|20|2025-12-20;7|2025-08-30|Cordero|Optimo|16|2025-12-20;8|2025-08-31|Cordero|Optimo|21|2025-12-20;9|2025-09-01|Cordero|Optimo|20|2025-12-20;10|2025-09-02|Cordero|Optimo|16|2025-12-20;11|2025-09-03|Cordero|Optimo|19|2025-12-20;12|2025-09-04|Cordero|Optimo|16|2025-12-20;13|2025-09-05|Cordero|Optimo|22|2025-12-20;14|2025-09-06|Cordero|Optimo|19|2025-12-20;15|2025-09-07|Cordero|Optimo|19|2025-12-20;16|2025-09-08|Cordero|Optimo|17|2025-12-20;17|2025-09-09|Cordero|Optimo|17|2025-12-20;18|2025-09-10|Cordero|Optimo|17|2025-12-20;19|2025-09-11|Cordero|Optimo|19|2025-12-20;20|2025-09-12|Cordero|Optimo|21|2025-12-20;21|2025-09-13|Cordero|Optimo|19|2025-12-20;22|2025-09-14|Cordero|Optimo|22|2025-12-20;23|2025-09-15|Cordero|Optimo|17|2025-12-20;24|2025-09-16|Cordero|Optimo|21|2025-12-20;25|2025-09-17|Cordero|Optimo|19|2025-12-20;26|2025-09-18|Cordero|Optimo|19|2025-12-20;27|2025-09-19|Cordero|Optimo|20|2025-12-20;28|2025-09-20|Cordero|Optimo|20|2025-12-20;29|2025-09-21|Cordero|Optimo|21|2025-12-20;30|2025-09-22|Cordero|Optimo|19|2025-12-20;31|2022-07-17|Oveja|Preñada|98|;32|2023-07-17|Oveja|Preñada|107|;33|2022-06-15|Oveja|Preñada|80|;34|2022-07-17|Oveja|Preñada|73|;35|2023-07-17|Oveja|Preñada|101|;36|2022-06-15|Oveja|Preñada|102|;37|2022-07-17|Oveja|Preñada|103|;38|2022-07-17|Oveja|Preñada|104|;39|2023-07-17|Oveja|Preñada|110|;40|2022-06-15|Oveja|Preñada|92|;41|2022-07-17|Oveja|Preñada|70|;42|2023-07-17|Oveja|Preñada|98|;43|2022-06-15|Oveja|Preñada|90|;44|2022-07-17|Oveja|Preñada|91|;45|2022-07-17|Oveja|Preñada|97|;46|2023-07-17|Oveja|Preñada|87|;47|2022-06-15|Oveja|Preñada|85|;48|2022-07-17|Oveja|Preñada|84|;49|2023-07-17|Oveja|Preñada|78|;50|2022-06-15|Oveja|Preñada|93|;51|2022-07-17|Oveja|Preñada|102|;52|2022-07-17|Oveja|Preñada|76|;53|2023-07-17|Oveja|Preñada|70|;54|2022-06-15|Oveja|Preñada|75|;55|2022-07-17|Oveja|Preñada|70|;56|2023-07-17|Oveja|Preñada|93|;57|2022-06-15|Oveja|Preñada|79|;58|2022-07-17|Oveja|Preñada|93|;59|2022-07-17|Oveja|Preñada|86|;60|2023-07-17|Oveja|Preñada|94|;61|2022-06-15|Oveja|Preñada|106|;62|2022-07-17|Oveja|Preñada|90|;63|2023-07-17|Oveja|Preñada|99|;64|2022-06-15|Oveja|Preñada|79|;65|2022-07-17|Oveja|Preñada|83|;66|2022-07-17|Oveja|Lactando|84|;67|2023-07-17|Oveja|Preñada|82|;68|2022-06-15|Oveja|Preñada|110|;69|2022-07-17|Oveja|Preñada|109|;70|2023-07-17|Oveja|Preñada|102|;71|2022-06-15|Oveja|Preñada|98|;72|2022-07-17|Oveja|Preñada|88|;73|2022-07-17|Oveja|Preñada|89|;74|2023-07-17|Oveja|Vacía|75|;75|2022-06-15|Oveja|Preñada|103|;76|2022-07-17|Oveja|Preñada|104|;77|2023-07-17|Oveja|Vacía|92|;78|2022-06-15|Oveja|Preñada|99|;79|2022-07-17|Oveja|Preñada|84|;80|2022-07-17|Oveja|Vacía|95|;81|2023-07-17|Oveja|Preñada|92|;82|2022-06-15|Oveja|Preñada|71|;83|2022-07-17|Oveja|Preñada|82|;84|2023-07-17|Oveja|Lactando|92|;85|2022-06-15|Oveja|Preñada|83|;86|2022-07-17|Oveja|Preñada|88|;87|2022-07-17|Oveja|Preñada|89|;88|2023-07-17|Oveja|Lactando|97|;89|2022-06-15|Oveja|Preñada|71|;90|2022-07-17|Oveja|Preñada|90|;91|2023-07-17|Oveja|Preñada|77|;92|2022-06-15|Oveja|Preñada|105|;93|2022-07-17|Oveja|Preñada|97|;94|2022-07-17|Oveja|Preñada|109|;95|2022-07-17|Carnero|En servicio|94|;96|2022-07-17|Carnero|En servicio|75|;97|2026-08-24|Cordero|No aplica|4|;98|2026-08-24|Cordero|No aplica|4|;99|2026-08-24|Cordero|No aplica|7|';
// Planilla de movimientos, FAV 0003-000005858 (20/12/2025, La Campana, $3.000/kg, IVA 10,5%): caravana | kg
var DATOS_VENTA = '1|16;2|21;3|16;4|17;5|19;6|20;7|16;8|21;9|20;10|16;11|19;12|16;13|22;14|19;15|19;16|17;17|17;18|17;19|19;20|21;21|19;22|22;23|17;24|21;25|19;26|19;27|20;28|20;29|21;30|19';

function instalar() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('S_Usuarios')) {
    ui.alert('El sistema ya está instalado en esta planilla. No se instala dos veces para no pisar datos.');
    return;
  }
  var r1 = ui.prompt('Instalación (1 de 2)', 'Tu nombre y apellido (vas a ser la Administradora del sistema):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK || !r1.getResponseText().trim()) return;
  var r2 = ui.prompt('Instalación (2 de 2)', 'Elegí una clave para entrar a la aplicación (mínimo 6 caracteres). Anotala:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var clave = r2.getResponseText();
  if (clave.length < 6) { ui.alert('La clave tiene que tener al menos 6 caracteres. Volvé a ejecutar Instalar.'); return; }

  ss.setSpreadsheetTimeZone(TZ);
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  var email = Session.getEffectiveUser().getEmail().toLowerCase();
  var res = cargarTodo_(ss, email, r1.getResponseText().trim(), clave);
  ui.alert('Instalación terminada.\n\n' + res + '\n\nSiguiente paso: Implementar > Nueva implementación (ver la guía).');
}

/** Crea las hojas y carga los datos. Separado de instalar() para poder probarlo sin interfaz. */
function cargarTodo_(ss, email, nombre, clave) {
  var colores = { 'Maestras': '#dbe8f6', 'Parámetros': '#fff2cc', 'Hechos': '#d9ead3', 'Control': '#e6e6e6' };
  Object.keys(SCHEMA).forEach(function (t) {
    var sh = ss.insertSheet(t);
    var h = headersDe(t);
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground(colores[SCHEMA[t].grupo]);
    sh.setFrozenRows(1);
  });
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s) ss.deleteSheet(s); });

  var ahora = new Date();
  var aud = { CreadoEl: ahora, CreadoPor: email + ' (instalación)', ModificadoEl: '', ModificadoPor: '', Activo: 'Sí' };
  var escribir = function (tabla, filas) {
    if (!filas.length) return;
    var data = filas.map(function (f) { var o = {}; Object.keys(aud).forEach(function (k) { o[k] = aud[k]; }); Object.keys(f).forEach(function (k) { o[k] = f[k]; }); return aFila_(tabla, o); });
    ss.getSheetByName(tabla).getRange(2, 1, data.length, data[0].length).setValues(data);
  };
  var FUENTE_PLANILLA = 'GRUPO 6 Planillas de datos 3';

  escribir('D_UnidadNeg', [
    { IdUnidad: 'N1', Nombre: 'Ovino', TipoActividad: 'Ganadera' }, { IdUnidad: 'N2', Nombre: 'Bovino', TipoActividad: 'Ganadera' },
    { IdUnidad: 'N3', Nombre: 'Porcino', TipoActividad: 'Ganadera' }, { IdUnidad: 'N4', Nombre: 'Maíz', TipoActividad: 'Agrícola' },
    { IdUnidad: 'N5', Nombre: 'Soja', TipoActividad: 'Agrícola' }]);
  escribir('D_Subunidad', [
    { IdSubunidad: 'SUB-000001', IdUnidad: 'N1', Nombre: 'Cría', Descripcion: 'Madres, carneros y corderos desde el nacimiento hasta el destete (aprox. 3 meses)' },
    { IdSubunidad: 'SUB-000002', IdUnidad: 'N1', Nombre: 'Recría', Descripcion: 'Borregos/as de 3 a 12 meses (más de 16 kg y hasta 40 kg)' },
    { IdSubunidad: 'SUB-000003', IdUnidad: 'N1', Nombre: 'Engorde', Descripcion: 'Animales en terminación para venta o faena' }]);

  var cuentas = [
    ['1.01.01.01', 'Caja', 'N'], ['1.01.03.02', 'Deudores por ventas', 'M'], ['1.01.04.01', 'IVA Crédito Fiscal', 'M'],
    ['1.01.04.04', 'Retenciones practicadas', 'M'], ['1.01.05.01.001', 'Ovino Madre', 'N'], ['1.01.05.01.002', 'Carneros', 'N'],
    ['1.01.05.01.003', 'Borregos', 'N'], ['1.01.05.01.004', 'Borregas', 'N'], ['1.01.05.01.005', 'Corderos', 'N'],
    ['1.01.05.07.004', 'Alim balanceado y premezclas', 'N'], ['1.01.05.07.005', 'Productos veterinarios', 'N'],
    ['1.01.05.09.001', 'Carnero (activo biológico de producción)', 'N'], ['1.01.05.09.002', 'Oveja (activo biológico de producción)', 'N'],
    ['2.01.01.01', 'Proveedores', 'N'], ['2.01.04.01', 'IVA Débito Fiscal', 'M'], ['2.01.05.01', 'Mano de obra propia', 'M'],
    ['4.01.02', 'Ventas de hacienda ovina', 'N'], ['4.01.05', 'Venta de reproductores', 'N'],
    ['4.05.02.01', 'Pasturas y Recurso forrajero', 'N'], ['4.05.02.02', 'Sanidad', 'N'], ['4.05.02.03', 'Faena a Facon y Serv de planta', 'N'],
    ['4.05.02.04', 'Flete y Tránsito Ovino', 'N'], ['4.05.02.05', 'Mano de Obra (Capataz)', 'N'], ['4.05.02.06', 'Est de corrales y alambrados', 'N'],
    ['4.05.02.07', 'Cordero en crecimiento', 'N'], ['4.05.05', 'Costos indirectos a distribuir', 'N'], ['4.05.07', 'Gastos de comercialización', 'N'],
    ['5.01.01', 'Ovino Madre (cabezas)', 'N'], ['5.01.02', 'Carneros (cabezas)', 'N'], ['5.01.03', 'Borregos (cabezas)', 'N'],
    ['5.01.04', 'Borregas (cabezas)', 'N'], ['5.01.05', 'Corderos (cabezas)', 'N'], ['5.02.01', 'Kilos producidos y vendidos', 'N'],
    ['5.02.02', 'Alim cons por etapa y por especie', 'N'], ['5.02.05', 'Días de perm y gcias de peso', 'N']];
  var idCta = {};
  escribir('D_Cuenta', cuentas.map(function (c, i) {
    var id = 'CTA-' + ('000000' + (i + 1)).slice(-6); idCta[c[0]] = id;
    return { IdCuenta: id, Codigo: c[0], Nombre: c[1], Tipo: c[2], SignificadoTipo: 'Pendiente de confirmar con la cátedra' };
  }));

  var ums = [['Unidad', 'un'], ['Gramo', 'g'], ['Kilogramo', 'kg'], ['Quintal', 'qq'], ['Tonelada', 't'], ['Mililitro', 'mL'], ['Litro', 'L'],
    ['Metro cúbico', 'm³'], ['Metro', 'm'], ['Metro cuadrado', 'm²'], ['Hectárea', 'has'], ['Bolsa', 'bol'], ['Caja', 'cj'], ['Paquete', 'pqt'],
    ['Bidón', 'bid'], ['Tambor', 'tbr'], ['Saco', 'sc'], ['Litro por hectárea', 'L/has'], ['Kilogramo por hectárea', 'kg/has'],
    ['Metro cúbico por hectárea', 'm³/has'], ['Cabeza', 'cab'], ['Hora', 'h'], ['Jornal', 'J'], ['Día', 'd'], ['Kilómetro', 'km']];
  var idUM = {};
  escribir('D_UM', ums.map(function (u, i) { var id = 'UM-' + ('000000' + (i + 1)).slice(-6); idUM[u[1]] = id; return { IdUM: id, Nombre: u[0], Abreviatura: u[1] }; }));
  escribir('D_Conversion', [['g', 'kg', 0.001], ['qq', 'kg', 100], ['t', 'kg', 1000], ['mL', 'L', 0.001], ['m³', 'L', 1000]].map(function (c, i) {
    return { IdConversion: 'CNV-' + ('000000' + (i + 1)).slice(-6), IdUMOrigen: idUM[c[0]], IdUMDestino: idUM[c[1]], Factor: c[2] };
  }));

  escribir('D_Categoria', [
    { IdCategoria: 'CAT-000001', Nombre: 'Oveja', IdSubunidad: 'SUB-000001', RangoPeso: 'Adulto reproductor, más de 40 kg', IdCuentaExistencia: idCta['1.01.05.01.001'] },
    { IdCategoria: 'CAT-000002', Nombre: 'Carnero', IdSubunidad: 'SUB-000001', RangoPeso: 'Adulto reproductor, más de 40 kg', IdCuentaExistencia: idCta['1.01.05.01.002'] },
    { IdCategoria: 'CAT-000003', Nombre: 'Borrego', IdSubunidad: 'SUB-000002', RangoPeso: 'Más de 16 kg y hasta 40 kg', IdCuentaExistencia: idCta['1.01.05.01.003'] },
    { IdCategoria: 'CAT-000004', Nombre: 'Borrega', IdSubunidad: 'SUB-000002', RangoPeso: 'Más de 16 kg y hasta 40 kg', IdCuentaExistencia: idCta['1.01.05.01.004'] },
    { IdCategoria: 'CAT-000005', Nombre: 'Cordero', IdSubunidad: 'SUB-000001', RangoPeso: 'Hasta el destete, aprox. 16 kg', IdCuentaExistencia: idCta['1.01.05.01.005'] }]);
  var idCat = { 'Oveja': 'CAT-000001', 'Carnero': 'CAT-000002', 'Borrego': 'CAT-000003', 'Borrega': 'CAT-000004', 'Cordero': 'CAT-000005' };

  escribir('D_Campana', [
    { IdCampana: 'CAM-000001', Nombre: 'Campaña 2025', FechaDesde: '2025-07-01', FechaHasta: '2026-06-30' },
    { IdCampana: 'CAM-000002', Nombre: 'Campaña 2026', FechaDesde: '2026-07-01', FechaHasta: '2027-06-30' }]);
  escribir('D_Moneda', [{ IdMoneda: 'MON-000001', Nombre: 'Peso argentino', Simbolo: '$' }, { IdMoneda: 'MON-000002', Nombre: 'Dólar estadounidense', Simbolo: 'US$' }]);
  escribir('D_Tercero', [
    { IdTercero: 'TER-000001', CUIT: '30-69855753-9', RazonSocial: 'La Campana', Tipo: 'Cliente', CondicionIVA: 'Responsable inscripto' },
    { IdTercero: 'TER-000002', CUIT: '30-71013891-1', RazonSocial: 'Frigorífico Livorno', Tipo: 'Cliente', CondicionIVA: 'Responsable inscripto' },
    { IdTercero: 'TER-000003', CUIT: '33-71758819-9', RazonSocial: 'Agropecuaria Punillita S.A.S', Tipo: 'Cliente', CondicionIVA: 'Responsable inscripto' },
    { IdTercero: 'TER-000004', CUIT: '30-66926326-7', RazonSocial: 'Frigorífico San Javier Caprinos S.R.L', Tipo: 'Cliente', CondicionIVA: 'Responsable inscripto' }]);
  escribir('D_Producto', [{ IdProducto: 'PRO-000001', Nombre: 'Cordero en pie (kg vivo)', IdUM: idUM['kg'], IdCuenta: idCta['4.01.02'], AlicuotaIVA: 10.5 }]);
  escribir('D_Insumo', [
    { IdInsumo: 'INS-000001', Nombre: 'Alimentación y suplementación', IdUM: idUM['cab'], IdCuenta: idCta['4.05.02.01'], TipoCosto: 'Directo', Variabilidad: 'Variable' },
    { IdInsumo: 'INS-000002', Nombre: 'Sanidad (vacuna + antiparasitario)', IdUM: idUM['cab'], IdCuenta: idCta['4.05.02.02'], TipoCosto: 'Directo', Variabilidad: 'Variable' },
    { IdInsumo: 'INS-000003', Nombre: 'Faena a façon / servicio de planta', IdUM: idUM['cab'], IdCuenta: idCta['4.05.02.03'], TipoCosto: 'Directo', Variabilidad: 'Variable' },
    { IdInsumo: 'INS-000004', Nombre: 'Flete y tránsito', IdUM: idUM['km'], IdCuenta: idCta['4.05.02.04'], TipoCosto: 'Directo', Variabilidad: 'Variable' },
    { IdInsumo: 'INS-000005', Nombre: 'Mano de obra (capataz)', IdUM: idUM['un'], IdCuenta: idCta['4.05.02.05'], TipoCosto: 'Indirecto', Variabilidad: 'Fijo' },
    { IdInsumo: 'INS-000006', Nombre: 'Mantenimiento de corrales y alambrados', IdUM: idUM['un'], IdCuenta: idCta['4.05.02.06'], TipoCosto: 'Indirecto', Variabilidad: 'Fijo' }]);

  var animales = DATOS_ANIMALES.split(';').map(function (s) {
    var p = s.split('|');
    return { Caravana: Number(p[0]), IdCategoria: idCat[p[2]], FechaNac: p[1], PesoKg: Number(p[4]), EstadoRepro: p[3],
      Estado: p[5] ? 'Vendido' : 'Activo', FechaBaja: p[5], Observaciones: 'Planilla de existencias (' + FUENTE_PLANILLA + ')' };
  });
  escribir('D_Animal', animales);

  escribir('F_PrecioProd', [{ IdPrecioProd: 'PPR-000001', IdProducto: 'PRO-000001', Fecha: '2025-12-20', Precio: 3000, IdMoneda: 'MON-000001',
    PrecioIncluyeIVA: 'Sí', Fuente: 'Factura FAV 0003-000005858 a La Campana (precio real de venta)' }]);

  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var ventas = DATOS_VENTA.split(';').map(function (s, i) {
    var p = s.split('|'); var kg = Number(p[1]); var total = r2(kg * 3000); var neto = r2(total / 1.105);
    return { IdIngreso: 'ING-' + ('000000' + (i + 1)).slice(-6), Fecha: '2025-12-20', IdCampana: 'CAM-000001', Comprobante: 'FAV 0003-000005858',
      IdTercero: 'TER-000001', IdProducto: 'PRO-000001', IdSubunidad: 'SUB-000001', Caravana: Number(p[0]), Kg: kg, PrecioKg: 3000,
      PrecioIncluyeIVA: 'Sí', AlicuotaIVA: 10.5, ImporteNeto: neto, IVA: r2(total - neto), Total: total, EstadoCobro: 'Cobrado',
      Fuente: 'Planilla de movimientos y financiera (' + FUENTE_PLANILLA + ')' };
  });
  escribir('F_Ingresos', ventas);
  escribir('F_Produccion', [{ IdProduccion: 'PRD-000001', Fecha: '2025-12-20', IdCampana: 'CAM-000001', IdSubunidad: 'SUB-000001', KgProducidos: 565,
    CabezasBase: 64, RindeReal: Math.round(565 / 64 * 10000) / 10000, Descripcion: 'Kg de cordero vendidos al destete por madre en servicio (30 corderos)',
    Fuente: 'Planilla de existencias y de movimientos (' + FUENTE_PLANILLA + ')' }]);

  var SUP = 'SUPUESTO del trabajo del 14/09 (archivo "entrar a este 1", hoja 1_Datos y Fuentes). No es un comprobante real.';
  escribir('F_Costos', [
    ['INS-000001', 69, 4500], ['INS-000002', 69, 2000], ['INS-000003', 30, 3000], ['INS-000005', 1, 600000], ['INS-000006', 1, 200000]
  ].map(function (c, i) {
    return { IdCosto: 'COS-' + ('000000' + (i + 1)).slice(-6), Fecha: '2025-12-20', IdCampana: 'CAM-000001', Comprobante: '', IdTercero: '',
      IdInsumo: c[0], IdSubunidad: 'SUB-000001', Cantidad: c[1], PrecioUnit: c[2], Importe: c[1] * c[2], EsSupuesto: 'Sí', Fuente: SUP };
  }));

  var sal = Utilities.getUuid();
  escribir('S_Usuarios', [{ Email: email, Nombre: nombre, Rol: 'Administrador', IdSubunidad: '', ClaveHash: hash_(sal, clave), Sal: sal }]);
  ss.getSheetByName('S_Auditoria').appendRow(['AUD-000001', new Date(), email, 'Instalación', '(todas)', '', '', 'Tablas creadas y datos reales cargados']);

  // Costos supuestos en naranja, para que nunca se confundan con reales
  var shC = ss.getSheetByName('F_Costos');
  var colSup = headersDe('F_Costos').indexOf('EsSupuesto') + 1;
  var letra = String.fromCharCode(64 + colSup);
  var regla = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$' + letra + '2="Sí"').setBackground('#fce5cd')
    .setRanges([shC.getRange(2, 1, 1000, headersDe('F_Costos').length)]).build();
  shC.setConditionalFormatRules([regla]);

  var leeme = ss.insertSheet('LEEME', 0);
  leeme.getRange(1, 1, 9, 1).setValues([
    ['SISTEMA DE GESTIÓN OVINA · Pozo del Carril – La Aguada · Grupo 6'],
    ['Esta planilla es la BASE DE DATOS del sistema. No se edita a mano: los datos se cargan desde la aplicación web, que valida y deja auditoría.'],
    ['No compartas esta planilla con nadie. Los usuarios entran solo por el link de la aplicación.'],
    ['Colores de encabezado: celeste = tablas maestras · amarillo = parámetros · verde = hechos · gris = control.'],
    ['Filas naranjas en F_Costos = costos SUPUESTOS (no reales).'],
    ['Datos reales cargados desde: ' + FUENTE_PLANILLA + ' (existencias, movimientos, financiera, parámetros) y plan de cuentas (Anexo I).'],
    ['Animales: ' + animales.length + ' · Ventas: ' + ventas.length + ' renglones (FAV 0003-000005858) · Instalado el ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm') + ' por ' + email],
    [''], ['Menú "Sistema Ovino" > "Ver link de la aplicación" muestra la dirección web una vez implementada.']]);
  leeme.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  leeme.setColumnWidth(1, 900);

  return Object.keys(SCHEMA).length + ' tablas creadas · ' + animales.length + ' animales · ' + ventas.length + ' renglones de venta · 5 costos supuestos (en naranja) · usuario administrador: ' + email;
}