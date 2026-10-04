# Sistema de Gestión Ovina · Pozo del Carril – La Aguada

Aplicación web para gestionar la **unidad de negocio Ovina (rodeo Dorper)** del establecimiento Pozo del Carril – La Aguada.
Trabajo práctico del **Grupo 6 · Taller de Práctica II · Facultad de Ciencias Económicas – UNRC · 2026**.

- **Aplicación publicada:** https://script.google.com/macros/s/AKfycbwxi37sDcfb8AmWaBRuPz7heKJkiltEu4YSXViBNULiPhV9Ev2ZaMu8RwWjHKUf-29u/exec
- **Tecnología:** Google Apps Script (backend y publicación web) + Google Sheets (base de datos) + HTML/JavaScript (pantalla).

## Integrantes
Abatedaga Alexis Gaston · Anselmino Emiliano · Cacciavillani Franco Emmanuel · Gallo Exequiel Nicolas · Monzon Nicolas · Soler Salvatierra Micaela Belen

## Qué permite hacer
- Registrar **vacunas y tratamientos** por animal o por grupo, con días de carencia (bloquea la venta de animales en carencia).
- Registrar **nacimientos** (con madre y padre), **muertes** (con causa) y **ventas** (con baja automática del rodeo).
- Cargar **compras** con su factura (FAC / NDC / NCC, letra A, B o C, IVA crédito, estado de pago y vencimiento).
- Dar de alta **proveedores, clientes y productos** (cada producto hereda la cuenta del plan de cuentas según su rubro).
- Registrar **cobros y pagos** (recibos) aplicados a facturas, con saldo pendiente.
- Ver el **dólar oficial del Banco Nación** del día (se actualiza solo) y los resultados también en US$.
- Ver **resultados** por etapa (Cría, Recría, Engorde) y consolidados: ingresos, costos directos, margen bruto, % sobre costo, desvío de rinde y desvío de consumo, costos por rubro.

## Cómo está armado (capas)
| Capa | Dónde | Qué hace |
|---|---|---|
| Base de datos | Google Sheets (una hoja por tabla) | Tablas maestras (`D_`), parámetros y hechos (`F_`), control (`S_`) |
| Lógica de negocio | `Codigo.gs` | Login, permisos por rol, validaciones, Ids únicos, auditoría, cálculo de indicadores |
| Pantalla | `Index.html` (+ `Foto.html`) | Formularios simples para el campo y tableros de consulta |
| Instalación y mantenimiento | `Instalar.gs`, `Actualizar.gs`, `Respaldo.gs` | Crear las tablas, actualizar la estructura, respaldar la base |

## Roles
| Rol | Puede |
|---|---|
| Administrador | Todo: usuarios, tablas maestras, parámetros, correcciones y bajas |
| Responsable de subunidad | Cargar y corregir datos de su etapa |
| Operador de carga | Cargar operaciones (no modifica ni da de baja) |
| Consulta / auditoría | Ver, filtrar, exportar y revisar la auditoría |

Ningún registro se borra: las bajas lo marcan como inactivo y todo cambio queda en la hoja `S_Auditoria` (quién, cuándo, valor anterior y nuevo).

## Archivos
| Archivo | Para qué |
|---|---|
| `Codigo.gs` | Backend: esquema de tablas, reglas, API y reportes |
| `Index.html` | Pantalla de la aplicación |
| `Foto.html` | Foto del encabezado y logo (imágenes embebidas) |
| `Instalar.gs` | Instalación inicial: crea las tablas y carga los datos reales del rodeo |
| `Actualizar.gs` | Pasa una planilla ya instalada a la versión nueva sin borrar datos |
| `Respaldo.gs` | Copia diaria automática de la base de datos en Drive (últimas 30 copias) |

## Respaldo y recuperación de datos
1. **Copia diaria automática** (`Respaldo.gs`): carpeta de Drive *Respaldos Sistema Ovino*, una copia por día, se guardan las últimas 30.
2. **Historial de versiones de Google Sheets**: *Archivo → Historial de versiones* permite volver la planilla a cualquier momento anterior.
3. **Bajas lógicas y auditoría**: ningún dato se pierde por una baja; se puede reactivar.

## Versiones
| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 02/10/2026 | Primera versión: tablas maestras, parámetros y hechos; login y roles; ventas; costos; producción; consumos; tablero de resultados y desvíos |
| 2.0 | 03/10/2026 | Pantalla de inicio con botones; encabezado con foto, fecha y usuario; sanidad con carencia; compras con factura; proveedores; productos por rubro; nacimientos y muertes; ficha por animal; costos por rubro |
| 2.1 | 04/10/2026 | Dólar oficial BNA automático (resultados en US$); cobros y pagos con recibos y saldos; respaldo automático diario de la base de datos; mudanza a la cuenta del grupo |
