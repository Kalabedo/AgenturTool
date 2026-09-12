import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Misst, wie viel Fensterhöhe unterhalb eines Elements noch übrig ist.
 *
 * Gedacht für Bereiche, die den Rest des Bildschirms ausfüllen und darin
 * selbst scrollen sollen. Der naheliegende Weg wäre `h-[calc(100vh-14rem)]`
 * gewesen; die 14rem wären aber die addierte Höhe von Kopfzeile,
 * Seitenabstand und Seitenkopf — drei Zahlen, die anderswo stehen und sich
 * dort ändern dürfen, ohne dass hier jemand nachrechnet. Gemessen wird
 * stattdessen die tatsächliche Lage des Elements.
 *
 * @param ref Das Element, dessen Oberkante den Anfang markiert.
 * @param bottomGap Abstand, der unten frei bleiben soll, in Pixeln.
 * @returns Die verbleibende Höhe in Pixeln, oder `undefined`, solange noch
 *   nicht gemessen wurde — dann steht das Element in seiner natürlichen
 *   Höhe, statt beim ersten Bild auf null zusammenzufallen.
 */
export function useRemainingViewportHeight(
  ref: RefObject<HTMLElement>,
  bottomGap = 0,
): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);

  const measure = useCallback(() => {
    const element = ref.current;
    if (element === null) return;
    const top = element.getBoundingClientRect().top;
    setHeight(Math.max(0, window.innerHeight - top - bottomGap));
  }, [ref, bottomGap]);

  useEffect(() => {
    measure();

    window.addEventListener('resize', measure);

    /*
     * Alles über dem Element kann seine Höhe ändern, ohne dass das Fenster
     * sich ändert — die Navigation bricht auf schmalen Bildschirmen um, ein
     * Erklärsatz läuft in eine zweite Zeile. Der Beobachter hängt deshalb am
     * Vorfahren und nicht am Fenster allein.
     */
    const observer = new ResizeObserver(measure);
    const parent = ref.current?.parentElement;
    if (parent !== null && parent !== undefined) observer.observe(parent);
    observer.observe(document.documentElement);

    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [measure, ref]);

  return height;
}
