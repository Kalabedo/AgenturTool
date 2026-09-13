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
 *   node scripts/rauchprobe.mjs                 # gegen paket/dist/main.js
 *   node scripts/rauchprobe.mjs <ziel>          # gegen ein gebautes Paket
 *   node scripts/rauchprobe.mjs <ziel> --data-dir <pfad> --reopen
 *
 * Das Ziel ist eine `.js`-Datei (dann startet Electron sie), ein
 * macOS-Bundle (`release/mac-arm64/AgenturTool.app`) oder ein fertiges
 * Programm aus `release/` (dann startet es selbst).
 *
 * Auf einem Rechner ohne Bildschirm über `xvfb-run -a` aufrufen.
 */
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLineCollector, stopChild, waitForStartup } from './rauchprobe-prozess.mjs';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = parseArguments(process.argv.slice(2));
const target = resolveTarget(path.resolve(options.target));

function parseArguments(args) {
  let targetArgument = null;
  let dataDir = null;
  let reopen = false;
  let keepData = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--data-dir') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--data-dir erwartet einen Pfad.');
      }
      dataDir = path.resolve(value);
      index += 1;
    } else if (argument === '--reopen') {
      reopen = true;
    } else if (argument === '--keep-data') {
      keepData = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unbekannte Rauchprobenoption: ${argument}`);
    } else if (targetArgument === null) {
      targetArgument = argument;
    } else {
      throw new Error(`Mehr als ein Ziel angegeben: ${targetArgument}, ${argument}`);
    }
  }

  if (reopen && dataDir === null) {
    throw new Error('--reopen verlangt ein dauerhaftes --data-dir.');
  }

  return {
    target: targetArgument ?? path.join(desktopDir, 'paket/dist/main.js'),
    dataDir,
    reopen,
    keepData,
  };
}

/**
 * Das Ziel auf etwas Startbares zurückführen.
 *
 * Ein macOS-Bundle ist ein Verzeichnis; das Programm darin heißt, was das
 * Info.plist sagt, und das muss nicht der Name der Anwendung sein.
 * Angegeben wird deshalb das `.app`, nicht der Pfad hinein — von Hand
 * getippt ginge der ohnehin meist daneben.
 */
function resolveTarget(given) {
  const plist = path.join(given, 'Contents/Info.plist');
  if (fs.existsSync(plist)) {
    const content = fs.readFileSync(plist, 'utf8');
    const match = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(content);
    const name = match?.[1] ?? path.basename(given, '.app');
    return path.join(given, 'Contents/MacOS', name);
  }

  if (!fs.existsSync(given)) {
    console.error(`✗ Das Ziel gibt es nicht: ${given}`);
    console.error('  Erst packen: pnpm paket   (oder pnpm paket --nur-baum)');
    process.exit(1);
  }

  return given;
}

/** Was der Lauf gesehen hat — am Ende die Grundlage des Urteils. */
const blocked = [];
let apiUrl = null;
let output = '';
const startupEvents = new EventEmitter();

const temporaryDataDir = options.dataDir === null;
const dataDir =
  options.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-rauchprobe-'));
fs.mkdirSync(dataDir, { recursive: true });
console.log(`▸ Ziel:            ${target}`);
console.log(`▸ Datenverzeichnis: ${dataDir}`);
console.log(`▸ Lauf:            ${options.reopen ? 'Wiederaufnahme' : 'Neuinstallation'}`);

// Nicht `node_modules/.bin/electron`: Das ist unter Windows eine
// `.cmd`-Datei, die sich ohne Shell nicht starten lässt. Das Paket selbst
// nennt den Pfad zum Programm.
const require = createRequire(path.join(desktopDir, 'package.json'));
const [command, args] = target.endsWith('.js')
  ? [require('electron'), ['--no-sandbox', '--disable-error-dialogs', target]]
  : [target, ['--no-sandbox', '--disable-error-dialogs']];

const childEnvironment = { ...process.env };
delete childEnvironment.AGENTUR_TOOL_DEV_URL;
// Die Rauchprobe belegt, dass beim Start nichts den Rechner verlässt. Die
// Updateprüfung würde genau das tun — und zwar zu Recht, nur eben nicht
// hier. Sie wird deshalb abgeschaltet und unten daraufhin geprüft.
childEnvironment.AGENTUR_TOOL_UPDATE_FEED = 'aus';
// Die Tagessicherung wartet im Betrieb eine Minute und höchstens einmal je
// Kalendertag. Beides erlebt die Rauchprobe nie: Sie prüft ein paar Sekunden
// lang, und der erste Lauf hat schon ein Archiv desselben Tages angelegt.
// Der Schalter nimmt Wartezeit und Drossel heraus, damit der zweite Lauf
// belegen kann, dass die automatische Sicherung auch im Paket funktioniert.
childEnvironment.AGENTUR_TOOL_BACKUP_TAEGLICH = 'erzwingen';

const app = spawn(command, [...args, `--user-data-dir=${dataDir}`], {
  cwd: desktopDir,
  env: childEnvironment,
});

app.stdout.setEncoding('utf8');
app.stderr.setEncoding('utf8');
const stdoutLines = createLineCollector(absorbLine);
const stderrLines = createLineCollector(absorbLine);
app.stdout.on('data', (chunk) => absorb(chunk, stdoutLines));
app.stderr.on('data', (chunk) => absorb(chunk, stderrLines));
app.once('close', () => {
  stdoutLines.flush();
  stderrLines.flush();
});

function absorb(chunk, collector) {
  output += chunk;
  try {
    collector.write(chunk);
  } catch (error) {
    startupEvents.emit('failure', error);
  }
}

function absorbLine(line) {
  if (line.startsWith('AGENTUR_TOOL_URL ')) {
    const candidate = line.slice('AGENTUR_TOOL_URL '.length).trim();
    const parsed = new URL(candidate);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
      throw new Error(`Die Anwendung meldete keine Rückschleifen-Adresse: ${candidate}`);
    }
    apiUrl = candidate;
    startupEvents.emit('ready', candidate);
  }
  if (line.includes('abgewiesen:')) {
    blocked.push(line.trim());
  }
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

async function probeFreshInstall() {
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

  const update = await call('GET', '/api/app/update');
  check(
    update.state === 'abgeschaltet' && update.available === null,
    'Die Updateprüfung ist verdrahtet und in diesem Lauf abgeschaltet.',
  );

  const summary = await call('POST', '/api/backup/export');
  check(
    summary.counts.invoices === 1 && summary.counts.documents === 1,
    `Backup erzeugt (${summary.filename}).`,
  );

  check(blocked.length === 0, 'Keine Anfrage hat den Rechner verlassen wollen.');
}

async function probeReopen() {
  const invoices = await call('GET', '/api/invoices');
  check(invoices.total === 1, 'Die vorhandene Rechnung ist nach dem Neustart noch da.');

  const invoice = invoices.items[0];
  check(
    typeof invoice.number === 'string' && invoice.number.length > 0,
    `Die ausgestellte Rechnung behält ihre Nummer (${invoice.number}).`,
  );

  const pdf = await call('GET', `/api/invoices/${String(invoice.id)}/pdf`);
  check(pdf.subarray(0, 5).toString('latin1') === '%PDF-', 'Das gespeicherte PDF ist lesbar.');

  // Das Archiv aus dem ersten Lauf muss den Neustart überlebt haben — und
  // es darf keines dazugekommen sein, nur weil die Anwendung ein zweites Mal
  // gestartet ist. Vorher entstand hier bei jedem Start ein vollständiges
  // Archiv; genau das soll nicht mehr passieren.
  const daily = await waitForDailyBackup();
  check(
    daily.some((entry) => entry.reason === 'manuell'),
    'Das Archiv aus dem ersten Start ist nach dem Neustart noch da.',
  );
  check(
    daily.filter((entry) => entry.reason === 'migration').length === 0,
    'Ohne ausstehende Migration entsteht beim Start kein weiteres Archiv.',
  );
  check(
    daily.some((entry) => entry.reason === 'taeglich'),
    'Die Tagessicherung läuft auch im gepackten Baum.',
  );
  check(blocked.length === 0, 'Keine Anfrage hat den Rechner verlassen wollen.');
}

/**
 * Wartet, bis die Tagessicherung durch ist.
 *
 * Sie läuft nebenher und braucht einen Moment; ein einzelner Blick auf die
 * Liste wäre ein Wettlauf. Dafür ist die Prüfung danach eindeutig: Entweder
 * das Archiv ist da oder es ist nach dreißig Sekunden nicht gekommen.
 */
async function waitForDailyBackup() {
  const deadline = Date.now() + 30_000;

  for (;;) {
    const status = await call('GET', '/api/backup/status');
    if (status.backups.some((entry) => entry.reason === 'taeglich')) return status.backups;
    if (Date.now() > deadline) return status.backups;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function probe() {
  apiUrl = await waitForStartup(app, startupEvents, () => output);
  console.log(`▸ Server:          ${apiUrl}\n`);
  check((await call('GET', '/api/health')).status === 'ok', 'Der Server antwortet.');

  if (options.reopen) {
    await probeReopen();
  } else {
    await probeFreshInstall();
  }
}

let failure = null;
try {
  await probe();
} catch (error) {
  failure = error;
}

await stopChild(app);

if (failure !== null) {
  console.error(`\n✗ ${failure.message}`);
  for (const line of blocked) console.error(`  ${line}`);
  process.exitCode = 1;
} else {
  console.log(`\n✓ Rauchprobe bestanden.`);
}

if (temporaryDataDir && !options.keepData) {
  try {
    // Chromium räumt seine eigenen Dateien noch auf, während wir schon
    // löschen. Ein liegen gebliebenes Verzeichnis unter /tmp ist kein Grund,
    // einen bestandenen Lauf als gescheitert zu melden.
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    console.log(`  (${dataDir} blieb liegen.)`);
  }
}
