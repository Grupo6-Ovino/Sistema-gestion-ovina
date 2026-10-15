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
 * Novedades v2.1: cotización del dólar oficial del Banco Nación (se actualiza sola todos los días) e importes en US$;
 *   cobros y pagos (recibos) aplicados a facturas, con saldo pendiente.
 * Novedades v2: sanidad (vacunas y tratamientos con días de carencia), compras con factura y
 * renglones, proveedores, muertes, nacimientos con madre y padre, formas de pago y tipos de
 * comprobante, alta rápida de productos, bloqueo de venta de animales en carencia.
 */

var TZ = 'America/Argentina/Buenos_Aires';
var VERSION = '2.1';
var AUDIT_COLS = ['CreadoEl', 'CreadoPor', 'ModificadoEl', 'ModificadoPor', 'Activo'];
var ROLES = ['Administrador', 'Responsable de subunidad', 'Operador de carga', 'Consulta / auditoría'];
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
  'Otros indirectos': { cuenta: '4.05.05',    tipo: 'Indirecto', variab: 'Fijo' }
};

/* =============================================================================================
 * 1. ESQUEMA: qué tablas existen, qué campos tienen y cómo se relacionan.
 *    t = tipo (text, num, date, bool, enum, email) · req = obligatorio · fk = tabla a la que apunta
 *    calc = lo calcula el sistema · min = valor mínimo · hidden = nunca sale del backend
 *    l = nombre que ve el usuario en pantalla
 * ============================================================================================= */
