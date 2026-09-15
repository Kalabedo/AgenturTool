# Produkt-TODO

AgenturTool bleibt auf Solo-Agenturen ausgerichtet. Neue Funktionen sollen
wiederkehrende Verwaltungsarbeit verkürzen, ohne die Anwendung in ein großes
ERP- oder Team-System zu verwandeln. Der Schwerpunkt liegt zunächst auf
Deutschland und anschließend auf einer breiteren Nutzung in der EU.

## Als Nächstes

- [ ] **Vertrieb, Lizenzierung und Updates**
  - Detailkonzept: [`VERTRIEB-UND-UPDATES.md`](VERTRIEB-UND-UPDATES.md).
  - Die Produktentscheidungen dazu sind als D38 bis D44 beschlossen; offen
    ist ihre technische und geschäftliche Umsetzung.
  - Die Anwendung zunächst über die eigene Website für macOS und Windows
    verkaufen und herunterladen lassen.
  - Einmalkauf mit dauerhaft nutzbarer Version und zwölf Monaten Updates
    anbieten; spätere Updateverlängerung bleibt freiwillig.
  - Kauf, EU-Umsatzsteuer, Rechnungsstellung, Rückerstattungen und Lizenz-
    E-Mails über einen Merchant of Record abwickeln.
  - Eine datensparsame Offline-Lizenz beziehungsweise eine einmalige
    Aktivierung vorsehen; die tägliche Nutzung darf keine Internetverbindung
    voraussetzen.
  - Signierte und notarisierte macOS-DMGs sowie signierte Windows-Installer
    auf einer eigenen Downloadseite anbieten.
  - ✅ Den Windows-Signaturweg entschieden und gebaut: Cloud-HSM bei
    SSL.com (eSigner), signiert über `CodeSignTool` als Haken von
    electron-builder. Eine exportierbare PFX, wie der Releaselauf sie zuvor
    erwartete, gibt keine öffentlich vertraute CA mehr aus; Azure verlangt
    eine geprüfte Organisation, Certum eine interaktive Anmeldung. Die
    Abwägung steht in [`RELEASE.md`](RELEASE.md).
  - Noch zu beschaffen, bevor das erste Windows-Paket entstehen kann: das
    Zertifikat selbst samt eSigner-Zugang und TOTP-Geheimnis. Die Identität
    lässt sich danach nicht mehr wechseln, ohne die SmartScreen-Reputation
    zu verlieren.
  - Später zusätzlich einen Eintrag im Microsoft Store prüfen. Den Mac App
    Store erst nach einer technischen Prüfung der Sandbox-Anforderungen
    verfolgen.
  - ✅ Einen sicheren Updatekanal für stabile Releases aufgebaut: eine
    Feed-Datei auf fester HTTPS-Domain, erzeugt von der Releasepipeline;
    nur diese wenigen Hosts sind im Hauptprozess erlaubt.
  - ✅ Beim Start höchstens einmal täglich nach einer neuen Version suchen;
    übertragen werden nur Version und Betriebssystem.
  - ✅ Bei einem verfügbaren Update ein nicht störendes Banner mit Version,
    Kurzbeschreibung, „Was ist neu?“ und „Update laden“ anzeigen.
  - ✅ Unter Einstellungen → Updates die installierte Version, „Jetzt nach
    Updates suchen“, „Täglich nach Updates suchen“ sowie Größe und
    SHA-256 des Pakets zeigen; derselbe Punkt steht im Menü.
  - ✅ Installation aus der Anwendung heraus: Downloadfortschritt im Banner,
    „Neu starten und installieren“, Backup unmittelbar davor, Prüfung von
    Prüfsumme und Signatur vor dem Austausch, verständliche und
    wiederholbare Fehlermeldungen. Der Weg von Hand bleibt daneben
    bestehen.
  - Noch offen: den Weg mit zwei echten Releases auf macOS ARM64, macOS x64
    und Windows x64 durchspielen (Prüfliste in `RELEASE.md`), ungespeicherte
    Entwürfe vor dem Neustart erkennen statt nur darauf hinzuweisen, und ein
    Rückweg auf die vorige Fassung.

