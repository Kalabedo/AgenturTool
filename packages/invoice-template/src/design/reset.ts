/**
 * Was jedes Design bekommt, ohne es zu wollen.
 *
 * Hier stehen keine Gestaltungsentscheidungen, sondern Notwehr gegen
 * Eigenheiten von Chromiums Druckausgabe. Ein neues Design soll sie durch
 * Bauart erben und nicht durch Disziplin — die Fehler, die daraus
 * entstehen, sieht man erst im fertigen PDF, oft erst auf Seite zwei.
 */

export const RESET_CSS = `
.invoice-root *,
.invoice-root *::before,
.invoice-root *::after {
  box-sizing: border-box;
}

.invoice-root {
  margin: 0;
  padding: 0;
  color: var(--ink);
  font-family: var(--font-family), 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

/* Auf Folgeseiten den Tabellenkopf wiederholen, sonst steht dort eine Zahlenwüste. */
.items thead {
  display: table-header-group;
}

/*
 * Zusammenhängende Blöcke nicht über den Seitenrand zerreißen. Eine
 * Positionszeile, deren Beschreibung auf Seite eins und deren Betrag auf
 * Seite zwei steht, ist schlimmer als eine halbleere Seite eins.
 */
.items tr,
.totals,
.notes,
.doc-footer {
  break-inside: avoid;
  page-break-inside: avoid;
}
`;
