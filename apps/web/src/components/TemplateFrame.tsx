import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
  documentWidth = 794,
  children,
}: {
  css: string;
  title: string;
  documentWidth?: number;
  children: ReactNode;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(documentWidth);
  const [contentHeight, setContentHeight] = useState(1123);

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

  // Nur verkleinern: Ein hochskaliertes A4-Blatt wird unscharf und gewinnt nichts.
  const scale = Math.min(1, availableWidth / documentWidth);

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm dark:ring-1 dark:ring-white/10"
        style={{ height: contentHeight * scale }}
      >
        <iframe
          ref={frameRef}
          title={title}
          // Das iframe zeigt eigene Inhalte derselben Anwendung; ein Sandbox-
          // Attribut brächte hier nichts, würde aber den Portal-Zugriff auf
          // das Dokument verhindern.
          className="block border-0"
          style={{
            width: documentWidth,
            height: contentHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
      {mountNode !== null && createPortal(children, mountNode)}
    </div>
  );
}
