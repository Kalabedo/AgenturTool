/**
 * Die Rauchprobe: Startet die gebaute Anwendung und arbeitet einmal durch.
 *
 * Was hier geprüft wird, prüft kein Unit-Test — es geht nicht um Logik,
 * sondern um die Form, in der die Anwendung ausgeliefert wird. Ob
 * `require.resolve` die API im Paketbaum findet, ob der Prisma-Client dort
 * erzeugt wurde, ob die Query-Engine neben ihm liegt und aus dem asar
 * heraus ladbar ist, ob die Migrationen über Electrons eigenes Node
 * laufen: Jede dieser Fragen ist im Repository beantwortet und im Paket
 * neu zu stellen.
 *
 * Aufruf:
 *
 *   node scripts/rauchprobe.mjs                     # gegen paket/dist/main.js
 *   node scripts/rauchprobe.mjs <programm|einstieg>  # gegen ein gebautes Paket
 *
 * Das Argument ist entweder eine `.js`-Datei (dann startet Electron sie)
 * oder ein fertiges Programm aus `release/` (dann startet es selbst).
 *
 * Auf einem Rechner ohne Bildschirm über `xvfb-run -a` aufrufen.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.argv[2] ?? path.join(desktopDir, 'paket/dist/main.js'));

/** Was der Lauf gesehen hat — am Ende die Grundlage des Urteils. */
const blocked = [];
let apiUrl = null;
let output = '';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-rauchprobe-'));
console.log(`▸ Ziel:            ${target}`);
console.log(`▸ Datenverzeichnis: ${dataDir}`);

// Nicht `node_modules/.bin/electron`: Das ist unter Windows eine
// `.cmd`-Datei, die sich ohne Shell nicht starten lässt. Das Paket selbst
// nennt den Pfad zum Programm.
const require = createRequire(path.join(desktopDir, 'package.json'));
const [command, args] = target.endsWith('.js')
  ? [require('electron'), ['--no-sandbox', target]]
  : [target, ['--no-sandbox']];

const app = spawn(command, [...args, `--user-data-dir=${dataDir}`], {
  cwd: desktopDir,
  env: { ...process.env, AGENTUR_TOOL_DEV_URL: undefined },
});

app.stdout.setEncoding('utf8');
app.stderr.setEncoding('utf8');
app.stdout.on('data', absorb);
app.stderr.on('data', absorb);

function absorb(chunk) {
  output += chunk;
  for (const line of chunk.split('\n')) {
    if (line.startsWith('AGENTUR_TOOL_URL ')) {
      apiUrl = line.slice('AGENTUR_TOOL_URL '.length).trim();
    }
    if (line.includes('abgewiesen:')) {
      blocked.push(line.trim());
    }
  }
}

