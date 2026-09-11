#!/usr/bin/env node
// Crea un utente auth Supabase per Multiplatore senza far passare secret in chat.
// Uso:  node scripts/create-auth-user.mjs <email>
// La password viene chiesta nel terminale (input nascosto, supporta paste/backspace).
// Richiede nel .env: VITE_SUPABASE_URL + SUPABASE_TOKEN_ACCESS (token CLI Supabase).
import { readFileSync } from 'node:fs';

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('uso: node scripts/create-auth-user.mjs <email>');
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

// Input nascosto robusto: raw mode, accumula carattere per carattere (i chunk
// di stdin possono arrivare spezzati, specie su Windows o con incolla).
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const wasRaw = stdin.isRaw === true;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (chunk) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const c of s) {
        if (c === '\r' || c === '\n') {
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf);
          return;
        }
        if (c === String.fromCharCode(3)) {
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
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
        if (c === '\t') continue;
        buf += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

const password = await askHidden('Password (input nascosto, Invio per confermare): ');
if (password.length < 8) {
  console.error(`password troppo corta (${password.length} caratteri, min 8) — riprova`);
  process.exit(1);
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

const createRes = await fetch(`${projectUrl}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: svc, Authorization: `Bearer ${svc}` },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const body = await createRes.json().catch(() => ({}));
if (!createRes.ok) {
  console.error('creazione fallita:', createRes.status, JSON.stringify(body).slice(0, 300));
  process.exit(1);
}
console.log(`OK: utente ${body.user?.email ?? email} creato e confermato (id ${body.user?.id}).`);
console.log("Ora fai login dall'AuthBar in alto nell'app.");
