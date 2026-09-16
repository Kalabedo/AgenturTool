# Desktop-Releases

## Vertrieb zum Launch

- macOS: signierte und notarisierte Developer-ID-DMGs als Direktdownload.
- Windows: ausschließlich Microsoft Store als AppX-Paket. Microsoft signiert
  nach der Zertifizierung und verteilt Updates. Kein eigener Signaturdienst.
- NSIS bleibt für lokale Entwicklung und CI-Tests erhalten. Es gibt zum Launch
  keine öffentlichen Windows-EXE-Downloads.

| System      | Runner           | Ergebnis                    | Ziel           |
| ----------- | ---------------- | --------------------------- | -------------- |
| macOS ARM64 | `macos-15`       | `Privatura-X.Y.Z-arm64.dmg` | Website        |
| macOS x64   | `macos-15-intel` | `Privatura-X.Y.Z-x64.dmg`   | Website        |
| Windows x64 | `windows-2025`   | `Privatura-X.Y.Z-x64.appx`  | Partner Center |

macOS benötigt Version 13 oder neuer. Das Store-Manifest setzt Windows 10
Build 19041 voraus; Windows 11 ist der primäre manuelle Testrechner.
Windows ARM64 ist noch nicht als eigene Architektur getestet. Linux ist kein
Releaseziel.

## Geschützte GitHub-Umgebung `release`

Die macOS-Secrets bleiben bestehen:

| Secret                 | Inhalt                                             |
| ---------------------- | -------------------------------------------------- |
| `MAC_CSC_LINK`         | Developer-ID-Application-Zertifikat als Base64-P12 |
| `MAC_CSC_KEY_PASSWORD` | Passwort der P12                                   |
| `APPLE_API_KEY_P8`     | vollständiger PEM-Text der Team-API-Key-Datei      |
| `APPLE_API_KEY_ID`     | Key-ID                                             |
| `APPLE_API_ISSUER`     | Issuer-ID                                          |

Die P12 wird mit `base64 -i DeveloperIDApplication.p12 | pbcopy` kopiert.
Der P8-Inhalt bleibt normaler PEM-Text.

Für Windows unter **Environment variables**, nicht Secrets, ergänzen:

