# Desktop-Releases

Öffentliche Desktop-Pakete entstehen nur aus einem stabilen SemVer-Tag auf
`main`. Eine installierte Anwendung findet diese Pakete selbst: Sie fragt den
Updatefeed, lädt auf Klick, prüft Prüfsumme und Signatur und ersetzt sich
nach einem Backup selbst (D54, Architektur Abschnitt 28). Der Releaselauf
erzeugt neben den Paketen die Feed-Datei; ausgeliefert wird sie über die
eigene Website.

## Unterstützte Pakete

| System      | Runner           | Ergebnis                      |
| ----------- | ---------------- | ----------------------------- |
| macOS ARM64 | `macos-15`       | `AgenturTool-X.Y.Z-arm64.dmg` |
| macOS x64   | `macos-15-intel` | `AgenturTool-X.Y.Z-x64.dmg`   |
| Windows x64 | `windows-2025`   | `AgenturTool-X.Y.Z-x64.exe`   |

macOS 13 oder neuer sowie Windows 10 und 11 werden unterstützt. Windows ARM64
kann das x64-Paket über die Betriebssystememulation ausführen, wird aber nicht
als eigene Architektur gebaut oder zertifiziert. Linux ist kein Release-Ziel.

## Geschützte Umgebung und Geheimnisse

Unter **Settings → Environments** muss eine Umgebung `release` angelegt
werden. Ein erforderlicher Reviewer verhindert, dass ein versehentlich
gesetzter Tag ohne menschliche Freigabe Zugriff auf die Zertifikate erhält.

Die Umgebung enthält ausschließlich diese Secrets:

| Secret                     | Inhalt                                        |
| -------------------------- | --------------------------------------------- |
| `MAC_CSC_LINK`             | Developer-ID-Application-Zertifikat als P12   |
| `MAC_CSC_KEY_PASSWORD`     | Passwort der P12-Datei                        |
| `APPLE_API_KEY_P8`         | App-Store-Connect-Schlüssel, Inhalt der `.p8` |
| `APPLE_API_KEY_ID`         | Kennung des Schlüssels, zehnstellig           |
| `APPLE_API_ISSUER`         | Issuer-ID des Teams, eine UUID                |
| `WINDOWS_CSC_LINK`         | Windows-Signatur — Weg offen, siehe unten     |
| `WINDOWS_CSC_KEY_PASSWORD` | Windows-Signatur — Weg offen, siehe unten     |

Die P12 wird als einzeiliger Base64-Inhalt gespeichert:

```bash
base64 -i DeveloperIDApplication.p12 | pbcopy
```

Der Notarisierungsschlüssel dagegen im Klartext: Die heruntergeladene
`AuthKey_XXXXXXXXXX.p8` ist PEM-Text und kommt mit allen Zeilen — von
`-----BEGIN PRIVATE KEY-----` bis zur letzten — in das Secret.

Die Workflows reichen nur die für den jeweiligen Runner benötigten Secrets
weiter. Werte gehören weder in Dateien noch in Workflow-Ausgaben.
`pnpm paket --release` nennt bei einem Fehler ausschließlich die fehlenden
Variablennamen.

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

## Windows-Signatur: offener Punkt

**Der Windows-Job des Workflows ist so, wie er dasteht, nicht mehr
befüllbar.** `WINDOWS_CSC_LINK` erwartet eine PFX-Datei mit exportierbarem
privatem Schlüssel; seit dem 1. Juni 2023 verlangen die Baseline Requirements
des CA/Browser-Forums für jedes Code-Signing-Zertifikat — OV wie EV —, dass
der private Schlüssel auf zertifizierter Hardware erzeugt wird und
nicht-exportierbar bleibt. Keine öffentlich vertraute CA gibt seitdem noch
eine herunterladbare PFX heraus. Seit dem 1. März 2026 gilt zusätzlich eine
Höchstlaufzeit von 460 Tagen, das Zertifikat ist also etwa jährlich zu
erneuern.

Vor dem ersten Windows-Release ist deshalb einer dieser Wege zu wählen:

