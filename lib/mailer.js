// Service d'envoi d'e-mails.
// - En production : via un serveur SMTP (Brevo, Mailjet, OVH, Gmail…) configuré par variables d'environnement.
// - Sans SMTP configuré (développement) : les e-mails sont enregistrés dans data/emails/ et visibles sur /dev/emails.
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { DATA_DIR } = require('./db');
const { esc } = require('./helpers');

const APP_URL = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const FROM = process.env.MAIL_FROM || 'Relais <no-reply@relais.local>';
const OUTBOX = path.join(DATA_DIR, 'emails');

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
} else {
  fs.mkdirSync(OUTBOX, { recursive: true });
}

const url = (p) => APP_URL + p;

// Mise en page commune à tous les e-mails (couleurs Relais, compatible messageries).
function layout({ title, lines, button, footer }) {
  const body = lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#14213D">${l}</p>`).join('');
  const btn = button ? `<p style="margin:24px 0"><a href="${esc(button.href)}" style="display:inline-block;background:#17306B;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 24px;border-radius:12px">${esc(button.label)}</a></p>` : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F7F6F1;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F1;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E6E3D8;border-radius:20px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-weight:800;font-size:28px;color:#17306B;letter-spacing:-1px">relais<span style="color:#1FAE73">.</span></p>
<h1 style="margin:0 0 18px;font-size:22px;color:#17306B">${esc(title)}</h1>
${body}${btn}
<p style="margin:28px 0 0;font-size:13px;color:#4A5578">${footer || "Tu reçois cet e-mail car tu as un compte sur Relais. Pour ta sécurité, nous ne te demanderons jamais ton mot de passe ni tes coordonnées bancaires par e-mail."}</p>
</td></tr></table></td></tr></table></body></html>`;
}

const toText = (html) => html.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2 : $1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

async function send(to, subject, content) {
  const html = layout(content);
  try {
    if (transport) {
      await transport.sendMail({ from: FROM, to, subject, html, text: toText(html) });
    } else {
      const file = `${Date.now()}-${subject.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.html`;
      fs.writeFileSync(path.join(OUTBOX, file), `<!-- To: ${to} | Subject: ${subject} -->\n${html}`);
      console.log(`[e-mail] → ${to} : ${subject}`);
    }
  } catch (err) {
    // Un e-mail qui échoue ne doit jamais faire planter le site.
    console.error(`[e-mail] échec d'envoi à ${to} :`, err.message);
  }
}

// Envoi « en arrière-plan » : la page répond sans attendre le serveur e-mail.
const queue = (...args) => { setImmediate(() => send(...args)); };

module.exports = { send, queue, url, APP_URL, OUTBOX, smtpEnabled: !!transport };
