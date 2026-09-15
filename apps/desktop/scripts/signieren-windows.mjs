/**
 * Windows-Signatur über das Cloud-HSM von SSL.com (eSigner).
 *
 * electron-builder ruft diese Datei als `win.signtoolOptions.sign` für jede
 * zu signierende Datei einzeln auf: die Anwendung, den Deinstallierer und
 * den fertigen NSIS-Installer. Signiert wird nicht mit `signtool.exe` und
 * einer lokalen Zertifikatsdatei, sondern über `CodeSignTool` — der private
 * Schlüssel verlässt das HSM des Ausstellers nie.
 *
 * Warum überhaupt dieser Umweg: Seit dem 1. Juni 2023 verlangen die
 * Baseline Requirements des CA/Browser-Forums, dass der private Schlüssel
 * eines Code-Signing-Zertifikats auf zertifizierter Hardware entsteht und
 * nicht-exportierbar bleibt. Eine herunterladbare PFX, wie sie
 * `CSC_LINK` erwartet, gibt seitdem keine öffentlich vertraute
 * Zertifizierungsstelle mehr aus. Der Weg über ein Cloud-HSM ist der
 * einzige, der ohne eigenen Runner und ohne Signieren von Hand auskommt;
 * die Abwägung steht in docs/RELEASE.md.
 *
 * Ein Wechsel des Ausstellers fasst nur `codeSignToolArguments` und die
 * Namen unten an — der Rest dieser Datei ist von der Zertifizierungsstelle
 * unabhängig.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crossSpawn from 'cross-spawn';

/**
 * Die Geheimnisse, ohne die nicht signiert werden kann.
 *
 * `SSL_COM_CREDENTIAL_ID` steht hier bewusst mit dabei, obwohl CodeSignTool
 * es weglässt, solange im Konto genau ein Zertifikat liegt: Bei der
 * jährlichen Erneuerung liegen dort kurzzeitig zwei, und dann entschiede
 * das Werkzeug allein, mit welchem es signiert.
 */
export const WINDOWS_SIGN_SECRETS = [
  'SSL_COM_USERNAME',
  'SSL_COM_PASSWORD',
  'SSL_COM_CREDENTIAL_ID',
  'SSL_COM_TOTP_SECRET',
];

const SECRET_ARGUMENTS = /^(-(?:username|password|credential_id|totp_secret)=).*$/su;

/**
 * Der Aufruf von CodeSignTool für genau eine Datei.
 *
 * CodeSignTool schreibt das Ergebnis nicht an die Stelle der Eingabe,
 * sondern in ein anderes Verzeichnis — deshalb `outputDir`, und deshalb
 * legt der Aufrufer die signierte Datei anschließend selbst zurück.
 *
 * Einen Zeitstempel setzt das Werkzeug von sich aus über den RFC-3161-Dienst
 * des Ausstellers. Das ist keine Nebensache: Ein Cloud-Zertifikat lebt
 * höchstens 460 Tage, und ohne Zeitstempel wäre jeder ausgelieferte
 * Installer mit dem Zertifikat ungültig statt weiterhin gültig.
 */
export function codeSignToolArguments(env, inputFile, outputDir) {
  return [
    'sign',
    `-username=${env.SSL_COM_USERNAME}`,
    `-password=${env.SSL_COM_PASSWORD}`,
    `-credential_id=${env.SSL_COM_CREDENTIAL_ID}`,
    `-totp_secret=${env.SSL_COM_TOTP_SECRET}`,
    `-input_file_path=${inputFile}`,
    `-output_dir_path=${outputDir}`,
  ];
}

/**
 * Dieselbe Befehlszeile für die Ausgabe — ohne die Geheimnisse.
 *
 * Die Zugangsdaten stehen als Argumente in der Prozessliste des Runners,
 * denn CodeSignTool nimmt sie anders nicht entgegen. In das Protokoll des
 * Laufs, das jeder mit Lesezugriff sieht, gehören sie deshalb erst recht
 * nicht.
 */
export function redactedCommandLine(args) {
  return args.map((argument) => argument.replace(SECRET_ARGUMENTS, '$1…')).join(' ');
}