/** Wartet auf die Zeile mit der Adresse — oder darauf, dass es sie nie gibt. */
async function waitForUrl(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (apiUrl !== null) return apiUrl;
    if (app.exitCode !== null) {
      throw new Error(`Die Anwendung endete mit Code ${String(app.exitCode)}.\n\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Keine Adresse nach ${String(timeoutMs)} ms.\n\n${output}`);
}

async function call(method, route, body) {
  const response = await fetch(`${apiUrl}${route}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${method} ${route} → ${String(response.status)}: ${await response.text()}`);
  }

  const type = response.headers.get('content-type') ?? '';
  return type.includes('application/json')
    ? response.json()
    : Buffer.from(await response.arrayBuffer());
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

function isoDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

async function probe() {
  await waitForUrl();
  console.log(`▸ Server:          ${apiUrl}\n`);

  check((await call('GET', '/api/health')).status === 'ok', 'Der Server antwortet.');

  const profiles = await call('GET', '/api/tax-profiles');
  check(profiles.length > 0, `Grunddaten stehen (${String(profiles.length)} Steuerprofile).`);

  await call('PUT', '/api/company', {
    companyName: 'XYZ - Agentur',
    street: 'Wolfgangsklinge 14',
    postalCode: '73479',
    city: 'Ellwangen',
    country: 'DE',
    email: 'rechnung@example.de',
    website: null,
    phone: null,
    vatId: 'DE455137261',
    taxNumber: null,
    bankAccountHolder: 'XYZ - Agentur',
    iban: 'DE12202208000052019114',
    bic: null,
    bankName: null,
    defaultPaymentTermDays: 14,
  });
  check(true, 'Firmendaten gespeichert.');

  const customer = await call('POST', '/api/customers', {
    customerNumber: null,
    companyName: 'Musterkunde GmbH',
    contactName: null,
    addressLine: null,
    street: 'Musterweg 1',
    postalCode: '10115',
    city: 'Berlin',
    country: 'DE',
    email: null,
    vatId: null,
    notes: null,
    defaultPaymentTermDays: null,
    defaultTaxProfileId: null,
  });
  check(typeof customer.id === 'number', `Kunde angelegt (#${String(customer.id)}).`);

  const draft = await call('POST', '/api/invoices', { customerId: customer.id });

  await call('PATCH', `/api/invoices/${String(draft.id)}`, {
    customerId: customer.id,
    taxProfileId: profiles[0].id,
    buyerData: {
      companyName: 'Musterkunde GmbH',
      contactName: null,
      addressLine: null,
      street: 'Musterweg 1',
      postalCode: '10115',
      city: 'Berlin',
      country: 'DE',
      email: null,
      vatId: null,
      customerNumber: null,
    },
    invoiceDate: isoDate(),
    serviceDate: isoDate(-7),
    serviceDateTo: null,
    dueDate: isoDate(14),
    notes: null,
    footerNote: null,
    internalNotes: null,
    items: [
      {
        description: 'Konzeption und Umsetzung',
        quantity: '10',
        unit: 'Std.',
        unitPriceCents: '95,00',
        discountType: 'PERCENT',
        discountValue: '0',
        taxRateBasisPoints: profiles[0].defaultRateBasisPoints ?? 1900,
      },
    ],
  });

  const finalized = await call('POST', `/api/invoices/${String(draft.id)}/finalize`);
  check(
    typeof finalized.number === 'string' && finalized.number.length > 0,
    `Rechnung ausgestellt (${finalized.number}).`,
  );

  // Der eigentliche Punkt: Das PDF entsteht in Electrons Chromium, im
  // Paket wie im Repository.
  const pdf = await call('GET', `/api/invoices/${String(draft.id)}/pdf`);
  check(pdf.subarray(0, 5).toString('latin1') === '%PDF-', 'Das PDF trägt die richtige Signatur.');
  check(pdf.length > 20_000, `Das PDF ist ${String(Math.round(pdf.length / 1024))} kB groß.`);

  const summary = await call('POST', '/api/backup/export');
  check(
    summary.counts.invoices === 1 && summary.counts.documents === 1,
    `Backup erzeugt (${summary.filename}).`,
  );

  check(blocked.length === 0, 'Keine Anfrage hat den Rechner verlassen wollen.');
}

let failure = null;
try {
  await probe();
} catch (error) {
  failure = error;
}

app.kill('SIGTERM');
await new Promise((resolve) => {
  app.once('exit', resolve);
  setTimeout(() => {
    app.kill('SIGKILL');
    resolve();
  }, 10_000);
});

if (failure !== null) {
  console.error(`\n✗ ${failure.message}`);
  for (const line of blocked) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`\n✓ Rauchprobe bestanden.`);

try {
  // Chromium räumt seine eigenen Dateien noch auf, während wir schon
  // löschen. Ein liegen gebliebenes Verzeichnis unter /tmp ist kein Grund,
  // einen bestandenen Lauf als gescheitert zu melden.
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
} catch {
  console.log(`  (${dataDir} blieb liegen.)`);
}
