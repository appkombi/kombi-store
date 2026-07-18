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
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, status: "Kombi API activa ✓" }))
    .setMimeType(ContentService.MimeType.JSON);
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
    + '<td align="right"><div style="background:rgba(255,255,255,.15);border-radius:8px;padding:8px 14px;color:#fff;font-weight:800;font-size:15px">🛒 Kombi</div></td>'
    + '</tr></table></td></tr>'
    + '<tr><td style="padding:28px 32px;color:#374151;font-size:14px;line-height:1.6">' + contenidoHtml + '</td></tr>'
    + '<tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB">'
    + '<div style="color:#9CA3AF;font-size:12px;text-align:center">Enviado por <strong>Kombi Store</strong> · ' + hora + '</div>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}
