# 🛒 Kombi Store — Gestión Operativa

App web standalone (HTML + CSS + JS) para gestión operativa de puntos de venta con múltiples sucursales.

## ✨ Funcionalidades

### Operador
- **Arqueo de Apertura** — conteo de billetes CLP, stock de cigarros, checklist
- **Retiros y Abonos** — con autorización por clave y categorías predefinidas
- **Arqueo de Cierre** — ventas según sistema, efectivo, POS, movimientos, cigarros, checklist con fotos obligatorias

### Administrador
- **Dashboard** — KPIs, ventas por período (día/semana/mes/año), composición, mejor día de la semana
- **Historial de Turnos** — todos los cierres archivados, filtrables por mes/sucursal/turno
- **Ventas del Día** — registro diario con tendencia y exportación CSV
- **Caja** — arqueo completo con cuadraturas
- **Inventario** — por categorías (incluye cigarros con 44 productos precargados)
- **Reportes** — reporte diario e inventario enviados por correo vía Google Apps Script
- **Ajustes** — sucursales, terminales POS, claves, checklist, historial de precios

### Multi-sucursal
- Selector de sucursal en login
- Selector de turno (mañana / tarde / noche)
- Historial filtrable por sucursal y turno

## 🚀 Uso

Es un archivo HTML standalone — no requiere servidor ni dependencias.

```bash
# Opción 1: abrir directo
open index.html

# Opción 2: servidor local simple
python3 -m http.server 8000
# Luego ir a http://localhost:8000
```

## 🔑 Credenciales demo

| Rol | Clave |
|-----|-------|
| Operador | `1234` |
| Administrador | `admin123` |

## 📧 Configuración de correo (Google Apps Script)

1. Ve a [script.google.com](https://script.google.com)
2. Crea un nuevo proyecto y pega el contenido de `kombi-email-script.gs`
3. Implementar → Nueva implementación → Aplicación web
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier persona**
4. Autoriza el acceso y copia la URL `/exec`
5. En la app: Administrador → Reportes → pega la URL → Guardar

Los reportes se envían a `appkombi@gmail.com`.

## 🧰 Stack

- HTML5 + CSS3 + JavaScript vanilla
- [Lucide Icons](https://lucide.dev) (CDN)
- Google Fonts — Inter + JetBrains Mono
- `localStorage` para persistencia
- Google Apps Script para envío de correos

## 📁 Archivos

| Archivo | Descripción |
|---------|-------------|
| `index.html` | App completa (standalone) |
| `kombi-email-script.gs` | Script de Google Apps Script para envío de correos |

## 🏪 Para múltiples locales

Cada sucursal se configura desde **Ajustes → Sucursales**. El operador selecciona su sucursal al iniciar sesión. El historial de turnos filtra por sucursal.

Para una instalación multi-local con datos centralizados, se recomienda migrar `localStorage` a Firebase Firestore o Supabase.

## 📝 Licencia

MIT — libre uso y modificación.