var SCHEMA = {
  // ---------- MAESTRAS ----------
  D_UnidadNeg: { grupo: 'Maestras', titulo: 'Unidades de negocio', pk: 'IdUnidad', prefijo: 'N', label: 'Nombre',
    cols: [{ n: 'IdUnidad', l: 'Código' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'TipoActividad', l: 'Tipo de actividad' }] },
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
      { n: 'Tipo', t: 'enum', opts: ['C', 'M', 'N'], l: 'Tipo' }, { n: 'SignificadoTipo', l: 'Qué significa el tipo' }] },
  D_UM: { grupo: 'Maestras', titulo: 'Unidades de medida', pk: 'IdUM', prefijo: 'UM', label: 'Nombre',
    cols: [{ n: 'IdUM', l: 'Id' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'Abreviatura', req: true, l: 'Abreviatura' }] },
  D_Conversion: { grupo: 'Maestras', titulo: 'Conversiones de unidades', pk: 'IdConversion', prefijo: 'CNV', label: 'IdConversion',
    cols: [{ n: 'IdConversion', l: 'Id' }, { n: 'IdUMOrigen', req: true, fk: 'D_UM', l: 'De' }, { n: 'IdUMDestino', req: true, fk: 'D_UM', l: 'A' },
      { n: 'Factor', t: 'num', req: true, min: 0.0000001, l: 'Factor' }] },
  D_Campana: { grupo: 'Maestras', titulo: 'Campañas', pk: 'IdCampana', prefijo: 'CAM', label: 'Nombre',
    cols: [{ n: 'IdCampana', l: 'Id' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'FechaDesde', t: 'date', req: true, l: 'Desde' },
      { n: 'FechaHasta', t: 'date', req: true, l: 'Hasta' }] },
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
  F_PrecioIns: { grupo: 'Parámetros', titulo: 'Precios reales de insumos', pk: 'IdPrecioIns', prefijo: 'PIN', label: 'IdPrecioIns',
    cols: [{ n: 'IdPrecioIns', l: 'Id' }, { n: 'IdInsumo', req: true, fk: 'D_Insumo', l: 'Insumo' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' },
      { n: 'Precio', t: 'num', req: true, min: 0.0000001, l: 'Precio' }, { n: 'IdMoneda', req: true, fk: 'D_Moneda', l: 'Moneda' }, { n: 'Fuente', req: true, l: 'Fuente' }] },
  F_PrecioProd: { grupo: 'Parámetros', titulo: 'Precios reales de productos', pk: 'IdPrecioProd', prefijo: 'PPR', label: 'IdPrecioProd',
    cols: [{ n: 'IdPrecioProd', l: 'Id' }, { n: 'IdProducto', req: true, fk: 'D_Producto', l: 'Producto' }, { n: 'Fecha', t: 'date', req: true, l: 'Fecha' },
      { n: 'Precio', t: 'num', req: true, min: 0.0000001, l: 'Precio' }, { n: 'IdMoneda', req: true, fk: 'D_Moneda', l: 'Moneda' },
      { n: 'PrecioIncluyeIVA', t: 'bool', req: true, l: '¿Incluye IVA?' }, { n: 'Fuente', req: true, l: 'Fuente' }] },
  F_TipoCambio: { grupo: 'Parámetros', titulo: 'Dólar oficial Banco Nación (cotizaciones)', pk: 'Fecha', pkManual: true, label: 'Fecha',
    cols: [{ n: 'Fecha', t: 'date', req: true, l: 'Fecha' }, { n: 'Comprador', t: 'num', req: true, min: 0.0000001, l: 'Comprador ($ por US$)' },
      { n: 'Vendedor', t: 'num', req: true, min: 0.0000001, l: 'Vendedor ($ por US$)' }, { n: 'Fuente', req: true, l: 'Fuente' },
      { n: 'Origen', t: 'enum', opts: ['Automático', 'Manual'], l: 'Cómo se cargó' }] },

  // ---------- HECHOS ----------
  F_Ingresos: { grupo: 'Hechos', titulo: 'Ingresos (ventas)', pk: 'IdIngreso', prefijo: 'ING', label: 'IdIngreso', hecho: true,
    soloFormulario: true, editablesDespues: ['Comprobante', 'EstadoCobro', 'Fuente'],
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

  // ---------- CONTROL ----------
  S_Usuarios: { grupo: 'Control', titulo: 'Usuarios', pk: 'Email', pkManual: true, label: 'Nombre', soloAdminLee: true,
    cols: [{ n: 'Email', t: 'email', req: true, l: 'Email' }, { n: 'Nombre', req: true, l: 'Nombre' }, { n: 'Rol', t: 'enum', req: true, opts: ROLES, l: 'Rol' },
      { n: 'IdSubunidad', fk: 'D_Subunidad', l: 'Etapa a cargo' }, { n: 'ClaveHash', hidden: true }, { n: 'Sal', hidden: true }] },
  S_Auditoria: { grupo: 'Control', titulo: 'Auditoría', pk: 'IdAuditoria', prefijo: 'AUD', label: 'IdAuditoria', sinAuditoria: true, soloLectura: true,
    cols: [{ n: 'IdAuditoria' }, { n: 'FechaHora' }, { n: 'Usuario' }, { n: 'Accion' }, { n: 'Tabla' }, { n: 'IdRegistro' },
      { n: 'ValorAnterior' }, { n: 'ValorNuevo' }] }
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
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function hoja_(tabla) {
  var sh = ss_().getSheetByName(tabla);
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
  CACHE_[tabla] = leerHoja_(tabla);
  return copiar_(CACHE_[tabla]);
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
  var esCargaHacienda = s.hecho || tabla === 'D_Animal';
  if (!esCargaHacienda) return false; // resto de maestras, parámetros y usuarios: solo Administrador
  if (rol === 'Operador de carga') return accion === 'crear';
  if (rol === 'Responsable de subunidad') {
    if (!s.hecho) return accion === 'crear'; // puede dar de alta nacimientos
    if (!registro) return true;
    if (registro.IdSubunidad === undefined) return accion !== 'baja'; // compras: puede cargarlas y marcar el pago
    return String(registro.IdSubunidad) === String(u.IdSubunidad);
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
  delete CACHE_['S_Auditoria'];
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
  var c = leer_('D_Campana').filter(function (x) { return activo_(x) && x.FechaDesde <= f && f <= x.FechaHasta; });
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
    if (c.fk && !existeActivo_(c.fk, v)) errores.push(nom + ': "' + v + '" no existe en ' + SCHEMA[c.fk].titulo + ' (o está dado de baja).');
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
  if (tabla === 'F_EstandarRinde' && otros.some(function (x) { return x.IdCampana === o.IdCampana && x.IdSubunidad === o.IdSubunidad; })) {
    throw new Error('Ya hay un rinde estándar para esa campaña y etapa. La cátedra exige UNA sola referencia: editá la existente.');
  }
  if (tabla === 'F_Dosis' && otros.some(function (x) { return x.IdCampana === o.IdCampana && x.IdSubunidad === o.IdSubunidad && x.IdInsumo === o.IdInsumo; })) {
    throw new Error('Ya hay una dosis técnica para ese insumo, etapa y campaña: editá la existente.');
  }
  if (tabla === 'D_Campana') {
    if (o.FechaDesde > o.FechaHasta) throw new Error('La fecha "Desde" tiene que ser anterior a "Hasta".');
    if (otros.some(function (x) { return !(o.FechaHasta < x.FechaDesde || o.FechaDesde > x.FechaHasta); })) {
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
  if (s.hecho && colDe(tabla, 'IdSubunidad') && !colDe(tabla, 'IdSubunidad').calc && u.Rol === 'Responsable de subunidad' && String(o.IdSubunidad) !== String(u.IdSubunidad)) {
    throw new Error('Solo podés cargar datos de tu etapa.');
  }
}
function calcular_(tabla, o) {
  var r2 = function (x) { return Math.round(x * 100) / 100; };
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
  delete CACHE_[tabla];
  if (!s.sinAuditoria) auditar_(email, 'Alta', tabla, o[s.pk], null, sinOcultos_(tabla, o));
  return o[s.pk];
}
function reescribir_(tabla, fila, o) {
  var sh = hoja_(tabla);
  var h = headersHoja_(tabla);
  sh.getRange(fila, 1, 1, h.length).setValues([aFila_(tabla, o)]);
  delete CACHE_[tabla];
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
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + token, String(u.Email).toLowerCase(), SESION_SEGUNDOS);
  conBloqueo_(function () { auditar_(String(u.Email).toLowerCase(), 'Ingreso', 'S_Usuarios', u.Email, null, null); });
  return { token: token, usuario: publico_({ Email: String(u.Email).toLowerCase(), Nombre: u.Nombre, Rol: u.Rol, IdSubunidad: u.IdSubunidad }) };
}
function api_logout(token) { CacheService.getScriptCache().remove('s_' + token); return true; }

/** Todo lo que la pantalla necesita para armarse: usuario, esquema, listas desplegables y resumen del día. */
function api_inicio(token) {
  var u = sesion_(token);
  var esquema = {};
  Object.keys(SCHEMA).forEach(function (t) {
    var s = SCHEMA[t];
    esquema[t] = {
      grupo: s.grupo, titulo: s.titulo, pk: s.pk, pkManual: !!s.pkManual, hecho: !!s.hecho,
      soloFormulario: !!s.soloFormulario, editablesDespues: s.editablesDespues || null,
      cols: s.cols.filter(function (c) { return !c.hidden; }),
      puede: { leer: puede_(u, t, 'leer'), crear: puede_(u, t, 'crear'), editar: puede_(u, t, 'editar'), baja: puede_(u, t, 'baja') }
    };
  });
  return { usuario: publico_(u), esquema: esquema, listas: listas_(), resumen: resumen_(), rubros: Object.keys(RUBROS), version: VERSION };
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
    dolar: ultimaCotizacion_()
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
      if (t === 'D_Campana') { item.desde = x.FechaDesde; item.hasta = x.FechaHasta; }
      if (t === 'D_Producto') { item.iva = x.AlicuotaIVA; }
      if (t === 'D_Insumo') { item.rubro = x.Rubro || ''; item.um = x.IdUM; item.contenido = x.ContenidoEnvase || ''; item.tipo = x.TipoCosto; }
      if (t === 'D_Tercero') { item.tipo = x.Tipo; item.cuit = x.CUIT || ''; }
      if (t === 'D_TipoComprobante') { item.circuito = x.Circuito; item.signo = x.Signo; item.nombre = x.Nombre; }
      if (t === 'D_Categoria') { item.sub = x.IdSubunidad; }
      if (t === 'D_UM') { item.abrev = x.Abreviatura; }
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
    if (tabla === 'S_Usuarios') { o.Sal = Utilities.getUuid(); o.ClaveHash = hash_(o.Sal, String(entrada.ClaveNueva)); }
    var id = insertar_(tabla, o, u.Email);
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
      if (tabla === 'D_Animal') { o.Estado = actual.Estado; o.FechaBaja = actual.FechaBaja; }
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

/** Venta: un comprobante con uno o varios animales. Valida TODO antes de escribir. */
function api_registrarVenta(token, v) {
  var u = sesion_(token);
  exigir_(u, 'F_Ingresos', 'crear');
  return conBloqueo_(function () {
    if (!v.lineas || !v.lineas.length) throw new Error('Agregá al menos un animal a la venta.');
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
    return { ok: true, ids: ids, totales: tot, mensaje: 'Venta registrada: ' + ids.length + (ids.length === 1 ? ' animal, ' : ' animales, ') + tot.kg + ' kg.' };
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
      if (u.Rol === 'Responsable de subunidad' && String(o.IdSubunidad) !== String(u.IdSubunidad)) throw new Error('La caravana ' + car + ' no es de tu etapa.');
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
    if (u.Rol === 'Responsable de subunidad' && String(o.IdSubunidad) !== String(u.IdSubunidad)) throw new Error('Ese animal no es de tu etapa.');
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
    animal: sinOcultos_('D_Animal', an),
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
  var campanas = leer_('D_Campana').filter(activo_);
  if (!idCampana) idCampana = campanas.length ? campanas[0].IdCampana : '';
  var camp = campanas.filter(function (c) { return c.IdCampana === idCampana; })[0];
  var subs = leer_('D_Subunidad').filter(activo_);
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
    return nuevas.length ? 'Cotizaciones nuevas: ' + nuevas.join(' · ') : 'No hacía falta traer cotizaciones nuevas.';
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