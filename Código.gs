/**
 * SISTEMA DE GESTIÓN OVINA — Pozo del Carril – La Aguada (Grupo 6, Taller de Práctica II, FCE UNRC)
 * Versión 2 · octubre 2026
 * ---------------------------------------------------------------------------------------------
 * BACKEND (Google Apps Script). Toda la lógica crítica vive acá: login, permisos, validaciones,
 * generación de Ids, auditoría y cálculo de indicadores. La pantalla (Index.html) solo pide cosas;
 * este archivo decide si se pueden hacer.
 *
 * Datos: cada hoja de la planilla es una tabla (fila 1 = encabezados, una fila = un registro).
 * Las columnas se leen y escriben POR NOMBRE de encabezado, así se pueden agregar columnas nuevas
 * sin romper los datos que ya estaban (ver actualizar() en Instalar.gs).
 *
 * Novedades v3.0 (octubre 2026): menú lateral; INDICADORES (Cuadro de Mando Integral con semáforo, metas editables);
 *   COTIZACIONES (granos de la Bolsa de Rosario automáticas, Cañuelas experimental, links guardados);
 *   IMPUESTOS (vencimientos con semáforo); UNIDADES de Pozo del Carril con link a la app de cada grupo;
 *   responsable de "todas las etapas"; presupuesto por rubro; datos nuevos del dueño (15/10/2026). Ver Version3.gs.
 * Novedades v2.1: cotización del dólar oficial del Banco Nación (se actualiza sola todos los días) e importes en US$;
 *   cobros y pagos (recibos) aplicados a facturas, con saldo pendiente.
 * Novedades v2: sanidad (vacunas y tratamientos con días de carencia), compras con factura y
 * renglones, proveedores, muertes, nacimientos con madre y padre, formas de pago y tipos de
 * comprobante, alta rápida de productos, bloqueo de venta de animales en carencia.
 */

var TZ = 'America/Argentina/Buenos_Aires';
var VERSION = '3.7';
var AUDIT_COLS = ['CreadoEl', 'CreadoPor', 'ModificadoEl', 'ModificadoPor', 'Activo'];
var ROLES = ['Administrador', 'Operador de carga', 'Consulta / auditoría']; // v3.5: se quitó "Responsable de subunidad" (el Operador de carga hace lo mismo)
var SESION_SEGUNDOS = 6 * 60 * 60;

/** Rubros de gasto: cada producto nuevo hereda la cuenta del Anexo I y la clasificación del costo. */
var RUBROS = {
  'Sanidad':          { cuenta: '4.05.02.02', tipo: 'Directo',   variab: 'Variable' },
  'Alimentación':     { cuenta: '4.05.02.01', tipo: 'Directo',   variab: 'Variable' },
  'Faena':            { cuenta: '4.05.02.03', tipo: 'Directo',   variab: 'Variable' },
  'Flete':            { cuenta: '4.05.02.04', tipo: 'Directo',   variab: 'Variable' },
  'Comercialización': { cuenta: '4.05.07',    tipo: 'Directo',   variab: 'Variable' },
  'Mano de obra':     { cuenta: '4.05.02.05', tipo: 'Indirecto', variab: 'Fijo' },
  'Mantenimiento':    { cuenta: '4.05.02.06', tipo: 'Indirecto', variab: 'Fijo' },
  'Otros indirectos': { cuenta: '4.05.05',    tipo: 'Indirecto', variab: 'Fijo' },
  'Amortización':     { cuenta: '4.05.02.08', tipo: 'Indirecto', variab: 'Fijo' },
  'Reposición de madres': { cuenta: '4.05.02.09', tipo: 'Indirecto', variab: 'Fijo' }
};
var PERSPECTIVAS = ['Financiera', 'Clientes', 'Procesos internos', 'Aprendizaje y desarrollo'];
var TODAS = '*'; // valor de "Etapa a cargo" cuando el responsable ve todas las etapas
function miEtapa_(u, sub) { return u.IdSubunidad === TODAS || String(u.IdSubunidad) === String(sub); }

/* =============================================================================================
 * 1. ESQUEMA: qué tablas existen, qué campos tienen y cómo se relacionan.
 *    t = tipo (text, num, date, bool, enum, email) · req = obligatorio · fk = tabla a la que apunta
 *    calc = lo calcula el sistema · min = valor mínimo · hidden = nunca sale del backend
 *    l = nombre que ve el usuario en pantalla
 * ============================================================================================= */
