// ============================================
// KOMBI STORE — Email API via Google Apps Script
// v3 — soporta CC a gerentes
// ============================================

const DESTINO = "appkombi@gmail.com";
const NOMBRE_APP = "Kombi Store";

function doPost(e) {
  try {
    let asunto, cuerpo, html, tipo, cc;

    if (e.parameter && e.parameter.asunto) {
      asunto = e.parameter.asunto || "Reporte Kombi Store";
      cuerpo = e.parameter.cuerpo || "";
      html   = e.parameter.html  || cuerpo.replace(/\n/g, "<br>");
      tipo   = e.parameter.tipo  || "general";
      cc     = e.parameter.cc    || ""; // emails de gerentes separados por coma
    } else {
      const data = JSON.parse(e.postData.contents);
      asunto = data.asunto || "Reporte Kombi Store";
      cuerpo = data.cuerpo || "";
      html   = data.html   || cuerpo.replace(/\n/g, "<br>");
      tipo   = data.tipo   || "general";
      cc     = data.cc     || "";
    }

    const htmlEmail = buildEmail(asunto, html, tipo);
    const opts = { htmlBody: htmlEmail, name: NOMBRE_APP };

    // Agregar CC si hay gerentes configurados
    if (cc && cc.trim()) {
      // Filtra emails inválidos y duplicados
      const ccList = [...new Set(cc.split(',').map(e => e.trim()).filter(e => e.includes('@')))];
      if (ccList.length) opts.cc = ccList.join(',');
    }

    GmailApp.sendEmail(
      DESTINO,
      "[" + NOMBRE_APP + "] " + asunto,
      cuerpo,
      opts
    );

    return HtmlService.createHtmlOutput(
      '<html><body><p style="font-family:sans-serif;color:green">✅ Correo enviado</p></body></html>'
    );

  } catch (err) {
    Logger.log("Error: " + err.message);
    return HtmlService.createHtmlOutput(
      '<html><body><p style="font-family:sans-serif;color:red">Error: ' + err.message + '</p></body></html>'
    );
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, status: "Kombi Email API activa ✓" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildEmail(asunto, contenidoHtml, tipo) {
  const colores = {
    cierre:     { bg: "#F59E0B", label: "CIERRE DE TURNO"      },
    diario:     { bg: "#3B82F6", label: "REPORTE DIARIO"        },
    inventario: { bg: "#8B5CF6", label: "INVENTARIO"            },
    diferencia: { bg: "#EF4444", label: "⚠ DIFERENCIA EN CAJA" },
    general:    { bg: "#1F2937", label: "REPORTE"               },
  };
  const c = colores[tipo] || colores.general;
  const fecha = Utilities.formatDate(new Date(), "America/Santiago", "dd/MM/yyyy HH:mm");

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>' +
    '<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px">' +
    '<tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.07)">' +
    '<tr><td style="background:' + c.bg + ';padding:24px 32px">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td><div style="color:rgba(255,255,255,.8);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">' + c.label + '</div>' +
    '<div style="color:#fff;font-size:20px;font-weight:800">' + asunto + '</div></td>' +
    '<td align="right"><div style="background:rgba(255,255,255,.15);border-radius:8px;padding:8px 14px;color:#fff;font-weight:800;font-size:15px">🛒 Kombi</div></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:28px 32px;color:#374151;font-size:14px;line-height:1.6">' + contenidoHtml + '</td></tr>' +
    '<tr><td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB">' +
    '<div style="color:#9CA3AF;font-size:12px;text-align:center">Enviado automáticamente por <strong>Kombi Store</strong> · ' + fecha + '</div>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}
