# Produkt-TODO

Privatura bleibt auf Solo-Agenturen ausgerichtet. Neue Funktionen sollen
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
  - Offen und vor 1.0 zu entscheiden: der Windows-Signaturweg. Eine
    exportierbare PFX, wie sie der Releaselauf heute erwartet, gibt keine
    öffentlich vertraute CA mehr aus. Wege und Folgen stehen in
    [`RELEASE.md`](RELEASE.md); die Identität lässt sich nach dem ersten
    öffentlichen Release nicht mehr wechseln, ohne die SmartScreen-Reputation
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

- [ ] **E-Rechnungen empfangen und lesen**
  - Seit dem 1. Januar 2025 muss jedes deutsche Unternehmen E-Rechnungen
    **annehmen** können. Privatura kann heute nur senden; damit fehlt die
    Hälfte der Pflicht, und zwar die, die bereits gilt.
  - XRechnung und ZUGFeRD/Factur-X einlesen — die eigenständige XML-Datei
    ebenso wie den Datensatz, der in einem fremden PDF steckt.
  - Den Datensatz menschenlesbar anzeigen: Absender, Nummer, Datum,
    Positionen, Steueraufteilung, Summen, Bankverbindung. Ein Empfänger
    will die Rechnung sehen, nicht ihr XML.
  - Eingegangene Belege mit Prüfsumme unverändert ablegen, so wie die
    eigenen ausgestellten Dokumente. Die Originaldatei bleibt das
    Original; Privatura erzeugt daraus keine neue Wahrheit.
  - Widersprüche zwischen sichtbarem PDF und eingebettetem XML benennen,
    statt stillschweigend einer Seite zu glauben.
  - Der Lesepfad ist größtenteils vorhanden: `packages/einvoice` kennt
    CII, die Profile und die Codelisten. Was fehlt, ist die Richtung —
    aus XML ein Modell statt aus einem Modell XML.
  - Die Grenze ist ausdrücklich das Lesen und Ablegen. Eine eingegangene
    Rechnung wird angenommen, angezeigt und aufbewahrt — sie wird nicht
    verbucht, nicht mit Vorsteuer versehen und nicht ausgewertet. Das
    bliebe Buchhaltung, und Privatura bleibt Rechnung und Zeiterfassung.

- [ ] **Kleinunternehmer-Grenzen im Blick behalten**
  - Seit 2025 gelten 25.000 € für das Vorjahr und 100.000 € für das
    laufende Jahr. Entscheidend ist die zweite Zahl: Wird sie überschritten,
    endet die Kleinunternehmerregelung **sofort im laufenden Jahr** — die
    nächste Rechnung trägt Umsatzsteuer, nicht erst die im Januar.
  - Laufenden Jahresumsatz aus den ausgestellten Rechnungen ermitteln und
    dem Grenzwert gegenüberstellen, solange das Steuerprofil
    `SMALL_BUSINESS` aktiv ist.
  - Rechtzeitig warnen, nicht erst beim Überschreiten: ein ruhiger
    Hinweis auf dem Dashboard ab einem gut sichtbaren Anteil der Grenze.
  - Beim Ausstellen einer Rechnung, die die Grenze reißen würde, vorher
    darauf hinweisen — danach ist es zu spät.
  - Den Wechsel des Steuerprofils erklären, nicht selbst vollziehen. Ob
    und wann gewechselt wird, entscheidet der Steuerberater.
  - Die Grenzwerte gehören in die Konfiguration, nicht in den Code —
    dieselbe Regel wie bei den Steuerprofilen.

- [ ] **Timer in der Zeiterfassung**
  - Auf dem Dashboard eine laufende Uhr starten und stoppen, statt Beginn
    und Ende hinterher einzutippen. Die Zeiterfassung ist die Stelle, an
    der täglich Reibung entsteht.
  - Beim Start ein kleiner Dialog mit genau einer Frage: für welchen
    Kunden? Zuletzt benutzte Kunden oben, Tastatur genügt.
  - Beim Beenden direkt die zweite Frage: was wurde gemacht? Der Text
    landet in der Beschreibung des Eintrags. Beides zusammen ist der
    ganze Ablauf — kein dritter Schritt.
  - Der laufende Timer bleibt sichtbar, solange er läuft, und übersteht
    einen Neustart der Anwendung. Eine vergessene Uhr, die über Nacht
    weiterläuft, wird beim nächsten Start angesprochen, statt einen
    Vierzehn-Stunden-Eintrag zu erzeugen.
  - Aus der gestoppten Uhr entsteht ein gewöhnlicher Eintrag der
    Zeiterfassung — dieselben offenen Zeiten, dasselbe Abrechnen,
    derselbe Zeitnachweis.
  - Zu klären: Die erfassten Minuten sind per CHECK auf Viertelstunden
    festgenagelt. Eine echte Uhr liefert 37 Minuten. Entweder rundet der
    Timer beim Beenden auf die nächste Viertelstunde — sichtbar, nicht
    heimlich —, oder das Datenmodell lernt genaue Minuten und rundet erst
    beim Abrechnen. Die zweite Fassung ist ehrlicher und die größere
    Änderung.