/** Eine Zeichenkette als PowerShell-Literal; Pfade enthalten Leerzeichen. */
export function powershellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Warum dieser Lauf nicht signiert — oder `null`, wenn er es tut.
 *
 * Pull-Request-Pakete bleiben bewusst unsigniert; `pnpm paket` ohne
 * `--release` setzt `AGENTUR_TOOL_RELEASE` auf `0`. Fehlende Zugangsdaten
 * sind dagegen nie ein Grund zu überspringen: In einem Release-Lauf sind
 * sie ein Fehler, und `paket.mjs` bricht dafür schon vor dem Bau ab.
 */
export function skipReason(env) {
  return env.AGENTUR_TOOL_RELEASE === '1' ? null : 'kein Release-Lauf';
}

function run(command, args, options = {}) {
  const result = crossSpawn.sync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} wurde durch ${result.signal} beendet.`);
  return result;
}

/**
 * Prüfen, dass die Datei danach wirklich gültig signiert ist.
 *
 * Nicht Vorsicht, sondern Erfahrung mit dem Werkzeug: CodeSignTool meldet
 * einen Teil seiner Fehler auf der Ausgabe und endet trotzdem mit Code 0.
 * Ohne diese Prüfung fiele eine unsignierte Anwendung erst am Ende des
 * Laufs auf — dann aber im Installer eingepackt, wo sie niemand mehr
 * herausbekommt, ohne neu zu bauen.
 */
function assertAuthenticodeValid(file) {
  const result = crossSpawn.sync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-AuthenticodeSignature -LiteralPath ${powershellLiteral(file)}).Status`,
    ],
    { encoding: 'utf8' },
  );

  if (result.error) throw result.error;

  const status = (result.stdout ?? '').trim();
  if (status !== 'Valid') {
    throw new Error(
      `Authenticode-Signatur ist nicht gültig (${status || 'keine Ausgabe'}): ${file}`,
    );
  }
}

/**
 * Der Haken, den electron-builder je Datei aufruft.
 *
 * Aufgerufen wird er genau einmal je Datei, weil `signingHashAlgorithms` in
 * `electron-builder.yml` auf `sha256` festgelegt ist. Ohne diese Festlegung
 * liefe er zweimal — einmal für SHA-1 —, und CodeSignTool signierte
 * dieselbe Datei ein zweites Mal.
 */
export default async function sign(configuration) {
  const file = configuration.path;
  const name = path.basename(file);

  const skip = skipReason(process.env);
  if (skip !== null) {
    process.stdout.write(`▸ Windows-Signatur übersprungen (${skip}): ${name}\n`);
    return;
  }

  const missing = WINDOWS_SIGN_SECRETS.filter((variable) => {
    const value = process.env[variable];
    return value === undefined || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(`Windows-Signatur: Zugangsdaten fehlen: ${missing.join(', ')}`);
  }

  const toolDirectory = (process.env.CODE_SIGN_TOOL_PATH ?? '').trim();
  if (toolDirectory === '') {
    throw new Error('Windows-Signatur: CODE_SIGN_TOOL_PATH fehlt.');
  }

  const tool = path.join(toolDirectory, 'CodeSignTool.bat');
  if (!fs.existsSync(tool)) {
    throw new Error(`Windows-Signatur: ${tool} gibt es nicht.`);
  }

  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-signatur-'));
  try {
    const args = codeSignToolArguments(process.env, file, outputDirectory);
    process.stdout.write(`▸ CodeSignTool ${redactedCommandLine(args)}\n`);

    // Das Arbeitsverzeichnis ist nicht beliebig: CodeSignTool sucht seine
    // Konfiguration unter `conf/` neben dem Skript.
    const result = run(tool, args, { cwd: toolDirectory });
    if (result.status !== 0) {
      throw new Error(`CodeSignTool endete mit Code ${String(result.status)} für ${name}.`);
    }

    const signed = path.join(outputDirectory, name);
    if (!fs.existsSync(signed)) {
      throw new Error(`CodeSignTool hinterließ keine signierte Datei für ${name}.`);
    }

    fs.copyFileSync(signed, file);
    assertAuthenticodeValid(file);
  } finally {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
  }
}