- **Azure Artifact Signing** (früher Trusted Signing). Etwa zehn Dollar im
  Monat, keine Hardware, von electron-builder 25 über `win.azureSignOptions`
  unmittelbar unterstützt. Voraussetzung ist eine geprüfte Organisation;
  Einzelentwickler sind bislang auf die USA und Kanada beschränkt, und die
  Organisationsprüfung verlangt etwa drei Jahre nachweisbare Geschäftshistorie.
- **Cloud-HSM einer klassischen CA** (SSL.com eSigner, DigiCert KeyLocker,
  GlobalSign, Certum). Teurer, dafür auch als Einzelperson zu bekommen. Die
  Signatur läuft über ein Skript in `win.sign`.
- **USB-Token.** Ein von GitHub gehosteter Runner sieht ihn nicht. Das hieße
  eigener Runner oder Signieren von Hand — und damit das Ende des
  geschlossenen Releaselaufs.

Zwei Dinge hängen daran:

- Bei kurzlebigen Cloud-Zertifikaten — bei Azure lebt jedes nur wenige Tage —
  entscheidet allein der RFC-3161-Zeitstempel darüber, ob der Installer in
  einem Monat noch gültig ist. Die Prüfung im Workflow sieht bisher nur
  `Status`; sobald der Weg steht, gehört `TimeStamperCertificate` dazu.
- Die Signaturidentität ist nach dem öffentlichen Release festgelegt (D43,
  `VERTRIEB-UND-UPDATES.md`). Ein späterer Wechsel des Ausstellers setzt die
  SmartScreen-Reputation zurück. Die Wahl fällt vor 1.0, nicht danach.

## Veröffentlichung

1. Die Version in `apps/desktop/package.json` erhöhen und den aktualisierten
   `pnpm-lock.yaml` mit einchecken. Diese Version ist für Desktop-Releases
   maßgeblich.
2. Pull Request vollständig grün werden lassen und nach `main` mergen.
3. Auf genau diesem Commit den passenden Tag anlegen und pushen:

   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```

4. Den Lauf **Desktop-Release** und den Zugriff auf die geschützte Umgebung
   freigeben.
5. Den erzeugten Release-Entwurf prüfen: zwei DMGs, ein EXE-Installer,
   `SHA256SUMS`, `updates.json` und automatisch erzeugte Hinweise müssen
   vorhanden sein.
6. Den Entwurf in GitHub veröffentlichen.
7. Die Website bestücken — siehe den nächsten Abschnitt.

Der Workflow lehnt Tags ab, die nicht exakt `vMAJOR.MINOR.PATCH` entsprechen,
nicht zur Desktop-Version passen oder deren Commit nicht zu `main` gehört.
Ein fehlgeschlagener Lauf darf denselben Entwurf und seine Dateien ersetzen;
ein bereits veröffentlichter Release wird niemals überschrieben.

## Website und Updatefeed

Verkauft und heruntergeladen wird über die eigene Website (D38). Die
installierte Anwendung fragt dort höchstens einmal am Tag eine einzige Datei
ab:

```text
https://updates.agenturtool.de/stable/updates.json
```

Die Datei entsteht im Releaselauf aus den fertigen Paketen
(`apps/desktop/scripts/updatefeed.mjs`) und liegt dem Release bei — so
stammen veröffentlichte Prüfsummen und Feed aus demselben Lauf. Sie enthält
Version, Datum, einen Satz für das Banner sowie je Paket Adresse, Größe und
SHA-256.

**Die Reihenfolge ist die Regel:**

1. Die drei Pakete auf die Website laden, unter genau die Adressen, die in
   `updates.json` stehen (`…/stable/AgenturTool-<Version>-<arch>.<ext>`).
2. Prüfen, dass jede dieser Adressen die Datei wirklich ausliefert.
3. Erst dann `updates.json` hochladen und ersetzen.

Ein Feed, der auf einen 404 zeigt, ist schlimmer als gar keiner: Jede
laufende Installation zeigt dann ein Banner, dessen Knopf ins Leere führt.

Die Datei wird ohne Zwischenspeicher ausgeliefert (`Cache-Control:
no-cache`, kurze TTL); sonst sieht ein Teil der Kunden tagelang die alte
Version. Die Pakete dürfen dagegen lange zwischengespeichert werden — ihre
Adressen enthalten die Version.

Von Hand erzeugen lässt sich der Feed genauso, etwa für einen Testkanal:

```bash
node apps/desktop/scripts/updatefeed.mjs \
  --dir apps/desktop/release --version 1.4.0 \
  --notes "Verbesserte Exporte und Fehlerkorrekturen." \
  --base-url https://updates.agenturtool.de/stable
