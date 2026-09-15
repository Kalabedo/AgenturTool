import { describe, expect, it } from 'vitest';
import { backupFilename, type BackupReason } from '@privatura/shared';
import { archivesToRemove, RETENTION } from '../src/backup/retention';

/**
 * Die Aufbewahrung (Abschnitt 17).
 *
 * Ohne Dateisystem: Die Regel ist eine Rechnung auf Kalenderfächern, und
 * genau die soll hier stehen — nicht der Umgang mit Archiven.
 *
 * `minimumKeep: 0` in den Fächer-Tests ist Absicht. Mit der echten
 * Mindestzahl bliebe in kleinen Beispielen ohnehin alles liegen, und der
 * Test prüfte nicht mehr die Regel, sondern nur noch den Rettungsanker.
 */

const JETZT = new Date('2026-09-13T12:00:00Z');
const OHNE_MINDESTZAHL = { ...RETENTION, minimumKeep: 0 };

function archiv(iso: string, reason: BackupReason = 'taeglich'): string {
  return backupFilename(new Date(iso), reason);
}

describe('Aufbewahrung', () => {
  it('behält jede Sicherung der letzten sieben Tage', () => {
    const namen = [
      archiv('2026-09-13T02:00:00Z'),
      archiv('2026-09-12T02:00:00Z'),
      archiv('2026-09-11T02:00:00Z'),
      archiv('2026-09-10T02:00:00Z'),
      archiv('2026-09-09T02:00:00Z'),
      archiv('2026-09-08T02:00:00Z'),
      archiv('2026-09-07T02:00:00Z'),
    ];

    expect(archivesToRemove(namen, JETZT, OHNE_MINDESTZAHL)).toEqual([]);
  });

  it('behält je Woche die älteste Sicherung', () => {
    // Alle drei liegen in der Woche vom 24. bis 30. August, also zwei
    // Wochen vor der Woche, in der „jetzt" liegt.
    const aeltest = archiv('2026-08-24T02:00:00Z');

    const entfernt = archivesToRemove(
      [aeltest, archiv('2026-08-26T02:00:00Z'), archiv('2026-08-28T02:00:00Z')],
      JETZT,
      OHNE_MINDESTZAHL,
    );

    expect(entfernt).toHaveLength(2);
    expect(entfernt).not.toContain(aeltest);
  });

  it('behält je Monat die älteste Sicherung', () => {
    const aeltest = archiv('2026-03-02T02:00:00Z');

    const entfernt = archivesToRemove(
      [aeltest, archiv('2026-03-17T02:00:00Z'), archiv('2026-03-29T02:00:00Z')],
      JETZT,
      OHNE_MINDESTZAHL,
    );

    expect(entfernt).toEqual([archiv('2026-03-29T02:00:00Z'), archiv('2026-03-17T02:00:00Z')]);
  });

  it('entfernt, was älter als zwölf Monate ist', () => {
    const alt = archiv('2025-08-15T02:00:00Z');

    expect(
      archivesToRemove([alt, archiv('2026-09-13T02:00:00Z')], JETZT, OHNE_MINDESTZAHL),
    ).toEqual([alt]);
  });

  it('behält die jüngsten drei, wie alt sie auch sind', () => {
    // Vier Archive aus einer einzigen Woche vor Jahren: Ohne die
    // Mindestzahl bliebe genau eines übrig. Wer die Anwendung zweimal im
    // Jahr öffnet, soll trotzdem mehr als eine Sicherung vorfinden.
    const namen = [
      archiv('2023-01-04T02:00:00Z'),
      archiv('2023-01-03T02:00:00Z'),
      archiv('2023-01-02T02:00:00Z'),
      archiv('2023-01-01T02:00:00Z'),
    ];

    expect(archivesToRemove(namen, JETZT)).toEqual([archiv('2023-01-01T02:00:00Z')]);
  });

  it('entfernt nie die einzige Sicherung', () => {
    expect(archivesToRemove([archiv('2019-04-01T02:00:00Z')], JETZT)).toEqual([]);
  });

  it('lässt ein fremdes Archiv in Ruhe', () => {
    // `data/backups` ist ein Ordner, in den Benutzer selbst etwas legen.
    const fremd = 'urlaubsfotos.zip';
    const namen = [
      fremd,
      'privatura-backup-kaputt.zip',
      archiv('2023-01-04T02:00:00Z'),
      archiv('2023-01-03T02:00:00Z'),
      archiv('2023-01-02T02:00:00Z'),
      archiv('2023-01-01T02:00:00Z'),
    ];

    const entfernt = archivesToRemove(namen, JETZT);

    expect(entfernt).not.toContain(fremd);
    expect(entfernt).not.toContain('privatura-backup-kaputt.zip');
  });

  it('liest auch Namen ohne Anlass — die aus älteren Fassungen', () => {
    const alt = 'privatura-backup-20230101-020000.zip';

    expect(
      archivesToRemove([alt, archiv('2026-09-13T02:00:00Z')], JETZT, OHNE_MINDESTZAHL),
    ).toEqual([alt]);
  });

  it('unterscheidet zwei Sicherungen derselben Sekunde', () => {
    const namen = [
      'privatura-backup-20230101-020000-taeglich.zip',
      'privatura-backup-20230101-020000-taeglich-1.zip',
      'privatura-backup-20230101-020000-taeglich-2.zip',
      'privatura-backup-20230101-020000-taeglich-3.zip',
    ];

    // Die Nummer entscheidet, welche drei die jüngsten sind — nicht die
    // Reihenfolge, in der das Dateisystem seine Einträge ausgibt.
    expect(archivesToRemove([...namen].reverse(), JETZT)).toEqual([
      'privatura-backup-20230101-020000-taeglich.zip',
    ]);
  });

  it('löscht beim zweiten Lauf nichts mehr', () => {
    const namen = [
      archiv('2026-09-13T02:00:00Z'),
      archiv('2026-09-12T02:00:00Z'),
      archiv('2026-08-28T02:00:00Z'),
      archiv('2026-08-26T02:00:00Z'),
      archiv('2026-08-24T02:00:00Z'),
      archiv('2026-03-29T02:00:00Z'),
      archiv('2026-03-02T02:00:00Z'),
      archiv('2024-11-11T02:00:00Z'),
    ];

    const ersterLauf = archivesToRemove(namen, JETZT);
    expect(ersterLauf.length).toBeGreaterThan(0);

    const verbleibend = namen.filter((name) => !ersterLauf.includes(name));
    // Altersfenster statt Kalenderfächer würden hier weiter abtragen: Der
    // zweite Lauf sähe dieselbe Sammlung und käme zu einem anderen Schluss.
    expect(archivesToRemove(verbleibend, JETZT)).toEqual([]);
  });
});
