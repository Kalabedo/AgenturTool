# Vertrieb, Lizenzierung und Updates

## Beschlossene Leitplanken

- **Primärer Verkaufskanal:** eigene Website.
- **Weitere Kanäle:** Microsoft Store und Mac App Store nur optional und
  später, wenn ihr zusätzlicher Nutzen den Pflegeaufwand rechtfertigt.
- **Lizenz:** Einmalkauf mit dauerhaftem Nutzungsrecht für die zuletzt
  berechtigte Version.
- **Updates:** zwölf Monate ab Kauf inklusive; danach kann der Zeitraum
  optional kostenpflichtig verlängert werden. Ohne Verlängerung stellt die
  Anwendung ihre Arbeit nicht ein.
- **Offline-Versprechen:** keine dauernde Verbindung und keine wiederkehrende
  Online-Aktivierung. Neben einer einmaligen Aktivierung muss eine signierte
  Lizenzdatei einen vollständig offline möglichen Weg bieten.
- **Updatearchitektur:** eigener, signierter Updatefeed auf einer festen
  HTTPS-Domain. Die Anwendung prüft und installiert über den
  Electron-Hauptprozess, erzeugt vorher ein Backup und startet nur mit
  Zustimmung des Nutzers neu.
- **Stabile App-Identität:** Produktname `AgenturTool`, App-ID
  `de.agenturtool.app`, bestehende Datenverzeichnisse und dieselben
  Signaturidentitäten ändern sich nach dem öffentlichen Release nicht.
- **Datenschutzgrenze:** Updateprüfung, Lizenzaktivierung und bewusst
  ausgelöster E-Mail-Versand sind technisch getrennte Netzwerkzwecke. Es gibt
  keine Telemetrie; der Updatecheck überträgt keine Kunden-, Rechnungs- oder
  Nutzungsdaten.
- **Preisvalidierung:** Vor dem Bau des vollständigen Verkaufs- und
  Lizenzsystems sowie weiterer großer Module werden Problem, Nutzen und
  Zahlungsbereitschaft mit etwa fünf bis zehn Solo-Agenturen geprüft. Eine
  einfache Landingpage darf Preisvarianten testen.

Diese Entscheidungen sind als D38 bis D44 in der verbindlichen Architektur
festgehalten.

## Vertriebskonzept

AgenturTool startet mit der eigenen Website als primärem Verkaufskanal. Die
Website verkauft eine Lizenz und bietet die vorhandenen signierten Installer
für macOS und Windows an. Die Anwendung bleibt lokal und eigenständig; nur
Lizenzaktivierung, manuelle E-Mail-Funktionen und die Updateprüfung benötigen
optionalen Netzwerkzugriff.

Ein Store kann später als zusätzlicher Vertrauens- und Auffindbarkeitskanal
dazukommen. Er sollte nicht die technische oder wirtschaftliche Grundlage des
Produkts sein.

## Warum die Website zuerst sinnvoll ist

- Dieselben DMG- und NSIS-Artefakte können weiterverwendet werden.
- Preis, Rabatte, Testversionen, Lizenzen und Kundenbeziehung bleiben unter
  eigener Kontrolle.
- Updates können zeitnah veröffentlicht werden, ohne auf eine Store-Prüfung zu
  warten.
- macOS- und Windows-Kunden erhalten dasselbe Lizenzmodell.
- Der aktuelle lokale Aufbau mit eingebettetem Server, SQLite, Prisma und
  nativen Modulen muss nicht für die Mac-App-Store-Sandbox umgebaut werden.
- Eine eigene Website erklärt den Nutzen für Solo-Agenturen besser als eine
  kurze Store-Seite.

Der zusätzliche Aufwand liegt bei Checkout, EU-Umsatzsteuer, Lizenzvergabe,
Downloads und Rückerstattungen. Dafür empfiehlt sich zum Start ein
**Merchant of Record** statt einer selbst gebauten Zahlungs- und
Steuerlösung. Dieser verkauft die Software rechtlich an den Endkunden und
übernimmt typischerweise Zahlungsabwicklung, Umsatzsteuer und Belege.

## Preismodell und noch offene Preisfrage

Für eine lokale Solo-Agentur-Anwendung passt ein Einmalkauf besser als ein
erzwungenes monatliches Abo:

- einmaliger Kaufpreis für eine dauerhaft nutzbare Version;
- Updates für einen klar genannten Zeitraum, zum Beispiel zwölf Monate,
  inklusive;
- danach optional günstige Verlängerung des Updatezeitraums;
- die zuletzt berechtigte Version funktioniert auch ohne Verlängerung weiter;
- größere spätere Versionen können als bezahltes Upgrade angeboten werden.

Die Struktur ist entschieden, der Betrag noch nicht. Ein möglicher Startpunkt
zur Validierung wäre **49–79 EUR inklusive Umsatzsteuer** mit zwölf Monaten
Updates. Der endgültige Preis wird nach Gesprächen mit ersten Solo-Agenturen
festgelegt.

