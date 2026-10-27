// Shared look for every email that goes to subscribers (TJ, 2026-10-25): a navy header bar with the trout
// icon and "HereFishyFishy" as real text, then a white card. The name is text, not an image, so the
// header still reads when a mail app blocks images, and navy holds up in dark mode (Gmail and Apple
// Mail leave dark backgrounds alone and only invert light ones). Tables and inline styles, because
// Outlook and Gmail ignore most CSS. Every subscriber email goes through brandEmail(); previews sent
// only to TJ don't need it.
export const BRAND_NAVY = '#0e2a4a';
export const BRAND_TEAL = '#1e7a6e';
const ICON = 'https://herefishyfishy.ca/icon-192.png?v=3';

function escAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// inner: the email's own HTML (headings, paragraphs, the footer). preheader: the grey line inbox lists
// show after the subject; keep it short.
export function brandEmail(inner, opts = {}) {
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#fbf9f5">${escAttr(opts.preheader)}</div>`
    : '';
  const site = opts.site || 'https://herefishyfishy.ca';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>HereFishyFishy</title></head>
<body style="margin:0;padding:0;background:#f3f0ea">${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f0ea">
<tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
<tr><td style="background:${BRAND_NAVY};border-radius:10px 10px 0 0;padding:14px 20px">
  <a href="${escAttr(site)}" style="text-decoration:none;color:#ffffff">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;padding-right:10px"><img src="${ICON}" width="36" height="36" alt="" style="display:block;border:0;border-radius:18px"></td>
      <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:700;font-size:22px;color:#ffffff;letter-spacing:.2px">HereFishyFishy</td>
    </tr></table>
  </a>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 10px 10px;padding:20px 22px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1a2e3a">
${inner}
</td></tr>
</table>
</td></tr></table></body></html>`;
}
