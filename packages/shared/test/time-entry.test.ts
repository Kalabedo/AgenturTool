import { describe, expect, it } from 'vitest';
import {
  formatDecimalHours,
  formatDuration,
  formatTimeOfDay,
  gridTimes,
  groupTimeEntriesByDay,
  monthRange,
  parseTimeInput,
  parseTimeOfDay,
  snapToGrid,
  summarizeTimeEntries,
  timeEntryInputSchema,
  timeEntryRangeSchema,
  type IsoDate,
  type TimeEntryResponse,
} from '../src/index.js';

function input(overrides: Record<string, unknown> = {}) {
  return timeEntryInputSchema.parse({
    date: '2026-09-07',
    customerId: '3',
    startMinutes: '09:00',
    endMinutes: '12:30',
    breakMinutes: '',
    description: '',
    ...overrides,
  });
}

describe('Uhrzeiten und Raster', () => {
  it('rundet auf die volle Viertelstunde ab', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(14)).toBe(0);
    expect(snapToGrid(15)).toBe(15);
    expect(snapToGrid(29)).toBe(15);
  });

  it('liest und schreibt Uhrzeiten', () => {
    expect(parseTimeOfDay('09:30')).toBe(570);
    expect(parseTimeOfDay('9:30')).toBe(570);
    expect(parseTimeOfDay('24:00')).toBe(1440);
    expect(parseTimeOfDay('24:15')).toBeNull();
    expect(parseTimeOfDay('25:00')).toBeNull();
    expect(parseTimeOfDay('halb zehn')).toBeNull();

    expect(formatTimeOfDay(570)).toBe('09:30');
    expect(formatTimeOfDay(0)).toBe('00:00');
  });

  it('kennt 96 Rasterzeiten, auf Wunsch mit 24:00', () => {
    expect(gridTimes()).toHaveLength(96);
    expect(gridTimes()[0]).toBe('00:00');
    expect(gridTimes().at(-1)).toBe('23:45');
    expect(gridTimes(true).at(-1)).toBe('24:00');
  });

  it('zeigt Dauern als Stunden und als Dezimalzahl', () => {
    expect(formatDuration(135)).toBe('2:15');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDecimalHours(135)).toBe('2,25');
  });
});