## Verkauf und Download über die Website

1. Der Besucher wählt macOS oder Windows und kauft AgenturTool.
2. Der Zahlungsanbieter berechnet den korrekten Endpreis und stellt den
   Kaufbeleg aus.
3. Der Käufer erhält per E-Mail einen Lizenzschlüssel und einen persönlichen
   Downloadlink.
4. Die Anwendung akzeptiert den Schlüssel einmalig oder importiert eine
   signierte Lizenzdatei.
5. Anschließend läuft sie ohne dauerhafte Anmeldung und ohne permanente
   Internetverbindung.

Die Installationsdateien dürfen entweder nur über kurzlebige, signierte Links
erreichbar sein oder frei ausgeliefert werden, während die Nutzung durch die
Lizenz geregelt wird. Ein bloß schwer zu erratender Downloadlink ist kein
Lizenzschutz.

## Store-Optionen

### Microsoft Store

Der Microsoft Store ist als zweiter Kanal vergleichsweise passend:

- vorhandene EXE- oder MSI-Installer können grundsätzlich gelistet werden;
- eine Store-Seite schafft Vertrauen und erleichtert das Finden der App;
- bei nicht spielbezogenen Apps kann eine eigene Zahlungsplattform verwendet
  werden;
- ein als EXE/MSI gelistetes Programm kann weiterhin seinen eigenen
  In-App-Updater verwenden.

Damit kann zunächst dieselbe Windows-Anwendung auf Website und Store angeboten
werden. Vor Veröffentlichung müssen Lizenzfluss, Store-Richtlinien und das
Verhalten bei einem Store-Download separat getestet werden.

### Mac App Store

Der Mac App Store ist vorerst nachrangig:

- Store-Apps müssen die App Sandbox verwenden;
- die aktuelle Anwendung ist als Developer-ID-DMG für den direkten Vertrieb
  gebaut und nutzt keine App Sandbox;
- Store-Käufe und Store-Updates erfordern einen eigenen Vertriebs- und
  Berechtigungspfad;
- eine Store-Variante erhöht Test-, Signatur- und Releaseaufwand deutlich.

Die direkte macOS-Version ist bereits der richtige technische Ausgangspunkt:
Developer-ID-Signatur, Hardened Runtime und Notarisierung sind in der
Release-Pipeline vorgesehen.

## Update-Erlebnis in der Anwendung

> **Stand der Umsetzung:** Gebaut ist die Meldung, nicht der Updater (D54,
> Architektur Abschnitt 28). Die Anwendung prüft höchstens einmal in 24
> Stunden, zeigt ein Banner und öffnet das Paket auf Klick im Browser;
> geladen und installiert wird von Hand. Die Zustände „Download läuft" und
> „Update bereit" unten beschreiben weiterhin das Ziel, sobald es einen
> selbstinstallierenden Updater gibt — der braucht Backup vor der
> Installation, Migrationslauf und Rückweg und ist deshalb ein eigenes
> Vorhaben.

### Zustände

1. **Keine neue Version:** keine Meldung.
2. **Update verfügbar:** dezentes Banner am oberen Rand.
3. **Download läuft:** Fortschritt im Banner, Arbeit bleibt möglich.
4. **Update bereit:** „Neu starten und installieren“ sowie „Später“.
5. **Fehler:** im Banner erneut versuchen; Details zusätzlich in den
   Einstellungen, ohne die eigentliche Arbeit zu blockieren.

Beispiel für das erste Banner:

> AgenturTool 1.4 ist verfügbar · Verbesserte Exporte und Fehlerkorrekturen  
> Was ist neu? · Update laden · Später

Nach dem Download:

> AgenturTool 1.4 ist bereit. Vor der Installation wird automatisch ein
> Backup erstellt.  
> Neu starten und installieren · Später

### Verhalten

- Frühestens einige Sekunden nach dem Start prüfen, damit die Anwendung
  sofort benutzbar ist.
- Höchstens einmal in 24 Stunden automatisch prüfen.
- Zusätzlich einen manuellen Menüpunkt „Nach Updates suchen“ anbieten.
- Updates nur nach ausdrücklichem Klick herunterladen, solange diese
  Einstellung nicht bewusst geändert wurde.
- Niemals automatisch während einer offenen Bearbeitung neu starten.
- Vor dem Neustart auf ungespeicherte Rechnungsentwürfe hinweisen.
- Vor jeder Installation ein lokales Backup anlegen.
- Sicherheitsrelevante Updates deutlicher kennzeichnen, aber nicht heimlich
  installieren.

## Technischer Updatekanal

Die Release-Pipeline erzeugt neben den signierten Paketen die Feed-Datei und
legt sie dem Release bei (`apps/desktop/scripts/updatefeed.mjs`). Auf die
Website kommt sie zuletzt und erst, wenn die Pakete dort schon liegen; der
Ablauf steht in [`RELEASE.md`](RELEASE.md). Der stabile Kanal liegt unter
der eigenen Domain:

