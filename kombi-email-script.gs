// ============================================
// KOMBI STORE — Google Apps Script v4
// - Envío de correos con CC a gerentes
// - Almacenamiento de fotos en Google Drive
// - Limpieza automática de fotos +2 meses
// ============================================

const DESTINO     = "appkombi@gmail.com";
const NOMBRE_APP  = "Kombi Store";
const FOLDER_NAME = "Kombi Store — Fotos Cierres"; // carpeta raíz en Drive

// ─────────────────────────────────────────
// PUNTO DE ENTRADA POST
// ─────────────────────────────────────────
function doPost(e) {
  try {
    const accion = e.parameter.accion || "email";

    if (accion === "foto") {
      return handleFoto(e);
    } else {
      return handleEmail(e);
    }
  } catch (err) {
    Logger.log("doPost error: " + err.message);
    return HtmlService.createHtmlOutput("Error: " + err.message);
  }
}

function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || "status";

  if (accion === "ventasMinuto") {
    return handleVentasMinuto(e);
  }

  if (accion === "arqueoDia") {
    return handleArqueoDia(e);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, status: "Kombi API activa ✓" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────
// VENTAS MINUTO A MINUTO (boletas SII desde Drive)
// Lee las carpetas de exportación POS-Xpress:
//   [Tienda]/datos/[RUT]/xml/[AAMMDD]/*.xml
// Cada XML es un DTE (boleta) con timestamp real de emisión.
// ─────────────────────────────────────────
const TIENDAS_POS = ["Libertad", "Mi PC"];

function handleVentasMinuto(e) {
  try {
    const fecha = (e.parameter.fecha) || today(); // yyyy-MM-dd
    const carpetaFecha = fecha.slice(2, 4) + fecha.slice(5, 7) + fecha.slice(8, 10); // AAMMDD

    const ventas = [];

    TIENDAS_POS.forEach(nombreTienda => {
      const tiendaIt = DriveApp.getFoldersByName(nombreTienda);
      if (!tiendaIt.hasNext()) return;
      const tiendaFolder = tiendaIt.next();

      const datosIt = tiendaFolder.getFoldersByName("datos");
      if (!datosIt.hasNext()) return;
      const datosFolder = datosIt.next();

      const rutFolders = datosFolder.getFolders();
      while (rutFolders.hasNext()) {
        const rutFolder = rutFolders.next(); // ej: 77276679, 00000001
        const xmlIt = rutFolder.getFoldersByName("xml");
        if (!xmlIt.hasNext()) continue;
        const xmlFolder = xmlIt.next();

        const fechaIt = xmlFolder.getFoldersByName(carpetaFecha);
        if (!fechaIt.hasNext()) continue;
        const fechaFolder = fechaIt.next();

        const iter = fechaFolder.getFiles();
        while (iter.hasNext()) {
          const f = iter.next();
          if (!/\.xml$/i.test(f.getName())) continue;
          try {
            const xml = f.getBlob().getDataAsString("UTF-8");
            const monto = Number(extraerTagXML(xml, "MntTotal")) || 0;
            const folio = extraerTagXML(xml, "Folio") || "";
            const tipoDoc = extraerTagXML(xml, "TipoDTE") || "";
            const tsFirma = extraerTagXML(xml, "TmstFirma"); // yyyy-MM-ddTHH:mm:ss
            const hora = tsFirma
              ? tsFirma.replace("T", " ").slice(0, 19)
              : Utilities.formatDate(f.getDateCreated(), "America/Santiago", "yyyy-MM-dd HH:mm:ss");

            ventas.push({
              tienda: nombreTienda,
              archivo: f.getName(),
              folio: folio,
              tipoDoc: tipoDoc,
              monto: monto,
              hora: hora,
              items: extraerItemsXML(xml)
            });
          } catch (errFile) {
            Logger.log("Error leyendo " + f.getName() + ": " + errFile.message);
          }
        }
      }
    });

    ventas.sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, fecha: fecha, total: ventas.length, ventas: ventas }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function extraerTagXML(xml, tag) {
  const m = xml.match(new RegExp("<" + tag + ">([^<]+)</" + tag + ">"));
  return m ? m[1] : "";
}

// Extrae el detalle de productos de una boleta (puede traer varias líneas
// <Detalle> — una por producto vendido en esa transacción).
function extraerItemsXML(xml) {
  const items = [];
  const detalleRegex = /<Detalle>([\s\S]*?)<\/Detalle>/g;
  let m;
  while ((m = detalleRegex.exec(xml))) {
    const bloque = m[1];
    const codigo = extraerTagXML(bloque, "VlrCodigo");
    const nombre = extraerTagXML(bloque, "NmbItem");
    const cantidad = Number(extraerTagXML(bloque, "QtyItem")) || 1;
    const precio = Number(extraerTagXML(bloque, "PrcItem")) || 0;
    if (codigo) items.push({ codigo: codigo, nombre: nombre, cantidad: cantidad, precio: precio });
  }
  return items;
}

// ─────────────────────────────────────────
// ARQUEO / CIERRE DE CAJA (composición por medio de pago)
// Lee "filePrinD.doc" (texto plano pese a la extensión) que el
// POS-Xpress genera al hacer un cierre de caja / arqueo — trae
// el desglose real Efectivo/Débito/etc. Solo se actualiza cuando
// alguien hace el cierre en el POS, no es continuo como las boletas.
// ─────────────────────────────────────────
function handleArqueoDia(e) {
  try {
    const resultado = [];
    TIENDAS_POS.forEach(nombreTienda => {
      const tiendaIt = DriveApp.getFoldersByName(nombreTienda);
      if (!tiendaIt.hasNext()) return;
      const tiendaFolder = tiendaIt.next();

      const archivo = buscarArchivoArqueo(tiendaFolder);
      if (!archivo) return;

      const texto = archivo.getBlob().getDataAsString("UTF-8");
      const fechaArqueo = extraerFechaArqueo(texto);
      const medios = extraerMediosPago(texto);

      resultado.push({
        tienda: nombreTienda,
        fecha: fechaArqueo,
        modificado: Utilities.formatDate(archivo.getLastUpdated(), "America/Santiago", "yyyy-MM-dd HH:mm:ss"),
        medios: medios
      });
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, arqueos: resultado }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function buscarArchivoArqueo(tiendaFolder) {
  // Patrón 1 (ej. "Mi PC"): [Tienda]/report/filePrinD.doc
  let it = tiendaFolder.getFoldersByName("report");
  if (it.hasNext()) {
    const rf = it.next();
    const fIt = rf.getFilesByName("filePrinD.doc");
    if (fIt.hasNext()) return fIt.next();
  }
  // Patrón 2 (ej. "Libertad"): [Tienda]/locales/[N]/filePrinD.doc
  it = tiendaFolder.getFoldersByName("locales");
  if (it.hasNext()) {
    const localesFolder = it.next();
    const subFolders = localesFolder.getFolders();
    while (subFolders.hasNext()) {
      const sub = subFolders.next();
      const fIt = sub.getFilesByName("filePrinD.doc");
      if (fIt.hasNext()) return fIt.next();
    }
  }
  return null;
}

function extraerFechaArqueo(texto) {
  const m = texto.match(/Hasta fecha\s*:\s*(\d{1,2})\/\s*(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  let dia = m[1], mes = m[2], anio = m[3];
  if (anio.length === 2) anio = "20" + anio;
  return anio + "-" + mes.padStart(2, "0") + "-" + dia.padStart(2, "0");
}

function extraerMediosPago(texto) {
  const m = texto.match(/vtas\.formas de pagos[\s\S]*?_{5,}\r?\n([\s\S]*?)_{5,}/);
  if (!m) return [];
  const lineas = m[1].split(/\r?\n/).filter(l => l.trim());
  const items = [];
  lineas.forEach(l => {
    const mm = l.match(/^(.+?)\s*\(\s*\)\s*\$\s*([\d.,]+)/);
    if (mm) {
      const monto = Number(mm[2].replace(/\./g, "").replace(",", ".")) || 0;
      items.push({ descripcion: mm[1].trim(), monto: monto });
    }
  });
  return items;
}

// ─────────────────────────────────────────
// MANEJO DE FOTOS
// ─────────────────────────────────────────
function handleFoto(e) {
  // Recibe: fecha, sucursal, turno, itemId, itemText, fotoBase64, mimeType
  const fecha    = e.parameter.fecha    || today();
  const sucursal = e.parameter.sucursal || "sin-sucursal";
  const turno    = e.parameter.turno    || "sin-turno";
  const itemId   = e.parameter.itemId   || "item";
  const itemText = e.parameter.itemText || itemId;
  const b64      = e.parameter.foto;
  const mime     = e.parameter.mime     || "image/jpeg";

  if (!b64) {
    return HtmlService.createHtmlOutput("Sin foto");
  }

  // Decodificar base64
  const bytes = Utilities.base64Decode(b64);
  const blob  = Utilities.newBlob(bytes, mime, itemText + ".jpg");

  // Crear estructura de carpetas: KombiStore / 2025-07 / Centro / mañana /
  const root    = getOrCreateFolder(FOLDER_NAME);
  const mesDir  = getOrCreateFolder(fecha.slice(0, 7), root);     // "2025-07"
  const sucDir  = getOrCreateFolder(sucursal, mesDir);
  const turDir  = getOrCreateFolder(turno, sucDir);

  // Guardar archivo con nombre descriptivo
  const fileName = fecha + "_" + itemText.replace(/[^a-zA-Z0-9]/g, "_") + ".jpg";
  const file = turDir.createFile(blob);
  file.setName(fileName);

  // Hacer el archivo accesible por URL (solo lectura, sin login)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = "https://drive.google.com/uc?id=" + file.getId() + "&export=view";

  return HtmlService.createHtmlOutput(
    '<script>window.parent.postMessage({ok:true,url:"' + url + '",itemId:"' + itemId + '"},"*")</script>'
  );
}

function getOrCreateFolder(name, parent) {
  const src = parent ? parent.getFoldersByName(name) : DriveApp.getFoldersByName(name);
  if (src.hasNext()) return src.next();
  return parent ? parent.createFolder(name) : DriveApp.createFolder(name);
}

function today() {
  return Utilities.formatDate(new Date(), "America/Santiago", "yyyy-MM-dd");
}

// ─────────────────────────────────────────
// LIMPIEZA AUTOMÁTICA (disparada por trigger)
// ─────────────────────────────────────────
function limpiarFotosAntiguas() {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 2); // hace 2 meses

  try {
    const root = DriveApp.getFoldersByName(FOLDER_NAME);
    if (!root.hasNext()) return;
    const rootFolder = root.next();

    let eliminadas = 0;
    const meses = rootFolder.getFolders();

    while (meses.hasNext()) {
      const mesFolder = meses.next();
      const mesNombre = mesFolder.getName(); // "2025-05"
      const mesFecha  = new Date(mesNombre + "-01");

      if (mesFecha < limite) {
        // Eliminar carpeta completa del mes
        mesFolder.setTrashed(true);
        eliminadas++;
        Logger.log("Eliminada carpeta: " + mesNombre);
      }
    }

    Logger.log("Limpieza completada. Carpetas eliminadas: " + eliminadas);
  } catch (err) {
    Logger.log("Error en limpieza: " + err.message);
  }
}

// ─────────────────────────────────────────
// CONFIGURAR TRIGGER AUTOMÁTICO
// Ejecuta esto UNA VEZ desde el editor para
// programar la limpieza mensual automática
// ─────────────────────────────────────────
function configurarTriggerLimpieza() {
  // Elimina triggers existentes de limpieza
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "limpiarFotosAntiguas") {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Crear nuevo trigger: primer día de cada mes a las 3am
  ScriptApp.newTrigger("limpiarFotosAntiguas")
    .timeBased()
    .onMonthDay(1)
    .atHour(3)
    .create();
  Logger.log("Trigger de limpieza configurado: 1° de cada mes a las 3am");
}

// ─────────────────────────────────────────
// MANEJO DE CORREOS
// ─────────────────────────────────────────
function handleEmail(e) {
  let asunto, cuerpo, html, tipo, cc;

  if (e.parameter && e.parameter.asunto) {
    asunto = e.parameter.asunto || "Reporte Kombi Store";
    cuerpo = e.parameter.cuerpo || "";
    html   = e.parameter.html   || cuerpo.replace(/\n/g, "<br>");
    tipo   = e.parameter.tipo   || "general";
    cc     = e.parameter.cc     || "";
  } else if (e.postData) {
    const data = JSON.parse(e.postData.contents);
    asunto = data.asunto || "Reporte Kombi Store";
    cuerpo = data.cuerpo || "";
    html   = data.html   || cuerpo.replace(/\n/g, "<br>");
    tipo   = data.tipo   || "general";
    cc     = data.cc     || "";
  }

  const htmlEmail = buildEmail(asunto, html, tipo);
  const opts = { htmlBody: htmlEmail, name: NOMBRE_APP };

  if (cc && cc.trim()) {
    const ccList = [...new Set(cc.split(",").map(x => x.trim()).filter(x => x.includes("@")))];
    if (ccList.length) opts.cc = ccList.join(",");
  }

  GmailApp.sendEmail(DESTINO, "[" + NOMBRE_APP + "] " + asunto, cuerpo, opts);

  return HtmlService.createHtmlOutput(
    '<script>window.parent.postMessage({ok:true},"*")</script>'
  );
}

function buildEmail(asunto, contenidoHtml, tipo) {
  const colores = {
    cierre:     { bg: "#F59E0B", label: "CIERRE DE TURNO"       },
    diario:     { bg: "#3B82F6", label: "REPORTE DIARIO"         },
    inventario: { bg: "#8B5CF6", label: "INVENTARIO"             },
    diferencia: { bg: "#EF4444", label: "⚠ DIFERENCIA EN CAJA"  },
    general:    { bg: "#1F2937", label: "REPORTE"                },
  };
  const c    = colores[tipo] || colores.general;
  const hora = Utilities.formatDate(new Date(), "America/Santiago", "dd/MM/yyyy HH:mm");

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>'
    + '<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px">'
    + '<tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)">'
    + '<tr><td style="background:' + c.bg + ';padding:24px 32px">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td><div style="color:rgba(255,255,255,.8);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">' + c.label + '</div>'
    + '<div style="color:#fff;font-size:20px;font-weight:800">' + asunto + '</div></td>'
    + '<td align="right"><div style="background:rgba(255,255,255,.15);border-radius:8px;padding:8px 14px;color:#fff;font-weight:800;font-size:15px">Kombi</div></td>'
    + '</tr></table></td></tr>'
    + '<tr><td style="padding:28px 32px;color:#374151;font-size:14px;line-height:1.6">' + contenidoHtml + '</td></tr>'
    + '<tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB">'
    + '<div style="color:#9CA3AF;font-size:12px;text-align:center">Enviado por <strong>Kombi Store</strong> · ' + hora + '</div>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}
