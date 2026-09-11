/**
 * Ein sehr kleiner XML-Schreiber.
 *
 * ## Warum keine Bibliothek
 *
 * Eine E-Rechnung ist kein beliebiges XML. Sie ist ein Dokument mit
 * festgelegter Struktur, festgelegter Reihenfolge und einer Handvoll
 * Datentypen — das, was hier gebraucht wird, passt auf eine Seite.
 *
 * Dagegen stünde eine Abhängigkeit, die in den gepackten Baum wandert.
 * Diese Anwendung ringt bereits mit Prisma und argon2 um die Verpackung
 * (Abschnitt 16a); jede weitere Abhängigkeit im Auslieferungspfad ist ein
 * Risiko, dem hier kein Gewinn gegenübersteht.
 *
 * ## Was er kann und was nicht
 *
 * Er kann Elemente, Attribute, Text und Verschachtelung — und er maskiert
 * korrekt. Er kann **keine** Namensräume auflösen, keine Schemas prüfen und
 * keine Reihenfolge erzwingen. Das Letzte ist die eigentliche Gefahr bei
 * CII: Die Norm schreibt die Reihenfolge der Elemente vor, und ein
 * vertauschtes Paar fällt erst dem Prüfwerkzeug auf. Deshalb steht die
 * Reihenfolge in `cii.ts` als durchgehende Liste an einer Stelle, mit den
 * Feldnummern daneben — und der KoSIT-Validator in der CI ist der Beweis.
 */

/** Ein Knoten, bevor er zu Text wird. */
export interface XmlNode {
  name: string;
  attributes?: Record<string, string | undefined>;
  /** Entweder Text oder Kinder — beides zugleich kommt in CII nicht vor. */
  text?: string;
  children?: readonly (XmlNode | null | undefined)[];
}

/**
 * Maskiert die fünf Zeichen, die in XML eine Bedeutung haben.
 *
 * `&` zuerst, sonst würde die eigene Maskierung der übrigen gleich wieder
 * maskiert werden.
 *
 * Der Rest ist kein Übereifer: Ein Firmenname wie „Müller & Söhne" oder
 * eine Beschreibung mit `<` kommt im Alltag vor, und ohne Maskierung
 * entstünde daraus eine kaputte Datei, die kein Prüfwerkzeug mehr liest.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Entfernt Zeichen, die in XML 1.0 überhaupt nicht vorkommen dürfen.
 *
 * Steuerzeichen lassen sich nicht maskieren — sie sind schlicht unzulässig.
 * In ein Beschreibungsfeld geraten sie durch Einfügen aus einem anderen
 * Programm. Sie hier zu entfernen ist die einzige Rettung, die das Dokument
 * nicht verfälscht.
 */
function stripInvalid(value: string): string {
  // Erlaubt sind laut XML 1.0 nur Tab, Zeilenumbruch und Wagenrücklauf
  // unterhalb von 0x20.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function renderNode(node: XmlNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attributes = Object.entries(node.attributes ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${escapeXml(stripInvalid(value))}"`)
    .join('');

  const children = (node.children ?? []).filter(
    (child): child is XmlNode => child !== null && child !== undefined,
  );

  if (children.length > 0) {
    const inner = children.map((child) => renderNode(child, depth + 1)).join('\n');
    return `${indent}<${node.name}${attributes}>\n${inner}\n${indent}</${node.name}>`;
  }

  if (node.text !== undefined) {
    return `${indent}<${node.name}${attributes}>${escapeXml(stripInvalid(node.text))}</${node.name}>`;
  }

  // Ein leeres Element und kein selbstschließendes: Die Prüfwerkzeuge
  // nehmen beides, aber die Beispieldateien der Norm schreiben es so.
  return `${indent}<${node.name}${attributes}></${node.name}>`;
}

/** Schreibt das Dokument samt Deklaration. */
export function renderXmlDocument(root: XmlNode): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${renderNode(root, 0)}\n`;
}

/**
 * Wirft weg, was nicht da ist.
 *
 * Gebraucht überall dort, wo ein Element zwingend erscheinen muss, seine
 * Kinder aber nicht alle vorhanden sind — eine Anschrift etwa gibt es
 * immer, eine Postleitzahl vielleicht nicht.
 */
export function compact(children: readonly (XmlNode | null | undefined)[]): XmlNode[] {
  return children.filter((child): child is XmlNode => child !== null && child !== undefined);
}

/** Kurzform für ein Element mit Text. */
export function el(
  name: string,
  text: string | null | undefined,
  attributes?: Record<string, string | undefined>,
): XmlNode | null {
  if (text === null || text === undefined || text === '') return null;
  return { name, text, attributes };
}

/** Kurzform für ein Element mit Kindern; leer heißt weglassen. */
export function group(
  name: string,
  children: readonly (XmlNode | null | undefined)[],
  attributes?: Record<string, string | undefined>,
): XmlNode | null {
  const present = children.filter(
    (child): child is XmlNode => child !== null && child !== undefined,
  );
  if (present.length === 0) return null;
  return { name, children: present, attributes };
}