| Variable                               | Quelle in Partner Center → Product identity       |
| -------------------------------------- | ------------------------------------------------- |
| `WINDOWS_STORE_IDENTITY_NAME`          | Package/Identity/Name                             |
| `WINDOWS_STORE_PUBLISHER`              | Package/Identity/Publisher, vollständig mit `CN=` |
| `WINDOWS_STORE_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName           |

Diese Angaben sind öffentlich. Sie werden unverändert übernommen; keine
Beispielidentität darf veröffentlicht werden. Fehlen sie, stoppt der
Store-Paketbau. Es werden keine `WINDOWS_CSC_*`- oder eSigner-Secrets benötigt.

## macOS-Zertifikat und Notarisierungszugang einrichten

Einmalig, und bis auf den ersten Punkt nur auf einem Mac:

1. **Rolle prüfen.** Developer-ID-Zertifikate darf allein der Account Holder
   anlegen. Ein Admin sieht den Punkt nicht einmal.
2. **CSR erzeugen.** Schlüsselbundverwaltung → Zertifikatsassistent →
   _Zertifikat einer Zertifizierungsinstanz anfordern_, „Auf Festplatte
   sichern", 2048 Bit RSA. Der private Schlüssel entsteht dabei lokal und
   bleibt im Schlüsselbund dieses Rechners.
3. **Zertifikat anlegen.** developer.apple.com → Certificates → **Developer ID
   Application**. Nicht _Developer ID Installer_ — den braucht nur `.pkg`,
   ausgeliefert wird DMG. CSR hochladen, `.cer` laden, doppelklicken.
4. **Als P12 exportieren.** Zertifikat und privaten Schlüssel zusammen
   markieren, „2 Objekte exportieren", starkes Passwort. Die Datei gehört
   zusätzlich in den Passwortsafe: Apple kann den privaten Schlüssel nicht
   erneut ausstellen, und mehr als fünf Developer-ID-Application-Zertifikate
   gibt es je Account nicht.
5. **Notarisierungsschlüssel anlegen.** App Store Connect → Benutzer und
   Zugriff → Integrationen → Team-Keys, Rolle _Developer_. Die `.p8` lässt
   sich genau einmal herunterladen. Issuer-ID und Key-ID stehen auf
   derselben Seite.
6. Prüfen, dass in App Store Connect keine unbestätigte Vereinbarung
   offensteht — sonst scheitert die Notarisierung mit einer Meldung, die
   nicht darauf hindeutet.

Notarisiert wird bewusst mit dem App-Store-Connect-Schlüssel und nicht mit
Apple-ID und app-spezifischem Passwort: Der Schlüssel hängt an keinem
persönlichen Konto, überlebt einen Passwortwechsel und lässt sich einzeln
widerrufen. `notarytool` nimmt ihn nur als Datei entgegen, deshalb legt der
Workflow das Secret vor dem Bau kurz als Datei ab und entfernt sie danach.

Wer lokal signiert, darf `APPLE_ID` und `APPLE_APP_SPECIFIC_PASSWORD` nicht
gesetzt haben: electron-builder prüft sie zuerst und bricht ab, sobald eine
von beiden allein in der Umgebung steht.

### Lokaler macOS-Release mit dem Schlüsselbund

Ist die Developer-ID-Identität samt privatem Schlüssel bereits im lokalen
Schlüsselbund installiert, muss keine P12-Datei in die Shell geladen werden.
Der lokale ARM64-Bau verwendet dann ausdrücklich die Schlüsselbundsuche:

```bash
APPLE_API_KEY=/sicherer/Pfad/AuthKey.p8 \
APPLE_API_KEY_ID=KEY_ID \
APPLE_API_ISSUER=ISSUER_UUID \
pnpm --filter @privatura/desktop paket --release --keychain
```

Der P8-Schlüssel bleibt außerhalb des Arbeitsbaums. `--keychain` ist nur auf
macOS, nur zusammen mit `--release` und nie für Store-Pakete zulässig. Der
entstandene DMG muss anschließend mit `codesign`, Gatekeeper und `stapler`
geprüft und über einen echten Browserdownload gestartet werden.

## Microsoft Store einrichten und Paket bauen

1. Bei [Microsoft Store Developer](https://storedeveloper.microsoft.com/) über
   den neuen kostenlosen Individual-Developer-Flow registrieren und Identität
   verifizieren.
2. Privatura als Produkt anlegen und den Namen reservieren.
3. Die drei Product-Identity-Werte in der GitHub-Umgebung eintragen.
4. Auf Windows x64 `pnpm install --frozen-lockfile` und `pnpm build` ausführen.
5. Mit gesetzten Store-Variablen bauen:

   ```powershell
   pnpm --filter @privatura/desktop paket --store --release
   ```

`electron-builder.store.yml` ergänzt die Basiskonfiguration. Der vorhandene
Builder 25 unterstützt AppX; Microsoft akzeptiert AppX und MSIX. Store-Kacheln
entstehen auf Windows aus dem vorhandenen Markenasset.
`paket --release` ohne `--store` verweigert Windows-Releases.
Das erzeugte AppX ist unsigniert und ausschließlich ein Store-Uploadpaket.
Für lokale Paketinstallation eine Kopie mit einem lokal vertrauten
Testzertifikat signieren; dafür ist kein gekauftes Zertifikat nötig.

## Veröffentlichung

1. Version in `apps/desktop/package.json` erhöhen, Änderungen prüfen und
   nach `main` integrieren.
2. Passenden stabilen Tag `vX.Y.Z` auf dem Release-Commit pushen.
3. Den Lauf **Desktop-Release** und gegebenenfalls die Umgebung freigeben.
4. macOS: GitHub-Entwurf mit zwei DMGs, `SHA256SUMS` und `updates.json`
   prüfen und veröffentlichen. Signatur, Gatekeeper, Stapling und zweimaliger
   Lauf mit denselben Testdaten werden wie bisher geprüft.
5. Windows: das Actions-Artefakt `store-upload-windows-x64` herunterladen
   und die darin enthaltene AppX-Datei in Partner Center hochladen.
6. Listing mit Screenshots, Beschreibung, Datenschutzlink und Altersfreigabe
   vervollständigen. `runFullTrust` mit dem lokalen Electron-/Prisma-Betrieb
   begründen. Zertifizierung und die unten genannten manuellen Prüfungen
   abschließen, bevor die Store-Version öffentlich wird.
7. Den Windows-Downloadknopf der Website auf die veröffentlichte
   Microsoft-Store-Produktseite richten.

Der macOS-Entwurf wartet nur auf die macOS-Jobs. Windows-Zertifizierung und
Store-Veröffentlichung erfolgen unabhängig. Das Store-Uploadpaket wird nicht
an den GitHub-Release angehängt und nicht auf der Website gehostet.
Ein fehlgeschlagener Windows-Job muss vor Store-Einreichung behoben werden,
blockiert aber den macOS-Entwurf nicht.

## Website und macOS-Updatefeed

Der Feed bleibt `https://updates.privatura.de/stable/updates.json`.
`apps/desktop/scripts/updatefeed.mjs` nimmt ausschließlich die beiden DMGs
auf; auch eine versehentlich vorhandene EXE oder AppX gelangt nicht hinein.

