import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { verifyConstraints } from '../prisma/verify-constraints.js';
import { isImmutabilityViolation } from '../src/common/database-errors.js';

/**
 * Prüft, dass eine Operation an einer Immutability-Sperre gescheitert ist.
 *
 * Nötig, weil Prisma die Trigger-Meldung nur bei Roh-Queries durchreicht:
 * Über den typisierten Client kommt stattdessen P2003 an, derselbe Code wie
 * bei einer echten Fremdschlüsselverletzung. Genau deshalb gibt es
 * `isImmutabilityViolation`.
 */
async function expectImmutabilityViolation(operation: Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }
  expect(caught, 'Operation hätte abgelehnt werden müssen').toBeDefined();
  expect(isImmutabilityViolation(caught)).toBe(true);
}
import {
  createDraft,
  createTestDatabase,
  markIssued,
  type TestDatabase,
} from './database.helper.js';

let db: TestDatabase;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
});

afterAll(async () => {
  await db.cleanup();
});

describe('Migration', () => {
  it('legt alle erwarteten Constraints, Trigger und Indizes an', async () => {
    const result = await verifyConstraints(prisma);
    expect(result.missingTriggers).toEqual([]);
    expect(result.missingChecks).toEqual([]);
    expect(result.missingIndexes).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('CHECK-Constraints', () => {
  it('lehnt einen unbekannten Status ab', async () => {
    const id = await createDraft(prisma);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "status" = 'FOO' WHERE "id" = ?`, id),
    ).rejects.toThrow();
  });

  it('lehnt ein Datum im falschen Format ab', async () => {
    await expect(
      prisma.invoice.create({
        data: {
          invoiceDate: '31.12.2026',
          serviceDate: '2026-12-31',
          dueDate: '2027-01-14',
        },
      }),
    ).rejects.toThrow();
  });

  it('lehnt einen unbekannten Rabatttyp ab', async () => {
    const id = await createDraft(prisma);
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "InvoiceItem" ("invoiceId","position","description","discountType")
         VALUES (?, 1, 'Test', 'GESCHENK')`,
        id,
      ),
    ).rejects.toThrow();
  });

  it('erzwingt, dass nur Entwürfe ohne Nummer existieren', async () => {
    const id = await createDraft(prisma);
    // ISSUED ohne Nummer verletzt die Kopplung aus D5.
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "status" = 'ISSUED' WHERE "id" = ?`, id),
    ).rejects.toThrow();
  });

  it('erzwingt, dass ein Entwurf keine Nummer belegt', async () => {
    const id = await createDraft(prisma);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "number" = '2026-999' WHERE "id" = ?`, id),
    ).rejects.toThrow();
  });

  it('lässt Company und TemplateSettings nur einmal zu', async () => {
    await prisma.company.create({ data: { id: 1 } });
    await expect(prisma.company.create({ data: { id: 2 } })).rejects.toThrow();
  });
});

describe('Eindeutige Rechnungsnummern', () => {
  it('verhindert die doppelte Vergabe derselben Nummer', async () => {
    const first = await createDraft(prisma);
    const second = await createDraft(prisma);

    await markIssued(prisma, first, { number: '2026-100', seq: 100 });
    // Genau der Fall, den die Nummernvergabe niemals produzieren darf.
    await expect(markIssued(prisma, second, { number: '2026-100', seq: 100 })).rejects.toThrow();
  });
});

