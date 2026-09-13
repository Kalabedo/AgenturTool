# Desktop-Releases

Öffentliche Desktop-Pakete entstehen nur aus einem stabilen SemVer-Tag auf
`main`. Die Anwendung aktualisiert sich nicht selbst — sie meldet nur, dass
es eine neue Fassung gibt (D54). Der Lauf erzeugt neben den Paketen die
Feed-Datei, die eine installierte Anwendung dafür abfragt; ausgeliefert wird
sie über die eigene Website.

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

| Secret                        | Inhalt                                      |
| ----------------------------- | ------------------------------------------- |
| `MAC_CSC_LINK`                | Developer-ID-Application-Zertifikat als P12 |
| `MAC_CSC_KEY_PASSWORD`        | Passwort der P12-Datei                      |
| `APPLE_ID`                    | Apple-ID des Notarisierungszugangs          |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-spezifisches Apple-ID-Passwort          |
| `APPLE_TEAM_ID`               | Apple-Developer-Team-ID                     |
| `WINDOWS_CSC_LINK`            | Code-Signing-Zertifikat als PFX             |
| `WINDOWS_CSC_KEY_PASSWORD`    | Passwort der PFX-Datei                      |

P12 und PFX werden als einzeiliger Base64-Inhalt gespeichert. Beispiele:

```bash
# macOS
base64 -i DeveloperIDApplication.p12 | pbcopy
```

```powershell
# Windows
[Convert]::ToBase64String([IO.File]::ReadAllBytes('CodeSigning.pfx'))
```

Die Workflows reichen nur die für den jeweiligen Runner benötigten Secrets als
`CSC_LINK` und `CSC_KEY_PASSWORD` an electron-builder weiter. Werte gehören
weder in Dateien noch in Workflow-Ausgaben. `pnpm paket --release` nennt bei
einem Fehler ausschließlich die fehlenden Variablennamen.

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
- zweiter Start mit derselben Datenablage samt Rechnung, PDF und Start-Backup;
- keine von der Anwendung ausgehende Netzwerkanfrage.

Eine neue Windows-Signatur kann trotz gültigem Zertifikat anfangs noch keinen
SmartScreen-Ruf besitzen. Der Workflow kann die Authenticode-Gültigkeit
erzwingen, nicht Microsofts externe Reputationsbewertung.

## Manuelles Update

Die laufende Anwendung meldet die neue Fassung von selbst — als Banner und
unter Einstellungen → Updates, mit Größe und Prüfsumme zum Vergleichen.
„Update laden" öffnet das Paket im Browser; installiert wird von Hand.

Vor dem Update über die Anwendung ein Backup erzeugen. Anschließend das neue
DMG beziehungsweise den neuen NSIS-Installer über die bestehende Installation
installieren und AgenturTool starten. Die Daten unter Electron `userData`
liegen außerhalb des Programms, werden bei der Deinstallation nicht gelöscht
und vor Datenbankmigrationen nochmals automatisch gesichert.