- [ ] **Kundenimport**
  - Kunden aus einer CSV-Datei übernehmen, statt sie beim Umstieg von
    Hand abzutippen. Wer fünfzig Kunden hat, entscheidet daran, ob der
    Umstieg überhaupt stattfindet.
  - Spalten der Datei den Feldern zuordnen, statt ein festes Format zu
    verlangen. Jede Vorgängeranwendung exportiert anders.
  - Vor dem Übernehmen zeigen, was entstehen wird: wie viele Kunden neu
    sind, welche Zeilen unvollständig sind und welche auf einen
    bestehenden Kunden passen.
  - Doppelte erkennen — über Kundennummer, sonst über Name und Anschrift —
    und die Wahl lassen zwischen Überspringen und Aktualisieren.
  - Fehlerhafte Zeilen benennen und den Rest trotzdem übernehmen; ein
    Import, der an einer Zeile ganz scheitert, ist kein Import.
  - Der Weg zurück gehört dazu: Kunden auch als CSV ausgeben. Die Daten
    gehören dem Benutzer, und das soll man merken.

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

- [ ] **Steuertermine und Vorauszahlungen auf dem Dashboard**
  - Eine Erinnerung, keine Steuererklärung: Privatura meldet den nächsten
    Termin und die ungefähre Summe. Übermittelt wird nichts — kein
    ELSTER, kein ERiC, keine Schnittstelle zum Finanzamt.
  - Fälligkeitstermine der Umsatzsteuer-Voranmeldung anzeigen, je nach
    eingestelltem Rhythmus monatlich oder vierteljährlich, samt
    Dauerfristverlängerung.
  - Die vereinnahmte Umsatzsteuer des Zeitraums aus den ausgestellten
    Rechnungen überschlagen. Die Vorsteuer kennt Privatura nicht und wird
    sie auch nicht kennen — die Zahl sagt deshalb von sich aus, dass sie
    nur die Ausgangsseite ist und die tatsächliche Zahllast niedriger
    ausfällt. Eine Erinnerung an den Termin, keine Berechnung der
    Voranmeldung.
  - Termine der Einkommensteuer-Vorauszahlung (10. März, Juni, September,
    Dezember) mit dem hinterlegten Bescheidbetrag erinnern. Die Höhe gibt
    der Benutzer ein; sie steht in seinem Bescheid und lässt sich nicht
    errechnen.
  - Ein ruhiger Hinweis mit Vorlauf, keine roten Zähler. Der Termin ist
    erledigt, wenn der Benutzer ihn abhakt.
  - Zu klären: die Ist-Versteuerung nach § 20 UStG. Die meisten
    Solo-Selbstständigen versteuern nach vereinnahmten Entgelten, die
    Auswertungen rechnen heute implizit nach Soll. Ohne diese
    Unterscheidung nennt die Vorschau den falschen Zeitraum.

- [ ] **Zusammenfassende Meldung (ZM)**
  - Reverse Charge gibt es bereits als Steuerprofil. Wer es benutzt, ist
    zur Zusammenfassenden Meldung verpflichtet — sie fehlt vollständig.
  - Für ein Quartal je EU-Kunde die USt-IdNr. und die Summe der
    steuerfreien Leistungen auflisten, getrennt nach sonstiger Leistung
    und Lieferung.
  - Rechnungen ohne oder mit unplausibler USt-IdNr. vor der Meldung
    benennen, statt sie stillschweigend wegzulassen.
  - Als Auswertung zum Abtippen beziehungsweise als Datei für die
    Kanzlei. Eine Übermittlung an das Bundeszentralamt findet nicht
    statt — aus demselben Grund wie bei Peppol.
  - Den Fristenlauf (25. Tag nach Quartalsende) beim Punkt oben mit
    anzeigen.