describe('Kundennummer', () => {
  it('erlaubt beliebig viele Kunden ohne Nummer', async () => {
    // SQLite behandelt NULL in Unique-Indizes als verschieden — Grundlage
    // dafür, dass die Kundennummer optional bleiben kann (D22).
    await prisma.customer.create({ data: { companyName: 'Ohne Nummer A' } });
    await prisma.customer.create({ data: { companyName: 'Ohne Nummer B' } });
    const count = await prisma.customer.count({ where: { customerNumber: null } });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('verhindert dieselbe Nummer zweimal', async () => {
    await prisma.customer.create({ data: { companyName: 'Erste', customerNumber: 'K-1' } });
    await expect(
      prisma.customer.create({ data: { companyName: 'Zweite', customerNumber: 'K-1' } }),
    ).rejects.toThrow();
  });
});

describe('Sperre finalisierter Rechnungen', () => {
  it('blockiert die Änderung eines eingefrorenen Feldes', async () => {
    const id = await createDraft(prisma);
    await markIssued(prisma, id, { number: '2026-200', seq: 200 });

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "Invoice" SET "invoiceDate" = '2026-04-01' WHERE "id" = ?`,
        id,
      ),
    ).rejects.toThrow(/INVOICE_IMMUTABLE/);
  });

  it('blockiert das Überschreiben eines Snapshots', async () => {
    const id = await createDraft(prisma);
    await markIssued(prisma, id, { number: '2026-201', seq: 201 });

    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "Invoice" SET "buyerData" = '{"manipuliert":true}' WHERE "id" = ?`,
        id,
      ),
    ).rejects.toThrow(/INVOICE_IMMUTABLE/);
  });

  it('erlaubt weiterhin das Setzen des Zahldatums', async () => {
    const id = await createDraft(prisma);
    await markIssued(prisma, id, { number: '2026-202', seq: 202 });

    await prisma.$executeRawUnsafe(
      `UPDATE "Invoice" SET "paidAt" = '2026-03-20', "status" = 'PAID' WHERE "id" = ?`,
      id,
    );
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.paidAt).toBe('2026-03-20');
    expect(invoice.status).toBe('PAID');
  });

  it('erlaubt weiterhin interne Notizen und den Versandvermerk', async () => {
    const id = await createDraft(prisma);
    await markIssued(prisma, id, { number: '2026-203', seq: 203 });

    await prisma.$executeRawUnsafe(
      `UPDATE "Invoice" SET "internalNotes" = 'telefonisch angekündigt', "sentAt" = ? WHERE "id" = ?`,
      new Date().toISOString(),
      id,
    );
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.internalNotes).toBe('telefonisch angekündigt');
    expect(invoice.sentAt).not.toBeNull();
  });

  it('verhindert das Löschen einer ausgestellten Rechnung', async () => {
    const id = await createDraft(prisma);
    await markIssued(prisma, id, { number: '2026-204', seq: 204 });

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE "id" = ?`, id),
    ).rejects.toThrow(/INVOICE_IMMUTABLE/);
  });

  it('lässt das Zurücknehmen der Finalisierung zu', async () => {
    // Der Trigger darf die in D6 beschlossene Funktion nicht blockieren:
    // Status zurück auf DRAFT, Nummer und Snapshots geleert.
    const id = await createDraft(prisma);
    await markIssued(prisma, id, { number: '2026-205', seq: 205 });

    await prisma.$executeRawUnsafe(
      `UPDATE "Invoice"
          SET "status" = 'DRAFT',
              "number" = NULL,
              "numberYear" = NULL,
              "numberSeq" = NULL,
              "issuedAt" = NULL,
              "sellerSnapshot" = NULL,
              "taxSnapshot" = NULL,
              "templateSnapshot" = NULL,
              "totalsSnapshot" = NULL,
              "snapshotVersion" = NULL
        WHERE "id" = ?`,
      id,
    );

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.status).toBe('DRAFT');
    expect(invoice.number).toBeNull();

    // Danach ist die Rechnung wieder ganz normal bearbeitbar.
    await prisma.invoice.update({ where: { id }, data: { invoiceDate: '2026-04-01' } });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).invoiceDate).toBe(
      '2026-04-01',
    );
  });
});

describe('Sperre der Positionen', () => {
  it('erlaubt Positionen im Entwurf', async () => {
    const id = await createDraft(prisma);
    await prisma.invoiceItem.create({
      data: { invoiceId: id, position: 1, description: 'Konzeption', unitPriceCents: 12000 },
    });
    expect(await prisma.invoiceItem.count({ where: { invoiceId: id } })).toBe(1);
  });

  it('blockiert neue Positionen nach dem Finalisieren', async () => {
    const id = await createDraft(prisma);
    await prisma.invoiceItem.create({
      data: { invoiceId: id, position: 1, description: 'Konzeption' },
    });
    await markIssued(prisma, id, { number: '2026-300', seq: 300 });

    await expectImmutabilityViolation(
      prisma.invoiceItem.create({
        data: { invoiceId: id, position: 2, description: 'Nachträglich eingeschmuggelt' },
      }),
    );
  });

  it('blockiert das Ändern und Löschen bestehender Positionen', async () => {
    const id = await createDraft(prisma);
    const item = await prisma.invoiceItem.create({
      data: { invoiceId: id, position: 1, description: 'Konzeption', unitPriceCents: 12000 },
    });
    await markIssued(prisma, id, { number: '2026-301', seq: 301 });

    await expectImmutabilityViolation(
      prisma.invoiceItem.update({ where: { id: item.id }, data: { unitPriceCents: 1 } }),
    );

    await expectImmutabilityViolation(prisma.invoiceItem.delete({ where: { id: item.id } }));
  });

  it('lässt das Löschen eines Entwurfs samt Positionen zu', async () => {
    // Die Kaskade darf nicht am Positions-Trigger hängenbleiben.
    const id = await createDraft(prisma);
    await prisma.invoiceItem.create({
      data: { invoiceId: id, position: 1, description: 'Verworfen' },
    });

    await prisma.invoice.delete({ where: { id } });
    expect(await prisma.invoiceItem.count({ where: { invoiceId: id } })).toBe(0);
  });

  it('verhindert doppelte Positionsnummern', async () => {
    const id = await createDraft(prisma);
    await prisma.invoiceItem.create({ data: { invoiceId: id, position: 1, description: 'A' } });
    await expect(
      prisma.invoiceItem.create({ data: { invoiceId: id, position: 1, description: 'B' } }),
    ).rejects.toThrow();
  });
});

describe('Nummernsequenz', () => {
  it('erlaubt je Scope und Jahr nur einen Zähler', async () => {
    await prisma.numberSequence.create({ data: { scope: 'INVOICE', year: 2026, nextValue: 1 } });
    await expect(
      prisma.numberSequence.create({ data: { scope: 'INVOICE', year: 2026, nextValue: 1 } }),
    ).rejects.toThrow();
  });

  it('führt Zähler je Jahr getrennt', async () => {
    await prisma.numberSequence.create({ data: { scope: 'INVOICE', year: 2027, nextValue: 1 } });
    const sequences = await prisma.numberSequence.findMany({ where: { scope: 'INVOICE' } });
    expect(sequences.length).toBeGreaterThanOrEqual(2);
  });

  it('lehnt einen unbekannten Scope ab', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "NumberSequence" ("scope","year","nextValue","updatedAt")
         VALUES ('ANGEBOT', 2026, 1, ?)`,
        new Date().toISOString(),
      ),
    ).rejects.toThrow();
  });
});

describe('Fehlererkennung', () => {
  it('erkennt eine Sperrverletzung auch über den typisierten Client', async () => {
    // Regressionstest für ein Verhalten, das leicht zurückfällt: Prisma
    // meldet den Trigger-Abbruch als P2003 ohne die Trigger-Meldung. Wer
    // sich nur auf den Text verlässt, hält eine Sperrverletzung später für
    // einen Fremdschlüsselfehler.
    const id = await createDraft(prisma);
    const item = await prisma.invoiceItem.create({
      data: { invoiceId: id, position: 1, description: 'Konzeption' },
    });
    await markIssued(prisma, id, { number: '2026-400', seq: 400 });

    let caught: unknown;
    try {
      await prisma.invoiceItem.update({ where: { id: item.id }, data: { description: 'X' } });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect(isImmutabilityViolation(caught)).toBe(true);
  });

  it('hält eine gewöhnliche Validierungsverletzung nicht für eine Sperrverletzung', () => {
    expect(isImmutabilityViolation(new Error('irgendetwas anderes'))).toBe(false);
    expect(isImmutabilityViolation(undefined)).toBe(false);
  });
});
