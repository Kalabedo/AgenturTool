import type { TemplateDensityValue } from '@privatura/shared';
/**
 * Die Dichte: drei Stufen, ein Multiplikator.
 *
 * Bewusst kein stufenloser Regler. Jede Stufe verändert, wie viele
 * Positionen auf eine Seite passen, und damit den Seitenumbruch. Drei
 * Stufen mal vier Designs sind zwölf Kombinationen — die lassen sich
 * vollständig anschauen und prüfen. Bei einem freien Wert könnte eine
 * einzelne Zeile auf Seite zwei rutschen, ohne dass das je jemand gesehen
 * hätte.
 *
 * Die Designs schreiben ihre Abstände als `calc(3mm * var(--density))`
 * statt als feste Werte; die Stufe wirkt dadurch überall gleichmäßig.
 */

/**
 * Einheitenlos, damit `calc()` den Faktor auf jede Maßangabe anwenden kann.
 *
 * Die Spanne ist absichtlich eng: 0,8 spart auf einer vollen Seite rund
 * zwei Positionen ein, 1,25 kostet etwa ebenso viele. Größere Sprünge
 * lassen die Tabelle entweder gedrängt oder auseinandergerissen wirken.
 */
export const DENSITY_SCALE: Record<TemplateDensityValue, number> = {
  kompakt: 0.8,
  normal: 1,
  luftig: 1.25,
};

/** Unbekannte Stufe (etwa aus einem alten Snapshot) zählt als „normal". */
export function densityScale(value: string): number {
  return DENSITY_SCALE[value as TemplateDensityValue] ?? DENSITY_SCALE.normal;
}
