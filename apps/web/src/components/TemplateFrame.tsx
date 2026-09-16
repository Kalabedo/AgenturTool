import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** A4 bei Chromiums CSS-Auflösung von 96 dpi, auf ganze Pixel gerundet. */
export const A4_DOCUMENT_WIDTH_PX = 794;
export const A4_DOCUMENT_HEIGHT_PX = 1123;

/**
 * Rendert Kinder in ein iframe und skaliert es auf die verfügbare Breite.
 *
 * Warum überhaupt ein iframe (D14): Das Template bringt sein eigenes
 * Stylesheet mit, das ein Blatt Papier beschreibt — Millimeter, eigene
 * Schrift, eigene Grundeinstellungen. Im selben Dokument wie die Anwendung
 * kämen sich das und Tailwinds Preflight gegenseitig ins Gehege, und zwar in
 * beide Richtungen. Ein iframe ist ein eigenes Dokument; die Trennung ist
 * damit vollständig und nicht bloß durch Selektoren verabredet.
 *
 * Warum ein Portal statt `srcdoc`: Ein Portal rendert denselben React-Baum
 * weiter, React aktualisiert also nur die geänderten Knoten. Bei `srcdoc`
 * würde das Dokument bei jedem Tastendruck komplett neu aufgebaut — mit
 * Flackern und verlorener Scrollposition.
 */
export function TemplateFrame({
  css,
  title,
  /** Breite des dargestellten Dokuments in CSS-Pixeln (A4 = 794). */
  documentWidth = A4_DOCUMENT_WIDTH_PX,
  /**
   * Feste sichtbare Dokumenthöhe, wenn nicht der ganze Inhalt wachsen soll.
   * Die Vorlagenauswahl zeigt damit jedes Design als gleich großes A4-Blatt;
   * vollständige Vorschauen lassen den Wert weg und wachsen weiterhin mit.
   */
  viewportHeight,
  children,
}: {
  css: string;
  title: string;
  documentWidth?: number;
  viewportHeight?: number;
  children: ReactNode;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(documentWidth);
  const [contentHeight, setContentHeight] = useState(A4_DOCUMENT_HEIGHT_PX);

  /**
   * Das Dokument des iframes vorbereiten.
   *
   * Ein frisch eingehängtes `about:blank`-iframe hat sein Dokument meist
   * schon, aber eben nicht immer. Deshalb beides: sofort versuchen und
   * zusätzlich auf `load` hören.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;

    function attach(): void {
      const doc = frame?.contentDocument;
      if (doc === null || doc === undefined) return;
      doc.head.replaceChildren(doc.createElement('style'));
      const style = doc.head.firstElementChild;
      if (style !== null) style.textContent = css;
      doc.body.style.margin = '0';
      // Gesetzt wird immer außerhalb des iframes. Bei einer vollständigen
      // Vorschau wächst dessen Höhe mit dem Inhalt; bei einer festen
      // A4-Miniatur wird Überstand abgeschnitten. Ein eigener Scrollbalken
      // im Dokument würde in beiden Fällen nur eine zweite Scrollfläche
      // innerhalb der eigentlichen Vorschau erzeugen.
      doc.documentElement.style.overflow = 'hidden';
      doc.body.style.overflow = 'hidden';
      /*
       * Fest weiß, auch im Dunkelmodus: Hier steht kein Stück Oberfläche,
       * sondern ein Blatt Papier. Es soll aussehen wie das, was später aus
       * dem Drucker kommt. Das iframe ist ein eigenes Dokument, an das die
       * Marken der Anwendung ohnehin nicht heranreichen — der dunkle Rahmen
       * ringsum macht aus dem weißen Kasten ein Blatt auf einer Unterlage.
       */
      doc.body.style.background = '#ffffff';
      setMountNode(doc.body);
    }

    attach();
    frame.addEventListener('load', attach);
    return () => frame.removeEventListener('load', attach);
  }, [css]);

  /** Verfügbare Breite beobachten, um den Maßstab zu bestimmen. */
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined && width > 0) setAvailableWidth(width);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /**
   * Inhaltshöhe beobachten.
   *
   * Ohne das bliebe das iframe auf seiner Anfangshöhe stehen und schnitte
   * längere Rechnungen ab — im iframe selbst entstünde eine zweite
   * Bildlaufleiste, die im Vorschaubereich niemand erwartet.
   */
  useEffect(() => {
    if (mountNode === null) return;

    const update = (): void => {
      const height = mountNode.scrollHeight;
      if (height > 0) setContentHeight(height);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(mountNode);
    return () => observer.disconnect();
  }, [mountNode]);

  // Der Rahmen gehört um das Papier, nicht in dessen Maße. Zwei Pixel werden
  // deshalb vor dem Skalieren abgezogen; so passt das Blatt samt 1-px-Rand
  // auch in schmale Auswahlkarten, ohne seitlich abgeschnitten zu werden.
  const borderWidth = 2;
  // Nur verkleinern: Ein hochskaliertes A4-Blatt wird unscharf und gewinnt nichts.
  const scale = Math.min(1, Math.max(0, availableWidth - borderWidth) / documentWidth);
  const renderedWidth = documentWidth * scale;
  const frameHeight = viewportHeight ?? contentHeight;

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="mx-auto box-content overflow-hidden rounded-sm border border-border-strong bg-white shadow-md dark:ring-1 dark:ring-white/10"
        style={{ width: renderedWidth, height: frameHeight * scale }}
      >
        <iframe
          ref={frameRef}
          title={title}
          scrolling="no"
          // Das iframe zeigt eigene Inhalte derselben Anwendung; ein Sandbox-
          // Attribut brächte hier nichts, würde aber den Portal-Zugriff auf
          // das Dokument verhindern.
          className="block border-0"
          style={{
            width: documentWidth,
            height: frameHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
      {mountNode !== null && createPortal(children, mountNode)}
    </div>
  );
}
