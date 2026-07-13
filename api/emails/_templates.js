// ---------------------------------------------------------------------------
// Plantillas HTML responsivas para los correos de POST-PLAT.
//
// Se usan estilos inline (los clientes de correo ignoran <style> externos y
// buena parte de CSS moderno). El layout base es una tabla centrada, ancho
// máx. 600px, que colapsa bien en móvil. Cambia BRAND si tu marca usa otro
// color; mantenlo consistente con src/lib/brand.js del frontend.
// ---------------------------------------------------------------------------

const BRAND = '#4f46e5';       // indigo-600
const BG = '#f4f4f5';          // zinc-100
const TEXT = '#27272a';        // zinc-800
const MUTED = '#71717a';       // zinc-500
const BORDER = '#e4e4e7';      // zinc-200

// Escapa contenido dinámico que se interpola en el HTML (nombres, descripciones,
// etc.) para evitar romper el markup o inyectar etiquetas.
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout({ title, preheader = '', bodyHtml, companyName = 'POST-PLAT' }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER};">
      <tr>
        <td style="background:${BRAND};padding:20px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">${esc(companyName)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;color:${TEXT};font-size:15px;line-height:1.6;">
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px;border-top:1px solid ${BORDER};color:${MUTED};font-size:12px;line-height:1.5;">
          Este es un correo automático de POST-PLAT. Por favor no respondas a este mensaje.
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
    <td style="border-radius:8px;background:${BRAND};">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${esc(label)}</a>
    </td></tr></table>`;
}

function codeBox(value) {
  return `<div style="margin:20px 0;padding:16px 20px;background:${BG};border:1px dashed ${BORDER};border-radius:8px;text-align:center;">
    <span style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:2px;color:${TEXT};">${esc(value)}</span>
  </div>`;
}

// --- 1. Contraseña temporal del gerente (alta de empresa) -------------------
export function tempPasswordEmail({ name, email, tempPassword, companyName, loginUrl }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:${TEXT};">¡Bienvenido a POST-PLAT, ${esc(name)}!</h1>
    <p style="margin:0 0 12px;">Tu cuenta de <strong>gerente</strong> para <strong>${esc(companyName)}</strong> ya está activa. Usa estas credenciales para tu primer inicio de sesión:</p>
    <p style="margin:0 0 4px;color:${MUTED};font-size:13px;">Usuario</p>
    <p style="margin:0 0 12px;font-weight:600;">${esc(email)}</p>
    <p style="margin:0 0 4px;color:${MUTED};font-size:13px;">Contraseña temporal</p>
    ${codeBox(tempPassword)}
    <p style="margin:0 0 12px;">Por seguridad, <strong>cámbiala apenas ingreses</strong>. Esta contraseña es de un solo uso recomendado.</p>
    ${loginUrl ? button(loginUrl, 'Iniciar sesión') : ''}
  `;
  return {
    subject: `Tu acceso a POST-PLAT — ${companyName}`,
    html: layout({ title: 'Acceso a POST-PLAT', preheader: 'Tu contraseña temporal está adentro', bodyHtml: body })
  };
}

