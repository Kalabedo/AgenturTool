import { describe, expect, it } from 'vitest';
import {
  formatDecimalHours,
  formatDuration,
  formatTimeOfDay,
  gridTimes,
  monthRange,
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
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}