Zuerst beide DMGs an die im Feed angegebenen Adressen laden und Erreichbarkeit
prüfen, danach `updates.json` austauschen. Den Feed mit `Cache-Control:
no-cache` ausliefern. Versionierte DMGs dürfen länger zwischengespeichert werden.

Für einen Testfeed:

```bash
node apps/desktop/scripts/updatefeed.mjs \
  --dir apps/desktop/release --version 1.4.0 \
  --notes "Verbesserte Exporte und Fehlerkorrekturen." \
  --base-url https://updates.privatura.de/stable
```

macOS meldet und lädt Updates weiterhin über den eigenen Kanal, erstellt vor
der Installation ein Backup und startet erst nach Zustimmung neu.
Ein kompletter Upgrade-Test benötigt zwei Fassungen, einschließlich des
Fehlerfalls ohne Schreibrecht und der Entfernung alter Updateverzeichnisse.

## Windows-Updates und Daten

Electron erkennt Store-/MSIX-Pakete über `process.windowsStore`.
In diesem Betrieb wird kein eigener UpdateService gestartet. Alle
Update-API-Aktionen bleiben im Zustand `microsoft-store`; der eigene
Feed, Download und NSIS-Installer werden nicht aufgerufen. Einstellungen und
Menü verweisen auf den Microsoft Store.

Store-Updates müssen nicht mit dem macOS-Release zeitgleich erscheinen.
Die Tagessicherung und die Sicherung vor Datenbankmigrationen bleiben aktiv.
Ein Backup unmittelbar vor jedem vom Store installierten Update kann die
Anwendung nicht garantieren.

**Vor Launch offen:** Windows kann virtualisierte AppData beim Deinstallieren
oder Zurücksetzen entfernen. `userData/Daten/backups` ist deshalb allein kein
Schutz vor diesen Aktionen. Externe Backups müssen außerhalb der Paketdaten
gespeichert werden; Datenerhalt, Export und Wiederherstellung sind zu testen.
Falls Daten eine Deinstallation überstehen sollen, muss die Ablage vor dem
öffentlichen Launch entsprechend angepasst werden.

Auch das geplante Lizenzmodell mit zwölf Monaten Updates muss Store-konform
ausgearbeitet werden: Der Store aktualisiert Binärdateien unabhängig von
kundenspezifischen Lizenzfristen. Die Vertriebsentscheidung ändert keine
zugesagten Nutzungsrechte.

## Prüfungen und Grenzen

Automatisch prüft der Windows-Releasejob Paketbau, Identität, Publisher,
Architektur und Full-Trust-Einstieg. Anschließend startet er die aus dem AppX
extrahierte Anwendung zweimal mit denselben Daten und prüft Rechnung, PDF,
Tagessicherung und ausgehende Verbindungen.

**Dies ist noch kein Test einer installierten Store-App.** Vor Freigabe auf
einem Windows-11-Rechner prüfen:

- AppX installieren und aus dem Startmenü starten; Updates-Seite nennt den
  Microsoft Store und bietet keinen eigenen Installer an.
- Prisma-Migrationen, Rechnung, PDF-Export, E-Mail-Übergabe und SMTP testen.
- Zweite Paketversion über die erste installieren und Daten prüfen.
- Externes Backup exportieren und nach Reset/Neuinstallation wiederherstellen;
  ausschließlich Wegwerfdaten für Reset- und Deinstallationstests verwenden.
- Eine Store-signierte Testversion über Partner Center beziehen und den
  tatsächlichen Store-Installations- und Upgradeweg bestätigen.

Noch erforderlich sind echte Partner-Center-Identitäten, ein Windows-Paketlauf,
diese Installationstests sowie Microsofts Zertifizierung. Ein erfolgreich
erstelltes Uploadpaket ist keine Store-Freigabe.

## Offizielle Referenzen

- [Kostenloser Individual-Developer-Flow](https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer)
- [Store-Signierung von AppX/MSIX](https://learn.microsoft.com/en-us/windows/apps/publish/faq/get-started-with-the-microsoft-store)
- [Verhalten paketierter Desktop-Apps](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes)
- [Electron-Paketerkennung](https://www.electronjs.org/docs/latest/api/process#processwindowsstore-readonly)