var SCHEMA = {
  // ---------- MAESTRAS ----------
  D_UnidadNeg: { grupo: 'Maestras', titulo: 'Unidades de negocio', pk: 'IdUnidad', prefijo: 'N', label: 'Nombre',
    cols: [{ n: 'IdUnidad', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'TipoActividad', l: 'Tipo de actividad' },
      { n: 'Descripcion', l: 'Descripción' }, { n: 'LinkApp', l: 'Link de la aplicación de esa unidad (si tiene)' }] },
  D_Subunidad: { grupo: 'Maestras', titulo: 'Subunidades (etapas)', pk: 'IdSubunidad', prefijo: 'SUB', label: 'Nombre',
    cols: [{ n: 'IdSubunidad', l: 'Código' }, { n: 'IdUnidad', req: true, fk: 'D_UnidadNeg', l: 'Unidad de negocio' },
      { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'Descripcion', l: 'Descripción' }] },
  D_Categoria: { grupo: 'Maestras', titulo: 'Categorías de hacienda', pk: 'IdCategoria', prefijo: 'CAT', label: 'Nombre',
    cols: [{ n: 'IdCategoria', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' },
      { n: 'RangoPeso', l: 'Rango de peso' }, { n: 'IdCuentaExistencia', fk: 'D_Cuenta', l: 'Cuenta de existencia' }] },
  D_Animal: { grupo: 'Maestras', titulo: 'Animales (caravanas)', pk: 'Caravana', pkManual: true, label: 'Caravana',
    cols: [{ n: 'Caravana', t: 'num', req: true, min: 1, l: 'Caravana' }, { n: 'IdCategoria', req: true, fk: 'D_Categoria', l: 'Categoría' },
      { n: 'FechaNac', t: 'date', req: true, l: 'Fecha de nacimiento' }, { n: 'PesoKg', t: 'num', min: 0, l: 'Peso (kg)' },
      { n: 'Sexo', t: 'enum', opts: ['Hembra', 'Macho'], l: 'Sexo' },
      { n: 'Madre', t: 'num', l: 'Caravana de la madre' }, { n: 'Padre', t: 'num', l: 'Caravana del padre' },
      { n: 'EstadoRepro', t: 'enum', opts: ['Preñada', 'Vacía', 'Lactando', 'En servicio', 'Optimo', 'No aplica'], l: 'Estado reproductivo' },
      { n: 'Estado', t: 'enum', opts: ['Activo', 'Vendido', 'Muerto'], calc: true, l: 'Estado' }, { n: 'FechaBaja', t: 'date', calc: true, l: 'Fecha de baja' },
      { n: 'Observaciones', l: 'Observaciones' }] },
  D_Producto: { grupo: 'Maestras', titulo: 'Productos que se venden', pk: 'IdProducto', prefijo: 'PRO', label: 'Nombre',
    cols: [{ n: 'IdProducto', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'IdUM', req: true, fk: 'D_UM', l: 'Unidad' },
      { n: 'IdCuenta', req: true, fk: 'D_Cuenta', l: 'Cuenta contable' }, { n: 'AlicuotaIVA', t: 'num', req: true, min: 0, l: 'IVA %' }] },
  D_Insumo: { grupo: 'Maestras', titulo: 'Insumos y servicios (lo que se compra)', pk: 'IdInsumo', prefijo: 'INS', label: 'Nombre',
    cols: [{ n: 'IdInsumo', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' },
      { n: 'Rubro', t: 'enum', opts: Object.keys(RUBROS), l: 'Rubro' },
      { n: 'IdUM', req: true, fk: 'D_UM', l: 'Unidad en que se usa' },
      { n: 'ContenidoEnvase', t: 'num', min: 0, l: 'Contenido de cada envase (en esa unidad)' },
      { n: 'IdCuenta', req: true, fk: 'D_Cuenta', l: 'Cuenta contable' },
      { n: 'TipoCosto', t: 'enum', req: true, opts: ['Directo', 'Indirecto'], l: 'Directo / indirecto' },
      { n: 'Variabilidad', t: 'enum', opts: ['Variable', 'Fijo'], l: 'Fijo / variable' }] },
  D_Cuenta: { grupo: 'Maestras', titulo: 'Plan de cuentas (Anexo I)', pk: 'IdCuenta', prefijo: 'CTA', label: ['Codigo', 'Nombre'],
    cols: [{ n: 'IdCuenta', l: 'Id' }, { n: 'Codigo', req: true, unico: true, l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' },
      { n: 'Tipo', t: 'enum', opts: ['C', 'M', 'N'], l: 'Tipo' }, { n: 'SignificadoTipo', l: 'Qué significa el tipo' },
      { n: 'Observaciones', l: 'Observaciones' }] },
  D_UM: { grupo: 'Maestras', titulo: 'Unidades de medida', pk: 'IdUM', prefijo: 'UM', label: 'Nombre',
    cols: [{ n: 'IdUM', l: 'Id' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'Abreviatura', req: true, l: 'Abreviatura' }] },
  D_Conversion: { grupo: 'Maestras', titulo: 'Conversiones de unidades', pk: 'IdConversion', prefijo: 'CNV', label: 'IdConversion',
    cols: [{ n: 'IdConversion', l: 'Id' }, { n: 'IdUMOrigen', req: true, fk: 'D_UM', l: 'De' }, { n: 'IdUMDestino', req: true, fk: 'D_UM', l: 'A' },
      { n: 'Factor', t: 'num', req: true, min: 0.0000001, l: 'Factor' }] },
  D_Campana: { grupo: 'Maestras', titulo: 'Campañas', pk: 'IdCampana', prefijo: 'CAM', label: 'Nombre',
    cols: [{ n: 'IdCampana', l: 'Id' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'FechaDesde', t: 'date', req: true, l: 'Desde' },
      { n: 'FechaHasta', t: 'date', req: true, l: 'Hasta' }, { n: 'IdUnidad', fk: 'D_UnidadNeg', l: 'Unidad (vacío = Ovino)' },
      { n: 'Estado', t: 'enum', opts: ['Planificación', 'Activa', 'Cerrada'], l: 'Estado' }] },
  D_Moneda: { grupo: 'Maestras', titulo: 'Monedas', pk: 'IdMoneda', prefijo: 'MON', label: 'Nombre',
    cols: [{ n: 'IdMoneda', l: 'Id' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'Simbolo', req: true, l: 'Símbolo' }] },
  D_Tercero: { grupo: 'Maestras', titulo: 'Clientes y proveedores', pk: 'IdTercero', prefijo: 'TER', label: 'RazonSocial',
    cols: [{ n: 'IdTercero', l: 'Código' }, { n: 'RazonSocial', req: true, l: 'Nombre o razón social' },
      { n: 'Tipo', t: 'enum', req: true, opts: ['Proveedor', 'Cliente', 'Cliente y proveedor'], l: 'Es' },
      { n: 'CUIT', l: 'CUIT' },
      { n: 'CondicionIVA', t: 'enum', opts: ['Responsable inscripto', 'Monotributo', 'Exento', 'Consumidor final'], l: 'Condición frente al IVA' },
      { n: 'Rubro', l: 'Qué vende o compra' }, { n: 'Telefono', l: 'Teléfono' }, { n: 'Localidad', l: 'Localidad' },
      { n: 'Observaciones', l: 'Observaciones' }] },
  D_FormaPago: { grupo: 'Maestras', titulo: 'Formas de pago', pk: 'IdFormaPago', prefijo: 'FP', label: 'Nombre',
    cols: [{ n: 'IdFormaPago', l: 'Id' }, { n: 'Nombre', req: true, l: 'Forma de pago' }] },
  D_LinkCotizacion: { grupo: 'Maestras', titulo: 'Páginas de cotizaciones (links)', pk: 'IdLink', prefijo: 'LNK', label: 'Nombre',
    cols: [{ n: 'IdLink', l: 'Id' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'URL', req: true, l: 'Link (https://…)' },
      { n: 'Producto', l: 'Qué cotiza' }, { n: 'Descripcion', l: 'Descripción' }] },
  D_Impuesto: { grupo: 'Maestras', titulo: 'Impuestos que se pagan', pk: 'IdImpuesto', prefijo: 'IMP', label: 'Nombre',
    cols: [{ n: 'IdImpuesto', l: 'Id' }, { n: 'Nombre', req: true, l: 'Impuesto' },
      { n: 'Organismo', t: 'enum', req: true, opts: ['ARCA (nacional)', 'Rentas Córdoba (provincial)', 'Municipalidad', 'Otro'], l: 'Organismo' },
      { n: 'Periodicidad', t: 'enum', req: true, opts: ['Mensual', 'Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual'], l: 'Cada cuánto' },
      { n: 'TipoVencimiento', t: 'enum', req: true, opts: ['Según terminación de CUIT', 'Fecha fija'], l: 'Cómo vence' },
      { n: 'DiaFijo', t: 'num', min: 1, l: 'Día del mes (si es fecha fija)' }, { n: 'MesesFijos', l: 'Meses en que vence (ej. 3,7,11; vacío = según cada cuánto)' },
      { n: 'AvisarDiasAntes', t: 'num', min: 0, l: 'Avisar con cuántos días' }, { n: 'LinkConsulta', l: 'Link para consultar' }, { n: 'Descripcion', l: 'Descripción' }] },
  D_TipoComprobante: { grupo: 'Maestras', titulo: 'Tipos de comprobante', pk: 'Codigo', pkManual: true, label: ['Codigo', 'Nombre'],
    cols: [{ n: 'Codigo', req: true, l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' },
      { n: 'Circuito', t: 'enum', req: true, opts: ['Venta', 'Compra', 'Cobro', 'Pago'], l: 'Circuito' },
      { n: 'Signo', t: 'num', req: true, l: 'Signo (+1 suma, −1 resta)' }] },

  // ---------- PARÁMETROS ----------
  F_EstandarRinde: { grupo: 'Parámetros', titulo: 'Rinde estándar', pk: 'IdRinde', prefijo: 'RIN', label: 'IdRinde',
    cols: [{ n: 'IdRinde', l: 'Id' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' }, { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' },
      { n: 'Valor', t: 'num', req: true, min: 0.0000001, l: 'Valor' }, { n: 'Descripcion', req: true, l: 'Qué mide' }, { n: 'Fuente', req: true, l: 'Fuente' },
      { n: 'FechaFuente', t: 'date', req: true, l: 'Fecha de la fuente' }] },
  F_Dosis: { grupo: 'Parámetros', titulo: 'Dosis técnica', pk: 'IdDosis', prefijo: 'DOS', label: 'IdDosis',
    cols: [{ n: 'IdDosis', l: 'Id' }, { n: 'IdInsumo', req: true, fk: 'D_Insumo', l: 'Insumo' }, { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' },
      { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' }, { n: 'DosisPorBase', t: 'num', req: true, min: 0.0000001, l: 'Dosis por base' },
      { n: 'BaseCalculo', t: 'enum', req: true, opts: ['Cabeza', 'Kg'], l: 'Base' }, { n: 'Fuente', req: true, l: 'Fuente' },
      { n: 'FechaFuente', t: 'date', req: true, l: 'Fecha de la fuente' }] },
  F_Escenario: { grupo: 'Hechos', titulo: 'Escenarios guardados (qué pasaría si…)', pk: 'IdEscenario', prefijo: 'ESC', label: 'Nombre',
    cols: [{ n: 'IdEscenario', l: 'Id' }, { n: 'Nombre', req: true, l: 'Nombre del escenario' }, { n: 'IdCampana', fk: 'D_Campana', l: 'Campaña base' },
      { n: 'Supuestos', req: true, l: 'Supuestos (JSON)' }, { n: 'Resultado', l: 'Resultado (JSON)' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_HistoriaInd: { grupo: 'Control', titulo: 'Historia de indicadores (copia analítica diaria)', pk: 'IdHistoria', prefijo: 'HIS', label: 'IdHistoria', soloLectura: true, sinAuditoria: true,
    cols: [{ n: 'IdHistoria', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', l: 'Campaña' }, { n: 'IdIndicador', req: true, l: 'Indicador' },
      { n: 'Valor', t: 'num', l: 'Valor' }, { n: 'Estado', l: 'Semáforo' }] },
  F_PrecioIns: { grupo: 'Parámetros', titulo: 'Precios reales de insumos', pk: 'IdPrecioIns', prefijo: 'PIN', label: 'IdPrecioIns',
    cols: [{ n: 'IdPrecioIns', l: 'Id' }, { n: 'IdInsumo', req: true, fk: 'D_Insumo', l: 'Insumo' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' },
      { n: 'Precio', t: 'num', req: true, min: 0.0000001, l: 'Precio' }, { n: 'IdMoneda', req: true, fk: 'D_Moneda', l: 'Moneda' }, { n: 'Fuente', req: true, l: 'Fuente' }] },
  F_PrecioProd: { grupo: 'Parámetros', titulo: 'Precios reales de productos', pk: 'IdPrecioProd', prefijo: 'PPR', label: 'IdPrecioProd',
    cols: [{ n: 'IdPrecioProd', l: 'Id' }, { n: 'IdProducto', req: true, fk: 'D_Producto', l: 'Producto' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' },
      { n: 'Precio', t: 'num', req: true, min: 0.0000001, l: 'Precio' }, { n: 'IdMoneda', req: true, fk: 'D_Moneda', l: 'Moneda' },
      { n: 'PrecioIncluyeIVA', t: 'enum', opts: ['Sí', 'No', 'Sin dato'], req: true, l: '¿Incluye IVA?' }, { n: 'Fuente', req: true, l: 'Fuente' },
      { n: 'TipoPrecio', t: 'enum', opts: ['Venta propia', 'Referencia de mercado'], l: 'Tipo de precio' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_TipoCambio: { grupo: 'Parámetros', titulo: 'Dólar oficial Banco Nación (cotizaciones)', pk: 'Fecha', pkManual: true, label: 'Fecha',
    cols: [{ n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'Comprador', t: 'num', req: true, min: 0.0000001, l: 'Comprador ($ por US$)' },
      { n: 'Vendedor', t: 'num', req: true, min: 0.0000001, l: 'Vendedor ($ por US$)' }, { n: 'Fuente', req: true, l: 'Fuente' },
      { n: 'Origen', t: 'enum', opts: ['Automático', 'Manual'], l: 'Cómo se cargó' }] },

  F_Presupuesto: { grupo: 'Parámetros', titulo: 'Presupuesto por rubro', pk: 'IdPresupuesto', prefijo: 'PRE', label: 'IdPresupuesto',
    cols: [{ n: 'IdPresupuesto', l: 'Id' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' },
      { n: 'Rubro', t: 'enum', req: true, opts: Object.keys(RUBROS), l: 'Rubro' }, { n: 'IdSubunidad', fk: 'D_Subunidad', l: 'Etapa (opcional)' },
      { n: 'Importe', t: 'num', req: true, min: 0, l: 'Importe presupuestado ($)' }, { n: 'Fuente', req: true, l: 'Fuente' }] },
  P_Indicador: { grupo: 'Parámetros', titulo: 'Indicadores: metas y textos (CMI)', pk: 'IdIndicador', pkManual: true, label: 'Nombre',
    cols: [{ n: 'IdIndicador', req: true, l: 'Código' }, { n: 'Perspectiva', t: 'enum', req: true, opts: PERSPECTIVAS, l: 'Perspectiva' },
      { n: 'Objetivo', l: 'Objetivo estratégico' }, { n: 'Nombre', req: true, l: 'Indicador' }, { n: 'Formula', l: 'Fórmula' },
      { n: 'Interpretacion', l: 'Cómo se interpreta' }, { n: 'Unidad', l: 'Unidad' },
      { n: 'Sentido', t: 'enum', req: true, opts: ['Mayor es mejor', 'Menor es mejor', 'Cerca de cero es mejor'], l: 'Sentido' },
      { n: 'MetaVerde', t: 'num', l: 'Meta (verde)' }, { n: 'MetaAmarillo', t: 'num', l: 'Alerta (amarillo)' }, { n: 'FuenteMeta', l: 'De dónde sale la meta' },
      { n: 'Periodicidad', l: 'Cada cuánto se mide' }, { n: 'Responsable', l: 'Responsable' }, { n: 'Decision', l: 'Qué hacer si empeora' },
      { n: 'ValorManual', t: 'num', l: 'Valor cargado a mano (solo indicadores sin cálculo automático)' }, { n: 'Orden', t: 'num', l: 'Orden' },
      { n: 'IdUnidad', fk: 'D_UnidadNeg', l: 'Unidad (vacío = Ovino)' }] },
  F_Cotizacion: { grupo: 'Parámetros', titulo: 'Cotizaciones (granos y hacienda)', pk: 'IdCotizacion', prefijo: 'COT', label: 'IdCotizacion',
    cols: [{ n: 'IdCotizacion', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'Producto', req: true, l: 'Producto' },
      { n: 'Mercado', req: true, l: 'Mercado o fuente' }, { n: 'Precio', t: 'num', req: true, min: 0.0000001, l: 'Precio' }, { n: 'Unidad', req: true, l: 'Unidad (ej. $/t, $/kg vivo)' },
      { n: 'Origen', t: 'enum', opts: ['Automático', 'Manual'], l: 'Cómo se cargó' }, { n: 'Link', l: 'Link' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_VencImpuesto: { grupo: 'Parámetros', titulo: 'Calendario de vencimientos de impuestos', pk: 'IdVenc', prefijo: 'VEN', label: 'IdVenc',
    cols: [{ n: 'IdVenc', l: 'Id' }, { n: 'IdImpuesto', req: true, fk: 'D_Impuesto', l: 'Impuesto' }, { n: 'Periodo', req: true, l: 'Período (aaaa-mm)' },
      { n: 'Terminacion', t: 'enum', req: true, opts: ['Todas', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], l: 'Terminación de CUIT' },
      { n: 'FechaVencimiento', t: 'date', req: true, l: 'Vence el' }, { n: 'Estado', t: 'enum', req: true, opts: ['Confirmado', 'Estimado'], l: 'Estado' },
      { n: 'Fuente', l: 'Fuente' }] },

  // ---------- HECHOS ----------
  F_Ingresos: { grupo: 'Hechos', titulo: 'Ingresos (ventas)', pk: 'IdIngreso', prefijo: 'ING', label: 'IdIngreso', hecho: true,
    soloFormulario: true, editablesDespues: ['EstadoCobro', 'Fuente'] /* el número de factura lo pone el sistema: no se edita */,
    cols: [{ n: 'IdIngreso', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'Comprobante', req: true, l: 'Comprobante' }, { n: 'IdTercero', req: true, fk: 'D_Tercero', l: 'Cliente' }, { n: 'IdProducto', req: true, fk: 'D_Producto', l: 'Producto' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' }, { n: 'Caravana', req: true, fk: 'D_Animal', l: 'Caravana' },
      { n: 'Kg', t: 'num', req: true, min: 0.0000001, l: 'Kg' }, { n: 'PrecioKg', t: 'num', req: true, min: 0.0000001, l: 'Precio por kg' },
      { n: 'PrecioIncluyeIVA', t: 'bool', req: true, l: '¿Precio con IVA?' }, { n: 'AlicuotaIVA', t: 'num', calc: true, l: 'IVA %' },
      { n: 'ImporteNeto', t: 'num', calc: true, l: 'Neto' }, { n: 'IVA', t: 'num', calc: true, l: 'IVA' }, { n: 'Total', t: 'num', calc: true, l: 'Total' },
      { n: 'EstadoCobro', t: 'enum', req: true, opts: ['Pendiente', 'Cobrado'], l: 'Cobro' }, { n: 'Fuente', l: 'Fuente' }] },
  F_Compras: { grupo: 'Hechos', titulo: 'Compras (facturas de proveedores)', pk: 'IdCompra', prefijo: 'CPR', label: 'IdCompra', hecho: true,
    soloFormulario: true, editablesDespues: ['EstadoPago', 'FechaPago', 'IdFormaPago', 'Observaciones'],
    cols: [{ n: 'IdCompra', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'IdTipoComprobante', req: true, fk: 'D_TipoComprobante', l: 'Tipo de comprobante' },
      { n: 'Letra', t: 'enum', req: true, opts: ['A', 'B', 'C', 'Sin letra'], l: 'Letra' }, { n: 'Numero', req: true, l: 'Número' },
      { n: 'IdTercero', req: true, fk: 'D_Tercero', l: 'Proveedor' },
      { n: 'IdFormaPago', fk: 'D_FormaPago', l: 'Forma de pago' },
      { n: 'EstadoPago', t: 'enum', req: true, opts: ['Pendiente', 'Pagado'], l: 'Pago' },
      { n: 'Vencimiento', t: 'date', l: 'Vence' }, { n: 'FechaPago', t: 'date', l: 'Fecha de pago' },
      { n: 'Neto', t: 'num', calc: true, l: 'Neto' }, { n: 'IVA', t: 'num', calc: true, l: 'IVA crédito' }, { n: 'Total', t: 'num', calc: true, l: 'Total' },
      { n: 'Observaciones', l: 'Observaciones' }] },
  F_Costos: { grupo: 'Hechos', titulo: 'Costos', pk: 'IdCosto', prefijo: 'COS', label: 'IdCosto', hecho: true,
    cols: [{ n: 'IdCosto', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'IdCompra', fk: 'F_Compras', calc: true, l: 'Compra' },
      { n: 'Comprobante', l: 'Comprobante' }, { n: 'IdTercero', fk: 'D_Tercero', l: 'Proveedor' },
      { n: 'IdInsumo', req: true, fk: 'D_Insumo', l: 'Insumo o servicio' }, { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' },
      { n: 'Cantidad', t: 'num', req: true, min: 0.0000001, l: 'Cantidad' }, { n: 'PrecioUnit', t: 'num', req: true, min: 0.0000001, l: 'Precio unitario' },
      { n: 'AlicuotaIVA', t: 'num', min: 0, l: 'IVA %' },
      { n: 'Importe', t: 'num', calc: true, l: 'Importe (costo)' }, { n: 'IVA', t: 'num', calc: true, l: 'IVA crédito' },
      { n: 'EsSupuesto', t: 'bool', req: true, l: '¿Es un supuesto?' }, { n: 'Fuente', req: true, l: 'Fuente' }] },
  F_Sanidad: { grupo: 'Hechos', titulo: 'Sanidad (vacunas y tratamientos)', pk: 'IdSanidad', prefijo: 'SAN', label: 'IdSanidad', hecho: true,
    soloFormulario: true, editablesDespues: ['Responsable', 'Observaciones'],
    cols: [{ n: 'IdSanidad', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'IdEvento', calc: true, l: 'Jornada' },
      { n: 'Caravana', req: true, fk: 'D_Animal', l: 'Caravana' }, { n: 'IdSubunidad', fk: 'D_Subunidad', calc: true, l: 'Etapa' },
      { n: 'TipoEvento', t: 'enum', req: true, opts: ['Vacuna', 'Antiparasitario', 'Antibiótico / tratamiento', 'Vitaminas / minerales', 'Curación', 'Otro'], l: 'Qué se hizo' },
      { n: 'IdInsumo', req: true, fk: 'D_Insumo', l: 'Producto' }, { n: 'Dosis', t: 'num', req: true, min: 0, l: 'Dosis por animal' },
      { n: 'DiasCarencia', t: 'num', req: true, min: 0, l: 'Días de carencia' }, { n: 'FinCarencia', t: 'date', calc: true, l: 'Se puede vender desde' },
      { n: 'Responsable', req: true, l: 'Quién lo aplicó' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_Mortandad: { grupo: 'Hechos', titulo: 'Muertes', pk: 'IdMuerte', prefijo: 'MUE', label: 'IdMuerte', hecho: true,
    soloFormulario: true, editablesDespues: ['Causa', 'Observaciones'],
    cols: [{ n: 'IdMuerte', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'Caravana', req: true, fk: 'D_Animal', l: 'Caravana' }, { n: 'IdSubunidad', fk: 'D_Subunidad', calc: true, l: 'Etapa' },
      { n: 'Causa', t: 'enum', req: true, opts: ['Enfermedad', 'Parto', 'Accidente', 'Predador', 'Clima', 'No se sabe', 'Otra'], l: 'Causa' },
      { n: 'Observaciones', l: 'Observaciones' }] },
  F_Tesoreria: { grupo: 'Hechos', titulo: 'Cobros y pagos (recibos)', pk: 'IdMov', prefijo: 'MOV', label: 'IdMov', hecho: true,
    soloFormulario: true, editablesDespues: ['Numero', 'Observaciones'],
    cols: [{ n: 'IdMov', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'Tipo', t: 'enum', req: true, opts: ['Cobro', 'Pago'], l: 'Cobro o pago' },
      { n: 'IdTipoComprobante', req: true, fk: 'D_TipoComprobante', l: 'Comprobante' }, { n: 'Numero', l: 'Número de recibo' },
      { n: 'IdTercero', req: true, fk: 'D_Tercero', l: 'Cliente o proveedor' }, { n: 'IdFormaPago', req: true, fk: 'D_FormaPago', l: 'Forma de pago' },
      { n: 'Importe', t: 'num', req: true, min: 0.01, l: 'Importe ($)' },
      { n: 'IdCompra', fk: 'F_Compras', l: 'Factura de compra que paga' }, { n: 'ComprobanteVenta', l: 'Factura de venta que cobra' },
      { n: 'Observaciones', l: 'Observaciones' }] },
  F_Produccion: { grupo: 'Hechos', titulo: 'Producción real', pk: 'IdProduccion', prefijo: 'PRD', label: 'IdProduccion', hecho: true,
    cols: [{ n: 'IdProduccion', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' }, { n: 'KgProducidos', t: 'num', req: true, min: 0, l: 'Kg producidos' },
      { n: 'CabezasBase', t: 'num', req: true, min: 1, l: 'Cabezas base' }, { n: 'RindeReal', t: 'num', calc: true, l: 'Rinde real' },
      { n: 'Descripcion', l: 'Descripción' }, { n: 'Fuente', req: true, l: 'Fuente' }] },
  F_Consumo: { grupo: 'Hechos', titulo: 'Consumos reales', pk: 'IdConsumo', prefijo: 'CON', label: 'IdConsumo', hecho: true,
    cols: [{ n: 'IdConsumo', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' }, { n: 'IdInsumo', req: true, fk: 'D_Insumo', l: 'Insumo' },
      { n: 'CantidadReal', t: 'num', req: true, min: 0, l: 'Cantidad usada' }, { n: 'BaseReal', t: 'num', req: true, min: 0.0000001, l: 'Base real (cabezas o kg)' },
      { n: 'IdOrigen', calc: true, l: 'Origen' }, { n: 'Fuente', req: true, l: 'Fuente' }] },

  // ---------- UNIDAD MAÍZ (v3.7) — mismas tablas que la planilla del grupo de Maíz, integradas a este sistema ----------
  D_Lote: { grupo: 'Maestras', titulo: 'Maíz · Lotes', pk: 'IdLote', prefijo: 'LOT', label: 'Nombre', agro: true,
    cols: [{ n: 'IdLote', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre del lote' }, { n: 'Hectareas', t: 'num', req: true, min: 0.01, l: 'Hectáreas' },
      { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' }, { n: 'Cultivo', req: true, l: 'Cultivo' }, { n: 'Variedad', l: 'Variedad / híbrido' },
      { n: 'SistemaSiembra', t: 'enum', opts: ['Directa', 'Convencional'], l: 'Sistema de siembra' }, { n: 'Observaciones', l: 'Observaciones' }] },
  D_InsumoAgro: { grupo: 'Maestras', titulo: 'Maíz · Insumos y labores', pk: 'IdInsumoAgro', prefijo: 'IAG', label: 'Nombre', agro: true,
    cols: [{ n: 'IdInsumoAgro', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' },
      { n: 'Categoria', t: 'enum', req: true, opts: ['Pulverizar', 'Fertilizar', 'Maíz a sembrar', 'Labores', 'Otros / Servicios'], l: 'Categoría' },
      { n: 'Tipo', l: 'Tipo (herbicida, fertilizante…)' }, { n: 'Unidad', req: true, l: 'Unidad de medida (L, kg, bolsa, ha…)' }] },
  F_DosisAgro: { grupo: 'Parámetros', titulo: 'Maíz · Dosis técnica por lote', pk: 'IdDosisAgro', prefijo: 'DAG', label: 'IdDosisAgro', agro: true,
    cols: [{ n: 'IdDosisAgro', l: 'Id' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' }, { n: 'IdLote', req: true, fk: 'D_Lote', l: 'Lote' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Subunidad' }, { n: 'IdInsumoAgro', req: true, fk: 'D_InsumoAgro', l: 'Insumo' },
      { n: 'DosisHa', t: 'num', req: true, min: 0.0000001, l: 'Dosis técnica por ha' }, { n: 'Unidad', req: true, l: 'Unidad (kg/ha, L/ha…)' }] },
  F_RindeEstAgro: { grupo: 'Parámetros', titulo: 'Maíz · Rinde estándar', pk: 'IdRindeEst', prefijo: 'RAG', label: 'IdRindeEst', agro: true,
    cols: [{ n: 'IdRindeEst', l: 'Id' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' }, { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Subunidad' },
      { n: 'RindeEsperado', t: 'num', req: true, min: 0.0000001, l: 'Rinde esperado' }, { n: 'Unidad', req: true, l: 'Unidad (kg/ha, % conservación…)' }] },
  F_CostoEstAgro: { grupo: 'Parámetros', titulo: 'Maíz · Costo estándar por hectárea', pk: 'IdCostoEst', prefijo: 'CEA', label: 'IdCostoEst', agro: true,
    cols: [{ n: 'IdCostoEst', l: 'Id' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' }, { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Subunidad' },
      { n: 'Rubro', t: 'enum', req: true, opts: ['Siembra', 'Fertilizante', 'Fumigación', 'Combustible', 'RHHD', 'Almacenamiento', 'Labores', 'Otros'], l: 'Rubro' },
      { n: 'Concepto', req: true, l: 'Concepto' }, { n: 'Unidad', l: 'Unidad' }, { n: 'CantidadHa', t: 'num', req: true, min: 0, l: 'Cantidad estándar por ha' },
      { n: 'PrecioUSD', t: 'num', req: true, min: 0, l: 'Precio estándar (US$)' }, { n: 'CostoHaUSD', t: 'num', calc: true, l: 'Costo estándar por ha (US$)' }] },
  F_ConsumoLote: { grupo: 'Hechos', titulo: 'Maíz · Labores e insumos aplicados por lote', pk: 'IdConsumoLote', prefijo: 'CLO', label: 'IdConsumoLote', hecho: true, agro: true,
    cols: [{ n: 'IdConsumoLote', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Subunidad' }, { n: 'IdLote', req: true, fk: 'D_Lote', l: 'Lote' },
      { n: 'IdInsumoAgro', req: true, fk: 'D_InsumoAgro', l: 'Insumo o labor' }, { n: 'UnidadAplicacion', req: true, l: 'Unidad de aplicación (L/ha, kg/ha, ha…)' },
      { n: 'AplicacionHa', t: 'num', req: true, min: 0, l: 'Aplicación por ha' }, { n: 'Hectareas', t: 'num', calc: true, l: 'Hectáreas del lote' },
      { n: 'CantidadTotal', t: 'num', calc: true, l: 'Consumo real total' }, { n: 'PrecioUnit', t: 'num', req: true, min: 0, l: 'Precio unitario real ($)' },
      { n: 'CostoTotal', t: 'num', calc: true, l: 'Costo total real ($)' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_Cosecha: { grupo: 'Hechos', titulo: 'Maíz · Cosechas', pk: 'IdCosecha', prefijo: 'CSH', label: 'IdCosecha', hecho: true, agro: true,
    cols: [{ n: 'IdCosecha', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha de cosecha' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Subunidad' }, { n: 'IdLote', req: true, fk: 'D_Lote', l: 'Lote' },
      { n: 'KgTotal', t: 'num', req: true, min: 0, l: 'Producción total (kg)' }, { n: 'Hectareas', t: 'num', calc: true, l: 'Hectáreas' },
      { n: 'Toneladas', t: 'num', calc: true, l: 'Producción (t)' }, { n: 'RindeKgHa', t: 'num', calc: true, l: 'Rinde (kg/ha)' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_VentaGrano: { grupo: 'Hechos', titulo: 'Maíz · Ventas de grano', pk: 'IdVentaGrano', prefijo: 'VGR', label: 'IdVentaGrano', hecho: true, agro: true,
    cols: [{ n: 'IdVentaGrano', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Subunidad' },
      { n: 'Destino', t: 'enum', req: true, opts: ['Terceros', 'Interno: Ganadería'], l: 'Destino del grano' },
      { n: 'IdTercero', fk: 'D_Tercero', l: 'Cliente (si es a terceros)' }, { n: 'Comprobante', calc: true, l: 'Comprobante' },
      { n: 'Toneladas', t: 'num', req: true, min: 0.001, l: 'Toneladas' }, { n: 'PrecioTn', t: 'num', req: true, min: 0.01, l: 'Precio por tonelada ($)' },
      { n: 'AlicuotaIVA', t: 'num', min: 0, l: 'IVA %' }, { n: 'Neto', t: 'num', calc: true, l: 'Neto' }, { n: 'IVA', t: 'num', calc: true, l: 'IVA' },
      { n: 'Total', t: 'num', calc: true, l: 'Total' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_GastoAgro: { grupo: 'Hechos', titulo: 'Maíz · Gastos de almacén y comercialización', pk: 'IdGastoAgro', prefijo: 'GAG', label: 'IdGastoAgro', hecho: true, agro: true,
    cols: [{ n: 'IdGastoAgro', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', req: true, fk: 'D_Campana', l: 'Campaña' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Subunidad' },
      { n: 'Rubro', t: 'enum', req: true, opts: ['Almacenamiento', 'Flete', 'Comisión', 'Otros'], l: 'Rubro' },
      { n: 'Concepto', req: true, l: 'Concepto' }, { n: 'IdTercero', fk: 'D_Tercero', l: 'Proveedor' },
      { n: 'Cantidad', t: 'num', req: true, min: 0.0000001, l: 'Cantidad' }, { n: 'Unidad', l: 'Unidad (qq, t, unidad…)' },
      { n: 'PrecioUnit', t: 'num', req: true, min: 0, l: 'Precio unitario ($)' }, { n: 'Importe', t: 'num', calc: true, l: 'Importe ($)' },
      { n: 'Observaciones', l: 'Observaciones' }] },

  // ---------- UNIDAD BOVINA (v3.7) — a partir de las planillas de campo del grupo de Bovinos ----------
  D_CargaEngorde: { grupo: 'Maestras', titulo: 'Bovinos · Cargas de engorde', pk: 'IdCarga', prefijo: 'CEN', label: 'Nombre', bov: true,
    cols: [{ n: 'IdCarga', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre de la carga' }, { n: 'FechaInicio', t: 'date', req: true, l: 'Inicio' },
      { n: 'FechaFin', t: 'date', l: 'Fin (venta)' }, { n: 'Estado', t: 'enum', req: true, opts: ['En engorde', 'Vendida'], l: 'Estado' },
      { n: 'DesbastePct', t: 'num', min: 0, l: 'Desbaste (%)' }, { n: 'Observaciones', l: 'Observaciones' }] },
  D_Bovino: { grupo: 'Maestras', titulo: 'Bovinos · Animales (caravanas)', pk: 'Caravana', pkManual: true, label: 'Caravana', bov: true,
    cols: [{ n: 'Caravana', req: true, l: 'Caravana' }, { n: 'Sexo', t: 'enum', req: true, opts: ['Hembra', 'Macho'], l: 'Sexo' },
      { n: 'Categoria', t: 'enum', req: true, opts: ['Ternero', 'Ternera', 'Novillo', 'Vaquillona', 'Torito de reposición', 'Toro', 'Vaca'], l: 'Categoría' },
      { n: 'IdSubunidad', req: true, fk: 'D_Subunidad', l: 'Etapa' }, { n: 'FechaNac', t: 'date', l: 'Fecha de nacimiento' }, { n: 'PesoNac', t: 'num', min: 0, l: 'Peso al nacer (kg)' },
      { n: 'Madre', l: 'Vaca madre' }, { n: 'Padre', l: 'Toro (padre)' }, { n: 'IdCarga', fk: 'D_CargaEngorde', l: 'Carga de engorde' },
      { n: 'Estado', t: 'enum', opts: ['Activo', 'Vendido', 'Muerto', 'Faltante'], calc: true, l: 'Estado' }, { n: 'FechaBaja', t: 'date', calc: true, l: 'Fecha de baja' },
      { n: 'Observaciones', l: 'Observaciones' }] },
  F_PesadaBov: { grupo: 'Hechos', titulo: 'Bovinos · Pesadas', pk: 'IdPesada', prefijo: 'PES', label: 'IdPesada', hecho: true, bov: true,
    cols: [{ n: 'IdPesada', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'Caravana', req: true, fk: 'D_Bovino', l: 'Caravana' }, { n: 'PesoKg', t: 'num', req: true, min: 1, l: 'Peso (kg)' },
      { n: 'Evento', t: 'enum', req: true, opts: ['Nacimiento', 'Control de peso', 'Ingreso a engorde', 'Venta'], l: 'Motivo' },
      { n: 'IdCarga', fk: 'D_CargaEngorde', l: 'Carga de engorde' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_AlimentoBov: { grupo: 'Hechos', titulo: 'Bovinos · Alimento entregado (moliendas)', pk: 'IdAlimento', prefijo: 'ALB', label: 'IdAlimento', hecho: true, bov: true,
    cols: [{ n: 'IdAlimento', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha de la molienda' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'IdCarga', req: true, fk: 'D_CargaEngorde', l: 'Carga de engorde' }, { n: 'Alimento', t: 'enum', req: true, opts: ['Maíz molido', 'Soja', 'Minerales'], l: 'Alimento' },
      { n: 'Cantidad', t: 'num', req: true, min: 0.0001, l: 'Cantidad' }, { n: 'Unidad', t: 'enum', req: true, opts: ['kg', 'bolsa de 25 kg'], l: 'Unidad' },
      { n: 'Kg', t: 'num', calc: true, l: 'Kilos' }, { n: 'Observaciones', l: 'Observaciones' }] },
  F_MovBov: { grupo: 'Hechos', titulo: 'Bovinos · Ventas, muertes y faltantes', pk: 'IdMovBov', prefijo: 'MBV', label: 'IdMovBov', hecho: true, bov: true,
    cols: [{ n: 'IdMovBov', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'Caravana', req: true, fk: 'D_Bovino', l: 'Caravana' }, { n: 'Tipo', t: 'enum', req: true, opts: ['Venta', 'Muerte', 'Faltante'], l: 'Qué pasó' },
      { n: 'PesoKg', t: 'num', min: 0, l: 'Peso (kg)' }, { n: 'IdTercero', fk: 'D_Tercero', l: 'Cliente (si es venta)' },
      { n: 'PrecioKg', t: 'num', min: 0, l: 'Precio por kg ($)' }, { n: 'Importe', t: 'num', calc: true, l: 'Importe ($)' }, { n: 'Observaciones', l: 'Observaciones' }] },

  F_PagoImpuesto: { grupo: 'Hechos', titulo: 'Impuestos pagados', pk: 'IdPagoImp', prefijo: 'PIM', label: 'IdPagoImp', hecho: true,
    cols: [{ n: 'IdPagoImp', l: 'Id' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha de pago' }, { n: 'IdCampana', fk: 'D_Campana', calc: true, l: 'Campaña' },
      { n: 'IdImpuesto', req: true, fk: 'D_Impuesto', l: 'Impuesto' }, { n: 'Periodo', req: true, l: 'Período que paga (aaaa-mm)' },
      { n: 'Importe', t: 'num', req: true, min: 0, l: 'Importe ($)' }, { n: 'IdFormaPago', fk: 'D_FormaPago', l: 'Forma de pago' },
      { n: 'Comprobante', l: 'Comprobante (VEP, ticket)' }, { n: 'Observaciones', l: 'Observaciones' }] },

  // ---------- CONTROL ----------
  S_Usuarios: { grupo: 'Control', titulo: 'Usuarios', pk: 'Email', pkManual: true, label: 'Nombre', soloAdminLee: true,
    cols: [{ n: 'Email', t: 'email', req: true, l: 'Email' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'Rol', t: 'enum', req: true, opts: ROLES, l: 'Rol' },
      { n: 'IdSubunidad', fk: 'D_Subunidad', l: 'Etapa a cargo' }, { n: 'ClaveHash', hidden: true }, { n: 'Sal', hidden: true }] },
  S_Auditoria: { grupo: 'Control', titulo: 'Auditoría', pk: 'IdAuditoria', prefijo: 'AUD', label: 'IdAuditoria', sinAuditoria: true, soloLectura: true,
    cols: [{ n: 'IdAuditoria' }, { n: 'FechaHora' }, { n: 'Usuario' }, { n: 'Accion' }, { n: 'Tabla' }, { n: 'IdRegistro' },
      { n: 'ValorAnterior' }, { n: 'ValorNuevo' }] },
  S_Config: { grupo: 'Control', titulo: 'Configuración del sistema', pk: 'Clave', pkManual: true, label: 'Clave',
    cols: [{ n: 'Clave', req: true, l: 'Dato' }, { n: 'Valor', l: 'Valor' }, { n: 'Descripcion', l: 'Para qué sirve' }] }
};

function headersDe(tabla) {
  var s = SCHEMA[tabla];
  var h = s.cols.map(function (c) { return c.n; });
  return s.sinAuditoria ? h : h.concat(AUDIT_COLS);
}
function colDe(tabla, nombre) {
  var c = SCHEMA[tabla].cols.filter(function (x) { return x.n === nombre; });
  return c.length ? c[0] : null;
}

/* =============================================================================================
 * 2. ACCESO A LA PLANILLA
 * ============================================================================================= */
var SS_ = null, HOJAS_ = {};
function ss_() {
  if (SS_) return SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return SS_;
}
function hoja_(tabla) {
  if (HOJAS_[tabla]) return HOJAS_[tabla];
  var sh = ss_().getSheetByName(tabla);
  if (sh) HOJAS_[tabla] = sh;
  if (!sh) throw new Error('No existe la hoja ' + tabla + '. Ejecutá "Sistema Ovino > Actualizar" en la planilla.');
  return sh;
}
function fmtFecha_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}
function aFecha_(s) { // 'yyyy-mm-dd' -> Date al mediodía (evita corrimientos de zona horaria)
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}
function sumarDias_(s, dias) {
  var d = aFecha_(s); d.setDate(d.getDate() + Number(dias || 0));
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
function hoyStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** Memoria de lecturas dentro de UNA ejecución (se vacía al empezar cada pedido y al escribir). */
var CACHE_ = {};
var HEAD_ = {};
function copiar_(filas) { return filas.map(function (o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }); }
/** Encabezados REALES de la hoja (pueden tener columnas agregadas al final por una actualización). */
function headersHoja_(tabla) {
  if (HEAD_[tabla]) return HEAD_[tabla];
  var sh = hoja_(tabla);
  var n = sh.getLastColumn();
  HEAD_[tabla] = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
  return HEAD_[tabla];
}
/** Lee una tabla completa como lista de objetos. Las fechas salen como 'yyyy-mm-dd'. */
function leer_(tabla) {
  if (CACHE_[tabla]) return copiar_(CACHE_[tabla]);
  var g = genTabla_(tabla), r = memLeer_(tabla, g);
  if (!r) { r = leerHoja_(tabla); memGuardar_(tabla, g, r); }
  CACHE_[tabla] = r;
  return copiar_(CACHE_[tabla]);
}

/* ---------- v3.2 · Memoria entre pedidos (CacheService) ----------
 * Leer una hoja de Google Sheets tarda; guardamos cada tabla ya leída (comprimida) hasta 15 minutos.
 * Cada tabla tiene una "generación": toda escritura la cambia, y lo que quedó guardado con otra generación
 * se descarta. Así nunca se muestra un dato viejo después de guardar algo. */
var MEM_SEG = 900, MEM_NO = { S_Auditoria: 1 }, MEM_TROZO = 90000;
function genTabla_(tabla) {
  var c = CacheService.getScriptCache(), g = c.get('G_' + tabla);
  if (!g) { g = Utilities.getUuid().slice(0, 8); c.put('G_' + tabla, g, 21600); }
  return g;
}
function invalidar_(tabla) {
  delete CACHE_[tabla];
  try { CacheService.getScriptCache().put('G_' + tabla, Utilities.getUuid().slice(0, 8), 21600); } catch (e) {}
}
function invalidarTodo_() { CACHE_ = {}; HEAD_ = {}; Object.keys(SCHEMA).forEach(invalidar_); }
function memLeer_(tabla, g) {
  if (MEM_NO[tabla]) return null;
  try {
    var c = CacheService.getScriptCache(), meta = c.get('T_' + tabla);
    if (!meta) return null;
    var p = meta.split('|'); if (p[0] !== g) return null;
    var n = Number(p[1]), keys = [];
    for (var i = 0; i < n; i++) keys.push('T_' + tabla + '_' + g + '_' + i);
    var got = c.getAll(keys), b64 = '';
    for (var j = 0; j < n; j++) { if (got[keys[j]] === undefined || got[keys[j]] === null) return null; b64 += got[keys[j]]; }
    var txt = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip')).getDataAsString();
    return JSON.parse(txt);
  } catch (e) { return null; }
}
function memGuardar_(tabla, g, filas) {
  if (MEM_NO[tabla]) return;
  try {
    var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(filas), 'application/json')).getBytes());
    var c = CacheService.getScriptCache(), trozos = {}, n = 0;
    for (var i = 0; i < b64.length; i += MEM_TROZO) trozos['T_' + tabla + '_' + g + '_' + (n++)] = b64.slice(i, i + MEM_TROZO);
    if (n > 40) return; // tabla demasiado grande: se lee siempre de la hoja
    c.putAll(trozos, MEM_SEG);
    c.put('T_' + tabla, g + '|' + n, MEM_SEG);
  } catch (e) {}
}
function leerHoja_(tabla) {
  var sh = hoja_(tabla);
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var h = vals[0];
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var fila = vals[i];
    if (fila.join('') === '') continue;
    var o = { _fila: i + 1 };
    for (var j = 0; j < h.length; j++) {
      var v = fila[j];
      o[h[j]] = v instanceof Date ? (h[j] === 'CreadoEl' || h[j] === 'ModificadoEl' || h[j] === 'FechaHora'
        ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : fmtFecha_(v)) : v;
    }
    out.push(o);
  }
  return out;
}
function aFila_(tabla, obj) {
  return headersHoja_(tabla).map(function (n) {
    var c = SCHEMA[tabla] ? colDe(tabla, n) : null;
    var v = obj[n];
    if (v === undefined || v === null) return '';
    if (c && c.t === 'date' && v) return aFecha_(v) || v;
    if ((n === 'CreadoEl' || n === 'ModificadoEl') && v) return v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    return v;
  });
}
function activo_(o) { return o.Activo === undefined || o.Activo === '' || o.Activo === 'Sí'; }

/* =============================================================================================
 * 3. SESIÓN Y PERMISOS
 * ============================================================================================= */
function hash_(sal, clave) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + '|' + clave, Utilities.Charset.UTF_8);
  return b.map(function (x) { var h = (x < 0 ? x + 256 : x).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}
function usuarioPorEmail_(email) {
  email = String(email || '').trim().toLowerCase();
  var u = leer_('S_Usuarios').filter(function (x) { return String(x.Email).toLowerCase() === email; })[0];
  return u || null;
}
function sesion_(token) {
  CACHE_ = {}; HEAD_ = {}; TC_ = null;
  if (!token) throw new Error('Sesión vencida. Volvé a ingresar.');
  var email = CacheService.getScriptCache().get('s_' + token);
  if (!email) throw new Error('Sesión vencida. Volvé a ingresar.');
  var u = usuarioPorEmail_(email);
  if (!u || !activo_(u)) throw new Error('Usuario inexistente o dado de baja.');
  return { Email: String(u.Email).toLowerCase(), Nombre: u.Nombre, Rol: u.Rol, IdSubunidad: u.IdSubunidad || '' };
}
function publico_(u) { return { Email: u.Email, Nombre: u.Nombre, Rol: u.Rol, IdSubunidad: u.IdSubunidad || '' }; }

/** Matriz de permisos. accion: leer | crear | editar | baja */
function puede_(u, tabla, accion, registro) {
  var s = SCHEMA[tabla];
  var rol = u.Rol;
  if (accion === 'leer') {
    if (s.soloAdminLee) return rol === 'Administrador';
    if (tabla === 'S_Auditoria') return rol === 'Administrador' || rol === 'Consulta / auditoría';
    return true;
  }
  if (s.soloLectura) return false;
  if (rol === 'Administrador') return true;
  if (rol === 'Consulta / auditoría') return false;
  // Proveedores, clientes y productos nuevos: cualquiera que carga datos los puede DAR DE ALTA
  // (para no frenar la carga en el campo). Editarlos o darlos de baja queda para el Administrador.
  if (tabla === 'D_Tercero' || tabla === 'D_Insumo') return accion === 'crear';
  if (tabla === 'F_Escenario') return accion === 'crear'; // cualquiera que carga datos puede guardar un escenario
  var esCargaHacienda = s.hecho || tabla === 'D_Animal';
  if (!esCargaHacienda) return false; // resto de maestras, parámetros y usuarios: solo Administrador
  if (rol === 'Operador de carga') return accion === 'crear';
  if (rol === 'Responsable de subunidad') {
    if (!s.hecho) return accion === 'crear'; // puede dar de alta nacimientos
    if (!registro) return true;
    if (registro.IdSubunidad === undefined) return accion !== 'baja'; // compras: puede cargarlas y marcar el pago
    return miEtapa_(u, registro.IdSubunidad);
  }
  return false;
}
function exigir_(u, tabla, accion, registro) {
  if (!SCHEMA[tabla]) throw new Error('Tabla desconocida: ' + tabla);
  if (!puede_(u, tabla, accion, registro)) {
    throw new Error('Tu usuario (' + u.Rol + ') no puede ' + ({ leer: 'ver', crear: 'cargar', editar: 'modificar', baja: 'dar de baja' }[accion] || accion) +
      ' en ' + SCHEMA[tabla].titulo + (registro && u.Rol === 'Responsable de subunidad' ? ' de otra etapa' : '') + '.');
  }
}

/* =============================================================================================
 * 4. AUDITORÍA E IDS
 * ============================================================================================= */
function auditar_(email, accion, tabla, id, antes, despues) {
  var sh = hoja_('S_Auditoria');
  var n = sh.getLastRow(); // incluye encabezado: el próximo número es n
  var idA = 'AUD-' + ('000000' + n).slice(-6);
  var corta = function (o) { if (!o) return ''; var s = JSON.stringify(o); return s.length > 40000 ? s.slice(0, 40000) + '…' : s; };
  sh.appendRow([idA, new Date(), email, accion, tabla, String(id), corta(antes), corta(despues)]);
  invalidar_('S_Auditoria');
}
function nuevoId_(tabla, filas, prefijo) {
  var s = SCHEMA[tabla] || {};
  prefijo = prefijo || s.prefijo;
  var campo = s.pk;
  var max = 0;
  var re = new RegExp('^' + prefijo + '-?(\\d+)$');
  filas.forEach(function (f) {
    var m = re.exec(String(f[campo]));
    if (m) max = Math.max(max, Number(m[1]));
  });
  var sep = prefijo === 'N' ? '' : '-';
  var ancho = prefijo === 'N' ? 1 : 6;
  return prefijo + sep + ('000000' + (max + 1)).slice(-ancho);
}

/* =============================================================================================
 * 5. VALIDACIONES (el backend vuelve a validar todo, aunque la pantalla ya lo haya hecho)
 * ============================================================================================= */
function campanaDeFecha_(fecha) {
  var f = String(fecha);
  var c = campanasOvinas_().filter(function (x) { return x.FechaDesde <= f && f <= x.FechaHasta; });
  if (!c.length) throw new Error('La fecha ' + f + ' no cae dentro de ninguna campaña cargada. Pedile al administrador que cargue la campaña.');
  return c[0].IdCampana;
}
function existeActivo_(tabla, id) {
  var pk = SCHEMA[tabla].pk;
  return leer_(tabla).some(function (x) { return String(x[pk]) === String(id) && activo_(x); });
}
function etq_(tabla, c) { return c.l || c.n; }
function limpiar_(tabla, entrada, u) {
  var s = SCHEMA[tabla];
  var o = {};
  s.cols.forEach(function (c) {
    if (c.calc || c.hidden) return;
    if (c.n === s.pk && !s.pkManual) return;
    var v = entrada[c.n];
    if (v === undefined || v === null) v = '';
    if (typeof v === 'string') v = v.trim();
    if (c.t === 'num' && v !== '') {
      var num = Number(String(v).replace(',', '.'));
      if (isNaN(num)) throw new Error(etq_(tabla, c) + ': tiene que ser un número.');
      v = num;
    }
    if (c.t === 'bool' && v !== '') v = (v === true || v === 'Sí' || v === 'Si' || v === 'true') ? 'Sí' : 'No';
    if (c.t === 'email' && v !== '') v = String(v).toLowerCase();
    o[c.n] = v;
  });
  return o;
}
function validar_(tabla, o, u, idActual) {
  var s = SCHEMA[tabla];
  if (s.agro) validarAgro_(tabla, o);
  if (s.bov) validarBov_(tabla, o);
  var errores = [];
  s.cols.forEach(function (c) {
    if (c.calc || c.hidden) return;
    if (c.n === s.pk && !s.pkManual) return;
    var v = o[c.n], nom = etq_(tabla, c);
    if (c.req && (v === '' || v === undefined)) { errores.push('Falta completar: ' + nom + '.'); return; }
    if (v === '' || v === undefined) return;
    if (c.t === 'num' && c.min !== undefined && v < c.min) errores.push(nom + ' tiene que ser mayor' + (c.min === 0 ? ' o igual a 0.' : ' a 0.'));
    if (c.t === 'date' && !aFecha_(v)) errores.push(nom + ': fecha inválida.');
    if (c.t === 'enum' && c.opts.indexOf(v) < 0) errores.push(nom + ': "' + v + '" no es una opción válida.');
    if (c.t === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errores.push('Email inválido.');
    if (c.fk && !(tabla === 'S_Usuarios' && c.n === 'IdSubunidad' && v === TODAS) && !existeActivo_(c.fk, v)) errores.push(nom + ': "' + v + '" no existe en ' + SCHEMA[c.fk].titulo + ' (o está dado de baja).');
  });
  if (errores.length) throw new Error(errores.join(' '));

  var filas = leer_(tabla).filter(activo_);
  var otros = filas.filter(function (x) { return String(x[s.pk]) !== String(idActual); });
  if (s.pkManual && idActual === undefined) {
    if (leer_(tabla).some(function (x) { return String(x[s.pk]).toLowerCase() === String(o[s.pk]).toLowerCase(); })) {
      throw new Error('Ya existe un registro con ' + etq_(tabla, colDe(tabla, s.pk)) + ' ' + o[s.pk] + '.');
    }
  }
  s.cols.forEach(function (c) {
    if (c.unico && otros.some(function (x) { return String(x[c.n]) === String(o[c.n]); })) {
      throw new Error('Ya existe otro registro con ' + etq_(tabla, c) + ' = ' + o[c.n] + '.');
    }
  });

  // Reglas propias de la cátedra y del negocio
  if (tabla === 'F_Ingresos' && o.Comprobante !== undefined && o.Comprobante !== '') {
    if (!RE_FACTURA.test(String(o.Comprobante))) throw new Error('El número de factura tiene que tener el formato FAV 0003-000005859 (prefijo, espacio, 4 cifras, guion, 9 cifras).');
    if (otros.some(function (x) { return x.Comprobante === o.Comprobante && x.IdTercero !== o.IdTercero; })) throw new Error('La factura ' + o.Comprobante + ' ya está usada en una venta a otro cliente.');
  }
  if (tabla === 'F_EstandarRinde' && otros.some(function (x) { return x.IdCampana === o.IdCampana && x.IdSubunidad === o.IdSubunidad; })) {
    throw new Error('Ya hay un rinde estándar para esa campaña y etapa. La cátedra exige UNA sola referencia: editá la existente.');
  }
  if (tabla === 'F_Dosis' && otros.some(function (x) { return x.IdCampana === o.IdCampana && x.IdSubunidad === o.IdSubunidad && x.IdInsumo === o.IdInsumo; })) {
    throw new Error('Ya hay una dosis técnica para ese insumo, etapa y campaña: editá la existente.');
  }
  if (tabla === 'D_Campana') {
    if (o.FechaDesde > o.FechaHasta) throw new Error('La fecha "Desde" tiene que ser anterior a "Hasta".');
    if (otros.some(function (x) { return String(x.IdUnidad || UNIDAD_OVINA) === String(o.IdUnidad || UNIDAD_OVINA) && !(o.FechaHasta < x.FechaDesde || o.FechaDesde > x.FechaHasta); })) {
      throw new Error('Las fechas se superponen con otra campaña.');
    }
  }
  if (tabla === 'D_Conversion' && o.IdUMOrigen === o.IdUMDestino) throw new Error('Origen y destino no pueden ser la misma unidad.');
  if (tabla === 'S_Usuarios' && o.Rol === 'Responsable de subunidad' && !o.IdSubunidad) {
    throw new Error('Un Responsable de subunidad necesita tener una etapa asignada.');
  }
  if (tabla === 'D_Tercero') {
    if (o.CUIT && !/^\d{2}-?\d{8}-?\d$/.test(o.CUIT)) throw new Error('El CUIT tiene que tener 11 números (ej. 30-12345678-9).');
    var nom = String(o.RazonSocial).trim().toLowerCase();
    if (otros.some(function (x) { return String(x.RazonSocial).trim().toLowerCase() === nom; })) throw new Error('Ya hay un cliente o proveedor con el nombre "' + o.RazonSocial + '".');
    if (o.CUIT && otros.some(function (x) { return String(x.CUIT).replace(/-/g, '') === String(o.CUIT).replace(/-/g, ''); })) throw new Error('Ya hay un cliente o proveedor con ese CUIT.');
  }
  if (tabla === 'D_Insumo') {
    var ni = String(o.Nombre).trim().toLowerCase();
    if (otros.some(function (x) { return String(x.Nombre).trim().toLowerCase() === ni; })) throw new Error('Ya existe un producto o servicio llamado "' + o.Nombre + '".');
  }
  if (tabla === 'D_Animal') {
    if (o.FechaNac > hoyStr_()) throw new Error('La fecha de nacimiento no puede ser posterior a hoy.');
    ['Madre', 'Padre'].forEach(function (k) {
      if (o[k] === '' || o[k] === undefined) return;
      var p = leer_('D_Animal').filter(function (a) { return Number(a.Caravana) === Number(o[k]); })[0];
      if (!p) throw new Error('La caravana ' + o[k] + ' (' + k.toLowerCase() + ') no existe.');
      if (Number(o[k]) === Number(o.Caravana)) throw new Error('Un animal no puede ser su propia ' + k.toLowerCase() + '.');
    });
  }
  if (tabla === 'P_Indicador' && o.MetaVerde !== '' && o.MetaAmarillo !== '') {
    var mv = Number(o.MetaVerde), ma = Number(o.MetaAmarillo);
    if (o.Sentido === 'Mayor es mejor' && ma > mv) throw new Error('Si "mayor es mejor", la alerta (amarillo) tiene que ser menor o igual a la meta (verde).');
    if (o.Sentido !== 'Mayor es mejor' && ma < mv) throw new Error('Si "menor es mejor" o "cerca de cero", la alerta (amarillo) tiene que ser mayor o igual a la meta (verde).');
  }
  if ((tabla === 'F_VencImpuesto' || tabla === 'F_PagoImpuesto') && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(o.Periodo))) throw new Error('El período tiene que tener la forma aaaa-mm (ej. 2026-10).');
  if (tabla === 'D_Impuesto' && o.TipoVencimiento === 'Fecha fija' && !(Number(o.DiaFijo) >= 1 && Number(o.DiaFijo) <= 31)) throw new Error('Para un impuesto de fecha fija, indicá el día del mes (1 a 31).');
  if ((tabla === 'D_LinkCotizacion' && !/^https?:\/\//i.test(o.URL)) || (tabla === 'D_UnidadNeg' && o.LinkApp && !/^https?:\/\//i.test(o.LinkApp))) throw new Error('El link tiene que empezar con http:// o https://');
  if (tabla === 'S_Config' && o.Clave === 'CUIT_ESTABLECIMIENTO' && o.Valor && !/^\d{2}-?\d{8}-?\d$/.test(o.Valor)) throw new Error('El CUIT tiene que tener 11 números (ej. 30-12345678-9).');
  if (s.hecho && colDe(tabla, 'IdSubunidad') && !colDe(tabla, 'IdSubunidad').calc && u.Rol === 'Responsable de subunidad' && !miEtapa_(u, o.IdSubunidad)) {
    throw new Error('Solo podés cargar datos de tu etapa.');
  }
}
function calcular_(tabla, o) {
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  if (SCHEMA[tabla].agro) return calcularAgro_(tabla, o);
  if (SCHEMA[tabla].bov) return calcularBov_(tabla, o);
  if (SCHEMA[tabla].hecho && o.Fecha) o.IdCampana = campanaDeFecha_(o.Fecha);
  if (tabla === 'F_Costos') {
    var a = Number(o.AlicuotaIVA || 0);
    o.Importe = r2(o.Cantidad * o.PrecioUnit);
    o.IVA = r2(o.Importe * a / 100);
  }
  if (tabla === 'F_Produccion') o.RindeReal = Math.round(o.KgProducidos / o.CabezasBase * 10000) / 10000;
  if (tabla === 'F_Ingresos') {
    var prod = leer_('D_Producto').filter(function (x) { return x.IdProducto === o.IdProducto; })[0];
    var al = Number(prod.AlicuotaIVA);
    var bruto = o.Kg * o.PrecioKg;
    o.AlicuotaIVA = al;
    if (o.PrecioIncluyeIVA === 'Sí') { o.Total = r2(bruto); o.ImporteNeto = r2(bruto / (1 + al / 100)); o.IVA = r2(o.Total - o.ImporteNeto); }
    else { o.ImporteNeto = r2(bruto); o.IVA = r2(bruto * al / 100); o.Total = r2(o.ImporteNeto + o.IVA); }
  }
  if (tabla === 'D_Animal' && !o.Estado) o.Estado = 'Activo';
  return o;
}

/* =============================================================================================
 * 6. ESCRITURA (siempre con bloqueo para que dos personas no generen el mismo Id)
 * ============================================================================================= */
function conBloqueo_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function insertar_(tabla, o, email) {
  var s = SCHEMA[tabla];
  var ahora = new Date();
  if (!s.pkManual) o[s.pk] = nuevoId_(tabla, leer_(tabla));
  if (!s.sinAuditoria) { o.CreadoEl = ahora; o.CreadoPor = email; o.ModificadoEl = ''; o.ModificadoPor = ''; o.Activo = 'Sí'; }
  hoja_(tabla).appendRow(aFila_(tabla, o));
  invalidar_(tabla);
  if (!s.sinAuditoria) auditar_(email, 'Alta', tabla, o[s.pk], null, sinOcultos_(tabla, o));
  return o[s.pk];
}
function reescribir_(tabla, fila, o) {
  var sh = hoja_(tabla);
  var h = headersHoja_(tabla);
  sh.getRange(fila, 1, 1, h.length).setValues([aFila_(tabla, o)]);
  invalidar_(tabla);
}
function buscar_(tabla, id) {
  var pk = SCHEMA[tabla].pk;
  var r = leer_(tabla).filter(function (x) { return String(x[pk]) === String(id); })[0];
  if (!r) throw new Error('No se encontró ' + id + ' en ' + SCHEMA[tabla].titulo + '.');
  return r;
}
function sinOcultos_(tabla, o) {
  var c = {};
  Object.keys(o).forEach(function (k) {
    if (k === '_fila') return;
    var col = colDe(tabla, k);
    if (col && col.hidden) return;
    c[k] = o[k] instanceof Date ? Utilities.formatDate(o[k], TZ, 'yyyy-MM-dd HH:mm') : o[k];
  });
  return c;
}
function cambiarActivo_(tabla, actual, activar, email, accion) {
  var o = JSON.parse(JSON.stringify(actual));
  o.Activo = activar ? 'Sí' : 'No';
  o.ModificadoEl = new Date(); o.ModificadoPor = email;
  reescribir_(tabla, actual._fila, o);
  auditar_(email, accion || (activar ? 'Reactivación' : 'Baja'), tabla, actual[SCHEMA[tabla].pk], sinOcultos_(tabla, actual), sinOcultos_(tabla, o));
}
function cambiarEstadoAnimal_(caravana, estado, fechaBaja, email, accion) {
  var an = buscar_('D_Animal', caravana);
  var an2 = JSON.parse(JSON.stringify(an));
  an2.Estado = estado; an2.FechaBaja = fechaBaja || '';
  an2.ModificadoEl = new Date(); an2.ModificadoPor = email;
  reescribir_('D_Animal', an._fila, an2);
  auditar_(email, accion, 'D_Animal', an.Caravana, sinOcultos_('D_Animal', an), sinOcultos_('D_Animal', an2));
}

/* =============================================================================================
 * 7. API — funciones que llama la pantalla con google.script.run
 * ============================================================================================= */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Sistema de Gestión Ovina · Pozo del Carril')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}
/** Permite que Index.html incluya otros archivos (la foto del encabezado vive en Foto.html). */
function include(nombre) { return HtmlService.createHtmlOutputFromFile(nombre).getContent(); }

function api_login(email, clave) {
  CACHE_ = {}; HEAD_ = {};
  Utilities.sleep(300);
  var u = usuarioPorEmail_(email);
  if (!u || !activo_(u) || !u.ClaveHash || hash_(u.Sal, String(clave)) !== u.ClaveHash) {
    throw new Error('Email o clave incorrectos.');
  }
  var ses = nuevaSesion_(String(u.Email).toLowerCase());
  conBloqueo_(function () { auditar_(String(u.Email).toLowerCase(), 'Ingreso', 'S_Usuarios', u.Email, null, null); });
  return { token: ses.token, code: ses.code, usuario: publico_({ Email: String(u.Email).toLowerCase(), Nombre: u.Nombre, Rol: u.Rol, IdSubunidad: u.IdSubunidad }) };
}
/**
 * v3.1 — Sesión que sobrevive a F5. Además del token (que el navegador guarda), se entrega un código de reingreso
 * de un solo uso. Solo se usa si el navegador no guardó el token: se canjea por un token y un código nuevos.
 */
function nuevaSesion_(email) {
  var c = CacheService.getScriptCache(), token = Utilities.getUuid(), code = Utilities.getUuid().replace(/-/g, '');
  c.put('s_' + token, email, SESION_SEGUNDOS);
  c.put('r_' + code, email, SESION_SEGUNDOS);
  return { token: token, code: code };
}
function api_reingreso(code) {
  var c = CacheService.getScriptCache(), k = 'r_' + String(code || '').replace(/[^0-9a-f]/gi, '');
  var email = c.get(k);
  if (!email) throw new Error('Sesión vencida. Volvé a entrar.');
  c.remove(k); // un solo uso
  var u = usuarioPorEmail_(email);
  if (!u || !activo_(u)) throw new Error('Sesión vencida. Volvé a entrar.');
  return nuevaSesion_(email);
}
/** Mantiene vivo el código de reingreso de esta pestaña (o crea uno nuevo si no hay o es de otro usuario). */
function codigoVigente_(code, email) {
  var c = CacheService.getScriptCache(), k = String(code || '').replace(/[^0-9a-f]/gi, '');
  if (k && c.get('r_' + k) === email) { c.put('r_' + k, email, SESION_SEGUNDOS); return k; }
  k = Utilities.getUuid().replace(/-/g, ''); c.put('r_' + k, email, SESION_SEGUNDOS); return k;
}
/** El navegador sí guarda la sesión: el código de la dirección ya no hace falta y se invalida. */
function api_olvidarCodigo(code) { CacheService.getScriptCache().remove('r_' + String(code || '').replace(/[^0-9a-f]/gi, '')); return true; }
function api_logout(token, code) { var c = CacheService.getScriptCache(); c.remove('s_' + token); if (code) c.remove('r_' + String(code).replace(/[^0-9a-f]/gi, '')); return true; }

/** Todo lo que la pantalla necesita para armarse: usuario, esquema, listas desplegables y resumen del día. */
function api_inicio(token, code) {
  // v3.2: si el token no sirve (el navegador no lo guardó o se perdió), se retoma con el código de la dirección.
  var ses = null, u;
  try { u = sesion_(token); }
  catch (e) { if (!code) throw e; ses = api_reingreso(code); token = ses.token; u = sesion_(token); }
  if (!ses) ses = { token: token, code: codigoVigente_(code, u.Email) };
  var migracion = asegurarVersion_();
  var esquema = {};
  Object.keys(SCHEMA).forEach(function (t) {
    var s = SCHEMA[t];
    esquema[t] = {
      grupo: s.grupo, titulo: s.titulo, pk: s.pk, pkManual: !!s.pkManual, hecho: !!s.hecho, agro: !!s.agro, bov: !!s.bov,
      soloFormulario: !!s.soloFormulario, editablesDespues: s.editablesDespues || null,
      cols: s.cols.filter(function (c) { return !c.hidden; }),
      puede: { leer: puede_(u, t, 'leer'), crear: puede_(u, t, 'crear'), editar: puede_(u, t, 'editar'), baja: puede_(u, t, 'baja') }
    };
  });
  return { usuario: publico_(u), esquema: esquema, listas: listas_(), resumen: resumen_(), rubros: Object.keys(RUBROS), version: VERSION, migracion: migracion, sesion: ses };
}
function enCarencia_() {
  var hoy = hoyStr_(), out = {};
  leer_('F_Sanidad').filter(activo_).forEach(function (x) {
    if (x.FinCarencia && x.FinCarencia > hoy && (!out[x.Caravana] || out[x.Caravana] < x.FinCarencia)) out[x.Caravana] = x.FinCarencia;
  });
  return out;
}
function resumen_() {
  var an = leer_('D_Animal').filter(function (a) { return activo_(a) && a.Estado === 'Activo'; });
  var car = enCarencia_();
  var comp = leer_('F_Compras').filter(function (x) { return activo_(x) && x.EstadoPago === 'Pendiente'; });
  var hoy = hoyStr_();
  return {
    rodeo: an.length,
    enCarencia: an.filter(function (a) { return car[a.Caravana]; }).length,
    comprasPendientes: comp.length,
    comprasVencidas: comp.filter(function (x) { return x.Vencimiento && x.Vencimiento < hoy; }).length,
    totalPendiente: Math.round(comp.reduce(function (a, x) { return a + Number(x.Total || 0); }, 0) * 100) / 100,
    porCobrar: pendientesCobro_().length,
    dolar: ultimaCotizacion_(),
    impuestos: (function () { try { var v = vencimientos_().lista; return { vencidos: v.filter(function (x) { return x.estado === 'Vencido'; }).length, porVencer: v.filter(function (x) { return x.estado === 'Por vencer'; }).length }; } catch (e) { return null; } })()
  };
}
function listas_() {
  var out = {};
  var car = enCarencia_();
  Object.keys(SCHEMA).forEach(function (t) {
    if (t.indexOf('D_') !== 0) return;
    var s = SCHEMA[t];
    out[t] = leer_(t).filter(activo_).map(function (x) {
      var lab = Array.isArray(s.label) ? s.label.map(function (k) { return x[k]; }).join(' – ') : String(x[s.label]);
      var item = { id: String(x[s.pk]), label: lab };
      if (t === 'D_Animal') { item.estado = x.Estado; item.cat = x.IdCategoria; item.label = 'Caravana ' + x.Caravana; item.peso = x.PesoKg; item.sexo = x.Sexo || ''; item.carencia = car[x.Caravana] || ''; }
      if (t === 'D_Campana') { item.desde = x.FechaDesde; item.hasta = x.FechaHasta; item.unidad = x.IdUnidad || UNIDAD_OVINA; }
      if (t === 'D_Subunidad') { item.unidad = x.IdUnidad; }
      if (t === 'D_Lote') { item.ha = x.Hectareas; item.camp = x.IdCampana; }
      if (t === 'D_Bovino') { item.label = String(x.Caravana); item.estado = x.Estado; item.cat = x.Categoria; item.sexo = x.Sexo; item.carga = x.IdCarga || ''; }
      if (t === 'D_InsumoAgro') { item.um = x.Unidad; item.cat = x.Categoria; }
      if (t === 'D_Producto') { item.iva = x.AlicuotaIVA; }
      if (t === 'D_Insumo') { item.rubro = x.Rubro || ''; item.um = x.IdUM; item.contenido = x.ContenidoEnvase || ''; item.tipo = x.TipoCosto; }
      if (t === 'D_Tercero') { item.tipo = x.Tipo; item.cuit = x.CUIT || ''; }
      if (t === 'D_TipoComprobante') { item.circuito = x.Circuito; item.signo = x.Signo; item.nombre = x.Nombre; }
      if (t === 'D_Categoria') { item.sub = x.IdSubunidad; }
      if (t === 'D_UM') { item.abrev = x.Abreviatura; }
      if (t === 'D_UnidadNeg') { item.link = x.LinkApp || ''; item.desc = x.Descripcion || ''; item.tipo = x.TipoActividad || ''; }
      if (t === 'D_LinkCotizacion') { item.url = x.URL; item.producto = x.Producto || ''; item.desc = x.Descripcion || ''; }
      if (t === 'D_Impuesto') { item.organismo = x.Organismo; }
      return item;
    });
  });
  return out;
}

function api_listar(token, tabla) {
  var u = sesion_(token);
  exigir_(u, tabla, 'leer');
  return leer_(tabla).map(function (o) { var c = sinOcultos_(tabla, o); c._puedeEditar = puede_(u, tabla, 'editar', o); c._puedeBaja = puede_(u, tabla, 'baja', o); return c; });
}

function api_crear(token, tabla, entrada) {
  var u = sesion_(token);
  exigir_(u, tabla, 'crear');
  if (SCHEMA[tabla].soloFormulario) throw new Error('Esto se carga desde su propio botón en la pantalla de inicio.');
  return conBloqueo_(function () {
    var o = limpiar_(tabla, entrada, u);
    if (tabla === 'S_Usuarios') {
      if (!entrada.ClaveNueva || String(entrada.ClaveNueva).length < 6) throw new Error('La clave inicial tiene que tener al menos 6 caracteres.');
    }
    if (tabla === 'D_Insumo' && o.Rubro && RUBROS[o.Rubro]) completarInsumo_(o);
    validar_(tabla, o, u);
    calcular_(tabla, o);
    if (tabla === 'F_VentaGrano') o.Comprobante = o.Destino === 'Terceros' ? proximaFactura_() : 'Transferencia interna'; // v3.7: misma numeración que las ventas de corderos
    if (tabla === 'S_Usuarios') { o.Sal = Utilities.getUuid(); o.ClaveHash = hash_(o.Sal, String(entrada.ClaveNueva)); }
    var id = insertar_(tabla, o, u.Email);
    if (tabla === 'F_MovBov') cambiarEstadoBov_(o.Caravana, estadoDeMov_(o.Tipo), o.Fecha, u.Email, String(o.Tipo) + ' ' + id);
    return { ok: true, id: id, mensaje: 'Guardado con el número ' + id + '.' };
  });
}
/** Un producto nuevo hereda del rubro la cuenta contable y la clasificación del costo (si no se indicaron). */
function completarInsumo_(o) {
  var r = RUBROS[o.Rubro];
  var cta = leer_('D_Cuenta').filter(function (c) { return activo_(c) && c.Codigo === r.cuenta; })[0];
  if (!o.IdCuenta && cta) o.IdCuenta = cta.IdCuenta;
  if (!o.TipoCosto) o.TipoCosto = r.tipo;
  if (!o.Variabilidad) o.Variabilidad = r.variab;
  return o;
}

function api_editar(token, tabla, id, entrada) {
  var u = sesion_(token);
  return conBloqueo_(function () {
    var actual = buscar_(tabla, id);
    exigir_(u, tabla, 'editar', actual);
    if (!activo_(actual)) throw new Error('El registro está dado de baja. Reactivalo antes de modificarlo.');
    var s = SCHEMA[tabla];
    var o;
    if (s.editablesDespues) {
      o = JSON.parse(JSON.stringify(actual));
      var limpio = limpiar_(tabla, entrada, u);
      s.editablesDespues.forEach(function (k) { if (entrada[k] !== undefined) o[k] = limpio[k]; });
      s.editablesDespues.forEach(function (k) {
        var c = colDe(tabla, k);
        if (c.t === 'enum' && o[k] !== '' && c.opts.indexOf(o[k]) < 0) throw new Error(etq_(tabla, c) + ': opción inválida.');
        if (c.fk && o[k] !== '' && !existeActivo_(c.fk, o[k])) throw new Error(etq_(tabla, c) + ': no existe.');
        if (c.t === 'date' && o[k] !== '' && !aFecha_(o[k])) throw new Error(etq_(tabla, c) + ': fecha inválida.');
      });
      if (tabla === 'F_Compras' && o.EstadoPago === 'Pagado' && !o.FechaPago) o.FechaPago = hoyStr_();
    } else {
      o = limpiar_(tabla, entrada, u);
      if (s.pkManual) o[s.pk] = actual[s.pk];
      validar_(tabla, o, u, id);
      calcular_(tabla, o);
      if (tabla === 'F_VentaGrano') o.Comprobante = actual.Comprobante; // el número de factura no se toca
      if (tabla === 'D_Bovino') { o.Estado = actual.Estado; o.FechaBaja = actual.FechaBaja; }
      if (tabla === 'D_Animal') { o.Estado = actual.Estado; o.FechaBaja = actual.FechaBaja; }
      // v3.3: si se corrige el peso, la fecha o el sexo de una ficha con datos estimados, se saca la marca de "estimado"
      if (tabla === 'D_Animal' && /estimad/i.test(String(o.Observaciones || '')) &&
          (String(o.PesoKg) !== String(actual.PesoKg) || String(o.FechaNac) !== String(actual.FechaNac) || String(o.Sexo) !== String(actual.Sexo))) {
        o.Observaciones = String(o.Observaciones).replace(/[^.]*estimad[^.]*\.?/gi, '').replace(/\s+/g, ' ').trim();
      }
      if (tabla === 'S_Usuarios') { o.Sal = actual.Sal; o.ClaveHash = actual.ClaveHash; }
      if (tabla === 'F_Costos') o.IdCompra = actual.IdCompra;
      if (!s.pkManual) o[s.pk] = actual[s.pk];
    }
    if (tabla === 'S_Usuarios' && String(id).toLowerCase() === u.Email && o.Rol !== 'Administrador') {
      throw new Error('No podés quitarte a vos misma el rol de Administrador.');
    }
    AUDIT_COLS.forEach(function (k) { o[k] = actual[k]; });
    o.ModificadoEl = new Date(); o.ModificadoPor = u.Email;
    reescribir_(tabla, actual._fila, o);
    auditar_(u.Email, 'Modificación', tabla, id, sinOcultos_(tabla, actual), sinOcultos_(tabla, o));
    if (tabla === 'F_Costos' && o.IdCompra) recalcularCompra_(o.IdCompra, u.Email);
    return { ok: true, mensaje: 'Cambios guardados en ' + id + '.' };
  });
}

/** Ningún registro se borra: se marca Activo = No (o se reactiva). Las bajas arrastran lo que dependía de ese registro. */
function api_baja(token, tabla, id, activar) {
  var u = sesion_(token);
  return conBloqueo_(function () {
    var actual = buscar_(tabla, id);
    exigir_(u, tabla, 'baja', actual);
    if (tabla === 'S_Usuarios' && String(id).toLowerCase() === u.Email) throw new Error('No podés darte de baja a vos misma.');
    if (tabla === 'F_Ingresos' || tabla === 'F_Mortandad') { // anular una venta o una muerte devuelve el animal al stock (y al revés)
      var an = buscar_('D_Animal', actual.Caravana);
      if (activar && an.Estado !== 'Activo') throw new Error('La caravana ' + an.Caravana + ' ya no está activa: no se puede reactivar.');
      if (!activar && an.Estado === 'Activo') throw new Error('La caravana ' + an.Caravana + ' figura activa: revisá antes de anular.');
      var est = tabla === 'F_Ingresos' ? 'Vendido' : 'Muerto';
      cambiarEstadoAnimal_(actual.Caravana, activar ? est : 'Activo', activar ? actual.Fecha : '', u.Email,
        (activar ? 'Reactivación de ' : 'Anulación de ') + (tabla === 'F_Ingresos' ? 'venta ' : 'muerte ') + id);
    }
    if (tabla === 'F_MovBov') { // v3.7: anular una venta, muerte o faltante de un bovino lo devuelve al rodeo (y al revés)
      var bv = buscar_('D_Bovino', actual.Caravana);
      if (activar && bv.Estado !== 'Activo') throw new Error('La caravana ' + bv.Caravana + ' ya no está activa: no se puede reactivar.');
      cambiarEstadoBov_(actual.Caravana, activar ? estadoDeMov_(actual.Tipo) : 'Activo', activar ? actual.Fecha : '', u.Email, (activar ? 'Reactivación de ' : 'Anulación de ') + String(actual.Tipo).toLowerCase() + ' ' + id);
    }
    if (tabla === 'F_Sanidad') { // el consumo que generó ese tratamiento sigue su suerte
      leer_('F_Consumo').filter(function (c) { return c.IdOrigen === id; }).forEach(function (c) { cambiarActivo_('F_Consumo', c, activar, u.Email, (activar ? 'Reactivación' : 'Baja') + ' por ' + id); });
    }
    if (tabla === 'F_Compras') { // anular una factura anula sus renglones de costo y sus pagos
      leer_('F_Costos').filter(function (c) { return c.IdCompra === id; }).forEach(function (c) { cambiarActivo_('F_Costos', c, activar, u.Email, (activar ? 'Reactivación' : 'Baja') + ' por ' + id); });
      leer_('F_Tesoreria').filter(function (c) { return c.IdCompra === id; }).forEach(function (c) { cambiarActivo_('F_Tesoreria', c, activar, u.Email, (activar ? 'Reactivación' : 'Baja') + ' por ' + id); });
    }
    cambiarActivo_(tabla, actual, activar, u.Email);
    if (tabla === 'F_Tesoreria') { if (actual.IdCompra) recalcEstadoCompra_(actual.IdCompra, u.Email); if (actual.ComprobanteVenta) recalcEstadoVenta_(actual.ComprobanteVenta, actual.IdTercero, u.Email); }
    if (tabla === 'F_Costos' && actual.IdCompra) recalcularCompra_(actual.IdCompra, u.Email);
    return { ok: true, mensaje: (activar ? 'Reactivado: ' : 'Dado de baja: ') + id + '.' };
  });
}

/* ---------- Numeración automática de facturas de venta (v3.1) ---------- */
var RE_FACTURA = /^[A-Z]{2,4} \d{4}-\d{9}$/;
function proximaFactura_() {
  var pre = (config_('FACTURA_PREFIJO') || 'FAV').trim().toUpperCase(), pv = ('0000' + (config_('FACTURA_PUNTO_VENTA') || '0003').trim()).slice(-4);
  var re = new RegExp('^' + pre + ' ' + pv + '-(\\d{9})$'), max = 0;
  leer_('F_Ingresos').concat(leer_('F_VentaGrano')).forEach(function (x) { var m = re.exec(String(x.Comprobante).trim()); if (m) max = Math.max(max, Number(m[1])); }); // también las anuladas: un número usado no se reutiliza (v3.7: corderos y grano comparten la numeración)
  var forzado = Number(config_('FACTURA_PROXIMO_NUMERO')) || 0;
  var n = Math.max(max + 1, forzado);
  return pre + ' ' + pv + '-' + ('000000000' + n).slice(-9);
}
function api_proximaFactura(token) { var u = sesion_(token); exigir_(u, 'F_Ingresos', 'crear'); return proximaFactura_(); }

/** Venta: un comprobante con uno o varios animales. Valida TODO antes de escribir. */
function api_registrarVenta(token, v) {
  var u = sesion_(token);
  exigir_(u, 'F_Ingresos', 'crear');
  return conBloqueo_(function () {
    if (!v.lineas || !v.lineas.length) throw new Error('Agregá al menos un animal a la venta.');
    v.Comprobante = proximaFactura_(); // el número lo pone el sistema (dentro del bloqueo: nunca se repite)
    var vistos = {};
    var animales = leer_('D_Animal');
    var san = leer_('F_Sanidad').filter(activo_);
    var filas = v.lineas.map(function (l) {
      var o = limpiar_('F_Ingresos', {
        Fecha: v.Fecha, Comprobante: v.Comprobante, IdTercero: v.IdTercero, IdProducto: v.IdProducto, IdSubunidad: v.IdSubunidad,
        Caravana: l.Caravana, Kg: l.Kg, PrecioKg: v.PrecioKg, PrecioIncluyeIVA: v.PrecioIncluyeIVA, EstadoCobro: v.EstadoCobro, Fuente: v.Fuente
      }, u);
      o.Caravana = Number(o.Caravana);
      if (vistos[o.Caravana]) throw new Error('La caravana ' + o.Caravana + ' está repetida en la venta.');
      vistos[o.Caravana] = true;
      validar_('F_Ingresos', o, u);
      var an = animales.filter(function (a) { return Number(a.Caravana) === o.Caravana; })[0];
      if (!an || an.Estado !== 'Activo') throw new Error('La caravana ' + o.Caravana + ' no está en el rodeo (estado: ' + (an ? an.Estado : 'no existe') + ').');
      if (an.FechaNac > o.Fecha) throw new Error('La caravana ' + o.Caravana + ' nació después de la fecha de venta.');
      if (v.EstadoCobro === 'Cobrado' && !v.IdFormaPago) throw new Error('Si la venta ya se cobró, elegí la forma de cobro.');
      var bloq = san.filter(function (s) { return Number(s.Caravana) === o.Caravana && s.Fecha <= o.Fecha && s.FinCarencia > o.Fecha; })[0];
      if (bloq) throw new Error('La caravana ' + o.Caravana + ' está EN CARENCIA (tratamiento ' + bloq.IdSanidad + '): no se puede vender hasta el ' + bloq.FinCarencia + '.');
      calcular_('F_Ingresos', o);
      return { o: o, an: an };
    });
    var ids = filas.map(function (f) {
      var id = insertar_('F_Ingresos', f.o, u.Email);
      cambiarEstadoAnimal_(f.an.Caravana, 'Vendido', f.o.Fecha, u.Email, 'Baja por venta ' + id);
      return id;
    });
    var tot = filas.reduce(function (a, f) { a.kg += f.o.Kg; a.neto += f.o.ImporteNeto; a.iva += f.o.IVA; a.total += f.o.Total; return a; }, { kg: 0, neto: 0, iva: 0, total: 0 });
    if (filas[0].o.EstadoCobro === 'Cobrado') {
      var mv = { Fecha: filas[0].o.Fecha, Tipo: 'Cobro', IdTipoComprobante: 'REC', Numero: '', IdTercero: filas[0].o.IdTercero, IdFormaPago: v.IdFormaPago,
        Importe: Math.round(tot.total * 100) / 100, IdCompra: '', ComprobanteVenta: filas[0].o.Comprobante, Observaciones: 'Cobrado al registrar la venta' };
      validar_('F_Tesoreria', mv, u); calcular_('F_Tesoreria', mv); insertar_('F_Tesoreria', mv, u.Email);
    }
    asegurarCotizacion_(filas[0].o.Fecha);
    return { ok: true, ids: ids, comprobante: v.Comprobante, totales: tot, mensaje: 'Venta registrada: ' + ids.length + (ids.length === 1 ? ' animal, ' : ' animales, ') + tot.kg + ' kg.' };
  });
}

/**
 * Compra: una factura (o nota de débito / crédito) de un proveedor con uno o varios renglones.
 * Cada renglón es un costo de una etapa. Factura A: el IVA se discrimina y queda como crédito fiscal
 * (no es costo). Factura B, C o sin letra: el IVA no se discrimina y todo el importe es costo.
 * Nota de crédito: los importes se restan.
 */
function api_registrarCompra(token, c) {
  var u = sesion_(token);
  exigir_(u, 'F_Compras', 'crear');
  exigir_(u, 'F_Costos', 'crear');
  return conBloqueo_(function () {
    if (!c.lineas || !c.lineas.length) throw new Error('Agregá al menos un renglón a la compra.');
    var cab = limpiar_('F_Compras', c, u);
    validar_('F_Compras', cab, u);
    var tc = leer_('D_TipoComprobante').filter(function (x) { return x.Codigo === cab.IdTipoComprobante; })[0];
    if (tc.Circuito !== 'Compra') throw new Error('El comprobante ' + tc.Codigo + ' no es de compra.');
    var signo = Number(tc.Signo) < 0 ? -1 : 1;
    if (cab.EstadoPago === 'Pagado' && !cab.FechaPago) cab.FechaPago = cab.Fecha;
    if (cab.Vencimiento && cab.Vencimiento < cab.Fecha) throw new Error('El vencimiento no puede ser anterior a la fecha de la factura.');
    var numero = String(cab.Numero).trim();
    var dup = leer_('F_Compras').filter(activo_).some(function (x) {
      return x.IdTercero === cab.IdTercero && x.IdTipoComprobante === cab.IdTipoComprobante && x.Letra === cab.Letra && String(x.Numero).trim() === numero;
    });
    if (dup) throw new Error('Esa factura (' + tc.Codigo + ' ' + cab.Letra + ' ' + numero + ') de ese proveedor ya está cargada.');
    if (cab.EstadoPago === 'Pagado' && signo > 0 && !cab.IdFormaPago) throw new Error('Si la factura ya está pagada, elegí la forma de pago.');
    var discrimina = cab.Letra === 'A';
    var comprobante = tc.Codigo + ' ' + cab.Letra + ' ' + numero;
    var renglones = c.lineas.map(function (l, i) {
      var o = limpiar_('F_Costos', {
        Fecha: cab.Fecha, Comprobante: comprobante, IdTercero: cab.IdTercero, IdInsumo: l.IdInsumo, IdSubunidad: l.IdSubunidad,
        Cantidad: l.Cantidad, PrecioUnit: l.PrecioUnit, AlicuotaIVA: discrimina ? (l.AlicuotaIVA === '' || l.AlicuotaIVA === undefined ? 21 : l.AlicuotaIVA) : 0,
        EsSupuesto: 'No', Fuente: comprobante + (c.Fuente ? ' · ' + c.Fuente : '')
      }, u);
      if ([0, 2.5, 5, 10.5, 21, 27].indexOf(Number(o.AlicuotaIVA)) < 0) throw new Error('Renglón ' + (i + 1) + ': la alícuota de IVA tiene que ser 0, 2,5, 5, 10,5, 21 o 27.');
      try { validar_('F_Costos', o, u); } catch (e) { throw new Error('Renglón ' + (i + 1) + ': ' + e.message); }
      calcular_('F_Costos', o);
      if (signo < 0) { o.Importe = -o.Importe; o.IVA = -o.IVA; }
      return o;
    });
    calcular_('F_Compras', cab);
    var r2 = function (x) { return Math.round(x * 100) / 100; };
    cab.Neto = r2(renglones.reduce(function (a, o) { return a + o.Importe; }, 0));
    cab.IVA = r2(renglones.reduce(function (a, o) { return a + o.IVA; }, 0));
    cab.Total = r2(cab.Neto + cab.IVA);
    var idC = insertar_('F_Compras', cab, u.Email);
    var ids = renglones.map(function (o) {
      o.IdCompra = idC;
      // Importe y Cantidad se guardan con signo para que la nota de crédito reste en el resultado.
      if (signo < 0) { o.Cantidad = -Math.abs(o.Cantidad); }
      return insertar_('F_Costos', o, u.Email);
    });
    if (cab.EstadoPago === 'Pagado' && signo > 0) {
      var mv = { Fecha: cab.FechaPago || cab.Fecha, Tipo: 'Pago', IdTipoComprobante: 'REP', Numero: '', IdTercero: cab.IdTercero, IdFormaPago: cab.IdFormaPago,
        Importe: cab.Total, IdCompra: idC, ComprobanteVenta: '', Observaciones: 'Pagado al cargar la factura' };
      validar_('F_Tesoreria', mv, u); calcular_('F_Tesoreria', mv); insertar_('F_Tesoreria', mv, u.Email);
    }
    asegurarCotizacion_(cab.Fecha);
    return { ok: true, id: idC, ids: ids, totales: { neto: cab.Neto, iva: cab.IVA, total: cab.Total },
      mensaje: 'Compra ' + idC + ' guardada (' + comprobante + ') con ' + ids.length + (ids.length === 1 ? ' renglón' : ' renglones') + '.' };
  });
}
function recalcularCompra_(idCompra, email) {
  var cab = leer_('F_Compras').filter(function (x) { return x.IdCompra === idCompra; })[0];
  if (!cab) return;
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var R = leer_('F_Costos').filter(function (x) { return activo_(x) && x.IdCompra === idCompra; });
  var o = JSON.parse(JSON.stringify(cab));
  o.Neto = r2(R.reduce(function (a, x) { return a + Number(x.Importe); }, 0));
  o.IVA = r2(R.reduce(function (a, x) { return a + Number(x.IVA || 0); }, 0));
  o.Total = r2(o.Neto + o.IVA);
  o.ModificadoEl = new Date(); o.ModificadoPor = email;
  reescribir_('F_Compras', cab._fila, o);
  auditar_(email, 'Recalculo de totales', 'F_Compras', idCompra, sinOcultos_('F_Compras', cab), sinOcultos_('F_Compras', o));
}

/**
 * Sanidad: una jornada de vacunación o tratamiento a uno o varios animales.
 * Por cada animal queda un registro (trazabilidad individual) y un consumo real del producto,
 * que alimenta el desvío de consumo. El costo del remedio entra por la COMPRA, no acá (así no se cuenta dos veces).
 */
function api_registrarSanidad(token, s) {
  var u = sesion_(token);
  exigir_(u, 'F_Sanidad', 'crear');
  return conBloqueo_(function () {
    var cars = (s.caravanas || []).map(Number).filter(function (x) { return x > 0; });
    if (!cars.length) throw new Error('Elegí al menos un animal.');
    var animales = leer_('D_Animal');
    var cats = {}; leer_('D_Categoria').forEach(function (c) { cats[c.IdCategoria] = c; });
    var idEv = nuevoId_('F_Sanidad', leer_('F_Sanidad').map(function (x) { return { IdSanidad: x.IdEvento }; }), 'JOR');
    var filas = cars.map(function (car) {
      var o = limpiar_('F_Sanidad', { Fecha: s.Fecha, Caravana: car, TipoEvento: s.TipoEvento, IdInsumo: s.IdInsumo, Dosis: s.Dosis,
        DiasCarencia: s.DiasCarencia, Responsable: s.Responsable || u.Nombre, Observaciones: s.Observaciones }, u);
      validar_('F_Sanidad', o, u);
      var an = animales.filter(function (a) { return Number(a.Caravana) === car; })[0];
      if (!an || an.Estado !== 'Activo') throw new Error('La caravana ' + car + ' no está en el rodeo.');
      if (an.FechaNac > o.Fecha) throw new Error('La caravana ' + car + ' nació después de esa fecha.');
      if (o.Fecha > hoyStr_()) throw new Error('No se pueden cargar tratamientos con fecha futura.');
      o.IdSubunidad = cats[an.IdCategoria] ? cats[an.IdCategoria].IdSubunidad : '';
      if (u.Rol === 'Responsable de subunidad' && !miEtapa_(u, o.IdSubunidad)) throw new Error('La caravana ' + car + ' no es de tu etapa.');
      o.IdEvento = idEv;
      o.FinCarencia = sumarDias_(o.Fecha, o.DiasCarencia);
      calcular_('F_Sanidad', o);
      return o;
    });
    var ids = filas.map(function (o) {
      var id = insertar_('F_Sanidad', o, u.Email);
      insertar_('F_Consumo', { Fecha: o.Fecha, IdCampana: o.IdCampana, IdSubunidad: o.IdSubunidad, IdInsumo: o.IdInsumo, CantidadReal: o.Dosis,
        BaseReal: 1, IdOrigen: id, Fuente: 'Sanidad ' + id + ' (' + o.TipoEvento + ', caravana ' + o.Caravana + ')' }, u.Email);
      return id;
    });
    var f = filas[0];
    return { ok: true, ids: ids, jornada: idEv, finCarencia: f.FinCarencia, dias: f.DiasCarencia,
      mensaje: 'Listo: ' + ids.length + ' animal' + (ids.length === 1 ? '' : 'es') + ' tratado' + (ids.length === 1 ? '' : 's') + ' (jornada ' + idEv + ').' +
        (Number(f.DiasCarencia) > 0 ? ' No se pueden vender hasta el ' + f.FinCarencia + '.' : '') };
  });
}

/** Muerte de un animal: queda el registro con la causa y el animal sale del rodeo. */
function api_registrarMuerte(token, m) {
  var u = sesion_(token);
  exigir_(u, 'F_Mortandad', 'crear');
  return conBloqueo_(function () {
    var o = limpiar_('F_Mortandad', m, u);
    o.Caravana = Number(o.Caravana);
    validar_('F_Mortandad', o, u);
    var an = buscar_('D_Animal', o.Caravana);
    if (an.Estado !== 'Activo') throw new Error('La caravana ' + o.Caravana + ' ya no está en el rodeo (' + an.Estado + ').');
    if (an.FechaNac > o.Fecha) throw new Error('La fecha es anterior al nacimiento del animal.');
    if (o.Fecha > hoyStr_()) throw new Error('La fecha no puede ser posterior a hoy.');
    var cat = leer_('D_Categoria').filter(function (c) { return c.IdCategoria === an.IdCategoria; })[0];
    o.IdSubunidad = cat ? cat.IdSubunidad : '';
    if (u.Rol === 'Responsable de subunidad' && !miEtapa_(u, o.IdSubunidad)) throw new Error('Ese animal no es de tu etapa.');
    calcular_('F_Mortandad', o);
    var id = insertar_('F_Mortandad', o, u.Email);
    cambiarEstadoAnimal_(o.Caravana, 'Muerto', o.Fecha, u.Email, 'Baja por muerte ' + id);
    return { ok: true, id: id, mensaje: 'Se registró la muerte de la caravana ' + o.Caravana + ' (' + id + '). Ya no figura en el rodeo.' };
  });
}

/** Historia de un animal: datos, tratamientos y movimientos. */
function api_ficha(token, caravana) {
  sesion_(token);
  var an = buscar_('D_Animal', caravana);
  var c = Number(caravana);
  var insumos = {}; leer_('D_Insumo').forEach(function (i) { insumos[i.IdInsumo] = i.Nombre; });
  return {
    animal: sinOcultos_('D_Animal', an), quien: quien_(an),
    sanidad: leer_('F_Sanidad').filter(function (x) { return activo_(x) && Number(x.Caravana) === c; })
      .map(function (x) { return { Fecha: x.Fecha, TipoEvento: x.TipoEvento, IdInsumo: x.IdInsumo, Producto: insumos[x.IdInsumo] || x.IdInsumo, Dosis: x.Dosis, FinCarencia: x.FinCarencia, Responsable: x.Responsable }; }),
    venta: leer_('F_Ingresos').filter(function (x) { return activo_(x) && Number(x.Caravana) === c; }).map(function (x) { return { Fecha: x.Fecha, Kg: x.Kg, PrecioKg: x.PrecioKg, Comprobante: x.Comprobante }; }),
    muerte: leer_('F_Mortandad').filter(function (x) { return activo_(x) && Number(x.Caravana) === c; }).map(function (x) { return { Fecha: x.Fecha, Causa: x.Causa, Observaciones: x.Observaciones }; }),
    hijos: leer_('D_Animal').filter(function (x) { return activo_(x) && (Number(x.Madre) === c || Number(x.Padre) === c); }).map(function (x) { return { Caravana: x.Caravana, FechaNac: x.FechaNac, Estado: x.Estado }; })
  };
}

function api_cambiarClave(token, actual, nueva) {
  var u = sesion_(token);
  if (!nueva || String(nueva).length < 6) throw new Error('La clave nueva tiene que tener al menos 6 caracteres.');
  return conBloqueo_(function () {
    var r = buscar_('S_Usuarios', u.Email);
    if (hash_(r.Sal, String(actual)) !== r.ClaveHash) throw new Error('La clave actual no es correcta.');
    r.Sal = Utilities.getUuid(); r.ClaveHash = hash_(r.Sal, String(nueva));
    r.ModificadoEl = new Date(); r.ModificadoPor = u.Email;
    reescribir_('S_Usuarios', r._fila, r);
    auditar_(u.Email, 'Cambio de clave', 'S_Usuarios', u.Email, null, null);
    return { ok: true, mensaje: 'Clave actualizada.' };
  });
}
function api_resetearClave(token, email, nueva) {
  var u = sesion_(token);
  if (u.Rol !== 'Administrador') throw new Error('Solo el Administrador puede resetear claves.');
  if (!nueva || String(nueva).length < 6) throw new Error('La clave tiene que tener al menos 6 caracteres.');
  return conBloqueo_(function () {
    var r = buscar_('S_Usuarios', email);
    r.Sal = Utilities.getUuid(); r.ClaveHash = hash_(r.Sal, String(nueva));
    r.ModificadoEl = new Date(); r.ModificadoPor = u.Email;
    reescribir_('S_Usuarios', r._fila, r);
    auditar_(u.Email, 'Reseteo de clave', 'S_Usuarios', email, null, null);
    return { ok: true, mensaje: 'Clave reseteada para ' + email + '.' };
  });
}

/** Formato argentino sin depender de Intl: 1.533.936,62 */
function fmtNum_(x, dec) {
  var neg = x < 0, p = Math.abs(Number(x)).toFixed(dec).split('.');
  var ent = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + ent + (dec > 0 ? ',' + p[1].replace(/0+$/, '') : '').replace(/,$/, '');
}

/* =============================================================================================
 * 8. REPORTES: ingresos, costos, margen bruto, % sobre costo, desvíos de rinde y de consumo
 * ============================================================================================= */
function api_reportes(token, idCampana) {
  sesion_(token);
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var campanas = campanasOvinas_();
  if (!idCampana) idCampana = campanas.length ? campanas[0].IdCampana : '';
  var camp = campanas.filter(function (c) { return c.IdCampana === idCampana; })[0];
  var subs = leer_('D_Subunidad').filter(function (x) { return activo_(x) && String(x.IdUnidad) === UNIDAD_OVINA; });
  var insumos = {}; leer_('D_Insumo').forEach(function (i) { insumos[i.IdInsumo] = i; });
  var deCamp = function (x) { return activo_(x) && x.IdCampana === idCampana; };
  var ing = leer_('F_Ingresos').filter(deCamp);
  var cos = leer_('F_Costos').filter(deCamp);
  var prod = leer_('F_Produccion').filter(deCamp);
  var cons = leer_('F_Consumo').filter(deCamp);
  var rin = leer_('F_EstandarRinde').filter(deCamp);
  var dos = leer_('F_Dosis').filter(deCamp);
  var mue = leer_('F_Mortandad').filter(deCamp);

  var linea = function (filtro) {
    var I = ing.filter(filtro), C = cos.filter(filtro);
    var o = { ingresos: 0, kg: 0, cabezas: I.length, iva: 0, directosReales: 0, directosSupuestos: 0, indirectos: 0, filasIng: I.length, filasCos: C.length };
    I.forEach(function (x) { o.ingresos += Number(x.ImporteNeto); o.kg += Number(x.Kg); o.iva += Number(x.IVA); });
    C.forEach(function (x) {
      var tipo = insumos[x.IdInsumo] ? insumos[x.IdInsumo].TipoCosto : 'Directo';
      if (tipo === 'Directo') { if (x.EsSupuesto === 'Sí') o.directosSupuestos += Number(x.Importe); else o.directosReales += Number(x.Importe); }
      else o.indirectos += Number(x.Importe);
    });
    o.costosDirectos = o.directosReales + o.directosSupuestos;
    o.margenBruto = o.ingresos - o.costosDirectos;
    o.pctSobreCosto = o.costosDirectos > 0 ? r2(o.margenBruto / o.costosDirectos * 100) : null;
    ['ingresos', 'iva', 'directosReales', 'directosSupuestos', 'indirectos', 'costosDirectos', 'margenBruto'].forEach(function (k) { o[k] = r2(o[k]); });
    o.tieneSupuestos = o.directosSupuestos > 0;
    // En dólares: cada renglón al dólar oficial BNA (vendedor) del día de la operación o del último día hábil anterior
    o.usd = { ingresos: 0, costosDirectos: 0, indirectos: 0, completo: true };
    I.forEach(function (x) { var c = cotizacion_(x.Fecha); if (c) o.usd.ingresos += Number(x.ImporteNeto) / c.Vendedor; else o.usd.completo = false; });
    C.forEach(function (x) {
      var c = cotizacion_(x.Fecha), tipo = insumos[x.IdInsumo] ? insumos[x.IdInsumo].TipoCosto : 'Directo';
      if (!c) { o.usd.completo = false; return; }
      if (tipo === 'Directo') o.usd.costosDirectos += Number(x.Importe) / c.Vendedor; else o.usd.indirectos += Number(x.Importe) / c.Vendedor;
    });
    o.usd.margenBruto = o.usd.ingresos - o.usd.costosDirectos;
    ['ingresos', 'costosDirectos', 'indirectos', 'margenBruto'].forEach(function (k) { o.usd[k] = r2(o.usd[k]); });
    return o;
  };
  var porSub = subs.map(function (s) { var l = linea(function (x) { return x.IdSubunidad === s.IdSubunidad; }); l.IdSubunidad = s.IdSubunidad; l.nombre = s.Nombre; l.muertes = mue.filter(function (m) { return m.IdSubunidad === s.IdSubunidad; }).length; return l; });
  var consolidado = linea(function () { return true; });
  consolidado.nombre = 'Consolidado unidad ovina';
  consolidado.muertes = mue.length;

  // Costos por rubro (para ver de un vistazo en qué se gasta)
  var rubros = {};
  cos.forEach(function (x) {
    var ins = insumos[x.IdInsumo] || {};
    var k = ins.Rubro || ins.Nombre || x.IdInsumo;
    if (!rubros[k]) rubros[k] = { rubro: k, tipo: ins.TipoCosto || '', reales: 0, supuestos: 0, filas: 0 };
    rubros[k][x.EsSupuesto === 'Sí' ? 'supuestos' : 'reales'] += Number(x.Importe);
    rubros[k].filas++;
  });
  var costosRubro = Object.keys(rubros).map(function (k) { var r = rubros[k]; r.reales = r2(r.reales); r.supuestos = r2(r.supuestos); r.total = r2(r.reales + r.supuestos); return r; })
    .sort(function (a, b) { return b.total - a.total; });

  var rinde = subs.map(function (s) {
    var P = prod.filter(function (x) { return x.IdSubunidad === s.IdSubunidad; });
    var kg = P.reduce(function (a, x) { return a + Number(x.KgProducidos); }, 0);
    var base = P.reduce(function (a, x) { return a + Number(x.CabezasBase); }, 0);
    var est = rin.filter(function (x) { return x.IdSubunidad === s.IdSubunidad; })[0];
    var real = base > 0 ? Math.round(kg / base * 100) / 100 : null;
    return { IdSubunidad: s.IdSubunidad, nombre: s.Nombre, kg: kg, base: base, real: real,
      estandar: est ? Number(est.Valor) : null, descripcion: est ? est.Descripcion : '', fuente: est ? est.Fuente + ' (' + est.FechaFuente + ')' : '',
      desvio: (real !== null && est) ? Math.round((real - Number(est.Valor)) * 100) / 100 : null,
      desvioPct: (real !== null && est) ? r2((real - Number(est.Valor)) / Number(est.Valor) * 100) : null };
  });

  var claves = {};
  cons.forEach(function (x) { claves[x.IdSubunidad + '|' + x.IdInsumo] = true; });
  dos.forEach(function (x) { claves[x.IdSubunidad + '|' + x.IdInsumo] = true; });
  var nomSub = {}; subs.forEach(function (s) { nomSub[s.IdSubunidad] = s.Nombre; });
  var consumo = Object.keys(claves).sort().map(function (k) {
    var p = k.split('|');
    var C = cons.filter(function (x) { return x.IdSubunidad === p[0] && x.IdInsumo === p[1]; });
    var real = C.reduce(function (a, x) { return a + Number(x.CantidadReal); }, 0);
    var base = C.reduce(function (a, x) { return a + Number(x.BaseReal); }, 0);
    var d = dos.filter(function (x) { return x.IdSubunidad === p[0] && x.IdInsumo === p[1]; })[0];
    var esperado = d ? Math.round(Number(d.DosisPorBase) * base * 10000) / 10000 : null;
    var ins = insumos[p[1]] || {};
    return { IdSubunidad: p[0], subunidad: nomSub[p[0]] || p[0], IdInsumo: p[1], insumo: ins.Nombre || p[1], um: ins.IdUM || '',
      real: real, base: base, dosis: d ? Number(d.DosisPorBase) : null, baseCalculo: d ? d.BaseCalculo : '', esperado: esperado,
      desvio: (esperado !== null && C.length) ? Math.round((real - esperado) * 10000) / 10000 : null };
  });
  var consumoConsolidado = {};
  consumo.forEach(function (c) {
    var k = c.IdInsumo;
    if (!consumoConsolidado[k]) consumoConsolidado[k] = { insumo: c.insumo, um: c.um, real: 0, esperado: 0, completo: true };
    consumoConsolidado[k].real += c.real;
    if (c.esperado === null || c.desvio === null) consumoConsolidado[k].completo = false; else consumoConsolidado[k].esperado += c.esperado;
  });
  var consumoTotal = Object.keys(consumoConsolidado).map(function (k) {
    var c = consumoConsolidado[k];
    return { insumo: c.insumo, um: c.um, real: c.real, esperado: c.completo ? c.esperado : null, desvio: c.completo ? Math.round((c.real - c.esperado) * 10000) / 10000 : null };
  });

  var animales = leer_('D_Animal').filter(activo_);
  var cats = {}; leer_('D_Categoria').forEach(function (c) { cats[c.IdCategoria] = c.Nombre; });
  var stock = {};
  animales.forEach(function (a) {
    var n = cats[a.IdCategoria] || a.IdCategoria;
    if (!stock[n]) stock[n] = { categoria: n, activos: 0, vendidos: 0, muertos: 0 };
    if (a.Estado === 'Activo') stock[n].activos++; else if (a.Estado === 'Vendido') stock[n].vendidos++; else stock[n].muertos++;
  });

  var lectura = [];
  var $ = function (x) { return '$' + fmtNum_(x, 0); };
  porSub.forEach(function (s) {
    if (!s.filasIng && !s.filasCos) { lectura.push(s.nombre + ': sin ingresos ni costos cargados en esta campaña.'); return; }
    var t = s.nombre + ': ingresos ' + $(s.ingresos) + ' (neto de IVA), costos directos ' + $(s.costosDirectos) + ', margen bruto ' + $(s.margenBruto);
    if (s.pctSobreCosto !== null) t += ' (' + fmtNum_(s.pctSobreCosto, 2) + '% sobre costo)';
    if (s.tieneSupuestos) t += '. Ojo: ' + $(s.directosSupuestos) + ' de los costos son SUPUESTOS, no reales';
    lectura.push(t + '.');
  });
  rinde.forEach(function (r) {
    if (r.real !== null && r.estandar === null) lectura.push(r.nombre + ': rinde real ' + fmtNum_(r.real, 2) + ' kg por cabeza base; falta cargar el rinde estándar para calcular el desvío.');
    if (r.desvio !== null) lectura.push(r.nombre + ': rinde real ' + fmtNum_(r.real, 2) + ' vs estándar ' + fmtNum_(r.estandar, 2) + ' → desvío ' + (r.desvio >= 0 ? '+' : '') + fmtNum_(r.desvio, 2) + '.');
  });
  if (mue.length) lectura.push('Murieron ' + mue.length + ' animal' + (mue.length === 1 ? '' : 'es') + ' en la campaña.');
  if (!consumo.length) lectura.push('No hay consumos reales ni dosis técnicas cargadas: el desvío de consumo todavía no se puede calcular.');

  return {
    campana: camp ? { id: camp.IdCampana, nombre: camp.Nombre, desde: camp.FechaDesde, hasta: camp.FechaHasta } : null,
    campanas: campanas.map(function (c) { return { id: c.IdCampana, nombre: c.Nombre }; }),
    porSubunidad: porSub, consolidado: consolidado, rinde: rinde, consumo: consumo, consumoTotal: consumoTotal, costosRubro: costosRubro,
    stock: Object.keys(stock).map(function (k) { return stock[k]; }), lectura: lectura,
    detalleIngresos: ing.map(function (x) { return sinOcultos_('F_Ingresos', x); }),
    detalleCostos: cos.map(function (x) { var c = sinOcultos_('F_Costos', x); c.TipoCosto = insumos[x.IdInsumo] ? insumos[x.IdInsumo].TipoCosto : ''; c.Insumo = insumos[x.IdInsumo] ? insumos[x.IdInsumo].Nombre : ''; return c; })
  };
}


/* =============================================================================================
 * 9. DÓLAR OFICIAL BANCO NACIÓN
 *    Fuente: cotización del dólar oficial del Banco de la Nación Argentina (billete), tomada de la API pública
 *    ArgentinaDatos (api.argentinadatos.com) y, para el día de hoy, de DolarApi (dolarapi.com) si la primera todavía no la tiene.
 *    actualizarDolar() la ejecuta Google solo, todos los días a las 19 h (activador creado en Actualizar.gs).
 *    Para pasar pesos a dólares se usa el VENDEDOR del día de la operación (o del último día hábil anterior).
 * ============================================================================================= */
var TC_ = null;
function cotizaciones_() {
  if (TC_) return TC_;
  try { TC_ = leer_('F_TipoCambio').filter(activo_).map(function (x) { return { Fecha: x.Fecha, Comprador: Number(x.Comprador), Vendedor: Number(x.Vendedor), Fuente: x.Fuente }; }); }
  catch (e) { TC_ = []; }
  TC_.sort(function (a, b) { return a.Fecha < b.Fecha ? -1 : 1; });
  return TC_;
}
/** Cotización del día o del último día hábil anterior (hasta 10 días para atrás). */
function cotizacion_(fecha) {
  var L = cotizaciones_(), f = String(fecha).slice(0, 10), r = null;
  for (var i = 0; i < L.length; i++) { if (L[i].Fecha <= f) r = L[i]; else break; }
  if (r && (aFecha_(f) - aFecha_(r.Fecha)) / 86400000 > 10) return null;
  return r;
}
function ultimaCotizacion_() { var L = cotizaciones_(); return L.length ? L[L.length - 1] : null; }

function traerCotizacion_(fecha) {
  var p = fecha.split('-');
  var url = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/' + p[0] + '/' + p[1] + '/' + p[2];
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      var j = JSON.parse(r.getContentText());
      if (j && j.venta) return { Fecha: fecha, Comprador: Number(j.compra), Vendedor: Number(j.venta), Fuente: 'Dólar oficial Banco Nación (billete) · ArgentinaDatos (' + url + ')' };
    }
  } catch (e) {}
  if (fecha === hoyStr_()) {
    try {
      var r2 = UrlFetchApp.fetch('https://dolarapi.com/v1/dolares/oficial', { muteHttpExceptions: true });
      if (r2.getResponseCode() === 200) {
        var k = JSON.parse(r2.getContentText());
        var fk = k.fechaActualizacion ? Utilities.formatDate(new Date(k.fechaActualizacion), TZ, 'yyyy-MM-dd') : '';
        if (k.venta && fk === fecha && [0, 6].indexOf(aFecha_(fecha).getDay()) < 0) return { Fecha: fecha, Comprador: Number(k.compra), Vendedor: Number(k.venta), Fuente: 'Dólar oficial Banco Nación (billete) · DolarApi (dolarapi.com), ' + k.fechaActualizacion };
      }
    } catch (e) {}
  }
  return null; // feriado, fin de semana o sin conexión
}
/**
 * Trae la cotización de hoy y completa las fechas de ventas, compras y recibos que todavía no tienen dólar.
 * La ejecuta el activador diario; también se puede ejecutar a mano desde el editor o desde Administración.
 */
function actualizarDolar() {
  CACHE_ = {}; HEAD_ = {}; TC_ = null;
  if (!ss_().getSheetByName('F_TipoCambio')) return 'Falta la hoja F_TipoCambio: ejecutá actualizar().';
  return conBloqueo_(function () {
    var fechas = {}; fechas[hoyStr_()] = 1;
    ['F_Ingresos', 'F_Compras', 'F_Costos', 'F_Tesoreria'].forEach(function (t) {
      if (!ss_().getSheetByName(t)) return;
      leer_(t).filter(activo_).forEach(function (x) { if (x.Fecha) fechas[String(x.Fecha).slice(0, 10)] = 1; });
    });
    var tiene = {}; leer_('F_TipoCambio').forEach(function (x) { tiene[x.Fecha] = 1; });
    var nuevas = [];
    Object.keys(fechas).sort().forEach(function (f) {
      TC_ = null;
      var c = cotizacion_(f);
      if (c && (aFecha_(f) - aFecha_(c.Fecha)) / 86400000 <= 4) return; // ya hay una del día o de pocos días antes (fin de semana)
      for (var d = 0; d <= 5; d++) { // si ese día no hubo cotización (fin de semana o feriado), busca el día hábil anterior
        var fd = sumarDias_(f, -d);
        if (tiene[fd]) break;
        var t = traerCotizacion_(fd);
        if (t) { t.Origen = 'Automático'; insertar_('F_TipoCambio', t, 'sistema (dólar automático)'); tiene[fd] = 1; nuevas.push(fd + ': $' + t.Vendedor); break; }
      }
    });
    TC_ = null;
    var extra = [];
    try { if (ss_().getSheetByName('F_Cotizacion')) { extra.push(actualizarGranos_()); extra.push(actualizarCanuelas_()); } } catch (e) { extra.push('Cotizaciones de granos: ' + e.message); }
    try { extra.push(fotoIndicadores_()); } catch (e) { extra.push('Historia de indicadores: ' + e.message); }
    return (nuevas.length ? 'Cotizaciones nuevas: ' + nuevas.join(' · ') : 'No hacía falta traer cotizaciones nuevas del dólar.') + (extra.length ? ' | ' + extra.join(' | ') : '');
  });
}
function api_actualizarDolar(token) {
  var u = sesion_(token);
  if (u.Rol !== 'Administrador') throw new Error('Solo el Administrador puede actualizar el dólar a mano (igual se actualiza solo todos los días).');
  var m = actualizarDolar();
  return { ok: true, mensaje: m, dolar: ultimaCotizacion_() };
}

/* =============================================================================================
 * 10. COBROS Y PAGOS
 *    Un recibo de pago (REP) se aplica a una factura de compra; un recibo de cobro (REC) a una factura de venta.
 *    Se permiten pagos parciales: la factura queda "Pagado"/"Cobrado" cuando el saldo llega a cero.
 * ============================================================================================= */
function movsActivos_() { try { return leer_('F_Tesoreria').filter(activo_); } catch (e) { return []; } }
function pagadoCompra_(idCompra) { return movsActivos_().filter(function (m) { return m.Tipo === 'Pago' && m.IdCompra === idCompra; }).reduce(function (a, m) { return a + Number(m.Importe); }, 0); }
function cobradoVenta_(comp, tercero) { return movsActivos_().filter(function (m) { return m.Tipo === 'Cobro' && m.ComprobanteVenta === comp && m.IdTercero === tercero; }).reduce(function (a, m) { return a + Number(m.Importe); }, 0); }
function ventasPorComprobante_() {
  var g = {};
  leer_('F_Ingresos').filter(activo_).forEach(function (x) {
    var k = x.Comprobante + '|' + x.IdTercero;
    if (!g[k]) g[k] = { Comprobante: x.Comprobante, IdTercero: x.IdTercero, Fecha: x.Fecha, Total: 0, Animales: 0, EstadoCobro: x.EstadoCobro, filas: [] };
    g[k].Total += Number(x.Total); g[k].Animales++; g[k].filas.push(x);
    if (x.EstadoCobro === 'Pendiente') g[k].EstadoCobro = 'Pendiente';
  });
  return g;
}
function pendientesCobro_() {
  var g = ventasPorComprobante_();
  return Object.keys(g).map(function (k) { var v = g[k]; v.Cobrado = cobradoVenta_(v.Comprobante, v.IdTercero); v.Saldo = Math.round((v.Total - v.Cobrado) * 100) / 100; delete v.filas; return v; })
    .filter(function (v) { return v.EstadoCobro === 'Pendiente' && v.Saldo > 0.009; });
}
function recalcEstadoCompra_(idCompra, email) {
  var c = buscar_('F_Compras', idCompra);
  var pag = pagadoCompra_(idCompra), tot = Number(c.Total);
  var estado = pag >= tot - 0.01 ? 'Pagado' : 'Pendiente';
  var ult = movsActivos_().filter(function (m) { return m.Tipo === 'Pago' && m.IdCompra === idCompra; }).map(function (m) { return m.Fecha; }).sort().pop() || '';
  if (c.EstadoPago === estado && (estado === 'Pendiente' || c.FechaPago === ult)) return;
  var o = JSON.parse(JSON.stringify(c)); o.EstadoPago = estado; o.FechaPago = estado === 'Pagado' ? ult : '';
  o.ModificadoEl = new Date(); o.ModificadoPor = email;
  reescribir_('F_Compras', c._fila, o);
  auditar_(email, 'Estado de pago: ' + estado, 'F_Compras', idCompra, sinOcultos_('F_Compras', c), sinOcultos_('F_Compras', o));
}
function recalcEstadoVenta_(comp, tercero, email) {
  var g = ventasPorComprobante_()[comp + '|' + tercero];
  if (!g) return;
  var estado = cobradoVenta_(comp, tercero) >= g.Total - 0.01 ? 'Cobrado' : 'Pendiente';
  g.filas.forEach(function (x) {
    if (x.EstadoCobro === estado) return;
    var o = JSON.parse(JSON.stringify(x)); o.EstadoCobro = estado; o.ModificadoEl = new Date(); o.ModificadoPor = email;
    reescribir_('F_Ingresos', x._fila, o);
    auditar_(email, 'Estado de cobro: ' + estado, 'F_Ingresos', x.IdIngreso, sinOcultos_('F_Ingresos', x), sinOcultos_('F_Ingresos', o));
  });
}
function api_registrarMovimiento(token, m) {
  var u = sesion_(token);
  exigir_(u, 'F_Tesoreria', 'crear');
  return conBloqueo_(function () {
    var o = limpiar_('F_Tesoreria', m, u);
    if (!o.IdTipoComprobante) o.IdTipoComprobante = o.Tipo === 'Pago' ? 'REP' : 'REC';
    validar_('F_Tesoreria', o, u);
    var tc = leer_('D_TipoComprobante').filter(function (x) { return x.Codigo === o.IdTipoComprobante; })[0];
    if (tc.Circuito !== o.Tipo) throw new Error('El comprobante ' + tc.Codigo + ' no corresponde a un ' + o.Tipo.toLowerCase() + '.');
    if (o.Fecha > hoyStr_()) throw new Error('La fecha no puede ser posterior a hoy.');
    var ter = item_('D_Tercero', o.IdTercero);
    if (o.Tipo === 'Pago') {
      o.ComprobanteVenta = '';
      if (ter && ter.Tipo === 'Cliente') throw new Error(ter.RazonSocial + ' está cargado solo como cliente: no se le hacen pagos.');
      if (o.IdCompra) {
        var c = buscar_('F_Compras', o.IdCompra);
        if (c.IdTercero !== o.IdTercero) throw new Error('Esa factura es de otro proveedor.');
        var saldo = Number(c.Total) - pagadoCompra_(o.IdCompra);
        if (o.Importe > saldo + 0.01) throw new Error('El pago ($' + fmtNum_(o.Importe, 2) + ') es mayor que lo que falta pagar de esa factura ($' + fmtNum_(saldo, 2) + ').');
        if (o.Fecha < c.Fecha) throw new Error('El pago no puede ser anterior a la fecha de la factura.');
      }
    } else {
      o.IdCompra = '';
      if (ter && ter.Tipo === 'Proveedor') throw new Error(ter.RazonSocial + ' está cargado solo como proveedor: no se le hacen cobros.');
      if (o.ComprobanteVenta) {
        var g = ventasPorComprobante_()[o.ComprobanteVenta + '|' + o.IdTercero];
        if (!g) throw new Error('No hay una venta con el comprobante ' + o.ComprobanteVenta + ' para ese cliente.');
        var saldoV = g.Total - cobradoVenta_(o.ComprobanteVenta, o.IdTercero);
        if (o.Importe > saldoV + 0.01) throw new Error('El cobro ($' + fmtNum_(o.Importe, 2) + ') es mayor que lo que falta cobrar de esa venta ($' + fmtNum_(saldoV, 2) + ').');
      }
    }
    calcular_('F_Tesoreria', o);
    var id = insertar_('F_Tesoreria', o, u.Email);
    asegurarCotizacion_(o.Fecha);
    if (o.IdCompra) recalcEstadoCompra_(o.IdCompra, u.Email);
    if (o.ComprobanteVenta) recalcEstadoVenta_(o.ComprobanteVenta, o.IdTercero, u.Email);
    return { ok: true, id: id, mensaje: (o.Tipo === 'Pago' ? 'Pago' : 'Cobro') + ' registrado (' + id + ') por $' + fmtNum_(o.Importe, 2) + '.' };
  });
}
function item_(tabla, id) { var pk = SCHEMA[tabla].pk; return leer_(tabla).filter(function (x) { return String(x[pk]) === String(id); })[0] || null; }
/** Lo que se debe, lo que nos deben y los últimos movimientos (con su equivalente en dólares). */
function api_cuentas(token) {
  sesion_(token);
  var usd = function (imp, f) { var c = cotizacion_(f); return c ? Math.round(imp / c.Vendedor * 100) / 100 : null; };
  var porPagar = leer_('F_Compras').filter(function (x) { return activo_(x) && x.EstadoPago === 'Pendiente' && Number(x.Total) > 0; }).map(function (x) {
    var pag = pagadoCompra_(x.IdCompra), saldo = Math.round((Number(x.Total) - pag) * 100) / 100;
    return { IdCompra: x.IdCompra, IdTercero: x.IdTercero, Comprobante: x.IdTipoComprobante + ' ' + x.Letra + ' ' + x.Numero, Fecha: x.Fecha, Vencimiento: x.Vencimiento,
      Total: Number(x.Total), Pagado: pag, Saldo: saldo, SaldoUSD: usd(saldo, hoyStr_()) };
  });
  var porCobrar = pendientesCobro_().map(function (v) { v.SaldoUSD = usd(v.Saldo, hoyStr_()); return v; });
  var movs = movsActivos_().sort(function (a, b) { return a.Fecha < b.Fecha ? 1 : -1; }).slice(0, 60).map(function (m) {
    var c = sinOcultos_('F_Tesoreria', m); c.ImporteUSD = usd(Number(m.Importe), m.Fecha); return c; });
  var pagadas = leer_('F_Compras').filter(function (x) { return activo_(x) && x.EstadoPago === 'Pagado'; }).sort(function (a, b) { return a.Fecha < b.Fecha ? 1 : -1; }).slice(0, 40)
    .map(function (x) { return { IdCompra: x.IdCompra, IdTercero: x.IdTercero, Comprobante: x.IdTipoComprobante + ' ' + x.Letra + ' ' + x.Numero, Fecha: x.Fecha, FechaPago: x.FechaPago, Total: Number(x.Total) }; });
  return { porPagar: porPagar, porCobrar: porCobrar, movimientos: movs, pagadas: pagadas, dolar: ultimaCotizacion_() };
}

/** Si para esa fecha todavía no hay dólar, intenta traerlo en el momento (si falla, lo completa el activador de la noche). */
function asegurarCotizacion_(fecha) {
  try {
    if (!ss_().getSheetByName('F_TipoCambio')) return;
    TC_ = null;
    var c = cotizacion_(fecha);
    if (c && (aFecha_(fecha) - aFecha_(c.Fecha)) / 86400000 <= 4) return;
    var tiene = {}; leer_('F_TipoCambio').forEach(function (x) { tiene[x.Fecha] = 1; });
    for (var d = 0; d <= 5; d++) {
      var fd = sumarDias_(fecha, -d);
      if (tiene[fd]) return;
      var t = traerCotizacion_(fd);
      if (t) { t.Origen = 'Automático'; insertar_('F_TipoCambio', t, 'sistema (dólar automático)'); TC_ = null; return; }
    }
  } catch (e) { /* sin conexión: no frena la carga */ }
}
/* =============================================================================================
 * 11. INDICADORES — Cuadro de Mando Integral (Kaplan y Norton), con semáforo (diapositiva 11)
 *    Las metas, textos y umbrales viven en la tabla P_Indicador (el administrador los cambia desde la app).
 *    El VALOR de cada indicador lo calcula el sistema con los datos cargados (funciones de CALC_IND).
 *    Un indicador nuevo que no tenga cálculo automático usa el "Valor cargado a mano".
 * ============================================================================================= */
function ctxIndicadores_(idCampana) {
  var campanas = campanasOvinas_().sort(function (a, b) { return a.FechaDesde < b.FechaDesde ? -1 : 1; });
  var hoy = hoyStr_();
  if (!idCampana) { var act = campanas.filter(function (c) { return c.FechaDesde <= hoy && hoy <= c.FechaHasta; })[0]; idCampana = act ? act.IdCampana : (campanas.length ? campanas[campanas.length - 1].IdCampana : ''); }
  var camp = campanas.filter(function (c) { return c.IdCampana === idCampana; })[0] || { FechaDesde: '0000-00-00', FechaHasta: '9999-12-31' };
  var deCamp = function (x) { return activo_(x) && x.IdCampana === idCampana; };
  var cats = {}; leer_('D_Categoria').forEach(function (c) { cats[c.IdCategoria] = c.Nombre; });
  var insumos = {}; leer_('D_Insumo').forEach(function (i) { insumos[i.IdInsumo] = i; });
  var animales = leer_('D_Animal').filter(activo_);
  var cat = function (a) { return String(cats[a.IdCategoria] || '').toLowerCase(); };
  var activos = animales.filter(function (a) { return a.Estado === 'Activo'; });
  var actual = camp.FechaDesde <= hoy && hoy <= camp.FechaHasta;
  var prod = leer_('F_Produccion').filter(deCamp);
  var ovejasHoy = activos.filter(function (a) { return cat(a) === 'oveja'; }).length;
  var basePrd = prod.reduce(function (m, x) { return Math.max(m, Number(x.CabezasBase) || 0); }, 0);
  var tryLeer = function (t) { try { return leer_(t); } catch (e) { return []; } };
  return {
    id: idCampana, camp: camp, campanas: campanas, hoy: hoy, actual: actual, cats: cats, cat: cat, insumos: insumos,
    animales: animales, activos: activos,
    ing: leer_('F_Ingresos').filter(deCamp), cos: leer_('F_Costos').filter(deCamp), mue: leer_('F_Mortandad').filter(deCamp),
    san: leer_('F_Sanidad').filter(activo_), cons: leer_('F_Consumo').filter(deCamp), dos: leer_('F_Dosis').filter(deCamp), prod: prod,
    tes: tryLeer('F_Tesoreria').filter(activo_), precios: tryLeer('F_PrecioProd').filter(activo_), presu: tryLeer('F_Presupuesto').filter(deCamp),
    productos: (function () { var p = {}; leer_('D_Producto').forEach(function (x) { p[x.IdProducto] = x; }); return p; })(),
    // Ovejas en servicio: la base de la producción de la campaña si está cargada; si no, las ovejas que hay hoy en el rodeo.
    ovejasBase: basePrd || ovejasHoy, ovejasBaseTxt: basePrd ? 'ovejas en servicio (producción de la campaña)' : 'ovejas en el rodeo hoy',
    nacidos: animales.filter(function (a) { return a.FechaNac >= camp.FechaDesde && a.FechaNac <= camp.FechaHasta; })
  };
}
var CALC_IND = {
  COBERTURA: function (c) {
    var ing = sumar_(c.ing, 'ImporteNeto'), tot = sumar_(c.cos, 'Importe');
    if (!tot) return { valor: null, detalle: 'No hay costos cargados en la campaña.' };
    if (!ing && c.actual) return { valor: null, detalle: 'Campaña en curso: todavía no hubo ventas (costos cargados hasta ahora: $' + fmtNum_(tot, 0) + ').' };
    return { valor: ing / tot * 100, detalle: '$' + fmtNum_(ing, 0) + ' de ingresos (sin IVA) ÷ $' + fmtNum_(tot, 0) + ' de costos totales (directos + indirectos)',
      nota: supuestos_(c.cos) ? 'Incluye costos SUPUESTOS ($' + fmtNum_(supuestos_(c.cos), 0) + ').' : '' };
  },
  MB_MADRE: function (c) {
    if (!c.ovejasBase) return { valor: null, detalle: 'No hay ovejas cargadas.' };
    var ing = sumar_(c.ing, 'ImporteNeto'), dir = sumar_(c.cos.filter(function (x) { return tipoCosto_(c, x) === 'Directo'; }), 'Importe');
    if (!ing && !dir) return { valor: null, detalle: 'Sin ingresos ni costos directos en la campaña.' };
    if (!ing && c.actual) return { valor: null, detalle: 'Campaña en curso: todavía no hubo ventas.' };
    return { valor: (ing - dir) / c.ovejasBase, detalle: '($' + fmtNum_(ing, 0) + ' de ingresos − $' + fmtNum_(dir, 0) + ' de costos directos) ÷ ' + c.ovejasBase + ' ' + c.ovejasBaseTxt };
  },
  DESVIO_PRESUP: function (c) {
    if (!c.presu.length) return { valor: null, detalle: 'Falta cargar el presupuesto de la campaña (Administración → Presupuesto por rubro).' };
    var real = 0, pres = 0, partes = [];
    var porRubro = {}; c.presu.forEach(function (p) { porRubro[p.Rubro] = (porRubro[p.Rubro] || 0) + Number(p.Importe); });
    Object.keys(porRubro).forEach(function (r) {
      var R = c.cos.filter(function (x) { var i = c.insumos[x.IdInsumo] || {}; return x.EsSupuesto !== 'Sí' && i.Rubro === r; });
      if (!R.length) return; // sin gasto real todavía en ese rubro: no se compara
      var v = sumar_(R, 'Importe'); real += v; pres += porRubro[r];
      partes.push(r + ': real $' + fmtNum_(v, 0) + ' vs presupuesto $' + fmtNum_(porRubro[r], 0) + ' (' + (v >= porRubro[r] ? '+' : '') + fmtNum_((v - porRubro[r]) / porRubro[r] * 100, 1) + '%)');
    });
    if (!pres) return { valor: null, detalle: 'Hay presupuesto pero todavía no hay gastos reales en esos rubros para comparar.' };
    return { valor: (real - pres) / pres * 100, detalle: partes.join(' · ') };
  },
  PRECIO_REL: function (c) {
    if (!c.ing.length) return { valor: null, detalle: 'No hubo ventas en la campaña.' };
    var kg = 0, imp = 0, fechas = [];
    c.ing.forEach(function (x) { var p = Number(x.PrecioKg), al = Number(x.AlicuotaIVA || 0); kg += Number(x.Kg); imp += Number(x.Kg) * (x.PrecioIncluyeIVA === 'Sí' ? p : p * (1 + al / 100)); fechas.push(x.Fecha); });
    var obt = imp / kg, fVenta = fechas.sort()[Math.floor(fechas.length / 2)];
    var prods = {}; c.ing.forEach(function (x) { prods[x.IdProducto] = 1; });
    var refs = c.precios.filter(function (p) { return p.TipoPrecio === 'Referencia de mercado' && prods[p.IdProducto] && p.PrecioIncluyeIVA !== 'Sin dato'; });
    if (!refs.length) return { valor: null, detalle: 'Falta un precio de referencia de mercado para ese producto (Administración → Precios de productos).' };
    var dist = function (p) { return Math.abs(aFecha_(p.Fecha) - aFecha_(fVenta)); };
    var ref = refs.sort(function (a, b) { return dist(a) - dist(b); })[0];
    var al = Number((c.productos[ref.IdProducto] || {}).AlicuotaIVA || 0), pr = Number(ref.Precio) * (ref.PrecioIncluyeIVA === 'Sí' ? 1 : 1 + al / 100);
    var dias = Math.round(dist(ref) / 86400000);
    return { valor: obt / pr * 100, detalle: '$' + fmtNum_(obt, 2) + '/kg obtenido ÷ $' + fmtNum_(pr, 2) + '/kg de referencia (los dos con IVA). Referencia: ' + ref.Fuente + ' (' + ref.Fecha + ')',
      nota: dias > 60 ? 'Ojo: la referencia es de ' + dias + ' días de diferencia con la venta; con inflación, la comparación no es exacta.' : '' };
  },
  COBRANZA: function (c) {
    var g = {};
    c.ing.forEach(function (x) { var k = x.Comprobante + '|' + x.IdTercero; if (!g[k]) g[k] = { comp: x.Comprobante, ter: x.IdTercero, fecha: x.Fecha, total: 0 }; g[k].total += Number(x.Total); });
    var claves = Object.keys(g); if (!claves.length) return { valor: null, detalle: 'No hubo ventas en la campaña.' };
    var sumDias = 0, sumImp = 0, pend = 0;
    claves.forEach(function (k) {
      var v = g[k], M = c.tes.filter(function (m) { return m.Tipo === 'Cobro' && m.ComprobanteVenta === v.comp && m.IdTercero === v.ter; });
      var cobrado = 0;
      M.forEach(function (m) { var d = Math.max(0, Math.round((aFecha_(m.Fecha) - aFecha_(v.fecha)) / 86400000)); sumDias += d * Number(m.Importe); sumImp += Number(m.Importe); cobrado += Number(m.Importe); });
      var saldo = v.total - cobrado;
      if (saldo > 0.01) { var dd = Math.max(0, Math.round((aFecha_(c.hoy) - aFecha_(v.fecha)) / 86400000)); sumDias += dd * saldo; sumImp += saldo; pend++; }
    });
    return { valor: sumImp ? sumDias / sumImp : null, detalle: claves.length + ' factura' + (claves.length === 1 ? '' : 's') + ' de venta; días entre la venta y el cobro, ponderados por importe',
      nota: pend ? pend + ' venta' + (pend === 1 ? '' : 's') + ' todavía sin cobrar: se cuentan los días hasta hoy.' : '' };
  },
  CORDEROS_MADRE: function (c) {
    if (!c.ovejasBase) return { valor: null, detalle: 'No hay ovejas cargadas.' };
    var nac = c.nacidos.length, muertos = c.nacidos.filter(function (a) { return a.Estado === 'Muerto'; }).length;
    if (!nac) return { valor: null, detalle: 'Todavía no hay nacimientos en la campaña.' };
    return { valor: (nac - muertos) / c.ovejasBase * 100, detalle: (nac - muertos) + ' corderos logrados (' + nac + ' nacidos − ' + muertos + ' muertos) ÷ ' + c.ovejasBase + ' ' + c.ovejasBaseTxt,
      nota: c.actual ? 'Campaña en curso: el valor puede cambiar hasta el destete.' : '' };
  },
  SUPERVIVENCIA: function (c) {
    var nac = c.nacidos.length; if (!nac) return { valor: null, detalle: 'Todavía no hay nacimientos en la campaña.' };
    var muertos = c.nacidos.filter(function (a) { return a.Estado === 'Muerto'; }).length;
    return { valor: (nac - muertos) / nac * 100, detalle: (nac - muertos) + ' corderos vivos o vendidos ÷ ' + nac + ' nacidos en la campaña' };
  },
  KG_MADRE: function (c) {
    if (!c.ovejasBase) return { valor: null, detalle: 'No hay ovejas cargadas.' };
    var kg = sumar_(c.ing, 'Kg'); if (!kg) return { valor: null, detalle: 'Todavía no hay kilos vendidos en la campaña.' };
    return { valor: kg / c.ovejasBase, detalle: fmtNum_(kg, 1) + ' kg vendidos ÷ ' + c.ovejasBase + ' ' + c.ovejasBaseTxt };
  },
  PRENEZ: function (c) {
    var ov = c.activos.filter(function (a) { return c.cat(a) === 'oveja'; }); if (!ov.length) return { valor: null, detalle: 'No hay ovejas en el rodeo.' };
    var p = ov.filter(function (a) { return a.EstadoRepro === 'Preñada'; }).length;
    return { valor: p / ov.length * 100, detalle: p + ' ovejas preñadas ÷ ' + ov.length + ' ovejas en el rodeo', nota: 'Es una foto de HOY (según el estado reproductivo cargado en cada oveja), no depende de la campaña elegida.' };
  },
  MORTALIDAD: function (c) {
    var base = c.animales.filter(function (a) { return a.FechaNac <= c.camp.FechaHasta && (!a.FechaBaja || a.FechaBaja >= c.camp.FechaDesde); }).length;
    if (!base) return { valor: null, detalle: 'Sin animales en la campaña.' };
    var nd = c.mue.filter(function (m) { return /diferencia de conteo/i.test(String(m.Observaciones)); }).length;
    return { valor: c.mue.length / base * 100, detalle: c.mue.length + ' muertes ÷ ' + base + ' animales que estuvieron en el rodeo durante la campaña',
      nota: nd ? nd + ' de esas bajas son por diferencia de conteo con el dueño (causa real desconocida).' : '' };
  },
  DESVIO_ALIM: function (c) {
    var real = 0, esp = 0, partes = [];
    var claves = {}; c.cons.forEach(function (x) { claves[x.IdSubunidad + '|' + x.IdInsumo] = 1; });
    Object.keys(claves).forEach(function (k) {
      var p = k.split('|'), ins = c.insumos[p[1]] || {};
      if (ins.Rubro !== 'Alimentación') return;
      var d = c.dos.filter(function (x) { return x.IdSubunidad === p[0] && x.IdInsumo === p[1]; })[0]; if (!d) return;
      var C = c.cons.filter(function (x) { return x.IdSubunidad === p[0] && x.IdInsumo === p[1]; });
      var r = sumar_(C, 'CantidadReal'), e = Number(d.DosisPorBase) * sumar_(C, 'BaseReal');
      real += r; esp += e; partes.push(ins.Nombre + ': ' + fmtNum_(r, 1) + ' real vs ' + fmtNum_(e, 1) + ' esperado');
    });
    if (!esp) return { valor: null, detalle: 'Falta el consumo real o la dosis técnica de algún alimento en la campaña.' };
    return { valor: (real - esp) / esp * 100, detalle: partes.join(' · ') };
  },
  SANIDAD_REG: function (c) {
    if (!c.activos.length) return { valor: null, detalle: 'No hay animales en el rodeo.' };
    var desde = sumarDias_(c.hoy, -365), con = {};
    c.san.forEach(function (s) { if (s.Fecha >= desde) con[Number(s.Caravana)] = 1; });
    var n = c.activos.filter(function (a) { return con[Number(a.Caravana)]; }).length;
    return { valor: n / c.activos.length * 100, detalle: n + ' animales con al menos un tratamiento registrado en el último año ÷ ' + c.activos.length + ' en el rodeo',
      nota: 'Foto de HOY. Los corderos sin vacunar bajan este indicador.' };
  },
  COSTOS_REALES: function (c) {
    if (!c.cos.length) return { valor: null, detalle: 'No hay costos cargados en la campaña.' };
    var r = c.cos.filter(function (x) { return x.EsSupuesto !== 'Sí'; }).length;
    return { valor: r / c.cos.length * 100, detalle: r + ' renglones de costo con dato real ÷ ' + c.cos.length + ' renglones cargados' };
  },
  FICHAS: function (c) {
    if (!c.activos.length) return { valor: null, detalle: 'No hay animales en el rodeo.' };
    var ok = c.activos.filter(function (a) { return a.Sexo && a.PesoKg !== '' && a.PesoKg !== null && !/estimad/i.test(String(a.Observaciones)); }).length;
    return { valor: ok / c.activos.length * 100, detalle: ok + ' fichas completas (sexo, peso y fecha real) ÷ ' + c.activos.length + ' animales en el rodeo', nota: 'Foto de HOY.' };
  }
};
function sumar_(L, k) { return L.reduce(function (a, x) { return a + (Number(x[k]) || 0); }, 0); }
function supuestos_(cos) { return sumar_(cos.filter(function (x) { return x.EsSupuesto === 'Sí'; }), 'Importe'); }
function tipoCosto_(c, x) { return c.insumos[x.IdInsumo] ? c.insumos[x.IdInsumo].TipoCosto : 'Directo'; }
function semaforo_(v, ind) {
  if (v === null || v === undefined || isNaN(v)) return 'Sin datos';
  if (ind.MetaVerde === '' || ind.MetaVerde === undefined || ind.MetaVerde === null) return 'Sin meta';
  var mv = Number(ind.MetaVerde), ma = ind.MetaAmarillo === '' || ind.MetaAmarillo === undefined ? mv : Number(ind.MetaAmarillo);
  if (ind.Sentido === 'Menor es mejor') return v <= mv ? 'Verde' : v <= ma ? 'Amarillo' : 'Rojo';
  if (ind.Sentido === 'Cerca de cero es mejor') { var a = Math.abs(v); return a <= mv ? 'Verde' : a <= ma ? 'Amarillo' : 'Rojo'; }
  return v >= mv ? 'Verde' : v >= ma ? 'Amarillo' : 'Rojo';
}
function api_indicadores(token, idCampana) {
  sesion_(token);
  return indicadoresDe_(idCampana);
}
function indicadoresDe_(idCampana) {
  var c = ctxIndicadores_(idCampana);
  var defs = [];
  try { defs = leer_('P_Indicador').filter(function (d) { return activo_(d) && (!d.IdUnidad || String(d.IdUnidad) === UNIDAD_OVINA); }); } catch (e) { throw new Error('Falta la tabla de indicadores: recargá la página para que el sistema se actualice.'); }
  defs.sort(function (a, b) { return (PERSPECTIVAS.indexOf(a.Perspectiva) - PERSPECTIVAS.indexOf(b.Perspectiva)) || (Number(a.Orden) || 99) - (Number(b.Orden) || 99); });
  var cuenta = { Verde: 0, Amarillo: 0, Rojo: 0, 'Sin datos': 0, 'Sin meta': 0 };
  var lista = defs.map(function (d) {
    var r;
    try { r = CALC_IND[d.IdIndicador] ? CALC_IND[d.IdIndicador](c) : (d.ValorManual !== '' ? { valor: Number(d.ValorManual), detalle: 'Valor cargado a mano por el administrador.' } : { valor: null, detalle: 'Este indicador no tiene cálculo automático: cargá el valor a mano.' }); }
    catch (e) { r = { valor: null, detalle: 'No se pudo calcular: ' + e.message }; }
    var v = r.valor === null || r.valor === undefined || isNaN(r.valor) ? null : Math.round(r.valor * 100) / 100;
    var est = semaforo_(v, d); cuenta[est]++;
    return { id: d.IdIndicador, perspectiva: d.Perspectiva, objetivo: d.Objetivo, nombre: d.Nombre, formula: d.Formula, interpretacion: d.Interpretacion,
      unidad: d.Unidad, sentido: d.Sentido, metaVerde: d.MetaVerde, metaAmarillo: d.MetaAmarillo, fuenteMeta: d.FuenteMeta, periodicidad: d.Periodicidad,
      responsable: d.Responsable, decision: d.Decision, valor: v, estado: est, detalle: r.detalle || '', nota: r.nota || '', automatico: !!CALC_IND[d.IdIndicador] };
  });
  return { campana: { id: c.id, nombre: c.camp.Nombre, desde: c.camp.FechaDesde, hasta: c.camp.FechaHasta, actual: c.actual },
    campanas: c.campanas.map(function (x) { return { id: x.IdCampana, nombre: x.Nombre }; }), indicadores: lista, cuenta: cuenta };
}

/* =============================================================================================
 * 12. COTIZACIONES — granos de la Bolsa de Comercio de Rosario (automático, todos los días con el dólar),
 *     Mercado Agroganadero de Cañuelas (experimental) y links guardados.
 * ============================================================================================= */
var URL_BCR = 'https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-0';
var URL_MAG = 'http://www.mercadoagroganadero.com.ar/dll/inicio.dll';
function textoPlano_(html) {
  var ent = { nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', amp: '&', quot: '"', lt: '<', gt: '>', deg: '°' };
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); }).replace(/&([a-zA-Z]+);/g, function (m, n) { return ent[n] !== undefined ? ent[n] : m; })
    .replace(/\s+/g, ' ');
}
function numAR_(s) { return Number(String(s).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); }
/** Lee la tabla "Precios Cámara Arbitral de Cereales de Rosario" (pesos por tonelada) y devuelve la fecha más reciente y sus precios. */
function parsearBCR_(html) {
  var t = textoPlano_(html);
  var i = t.search(/Fecha\s+Negociaci/i); if (i < 0) i = t.search(/C[aá]mara Arbitral/i); if (i < 0) throw new Error('no se encontró la tabla de precios');
  var resto = t.slice(i);
  var f = /(\d{2})\/(\d{2})\/(\d{4})/.exec(resto); if (!f) throw new Error('no se encontró la fecha');
  var fecha = f[3] + '-' + f[2] + '-' + f[1], precios = {};
  ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Sorgo'].forEach(function (g) {
    var re = new RegExp(g.replace('í', '[ií]') + '[^$0-9]{0,60}?(\\$\\s*[\\d\\.]+,\\d{2}|S\\/C)', 'i');
    var m = re.exec(resto);
    if (m && m[1] !== 'S/C') { var v = numAR_(m[1]); if (v > 1000 && v < 100000000) precios[g] = v; }
  });
  if (!Object.keys(precios).length) throw new Error('no se encontraron precios');
  return { fecha: fecha, precios: precios };
}
function guardarCotizacion_(o, email) {
  var ya = leer_('F_Cotizacion').some(function (x) { return activo_(x) && x.Fecha === o.Fecha && x.Producto === o.Producto && x.Mercado === o.Mercado; });
  if (ya) return false;
  insertar_('F_Cotizacion', o, email || 'sistema (cotización automática)');
  return true;
}
/** Trae los precios de granos de la BCR. Se ejecuta todos los días con actualizarDolar(); también a mano desde Cotizaciones. */
function actualizarGranos_() {
  try {
    var r = UrlFetchApp.fetch(URL_BCR, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return 'BCR: la página respondió ' + r.getResponseCode() + '.';
    var p = parsearBCR_(r.getContentText());
    var nuevas = [];
    Object.keys(p.precios).forEach(function (g) {
      if (guardarCotizacion_({ Fecha: p.fecha, Producto: g, Mercado: 'Bolsa de Comercio de Rosario (Cámara Arbitral, pizarra)', Precio: p.precios[g], Unidad: '$/t',
        Origen: 'Automático', Link: URL_BCR, Observaciones: 'Precio pizarra (promedio ponderado del mercado físico)' })) nuevas.push(g + ' $' + fmtNum_(p.precios[g], 0));
    });
    return nuevas.length ? 'BCR ' + p.fecha + ': ' + nuevas.join(', ') : 'BCR: ya estaban las cotizaciones del ' + p.fecha + '.';
  } catch (e) { return 'BCR: no se pudo leer (' + e.message + ').'; }
}
/** Mercado Agroganadero de Cañuelas: intenta leer el índice INMAG ($/kg vivo). EXPERIMENTAL: si la página cambia, avisa y no carga nada. */
function actualizarCanuelas_() {
  try {
    var r = UrlFetchApp.fetch(URL_MAG, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return 'Cañuelas: la página respondió ' + r.getResponseCode() + '.';
    var t = textoPlano_(r.getContentText());
    var m = /INMAG[^0-9]{0,80}([\d\.]+,\d{1,3})/i.exec(t);
    if (!m) return 'Cañuelas: no se encontró el INMAG en la página (habrá que revisar la fuente).';
    var v = numAR_(m[1]);
    if (!(v > 100 && v < 100000)) return 'Cañuelas: el valor leído (' + m[1] + ') no parece un precio por kg; no se guardó.';
    var fm = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t.slice(Math.max(0, m.index - 300), m.index + 300));
    var fecha = fm ? fm[3] + '-' + fm[2] + '-' + fm[1] : hoyStr_();
    var ok = guardarCotizacion_({ Fecha: fecha, Producto: 'Hacienda bovina (INMAG)', Mercado: 'Mercado Agroganadero de Cañuelas', Precio: v, Unidad: '$/kg vivo',
      Origen: 'Automático', Link: URL_MAG, Observaciones: 'Lectura automática EXPERIMENTAL del índice INMAG: verificar en la página.' });
    return ok ? 'Cañuelas ' + fecha + ': INMAG $' + fmtNum_(v, 2) + '/kg' : 'Cañuelas: ya estaba el INMAG del ' + fecha + '.';
  } catch (e) { return 'Cañuelas: no se pudo leer (' + e.message + ').'; }
}
function api_cotizaciones(token) {
  sesion_(token);
  var L = leer_('F_Cotizacion').filter(activo_).sort(function (a, b) { return a.Fecha < b.Fecha ? 1 : -1; });
  var ult = {};
  L.forEach(function (x) { var k = x.Producto + '|' + x.Mercado; if (!ult[k]) ult[k] = { producto: x.Producto, mercado: x.Mercado, unidad: x.Unidad, fecha: x.Fecha, precio: Number(x.Precio), origen: x.Origen, link: x.Link, obs: x.Observaciones, anterior: null };
    else if (ult[k].anterior === null) ult[k].anterior = { fecha: x.Fecha, precio: Number(x.Precio) }; });
  var dolar = cotizaciones_().slice(-15).reverse();
  return { ultimas: Object.keys(ult).map(function (k) { return ult[k]; }), historial: L.slice(0, 120).map(function (x) { return sinOcultos_('F_Cotizacion', x); }), dolar: dolar };
}
function api_actualizarCotizaciones(token) {
  var u = sesion_(token);
  if (u.Rol !== 'Administrador') throw new Error('Solo el Administrador puede pedir la actualización a mano (igual se actualiza sola todos los días a las 19 h).');
  return conBloqueo_(function () { return { ok: true, mensaje: [actualizarGranos_(), actualizarCanuelas_()].join(' · ') }; });
}

/* =============================================================================================
 * 13. IMPUESTOS — vencimientos con semáforo
 *     "Según terminación de CUIT": las fechas salen del calendario cargado (F_VencImpuesto) para la terminación del CUIT
 *     del establecimiento (S_Config). Si falta el año, se ESTIMA con las fechas del año anterior (se marca "Estimado").
 *     "Fecha fija": todos los meses (o los indicados) el día elegido.
 * ============================================================================================= */
function config_(clave) { try { var r = leer_('S_Config').filter(function (x) { return activo_(x) && x.Clave === clave; })[0]; return r ? String(r.Valor || '') : ''; } catch (e) { return ''; } }
function habil_(f) { var d = aFecha_(f); while ([0, 6].indexOf(d.getDay()) >= 0) d.setDate(d.getDate() + 1); return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function mesesDe_(per) { return { 'Mensual': 1, 'Bimestral': 2, 'Trimestral': 3, 'Cuatrimestral': 4, 'Semestral': 6, 'Anual': 12 }[per] || 1; }
function vencimientos_() {
  var hoy = hoyStr_(), desde = sumarDias_(hoy, -90), hasta = sumarDias_(hoy, 150);
  var cuit = config_('CUIT_ESTABLECIMIENTO').replace(/\D/g, ''), term = cuit ? cuit.slice(-1) : '';
  var imps = leer_('D_Impuesto').filter(activo_), cal = leer_('F_VencImpuesto').filter(activo_), pagos = leer_('F_PagoImpuesto').filter(activo_);
  var lista = [], avisos = [];
  imps.forEach(function (imp) {
    var fechas = [];
    if (imp.TipoVencimiento === 'Fecha fija') {
      var meses = String(imp.MesesFijos || '').split(/[^\d]+/).map(Number).filter(function (m) { return m >= 1 && m <= 12; }), paso = mesesDe_(imp.Periodicidad);
      var d = aFecha_(desde.slice(0, 8) + '01');
      for (var k = 0; k < 10; k++) {
        var y = d.getFullYear(), m = d.getMonth() + 1;
        var toca = meses.length ? meses.indexOf(m) >= 0 : ((m - 1) % paso === 0);
        if (toca) {
          var ult = new Date(y, m, 0, 12).getDate(), dia = Math.min(Number(imp.DiaFijo) || 1, ult);
          fechas.push({ periodo: y + '-' + ('0' + m).slice(-2), fecha: habil_(y + '-' + ('0' + m).slice(-2) + '-' + ('0' + dia).slice(-2)), estado: 'Fecha fija', fuente: 'Día ' + imp.DiaFijo + ' de cada período (si cae fin de semana, pasa al lunes)' });
        }
        d.setMonth(d.getMonth() + 1);
      }
    } else {
      if (!term) { avisos.push(imp.Nombre + ': cargá el CUIT del establecimiento en Configuración para calcular los vencimientos.'); return; }
      var propios = cal.filter(function (v) { return v.IdImpuesto === imp.IdImpuesto && (v.Terminacion === term || v.Terminacion === 'Todas'); });
      var porPer = {}; propios.forEach(function (v) { porPer[v.Periodo] = v; });
      propios.forEach(function (v) { fechas.push({ periodo: v.Periodo, fecha: v.FechaVencimiento, estado: v.Estado, fuente: v.Fuente || '' }); });
      // Estimación: períodos de la ventana que no están cargados, copiando el día del mismo período del año anterior.
      var d2 = aFecha_(desde.slice(0, 8) + '01');
      for (var j = 0; j < 9; j++) {
        var per = Utilities.formatDate(d2, TZ, 'yyyy-MM'), ant = (Number(per.slice(0, 4)) - 1) + per.slice(4);
        if (!porPer[per] && porPer[ant]) {
          var fAnt = porPer[ant].FechaVencimiento, fEst = (Number(fAnt.slice(0, 4)) + 1) + fAnt.slice(4);
          fechas.push({ periodo: per, fecha: habil_(fEst), estado: 'Estimado', fuente: 'Estimado con el vencimiento del ' + ant + ' (' + fAnt + '): confirmar con el calendario oficial' });
        }
        d2.setMonth(d2.getMonth() + 1);
      }
      if (!propios.length) avisos.push(imp.Nombre + ': falta cargar el calendario de vencimientos (Administración → Calendario de vencimientos de impuestos).');
    }
    fechas.forEach(function (f) {
      if (f.fecha < desde || f.fecha > hasta) return;
      var pago = pagos.filter(function (p) { return p.IdImpuesto === imp.IdImpuesto && p.Periodo === f.periodo; })[0];
      var dias = Math.round((aFecha_(f.fecha) - aFecha_(hoy)) / 86400000);
      var aviso = imp.AvisarDiasAntes === '' || imp.AvisarDiasAntes === undefined ? 7 : Number(imp.AvisarDiasAntes);
      lista.push({ IdImpuesto: imp.IdImpuesto, impuesto: imp.Nombre, organismo: imp.Organismo, periodo: f.periodo, fecha: f.fecha, dias: dias, origen: f.estado, fuente: f.fuente,
        link: imp.LinkConsulta || '', pagado: pago ? { fecha: pago.Fecha, importe: Number(pago.Importe) } : null,
        estado: pago ? 'Pagado' : dias < 0 ? 'Vencido' : dias <= aviso ? 'Por vencer' : 'Al día' });
    });
  });
  lista.sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
  return { lista: lista, avisos: avisos, cuit: config_('CUIT_ESTABLECIMIENTO'), terminacion: term };
}
function api_impuestos(token) { sesion_(token); return vencimientos_(); }
/** Copia el calendario de un año al siguiente como "Estimado" (para revisar y confirmar con el calendario oficial). */
function api_generarCalendario(token, anio) {
  var u = sesion_(token);
  if (u.Rol !== 'Administrador') throw new Error('Solo el Administrador puede generar el calendario.');
  anio = Number(anio); if (!(anio > 2000)) throw new Error('Año inválido.');
  return conBloqueo_(function () {
    var cal = leer_('F_VencImpuesto').filter(activo_), n = 0;
    cal.filter(function (v) { return Number(v.Periodo.slice(0, 4)) === anio - 1; }).forEach(function (v) {
      var per = anio + v.Periodo.slice(4);
      if (cal.some(function (x) { return x.IdImpuesto === v.IdImpuesto && x.Periodo === per && x.Terminacion === v.Terminacion; })) return;
      insertar_('F_VencImpuesto', { IdImpuesto: v.IdImpuesto, Periodo: per, Terminacion: v.Terminacion, FechaVencimiento: habil_((Number(v.FechaVencimiento.slice(0, 4)) + 1) + v.FechaVencimiento.slice(4)),
        Estado: 'Estimado', Fuente: 'Copiado de ' + v.Periodo + ' (' + v.FechaVencimiento + '): confirmar con el calendario oficial' }, u.Email);
      n++;
    });
    return { ok: true, mensaje: n ? 'Se generaron ' + n + ' vencimientos estimados para ' + anio + '. Revisalos y marcalos como "Confirmado" cuando salga el calendario oficial.' : 'No había vencimientos de ' + (anio - 1) + ' para copiar (o ya estaban).' };
  });
}