describe('Eingabe eines Zeiteintrags', () => {
  /** Der Fall aus der Anforderung: 12:13–14:02 sind zwei Stunden. */
  it('rundet krumme Uhrzeiten auf das Raster ab', () => {
    const entry = input({ startMinutes: '12:13', endMinutes: '14:02' });

    expect(formatTimeOfDay(entry.startMinutes)).toBe('12:00');
    expect(formatTimeOfDay(entry.endMinutes)).toBe('14:00');
    expect(entry.endMinutes - entry.startMinutes).toBe(120);
  });

  it('rundet auch die Pause ab', () => {
    expect(input({ breakMinutes: '20' }).breakMinutes).toBe(15);
    expect(input({ breakMinutes: 0 }).breakMinutes).toBe(0);
    expect(input({ breakMinutes: null }).breakMinutes).toBe(0);
  });

  it('nimmt Minuten auch als Zahl entgegen', () => {
    expect(input({ startMinutes: 545, endMinutes: 600 }).startMinutes).toBe(540);
  });

  it('verlangt einen Kunden', () => {
    expect(timeEntryInputSchema.safeParse({ ...rawInput(), customerId: '' }).success).toBe(false);
  });

  it('weist ein Ende vor dem Beginn zurück', () => {
    const result = timeEntryInputSchema.safeParse({
      ...rawInput(),
      startMinutes: '14:00',
      endMinutes: '09:00',
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['endMinutes']);
  });

  /**
   * Ein Ende, das nach dem Abrunden auf dem Beginn landet: 09:05 bis 09:10
   * wäre sonst eine Spanne von null Minuten.
   */
  it('weist eine Spanne zurück, die durch das Runden verschwindet', () => {
    expect(
      timeEntryInputSchema.safeParse({
        ...rawInput(),
        startMinutes: '09:05',
        endMinutes: '09:10',
      }).success,
    ).toBe(false);
  });

  it('weist eine Pause zurück, die die Spanne aufzehrt', () => {
    const result = timeEntryInputSchema.safeParse({
      ...rawInput(),
      startMinutes: '09:00',
      endMinutes: '10:00',
      breakMinutes: '60',
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['breakMinutes']);
  });

  it('macht aus einer leeren Tätigkeit null', () => {
    expect(input({ description: '   ' }).description).toBeNull();
    expect(input({ description: ' Konzept ' }).description).toBe('Konzept');
  });

  it('begrenzt die Tätigkeit auf eine PDF-taugliche Länge', () => {
    expect(
      timeEntryInputSchema.safeParse({ ...rawInput(), description: 'x'.repeat(501) }).success,
    ).toBe(false);
  });
});

function rawInput(): Record<string, unknown> {
  return {
    date: '2026-09-07',
    customerId: '3',
    startMinutes: '09:00',
    endMinutes: '12:30',
    breakMinutes: '',
    description: '',
  };
}

describe('Zeitraum', () => {
  it('nimmt einen Zeitraum mit gleichem Anfang und Ende an', () => {
    const parsed = timeEntryRangeSchema.parse({ from: '2026-09-01', to: '2026-09-01' });
    expect(parsed.customerId).toBeNull();
  });

  it('weist ein Ende vor dem Beginn zurück', () => {
    expect(timeEntryRangeSchema.safeParse({ from: '2026-09-30', to: '2026-09-01' }).success).toBe(
      false,
    );
  });

  it('liest den Kundenfilter als Zahl', () => {
    expect(
      timeEntryRangeSchema.parse({ from: '2026-09-01', to: '2026-09-30', customerId: '7' })
        .customerId,
    ).toBe(7);
  });

  it('kennt den ersten und letzten Tag eines Monats', () => {
    expect(monthRange('2026-09-17' as IsoDate)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange('2026-02-05' as IsoDate).to).toBe('2026-02-28');
    expect(monthRange('2028-02-05' as IsoDate).to).toBe('2028-02-29');
    expect(monthRange('2026-12-31' as IsoDate).to).toBe('2026-12-31');
  });
});

describe('Zusammenfassung', () => {
  const entries = [
    entry({ customerId: 2, customerName: 'Zeta GmbH', durationMinutes: 90 }),
    entry({ customerId: 1, customerName: 'Alpha AG', durationMinutes: 120 }),
    entry({ customerId: 1, customerName: 'Alpha AG', durationMinutes: 45 }),
  ];

  it('summiert je Kunde und insgesamt', () => {
    const summary = summarizeTimeEntries(entries);

    expect(summary.entryCount).toBe(3);
    expect(summary.durationMinutes).toBe(255);
    expect(summary.byCustomer).toHaveLength(2);
    expect(summary.byCustomer[0]).toEqual({
      customerId: 1,
      customerName: 'Alpha AG',
      entryCount: 2,
      durationMinutes: 165,
    });
  });

  it('sortiert die Kunden nach Namen', () => {
    expect(summarizeTimeEntries(entries).byCustomer.map((c) => c.customerName)).toEqual([
      'Alpha AG',
      'Zeta GmbH',
    ]);
  });

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(summarizeTimeEntries([])).toEqual({
      entryCount: 0,
      durationMinutes: 0,
      byCustomer: [],
    });
  });
});