- [x] **Onboarding für den ersten Start**
  - [x] Geführte Einrichtung für Unternehmensdaten, Steuerangaben,
        Bankverbindung, Standard-Zahlungsziel und Standard-Stundensatz — fünf
        Schritte unter `/onboarding`, jeder speichert sofort in die echten
        Stammdaten.
  - [x] Auswahl eines passenden Steuerprofils. Angeboten werden die
        mitgelieferten Profile; das Profil für Kleinunternehmer entsteht erst
        beim Anklicken, weil der Seed es sonst jeder Installation aufdrängte.
  - [x] Logo und Rechnungsdarstellung direkt im Ablauf einrichten — Logo,
        Vorlage, Akzentfarbe und Schrift. Die übrigen Regler bleiben dem
        Designer vorbehalten.
  - [x] Fortschritt anzeigen und späteres Fortsetzen ermöglichen. Der
        Fortschritt wird aus den Daten abgeleitet und nicht mitgeschrieben:
        Ein Schritt, dessen Angabe später wieder gelöscht wird, steht wieder
        offen.
  - [x] Am Ende klar zeigen, welche Angaben für PDF und XRechnung noch
        fehlen — zwei getrennte Listen, weil die erste das Ausstellen
        verhindert und die zweite nur den XML-Export.
  - [x] Überspringbar an jeder Stelle; der Rest steht dann als Liste auf dem
        Dashboard. Von selbst öffnet sich der Ablauf nur bei leerer
        Datenbank und nur einmal je Programmstart.
  - Offen geblieben: Die Einrichtung fragt **keine Kunden** ab. Ein Kunde
    gehört zum ersten Auftrag und nicht zur Einrichtung — und wer beim
    Einrichten einen erfindet, hat später eine Karteileiche.

- [x] **Neue Rechnung auf Basis einer alten Rechnung**
  - [x] Bei einer bestehenden Rechnung die Aktion „Neue Rechnung auf Basis
        dieser Rechnung“ anbieten — in der Vorgang-Karte der Rechnung und als
        Zeilenaktion „Als Vorlage“ in der Rechnungsliste.
  - [x] Einen neuen, vollständig bearbeitbaren Entwurf erzeugen; das alte
        Dokument bleibt unverändert.
  - [x] Rechnungs- und Leistungsdatum auf das aktuelle Datum setzen und das
        Fälligkeitsdatum anhand des kundenspezifischen Zahlungsziels neu
        berechnen.
  - [x] Positionen, Beschreibungen und passende Rechnungstexte aus der alten
        Rechnung übernehmen.
  - [x] Aktuelle Kundendaten sowie aktuelle kundenspezifische Vorgaben für
        Steuerprofil und Zahlungsziel verwenden; abwählbar, weil die
        Korrektur nach einem Storno die Angaben von damals braucht.
  - [x] Vor dem Erstellen verständlich anzeigen, welche alten Inhalte
        übernommen und welche Werte aktualisiert werden.
  - Offen geblieben: die **Sprache** gibt es im Datenmodell noch nicht. Sie
    gehört zum Punkt „Rechnungssprachen Deutsch und Englisch“ weiter unten
    und wird dort nachgezogen, statt hier vorweggenommen zu werden.
    Den **Stundensatz** gibt es inzwischen: `Company.defaultHourlyRateCents`,
    angelegt mit dem Onboarding. Er ist der Vorschlag für den ganzen Betrieb;
    ein Projekt darf ihn später überschreiben.

