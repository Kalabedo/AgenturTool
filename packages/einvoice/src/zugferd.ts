import {
  AFRelationship,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';
import {
  SRGB_PROFILE_COMPONENTS,
  SRGB_PROFILE_NAME,
  srgbProfileBytes,
} from './srgb-profile.generated.js';
import { escapeXml } from './xml.js';

/**
 * ZUGFeRD: dieselbe Rechnung als Papier und als Datensatz, in einer Datei.
 *
 * Ein ZUGFeRD-Dokument ist kein eigenes Format, sondern eine Verabredung
 * über drei Dinge, die zusammenkommen müssen:
 *
 * 1. Das PDF ist ein **PDF/A-3** — ein Archivformat, das verspricht, in
 *    zwanzig Jahren noch genauso auszusehen.
 * 2. Darin steckt die **CII-XML-Datei** als Anhang, unter einem
 *    festgelegten Namen und mit der Beziehungsangabe „Alternative": Der
 *    Anhang ist nicht Beiwerk, sondern dasselbe Dokument in anderer Form.
 * 3. Die **XMP-Metadaten** sagen, dass beides der Fall ist — sonst findet
 *    kein Prüfprogramm den Anhang, weil keines ins Blaue hinein sucht.
 *
 * Das XML ist dasselbe, das auch als XRechnung herausgeht: Die Syntax ist
 * bei beiden CII in der Fassung D16B. Unterschiedlich ist nur das Profil
 * (`BT-24`), und genau deshalb steht die Abbildung in diesem Paket und
 * nicht zweimal.
 *
 * ## Warum das hier nachträglich passiert
 *
 * Das PDF entsteht über Chromiums `printToPDF` (D34), und Chromium kennt
 * kein PDF/A. Es fehlen drei Angaben, die sich aber allesamt hinzufügen
 * lassen, ohne die Seiten anzufassen: das Ausgabeprofil, die Metadaten und
 * der Anhang. Das Aussehen des Dokuments bleibt dabei unberührt — es wird
 * nichts neu gezeichnet, nur beschrieben.
 */

/**
 * Der Dateiname des Anhangs.
 *
 * **Nicht frei wählbar.** Factur-X 1.0 und ZUGFeRD ab 2.1 schreiben genau
 * diesen Namen vor; ein Prüfprogramm sucht danach und findet sonst nichts.
 * Dass der deutsche Standard eine französische Datei erwartet, ist kein
 * Versehen, sondern das Ergebnis der Vereinheitlichung beider Standards.
 */
export const ZUGFERD_ATTACHMENT_NAME = 'factur-x.xml';

/** Der Namensraum, unter dem die ZUGFeRD-Angaben in den Metadaten stehen. */
const FACTUR_X_NAMESPACE = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';

/**
 * Die Ausbaustufe, die in den Metadaten steht.
 *
 * ZUGFeRD kennt mehrere, von MINIMUM bis EXTENDED. `EN 16931` ist die, die
 * der EU-Norm entspricht — genau das, was `buildEinvoiceModel` erzeugt.
 */
const ZUGFERD_CONFORMANCE_LEVEL = 'EN 16931';

export interface ZugferdOptions {
  /** Steht als Titel im Dokument, z. B. „Rechnung 2026-001". */
  title: string;
  /** Wer die Rechnung ausstellt. */
  author: string;
  /**
   * Der Zeitpunkt, der in die Metadaten geht.
   *
   * Wird hereingereicht statt hier genommen: Dieselbe Rechnung soll
   * dieselbe Datei ergeben, und ein `new Date()` an dieser Stelle machte
   * jeden Lauf einzigartig — samt der Prüfsumme, mit der die Ablage
   * arbeitet.
   */
  now: Date;
}

/** XMP verlangt Zeitangaben nach ISO 8601 mit Zeitzone. */
function xmpDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Eine Eigenschaft in der Schema-Erklärung.
 *
 * PDF/A lässt keine Metadaten zu, deren Bedeutung nirgends steht: Jede
 * Eigenschaft außerhalb der bekannten Namensräume muss das Dokument selbst
 * erklären. Die vier ZUGFeRD-Angaben sind genau solche, deshalb der Block.
 */
function propertyDeclaration(name: string, description: string): string {
  return `            <rdf:li rdf:parseType="Resource">
              <pdfaProperty:name>${name}</pdfaProperty:name>
              <pdfaProperty:valueType>Text</pdfaProperty:valueType>
              <pdfaProperty:category>external</pdfaProperty:category>
              <pdfaProperty:description>${escapeXml(description)}</pdfaProperty:description>
            </rdf:li>`;
}

function buildXmp(options: ZugferdOptions): string {
  const timestamp = xmpDate(options.now);

  // Das Zeichen in `begin` ist die Byte-Reihenfolge-Marke; XMP schreibt sie
  // vor, damit ein Leser die Kodierung des Pakets erkennt. Als Escape
  // geschrieben, weil sie im Quelltext unsichtbar wäre.
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${escapeXml(options.title)}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>${escapeXml(options.author)}</rdf:li>
        </rdf:Seq>
      </dc:creator>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>AgenturTool</xmp:CreatorTool>
      <xmp:CreateDate>${timestamp}</xmp:CreateDate>
      <xmp:ModifyDate>${timestamp}</xmp:ModifyDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>AgenturTool</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>${FACTUR_X_NAMESPACE}</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
${propertyDeclaration('DocumentFileName', 'Name of the embedded XML invoice file')}
${propertyDeclaration('DocumentType', 'INVOICE')}
${propertyDeclaration('Version', 'The actual version of the standard applying to the embedded XML file')}
${propertyDeclaration('ConformanceLevel', 'The conformance level of the embedded XML file')}
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="${FACTUR_X_NAMESPACE}">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>${ZUGFERD_ATTACHMENT_NAME}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${ZUGFERD_CONFORMANCE_LEVEL}</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Hängt die Metadaten an den Katalog.
 *
 * Als unkomprimierter Rohstrom: PDF/A erlaubt hier keine Filter, weil ein
 * Programm die Metadaten lesen können soll, ohne das PDF zu verstehen.
 */
function setXmpMetadata(pdf: PDFDocument, xmp: string): void {
  const stream = pdf.context.stream(xmp, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(stream));
}

/**
 * Setzt das Ausgabeprofil.
 *
 * Ohne diese Angabe weiß niemand, was ein bestimmtes Rot in dieser Datei
 * bedeuten soll — und ohne sie ist die Datei kein PDF/A. Die Kennung
 * `GTS_PDFA1` trägt eine 1, gilt aber für alle Teile der Norm; sie ist ein
 * Name, keine Versionsnummer.
 */
function setOutputIntent(pdf: PDFDocument): void {
  const profile = srgbProfileBytes();
  const profileStream = PDFRawStream.of(
    pdf.context.obj({ N: SRGB_PROFILE_COMPONENTS, Length: profile.length }),
    profile,
  );
  const profileRef = pdf.context.register(profileStream);

  const outputIntent = pdf.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of(SRGB_PROFILE_NAME),
    Info: PDFString.of(SRGB_PROFILE_NAME),
    DestOutputProfile: profileRef,
  });

  pdf.catalog.set(PDFName.of('OutputIntents'), pdf.context.obj([outputIntent]));
}