function entry(overrides: Partial<TimeEntryResponse>): TimeEntryResponse {
  return {
    id: 1,
    date: '2026-09-07',
    customerId: 1,
    customerName: 'Alpha AG',
    startMinutes: 540,
    endMinutes: 660,
    breakMinutes: 0,
    durationMinutes: 120,
    description: null,
    billedAt: null,
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

describe('Getippte Uhrzeiten', () => {
  it('liest eine Zahl als volle Stunde', () => {
    expect(parseTimeInput('9')).toBe(9 * 60);
    expect(parseTimeInput('14')).toBe(14 * 60);
    expect(parseTimeInput('9h')).toBe(9 * 60);
  });

  it('liest die letzten beiden Ziffern als Minuten', () => {
    expect(parseTimeInput('930')).toBe(9 * 60 + 30);
    expect(parseTimeInput('1415')).toBe(14 * 60 + 15);
  });

  it('nimmt Doppelpunkt, Punkt und Komma als denselben Trenner', () => {
    for (const value of ['9:30', '9.30', '9,30']) {
      expect(parseTimeInput(value)).toBe(9 * 60 + 30);
    }
  });

  it('lässt 24:00 zu, aber nichts darüber hinaus', () => {
    expect(parseTimeInput('24')).toBe(1440);
    expect(parseTimeInput('24:00')).toBe(1440);
    expect(parseTimeInput('24:15')).toBeNull();
    expect(parseTimeInput('25')).toBeNull();
  });

  it('rät nicht: Unlesbares bleibt unlesbar', () => {
    for (const value of ['', 'abc', '12345', '9:99', '9:30:15']) {
      expect(parseTimeInput(value)).toBeNull();
    }
  });

  it('rundet nicht selbst — das bleibt beim Schema', () => {
    expect(parseTimeInput('9:07')).toBe(9 * 60 + 7);
  });

  it('nimmt getippte Zeiten auch über das Eingabeschema an', () => {
    const parsed = timeEntryInputSchema.parse({
      date: '2026-09-07',
      customerId: 1,
      startMinutes: '930',
      endMinutes: '1415',
      breakMinutes: '',
      description: '',
    });

    expect(parsed.startMinutes).toBe(9 * 60 + 30);
    expect(parsed.endMinutes).toBe(14 * 60 + 15);
  });
});

describe('Zeitraum als Filter', () => {
  it('kommt ohne Zeitraum aus — der Normalbetrieb fragt nach allem Offenen', () => {
    const query = timeEntryRangeSchema.parse({ billing: 'open' });

    expect(query.from).toBeNull();
    expect(query.to).toBeNull();
    expect(query.billing).toBe('open');
  });

  it('meldet ein Ende vor dem Beginn, wenn beide angegeben sind', () => {
    expect(() => timeEntryRangeSchema.parse({ from: '2026-09-30', to: '2026-09-01' })).toThrow();
  });

  it('zeigt ohne Angabe alles', () => {
    expect(timeEntryRangeSchema.parse({}).billing).toBe('all');
  });
});

describe('Gruppierung nach Tag', () => {
  const entries = [
    entry({ id: 1, date: '2026-09-07', startMinutes: 600, durationMinutes: 60 }),
    entry({ id: 2, date: '2026-09-07', startMinutes: 540, durationMinutes: 120 }),
    entry({ id: 3, date: '2026-09-09', startMinutes: 540, durationMinutes: 45 }),
  ];

  it('fasst einen Tag zusammen und summiert ihn', () => {
    const days = groupTimeEntriesByDay(entries);

    expect(days).toHaveLength(2);
    expect(days[0]?.date).toBe('2026-09-09');
    expect(days[1]?.durationMinutes).toBe(180);
  });

  it('sortiert Tage absteigend, Einträge innerhalb des Tages aufsteigend', () => {
    const days = groupTimeEntriesByDay(entries);

    expect(days.map((day) => day.date)).toEqual(['2026-09-09', '2026-09-07']);
    expect(days[1]?.entries.map((item) => item.id)).toEqual([2, 1]);
  });

  it('sortiert auf Wunsch chronologisch — so liest sich der Nachweis', () => {
    expect(groupTimeEntriesByDay(entries, false).map((day) => day.date)).toEqual([
      '2026-09-07',
      '2026-09-09',
    ]);
  });

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(groupTimeEntriesByDay([])).toEqual([]);
  });
});