- [ ] **Projekte**
  - Ein Projekt gehört zu genau einem Kunden und kann aktiv oder archiviert
    sein.
  - Projektname, Beschreibung, interner Status, Zeitraum und optionaler
    Stundensatz beziehungsweise Budget. Der Stundensatz überschreibt dann
    `Company.defaultHourlyRateCents` für die Zeiten dieses Projekts.
  - Zeiteinträge einem Projekt zuordnen.
  - Rechnungen und Zeitnachweise mit einem Projekt verknüpfen.
  - Projektansicht mit offenen und abgerechneten Zeiten, zugehörigen
    Rechnungen, Umsatz und noch nicht abgerechnetem Betrag.
  - Rechnung aus allen offenen Zeiten eines Projekts erstellen.
  - Projektzuordnung optional halten, damit kleine Einzelaufträge weiterhin
    ohne zusätzliche Verwaltung abgerechnet werden können.

- [x] **Direkter E-Mail-Versand**
  - [x] Rechnungen, XRechnungen und Zeitnachweise direkt aus der Anwendung
        versenden — aus der Vorgang-Karte der Rechnung und aus dem Archiv der
        Zeiterfassung.
  - [x] PDF, XML und Zeitnachweis vor dem Senden als Anhänge auswählen; was
        nicht geht, steht mit seinem Grund daneben statt zu fehlen.
  - [x] Betreff und Nachricht aus editierbaren Vorlagen vorbelegen — je eine
        für Rechnung, Storno und Zeitnachweis, mit Platzhaltern, Vorschau und
        Rückweg zum Auslieferungstext.
  - [x] Empfänger aus dem Kunden übernehmen und vor dem Versand änderbar
        machen; Kopie und Blindkopie auf Wunsch.
  - [x] Versandzeitpunkt, Empfänger und Anhänge protokollieren — vollständig
        im Versandprotokoll, als Kurzfassung im Rechnungsverlauf. Ein
        gescheiterter Versuch wird ebenfalls festgehalten.
  - [x] Wahlweise SMTP oder eine lokal konfigurierte Mail-Anwendung; ohne
        Einrichtung baut die Anwendung keine Verbindung nach außen auf.
  - Der Versandvermerk entsteht nur beim SMTP-Versand von selbst. Über die
    Mail-Anwendung weiß die Anwendung nicht, ob die Nachricht abging — dort
    bietet der Dialog den Vermerk als eigenen Klick an (D45, Abschnitt 27).
  - Über die Mail-Anwendung entsteht bei Apple Mail ein echter Entwurf
    (AppleScript), sonst eine `.eml`-Datei mit `X-Unsent`, die Outlook als
    Entwurf öffnet. Beide tragen die Anhänge in sich.
  - Offen geblieben: **Outlook für macOS** bekommt die Nachrichtendatei und
    nicht den AppleScript-Weg. Das neue Outlook für Mac unterstützt die dafür
    nötigen Apple-Events nicht mehr zuverlässig, und `X-Unsent` genügt dort.

- [ ] **CSV- und DATEV-kompatible Exporte**
  - Rechnungen und Stornos für einen frei wählbaren Zeitraum exportieren.
  - Separater, gut lesbarer CSV-Export für eigene Auswertungen.
  - DATEV-kompatibler Buchungsstapel mit konfigurierbaren Erlös- und
    Steuerkonten.
  - Optionales Steuerberater-Paket mit Exportdateien, PDFs und XRechnungen.
  - Vor dem Export Zusammenfassung und Validierungsfehler anzeigen.
  - Export dokumentieren, damit derselbe Zeitraum reproduzierbar erneut
    ausgegeben werden kann.

## Danach

- [ ] **Kleine Statistikseite**
  - Umsatz netto und brutto für Monat, Quartal und Jahr.
  - Offene und überfällige Beträge.
  - Abgerechnete und noch nicht abgerechnete Stunden beziehungsweise Werte.
  - Umsatz nach Kunde und optional nach Projekt.
  - Nur wenige entscheidungsrelevante Kennzahlen; kein komplexes
    Business-Intelligence-Dashboard.

- [ ] **Rechnungssprachen Deutsch und Englisch**
  - Sprache pro Kunde vorbelegen und pro Rechnungsentwurf änderbar machen.
  - Alle sichtbaren Bezeichnungen, Datumsdarstellungen, Zahlungs- und
    Steuerhinweise sowie Standardtexte übersetzen.
  - Eigene Textvorlagen getrennt nach Sprache pflegen.
  - Die gewählte Sprache beim Ausstellen im Rechnungssnapshot einfrieren.
  - Oberfläche zunächst weiterhin auf Deutsch; die Dokumentensprache wird
    davon unabhängig behandelt.