```

Vor dem Umstellen des echten Feeds lässt sich der ganze Weg mit einer
Testadresse prüfen — `AGENTUR_TOOL_UPDATE_FEED` zeigt dann dorthin, und nur
dieser Host gilt für Downloads:

```bash
AGENTUR_TOOL_UPDATE_FEED=https://test.agenturtool.de/updates.json pnpm dev:desktop
```

Der Host im Feed und der Host der Downloads müssen zusammenpassen: Die
Anwendung nimmt Adressen nur von `updates.agenturtool.de`,
`agenturtool.de` und `www.agenturtool.de` an (`apps/desktop/src/config.ts`).
Eine neue Domain ist deshalb eine Codeänderung und keine Serverkonfiguration
— das ist Absicht.

## Automatische Freigabekriterien

- vollständige statische, Unit-, Integrations- und Build-Prüfung;
- native Prisma- und argon2-Binärdateien je Zielarchitektur;
- gültige macOS-Codesignatur, Gatekeeper-Prüfung und angeheftetes
  Notarisierungsticket;
- gültige Authenticode-Signatur für Windows-Installer und Anwendung;
- erfolgreicher Start direkt aus dem DMG beziehungsweise nach stiller
  NSIS-Installation;
- zweiter Start mit derselben Datenablage samt Rechnung, PDF und Tagessicherung;
- keine von der Anwendung ausgehende Netzwerkanfrage.

Eine neue Windows-Signatur kann trotz gültigem Zertifikat anfangs noch keinen
SmartScreen-Ruf besitzen. Der Workflow kann die Authenticode-Gültigkeit
erzwingen, nicht Microsofts externe Reputationsbewertung.

## Update in der Anwendung

Die laufende Anwendung meldet die neue Fassung von selbst — als Banner und
unter Einstellungen → Updates, mit Größe und Prüfsumme zum Vergleichen.
„Update laden" holt das Paket, „Neu starten und installieren" erzeugt ein
Backup, prüft die Signatur, ersetzt die Installation und startet neu. Was
dabei im Einzelnen passiert, steht in Abschnitt 28 der Architektur.

**Nach dem ersten Release eines neuen Kanals von Hand nachprüfen** — der Weg
lässt sich nicht ohne zwei Fassungen testen:

1. Eine ältere Fassung installieren (DMG beziehungsweise Installer aus dem
   vorigen Release), starten und in den Einstellungen prüfen lassen.
2. „Update laden" — der Fortschritt muss laufen und die Prüfung durchgehen.
3. „Neu starten und installieren" — danach muss unter `Daten/backups` ein
   frisches Archiv liegen, die Anwendung von selbst wieder hochkommen und
   unter Einstellungen → Updates die neue Fassung stehen.
4. Auf macOS zusätzlich prüfen, dass `/Applications/AgenturTool.app` die neue
   Fassung ist und daneben kein `.agentur-tool-update-*` liegen bleibt.
5. Den Fall ohne Schreibrecht mitprüfen: dieselbe Anwendung aus dem
   Download-Ordner starten (Gatekeeper verschiebt sie dann) — die
   Installation muss mit einem Hinweis auf den Dateimanager abbrechen und
   nichts anfassen.

## Manuelles Update

Der Weg bleibt daneben bestehen — für den Fall, dass der Austausch
fehlschlägt, oder für jemanden, der ihn nicht will: Unter Einstellungen →
Updates führen „Paket im Ordner zeigen" und „Stattdessen im Browser laden"
dorthin.

Vor dem Update über die Anwendung ein Backup erzeugen. Anschließend das neue
DMG beziehungsweise den neuen NSIS-Installer über die bestehende Installation
installieren und AgenturTool starten. Die Daten unter Electron `userData`
liegen außerhalb des Programms, werden bei der Deinstallation nicht gelöscht
und vor Datenbankmigrationen nochmals automatisch gesichert.