/**
 * Gibt dem Dokument eine Kennung.
 *
 * PDF/A verlangt sie, und sie muss über Fassungen hinweg stabil sein.
 * Abgeleitet wird sie deshalb aus Titel und Zeitpunkt statt aus dem Zufall:
 * Dieselbe Rechnung ergibt dieselbe Kennung, und die Ablage kann weiter
 * über Prüfsummen arbeiten.
 */
function setDocumentId(pdf: PDFDocument, options: ZugferdOptions): void {
  let hash = 0x811c9dc5;
  for (const character of `${options.title}|${options.now.toISOString()}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const id = PDFHexString.of(hash.toString(16).padStart(8, '0').repeat(4).toUpperCase());
  pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
}

/**
 * Macht aus einem gewöhnlichen PDF ein ZUGFeRD-Dokument.
 *
 * @param pdfBytes Das gedruckte PDF, wie Chromium es geliefert hat.
 * @param xml Die CII-Rechnung — dieselbe, die auch als XRechnung ausgeht.
 * @returns Ein PDF/A-3 mit eingebettetem XML. Die Seiten sind unverändert.
 */
export async function embedZugferd(
  pdfBytes: Uint8Array,
  xml: string,
  options: ZugferdOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });

  // Der Anhang. pdf-lib trägt ihn selbst in den Namensbaum der eingebetteten
  // Dateien **und** in das `/AF`-Feld des Katalogs ein — Letzteres ist es,
  // was PDF/A-3 von einem gewöhnlichen Anhang unterscheidet.
  await pdf.attach(new TextEncoder().encode(xml), ZUGFERD_ATTACHMENT_NAME, {
    mimeType: 'text/xml',
    description: 'Rechnung als strukturierter Datensatz (CII, EN 16931)',
    creationDate: options.now,
    modificationDate: options.now,
    afRelationship: AFRelationship.Alternative,
  });

  // Die Angaben im Dokumentinfo-Wörterbuch müssen zu den XMP-Metadaten
  // passen; widersprechen sie sich, ist das ein Konformitätsfehler.
  pdf.setTitle(options.title);
  pdf.setAuthor(options.author);
  pdf.setProducer('AgenturTool');
  pdf.setCreator('AgenturTool');
  pdf.setCreationDate(options.now);
  pdf.setModificationDate(options.now);

  setXmpMetadata(pdf, buildXmp(options));
  setOutputIntent(pdf);
  setDocumentId(pdf, options);

  // Ohne Objektströme: PDF/A-1 verbietet sie, und auch wenn PDF/A-3 sie
  // erlaubt, ist die flache Datei die, die sich mit jedem Werkzeug
  // untersuchen lässt — bei einem Beleg, der Jahre überdauern soll, ist das
  // mehr wert als die paar Kilobyte.
  return pdf.save({ useObjectStreams: false });
}