// --- 2. Bienvenida a vendedor / operario ------------------------------------
export function welcomeCashierEmail({ name, email, tempPassword, companyName, roleLabel, loginUrl }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:${TEXT};">Hola ${esc(name)}, tu cuenta está lista</h1>
    <p style="margin:0 0 12px;">Se creó tu acceso como <strong>${esc(roleLabel)}</strong> en <strong>${esc(companyName)}</strong> dentro de POST-PLAT.</p>
    <p style="margin:0 0 4px;color:${MUTED};font-size:13px;">Usuario</p>
    <p style="margin:0 0 12px;font-weight:600;">${esc(email)}</p>
    ${tempPassword ? `<p style="margin:0 0 4px;color:${MUTED};font-size:13px;">Contraseña temporal</p>${codeBox(tempPassword)}<p style="margin:0 0 12px;">Cámbiala en tu primer ingreso.</p>` : `<p style="margin:0 0 12px;">Tu gerente te compartirá tu contraseña de acceso.</p>`}
    ${loginUrl ? button(loginUrl, 'Ingresar') : ''}
  `;
  return {
    subject: `Bienvenido a ${companyName} en POST-PLAT`,
    html: layout({ title: 'Bienvenido', preheader: 'Tu cuenta ya está activa', bodyHtml: body })
  };
}

// --- 3. Alerta de stock bajo (a la empresa) ---------------------------------
export function lowStockEmail({ companyName, productName, productCode, branchName, quantity, minStock }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:#b91c1c;">⚠️ Stock bajo</h1>
    <p style="margin:0 0 16px;">El siguiente producto alcanzó (o bajó de) su stock mínimo${branchName ? ` en <strong>${esc(branchName)}</strong>` : ''}:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
      <tr><td style="padding:12px 16px;background:${BG};color:${MUTED};font-size:13px;">Producto</td><td style="padding:12px 16px;background:${BG};font-weight:600;">${esc(productName)}${productCode ? ` <span style="color:${MUTED};font-weight:400;">(${esc(productCode)})</span>` : ''}</td></tr>
      <tr><td style="padding:12px 16px;color:${MUTED};font-size:13px;">Stock actual</td><td style="padding:12px 16px;font-weight:700;color:#b91c1c;">${esc(quantity)}</td></tr>
      <tr><td style="padding:12px 16px;background:${BG};color:${MUTED};font-size:13px;">Stock mínimo</td><td style="padding:12px 16px;background:${BG};font-weight:600;">${esc(minStock)}</td></tr>
    </table>
    <p style="margin:16px 0 0;color:${MUTED};">Te recomendamos reabastecer pronto para no interrumpir tus ventas.</p>
  `;
  return {
    subject: `⚠️ Stock bajo: ${productName}`,
    html: layout({ title: 'Stock bajo', preheader: `${productName} está por debajo del mínimo`, bodyHtml: body, companyName })
  };
}

// --- 4. Factura devuelta por el SRI (a la empresa) --------------------------
export function invoiceReturnedEmail({ companyName, invoiceNumber, reason }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:#b91c1c;">Factura devuelta por el SRI</h1>
    <p style="margin:0 0 12px;">El comprobante <strong>${esc(invoiceNumber)}</strong> no fue autorizado por el SRI y quedó en estado <strong>devuelta</strong>.</p>
    ${reason ? `<p style="margin:0 0 4px;color:${MUTED};font-size:13px;">Motivo / respuesta del SRI</p>
    <div style="margin:0 0 12px;padding:12px 16px;background:${BG};border-radius:8px;font-family:'Courier New',monospace;font-size:13px;color:${TEXT};word-break:break-word;">${esc(reason)}</div>` : ''}
    <p style="margin:0;color:${MUTED};">Revisa los datos del comprobante y vuelve a emitirlo desde el panel.</p>
  `;
  return {
    subject: `Factura ${invoiceNumber} devuelta por el SRI`,
    html: layout({ title: 'Factura devuelta', preheader: `El SRI devolvió ${invoiceNumber}`, bodyHtml: body, companyName })
  };
}

// --- 5. Nueva factura emitida (al cliente, con RIDE adjunto) -----------------
export function newInvoiceEmail({ customerName, companyName, invoiceNumber, total, authorizationNumber, issueDate }) {
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;color:${TEXT};">Comprobante electrónico</h1>
    <p style="margin:0 0 12px;">Hola ${esc(customerName || 'cliente')}, <strong>${esc(companyName)}</strong> te ha emitido una factura electrónica autorizada por el SRI. Encuentras el RIDE (PDF) adjunto a este correo.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;overflow:hidden;margin:8px 0;">
      <tr><td style="padding:12px 16px;background:${BG};color:${MUTED};font-size:13px;">N.º de factura</td><td style="padding:12px 16px;background:${BG};font-weight:600;">${esc(invoiceNumber)}</td></tr>
      ${issueDate ? `<tr><td style="padding:12px 16px;color:${MUTED};font-size:13px;">Fecha</td><td style="padding:12px 16px;">${esc(issueDate)}</td></tr>` : ''}
      <tr><td style="padding:12px 16px;background:${BG};color:${MUTED};font-size:13px;">Total</td><td style="padding:12px 16px;font-weight:700;">$${esc(total)}</td></tr>
      ${authorizationNumber ? `<tr><td style="padding:12px 16px;color:${MUTED};font-size:13px;">Autorización</td><td style="padding:12px 16px;font-family:'Courier New',monospace;font-size:12px;word-break:break-all;">${esc(authorizationNumber)}</td></tr>` : ''}
    </table>
    <p style="margin:16px 0 0;color:${MUTED};">Gracias por tu compra.</p>
  `;
  return {
    subject: `Factura ${invoiceNumber} — ${companyName}`,
    html: layout({ title: 'Nueva factura', preheader: `Tu factura ${invoiceNumber} está adjunta`, bodyHtml: body, companyName })
  };
}