- [x] **ZUGFeRD-/Factur-X-Hybridrechnungen**
  - [x] Zusätzlich zur vorhandenen XRechnung eine EN-16931-konforme XML-Datei
        in ein PDF/A-3-Dokument einbetten. Jedes ausgestellte PDF ist ein
        ZUGFeRD-Dokument; es gibt keinen Schalter und keine zweite Datei.
  - [x] Dasselbe Rechnungsmodell für XRechnung und ZUGFeRD/Factur-X
        verwenden. Unterschiedlich ist genau ein Profil: Die eigenständige
        Datei ist eine XRechnung, der Datensatz im PDF folgt der reinen
        EU-Norm — und verlangt deshalb keine Käuferreferenz, was ZUGFeRD
        für deutlich mehr Kunden möglich macht.
  - [x] Ausgabeprofil und technische Validierung klar anzeigen. Die Rechnung
        sagt, ob ihr PDF den Datensatz trägt; geprüft wird mit veraPDF in
        der CI, wie das XML mit dem KoSIT-Validator.
  - [x] PDF und eingebettete XML gemeinsam unveränderlich archivieren und mit
        Prüfsummen sichern — beides entsteht in derselben Transaktion, und
        das Einbetten ist deterministisch, damit die Prüfsumme trägt.
  - [x] Die Bezeichnung Factur-X berücksichtigen: Der Anhang heißt wie
        vorgeschrieben `factur-x.xml`, und die Metadaten nutzen den
        gemeinsamen Namensraum beider Standards.

## Produktregeln für diese Erweiterungen

- Funktionen müssen für eine einzelne Person ohne Buchhaltungsabteilung
  verständlich bleiben.
- **UX hat Vorrang vor dekorativer UI:** Abläufe müssen schnell,
  selbsterklärend und fehlerarm sein. Die Gestaltung unterstützt diese
  Abläufe, ohne selbst Aufmerksamkeit zu verlangen.
- Die Oberfläche bleibt sehr sauber, ruhig und professionell — nicht
  verspielt. Keine unnötigen Illustrationen, Animationen, Farbverläufe,
  Effekte oder dekorativen Bedienelemente.
- Klare Informationshierarchie, großzügige Abstände, gut lesbare Typografie
  und wenige zurückhaltende Farben verwenden. Farbe kennzeichnet Bedeutung
  wie Status, Warnung oder Hauptaktion und dient nicht als Dekoration.
- Häufige Aufgaben benötigen möglichst wenige Schritte. Sinnvolle Vorgaben,
  kundenspezifische Vorbelegung und direkte nächste Aktionen sind wichtiger
  als zusätzliche Einstellmöglichkeiten.
- Fachbegriffe vermeiden oder direkt erklären. Fehlermeldungen sagen, was
  passiert ist und wie es behoben werden kann.
- Fortschritt, gespeicherter Zustand, offene Änderungen und irreversible
  Aktionen müssen jederzeit eindeutig erkennbar sein.
- Jede neue Funktion muss mit Tastatur funktionieren, auf kleineren Fenstern
  verständlich bleiben und sinnvolle Leer-, Lade- und Fehlerzustände haben.
- Kunden- und Projektvorgaben sollen Eingaben vorbelegen, aber in einem
  Entwurf immer überschreibbar sein.
- Ausgestellte Dokumente und ihre historischen Snapshots bleiben
  unveränderlich.
- Externe Verbindungen wie E-Mail oder spätere Übertragungsdienste sind
  optional und transparent; die lokale Nutzung funktioniert weiterhin ohne
  Cloudkonto.
- Länder- und Steuerregeln werden als konfigurierbare Profile ergänzt, nicht
  als verstreute Sonderfälle im Rechnungseditor.