```text
https://updates.agenturtool.de/stable/updates.json
https://updates.agenturtool.de/stable/AgenturTool-<Version>-<arch>.<ext>
```

Der Updatefeed enthält nur:

- aktuelle Version und Veröffentlichungsdatum;
- minimale unterstützte Version;
- Downloadadresse, Dateigröße und SHA-256-Prüfsumme;
- kurze Versionshinweise;
- signierte Installer und die vom Updater benötigten Metadaten.

Für die vorhandenen Electron-Builder-Ziele bietet sich `electron-updater` an:

- macOS benötigt neben dem DMG das für den Updater vorgesehene ZIP-Artefakt;
- Windows kann den vorhandenen NSIS-Installer aktualisieren;
- alle Releaseartefakte bleiben plattformspezifisch signiert;
- das Update wird erst nach erfolgreicher Prüfung und Nutzerbestätigung
  installiert.

## Datenschutz und Netzwerkgrenze

Die Anwendung blockiert derzeit absichtlich jede Verbindung außerhalb der
lokalen Rückschleife. Diese Zusicherung soll nicht pauschal aufgegeben werden.
Stattdessen werden wenige Zwecke getrennt und sichtbar freigeschaltet:

- Updateprüfung nur zur fest hinterlegten Update-Domain;
- Lizenzaktivierung nur zur fest hinterlegten Lizenz-Domain;
- E-Mail-Versand nur zu dem vom Nutzer konfigurierten Anbieter;
- keine Telemetrie und keine Übertragung von Kunden- oder Rechnungsdaten beim
  Updatecheck.

Die Updateprüfung sollte vom Electron-Hauptprozess ausgehen, nicht aus der
Weboberfläche. Die Weboberfläche erhält ausschließlich den Status über eine
schmale, typisierte Brücke. Externe Inhalte werden nie im App-Fenster geladen.

## Umsetzungsetappen

- [ ] Vertriebsmodell und Preis mit ersten Kunden validieren.
- [ ] Merchant of Record und Lizenzmodell auswählen.
- [ ] Produkt-, Datenschutz-, Widerrufs- und Supportseiten erstellen.
- [ ] Lizenzformat und Offline-Verhalten definieren.
- [x] Updatefeed aufbauen; ein Testkanal lässt sich über
      `AGENTUR_TOOL_UPDATE_FEED` gegen dieselbe Anwendung prüfen.
- [x] Releasepipeline erzeugt die Feed-Datei aus den fertigen Paketen.
- [ ] Releasepipeline um Updater-Artefakte (macOS-ZIP) und atomare
      Veröffentlichung erweitern — erst nötig, wenn installiert statt nur
      gemeldet wird.
- [x] Electron-Hauptprozess um die Updateprüfung ergänzen.
- [ ] Installation aus der Anwendung heraus, mit Backup davor und
      Wiederanlauf nach der Migration.
- [x] Updatezustand über die vorhandene API-Brücke an React geben — ein
      Preload-Skript gibt es nicht, das Fenster spricht ohnehin HTTP mit dem
      eigenen Server.
- [x] Banner und Einstellungsseite bauen.
- [ ] Schutz vor ungespeicherten Änderungen — nötig, sobald die Anwendung
      für eine Installation selbst neu startet.
- [ ] Backup vor Update und Wiederanlauf nach Migration testen.
- [ ] Vollständigen Updatepfad auf macOS ARM64, macOS x64 und Windows x64
      testen.
- [ ] Website-Verkauf veröffentlichen.
- [ ] Microsoft-Store-Listing als zweiten Kanal evaluieren.
- [ ] Mac-App-Store-Prototyp nur bei erkennbarem Kundennutzen untersuchen.

## Quellen und aktuelle Rahmenbedingungen

- [Apple: Developer-ID-Zertifikat für Vertrieb außerhalb des Mac App Store](https://developer.apple.com/help/glossary/developer-id-certificate/)
- [Apple: Signieren für direkten Vertrieb oder Mac App Store](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)
- [Apple: App Sandbox ist für den Mac App Store erforderlich](https://developer.apple.com/documentation/Xcode/preparing-your-app-for-distribution)
- [Apple: Developer Program kostet 99 USD pro Jahr](https://developer.apple.com/support/compare-memberships/)
- [Microsoft: kostenlose Registrierung für individuelle Entwickler](https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer)
- [Microsoft: bestehende EXE/MSI-Anwendungen im Store aktualisieren](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/publish-update-to-your-app-on-store)
- [Microsoft: Store-Einstieg, Gebühren und Commerce-Optionen](https://learn.microsoft.com/en-us/windows/apps/publish/faq/get-started-with-the-microsoft-store)
- [Electron Builder: unterstützte Ziele und Auto-Update](https://www.electron.build/targets)
- [Electron Builder: Windows-Code-Signierung](https://www.electron.build/docs/features/code-signing/code-signing-win/)
- [Paddle: Merchant-of-Record-Modell](https://developer.paddle.com/concepts/sell/supported-countries-locales/)
