# Produkt-TODO

AgenturTool bleibt auf Solo-Agenturen ausgerichtet. Neue Funktionen sollen
wiederkehrende Verwaltungsarbeit verkürzen, ohne die Anwendung in ein großes
ERP- oder Team-System zu verwandeln. Der Schwerpunkt liegt zunächst auf
Deutschland und anschließend auf einer breiteren Nutzung in der EU.

## Als Nächstes

- [ ] **Vertrieb, Lizenzierung und Updates**
  - Detailkonzept: [`VERTRIEB-UND-UPDATES.md`](VERTRIEB-UND-UPDATES.md).
  - Die Anwendung zunächst über die eigene Website für macOS und Windows
    verkaufen und herunterladen lassen.
  - Einen einfachen, fairen Lizenztyp für Solo-Agenturen festlegen; bevorzugt
    Einmalkauf mit dauerhaft nutzbarer Version statt eines Pflicht-Abos.
  - Kauf, EU-Umsatzsteuer, Rechnungsstellung, Rückerstattungen und Lizenz-
    E-Mails über einen Merchant of Record abwickeln.
  - Eine datensparsame Offline-Lizenz beziehungsweise eine einmalige
    Aktivierung vorsehen; die tägliche Nutzung darf keine Internetverbindung
    voraussetzen.
  - Signierte und notarisierte macOS-DMGs sowie signierte Windows-Installer
    auf einer eigenen Downloadseite anbieten.
  - Später zusätzlich einen Eintrag im Microsoft Store prüfen. Den Mac App
    Store erst nach einer technischen Prüfung der Sandbox-Anforderungen
    verfolgen.
  - Einen sicheren Updatekanal für stabile Releases aufbauen und nur dessen
    feste Domain in der Netzwerk-Erlaubnisliste freigeben.
  - Beim Start höchstens einmal täglich nach einer neuen Version suchen; dabei
    werden keine Kunden-, Rechnungs- oder Nutzungsdaten übertragen.
  - Bei einem verfügbaren Update ein nicht störendes Banner mit Version,
    Kurzbeschreibung, „Was ist neu?“ und „Update laden“ anzeigen.
  - Downloadfortschritt und danach „Neu starten und installieren“ anbieten;
    niemals mitten in der Arbeit automatisch neu starten.
  - Unmittelbar vor der Installation automatisch ein Backup erzeugen.
  - Zusätzlich unter Einstellungen die installierte Version, „Nach Updates
    suchen“ und die Einstellung „Automatisch nach Updates suchen“ anbieten.
  - Signatur, Prüfsumme und Versionsmanifest vor der Installation prüfen und
    Updatefehler verständlich sowie wiederholbar behandeln.

- [ ] **Onboarding für den ersten Start**
  - Geführte Einrichtung für Unternehmensdaten, Steuerangaben,
    Bankverbindung, Standard-Zahlungsziel und Standard-Stundensatz.
  - Auswahl eines passenden Steuerprofils, zum Beispiel Regelbesteuerung,
    Kleinunternehmer oder Reverse Charge.
  - Logo und Rechnungsdarstellung direkt im Ablauf einrichten.
  - Fortschritt anzeigen und späteres Fortsetzen ermöglichen.
  - Am Ende klar zeigen, welche Angaben für PDF und XRechnung noch fehlen.

- [ ] **Neue Rechnung auf Basis einer alten Rechnung**
  - Bei einer bestehenden Rechnung die Aktion „Neue Rechnung auf Basis
    dieser Rechnung“ anbieten.
  - Einen neuen, vollständig bearbeitbaren Entwurf erzeugen; das alte
    Dokument bleibt unverändert.
  - Rechnungs- und Leistungsdatum auf das aktuelle Datum setzen und das
    Fälligkeitsdatum anhand des kundenspezifischen Zahlungsziels neu
    berechnen.
  - Positionen, Beschreibungen und passende Rechnungstexte aus der alten
    Rechnung übernehmen.
  - Aktuelle Kundendaten sowie aktuelle kundenspezifische Vorgaben für
    Steuerprofil, Stundensatz, Zahlungsziel und Sprache verwenden.
  - Vor dem Erstellen verständlich anzeigen, welche alten Inhalte übernommen
    und welche Werte aktualisiert werden.

- [ ] **Projekte**
  - Ein Projekt gehört zu genau einem Kunden und kann aktiv oder archiviert
    sein.
  - Projektname, Beschreibung, interner Status, Zeitraum und optionaler
    Stundensatz beziehungsweise Budget.
  - Zeiteinträge einem Projekt zuordnen.
  - Rechnungen und Zeitnachweise mit einem Projekt verknüpfen.
  - Projektansicht mit offenen und abgerechneten Zeiten, zugehörigen
    Rechnungen, Umsatz und noch nicht abgerechnetem Betrag.
  - Rechnung aus allen offenen Zeiten eines Projekts erstellen.
  - Projektzuordnung optional halten, damit kleine Einzelaufträge weiterhin
    ohne zusätzliche Verwaltung abgerechnet werden können.

- [ ] **Direkter E-Mail-Versand**
  - Rechnungen, XRechnungen und Zeitnachweise direkt aus der Anwendung
    versenden.
  - PDF, XML und Zeitnachweis vor dem Senden als Anhänge auswählen.
  - Betreff und Nachricht aus editierbaren Vorlagen vorbelegen.
  - Empfänger aus dem Kunden übernehmen und vor dem Versand änderbar machen.
  - Versandzeitpunkt, Empfänger und Anhänge im Rechnungsverlauf protokollieren.
  - Wahlweise SMTP oder eine lokal konfigurierte Mail-Anwendung unterstützen;
    Netzwerkzugriff bleibt eine ausdrückliche, optionale Entscheidung.

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

- [ ] **ZUGFeRD-/Factur-X-Hybridrechnungen**
  - Zusätzlich zur vorhandenen XRechnung eine EN-16931-konforme XML-Datei in
    ein PDF/A-3-Dokument einbetten.
  - Dasselbe Rechnungsmodell für XRechnung und ZUGFeRD/Factur-X verwenden,
    damit Beträge und Pflichtangaben nicht auseinanderlaufen.
  - Ausgabeprofil und technische Validierung klar anzeigen.
  - PDF und eingebettete XML gemeinsam unveränderlich archivieren und mit
    Prüfsummen sichern.
  - Die Bezeichnung Factur-X für französischsprachige beziehungsweise
    internationale Nutzung berücksichtigen.

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