- [ ] **Qualifizierte Bestätigungsabfrage der USt-IdNr. beim BZSt**
  - Heute prüft `isPlausibleVatId` nur das Format. Bei Reverse Charge
    haftet der Rechnungssteller für die Steuer, wenn die Nummer des
    Kunden nicht gültig war — die qualifizierte Abfrage ist der Nachweis,
    dass man sie geprüft hat.
  - **Zur Frage, ob das zur lokalen Anwendung passt: ja, nach demselben
    Muster wie bisher.** Die Abfrage geht vom Hauptprozess aus an genau
    einen festen Host des Bundeszentralamts, nur auf ausdrücklichen
    Klick, nie von selbst und nie im Hintergrund. Das ist derselbe Weg,
    den der Updatefeed und der SMTP-Versand schon gehen (D45): Eine
    Verbindung, die es ohne Zutun des Benutzers gar nicht gibt, ist keine
    Cloudanbindung.
  - Übertragen wird, was die Abfrage braucht: die eigene und die fremde
    USt-IdNr. sowie Name und Anschrift des Kunden. Der Dialog sagt das
    vorher, statt es hinterher im Protokoll zu vermerken.
  - Das amtliche Ergebnis samt Datum und Abfrageergebnis-Nummer beim
    Kunden ablegen — das ist der eigentliche Zweck. Ein Nachweis, der
    nicht aufbewahrt wird, ist keiner.
  - Ohne Netz oder bei abgeschalteter Abfrage bleibt alles wie heute: Die
    Rechnung entsteht, die Plausibilitätsprüfung greift, und der fehlende
    Nachweis steht als Hinweis daneben. Die Funktion darf nie zur
    Voraussetzung für das Ausstellen werden.
  - Abschaltbar wie die Updateprüfung, mit demselben Versprechen: kein
    Haken, keine Verbindung.

- [ ] **Historische Stundensätze**
  - `Company.defaultHourlyRateCents` ist heute ein einzelner Wert. Wer
    ihn erhöht, bewertet damit auch alle noch nicht abgerechneten Zeiten
    der Vergangenheit neu — lautlos.
  - Einen Stundensatz mit Gültigkeitsdatum führen, statt ihn zu
    überschreiben. Eine erfasste Stunde wird mit dem Satz bewertet, der
    an ihrem Tag galt.
  - Dieselbe Regel für kunden- und projektbezogene Sätze, sobald es
    Projekte gibt: Der spezifischere Satz gewinnt, der historische Stand
    bleibt.
  - Beim Abrechnen zeigen, welcher Satz je Zeitraum angesetzt wurde,
    wenn es mehr als einer ist — und ihn im Entwurf überschreibbar
    halten.
  - Der Satzwechsel ist ein eigener Vorgang mit Datum, kein Feld, das man
    nebenbei ändert. Das ist derselbe Gedanke wie beim eingefrorenen
    Rechnungsdokument.

- [ ] **Verschlüsselung der Datenbank**
  - `db.sqlite` liegt heute im Klartext im Benutzerordner. Darin stehen
    sämtliche Kundendaten — auf einem Notebook, das verloren gehen kann.
  - Die Datenbank im Ruhezustand verschlüsseln, mit einem Schlüssel im
    Schlüsselbund des Betriebssystems. Das Vorbild steht schon im Haus:
    `mail/secret-store.ts` macht genau das für das SMTP-Passwort.
  - Die Sicherungen gehören dazu. Ein verschlüsseltes `db.sqlite` in
    einem offenen ZIP-Archiv wäre die Verschlüsselung, die genau die
    Datei ungeschützt lässt, die man aus dem Haus trägt.
  - Der wunde Punkt ist die Wiederherstellung. Liegt der Schlüssel nur im
    Schlüsselbund, ist ein Backup auf einem neuen Rechner unlesbar — und
    zwar vollständig, nicht bloß ein Passwortfeld wie heute beim SMTP.
    Es braucht deshalb ein vom Benutzer gewähltes Kennwort oder einen
    ausdruckbaren Wiederherstellungsschlüssel, bevor die erste
    verschlüsselte Sicherung entsteht.
  - Technisch zu prüfen: Prisma spricht mit dem gewöhnlichen
    SQLite-Treiber, und SQLCipher ist keine Einstellung, sondern ein
    anderes Binärpaket. Der zweite Weg — die Verschlüsselung des
    Betriebssystems (FileVault, BitLocker) prüfen und beim ersten Start
    dazu raten — kostet nichts und deckt den häufigsten Fall ab.
  - Vorher zu entscheiden: welchen Angriff das abwehren soll. Gegen das
    verlorene Notebook hilft die Dateisystemverschlüsselung; eine
    verschlüsselte Datenbank hilft zusätzlich gegen alles, was Zugriff
    auf den laufenden Benutzerordner hat. Der Preis ist der Schlüssel,
    den man verlieren kann.

## Produktregeln für diese Erweiterungen

- Funktionen müssen für eine einzelne Person ohne Buchhaltungsabteilung
  verständlich bleiben.
- **Privatura ist Rechnungsstellung und Zeiterfassung und bleibt es.** Keine
  Ausgaben, keine Belegerfassung, keine Vorsteuer, keine EÜR, keine
  Buchhaltung. Auswertungen und Erinnerungen dürfen die Ausgangsseite
  zusammenfassen; sobald eine Funktion die Eingangsseite erfassen müsste,
  gehört sie nicht hierher, sondern zum Steuerberater oder in ein zweites
  Werkzeug. Was trotzdem hereingehört, ist die gesetzliche Pflicht,
  eingehende E-Rechnungen annehmen und lesen zu können — Annehmen ist
  nicht Verbuchen.
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
