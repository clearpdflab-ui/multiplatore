#!/usr/bin/env node
// Cambia la password di un utente auth Supabase esistente, senza far passare
// secret in chat.
// Uso:  node scripts/set-auth-password.mjs <email>
// La nuova password viene chiesta nel terminale (input nascosto).
// Richiede nel .env: VITE_SUPABASE_URL + SUPABASE_TOKEN_ACCESS (token CLI Supabase).
import { readFileSync } from 'node:fs';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('uso: node scripts/set-auth-password.mjs <email>');
  process.exit(1);
}

function envValue(file, key) {
  const line = file.split(/\r?\n/).find((l) => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim() : null;
}

const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const projectUrl = envValue(envFile, 'VITE_SUPABASE_URL');
const mgmtToken = envValue(envFile, 'SUPABASE_TOKEN_ACCESS');
const projectRef = projectUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectUrl || !mgmtToken || !projectRef) {
  console.error('manca VITE_SUPABASE_URL o SUPABASE_TOKEN_ACCESS in .env');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const wasRaw = stdin.isRaw === true;
    if (stdin.isTTY) {stdin.setRawMode(true);}
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (chunk) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const c of s) {
        if (c === '\r' || c === '\n') {
          if (stdin.isTTY) {stdin.setRawMode(wasRaw);}
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (c === String.fromCharCode(3)) {
          if (stdin.isTTY) {stdin.setRawMode(wasRaw);}
          process.stdout.write('^C\n');
          process.exit(130);
        }
        if (c === String.fromCharCode(8) || c === String.fromCharCode(127)) {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (c === '\t') {continue;}
        buf += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

// service_role dalle API keys del progetto (mai stampata)
const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
  headers: { Authorization: `Bearer ${mgmtToken}` },
});
if (!keysRes.ok) {
  console.error('fetch api-keys fallita:', keysRes.status, await keysRes.text());
  process.exit(1);
}
const keys = await keysRes.json();
const list = Array.isArray(keys) ? keys : keys.keys ?? [];
const found = list.find((k) => k.name === 'service_role' || k.type === 'service_role');
const svc = found?.api_key ?? found?.value;
if (!svc) {
  console.error('service_role key non trovata');
  process.exit(1);
}

// Cerca l'utente per email (paginazione di sicurezza, poche utenze attese).
let userId = null;
let page = 1;
for (;;) {
  const listRes = await fetch(`${projectUrl}/auth/v1/admin/users?page=${page}&per_page=100`, {
    headers: { apikey: svc, Authorization: `Bearer ${svc}` },
  });
  if (!listRes.ok) {
    console.error('lista utenti fallita:', listRes.status, await listRes.text());
    process.exit(1);
  }
  const data = await listRes.json();
  const users = data.users ?? [];
  const hit = users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (hit) {
    userId = hit.id;
    break;
  }
  if (users.length < 100) {
    break;
  }
  page += 1;
}
if (!userId) {
  console.error(`utente ${email} non trovato (crealo con scripts/create-auth-user.mjs)`);
  process.exit(1);
}

const password = await askHidden('Nuova password (input nascosto, Invio per confermare): ');
if (password.length < 8) {
  console.error(`password troppo corta (${password.length} caratteri, min 8) - riprova`);
  process.exit(1);
}

const updRes = await fetch(`${projectUrl}/auth/v1/admin/users/${userId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', apikey: svc, Authorization: `Bearer ${svc}` },
  body: JSON.stringify({ password }),
});
if (!updRes.ok) {
  console.error('aggiornamento fallito:', updRes.status, (await updRes.text()).slice(0, 300));
  process.exit(1);
}
console.log(`OK: password aggiornata per ${email}. Ora fai login con la nuova password.`);
