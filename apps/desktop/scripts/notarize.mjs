/**
 * Notarisierung bei Apple, nach dem Signieren.
 *
 * Ohne diesen Schritt startet die Anwendung auf einem fremden Mac nur über
 * den Umweg „Rechtsklick → Öffnen". Mit ihm prüft Apple das signierte
 * Paket einmal und hinterlegt das Ergebnis; Gatekeeper fragt danach nicht
 * mehr nach.
 *
 * Fehlen die Zugangsdaten, wird übersprungen statt abgebrochen: In CI wird
 * geprüft, ob das Paket überhaupt entsteht, und dafür braucht es kein
 * Zertifikat.
 */
import { notarize } from '@electron/notarize';

export default async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (appleId === undefined || appleIdPassword === undefined || teamId === undefined) {
    process.stdout.write(
      'Notarisierung übersprungen: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD oder ' +
        'APPLE_TEAM_ID fehlen.\n',
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  process.stdout.write(`Notarisierung läuft — das dauert erfahrungsgemäß einige Minuten …\n`);

  await notarize({
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword,
    teamId,
  });
}
