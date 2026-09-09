import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TIME_ENTRY_BILLING_FILTER,
  type TimeEntryOpenSummary,
  type TimeEntryPayload,
  type TimeEntryRangeQuery,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

/** Eintrag samt Kundennamen — den braucht jede Liste und jedes PDF. */
type TimeEntryWithCustomer = Prisma.TimeEntryGetPayload<{
  include: { customer: { select: { companyName: true } } };
}>;

const WITH_CUSTOMER = {
  include: { customer: { select: { companyName: true } } },
} as const;

/**
 * Die erfassten Zeiten.
 *
 * Absichtlich schlicht: Anlegen, Ändern, Löschen, Auflisten. Es gibt hier
 * keine Snapshots und keine Unveränderlichkeit wie bei den Rechnungen —
 * eine erfasste Stunde ist eine Notiz über den eigenen Tag, kein Dokument
 * mit Außenwirkung. Was daraus abgerechnet wird, wird beim Ausstellen der
 * Rechnung eingefroren, nicht hier.
 *
 * Das Viertelstundenraster steckt nicht in diesem Service: Es kommt aus
 * `timeEntryInputSchema` (rundet ab) und wird von den CHECK-Constraints der
 * Tabelle gehalten. So gilt es auf jedem Weg in die Datenbank, nicht nur
 * auf diesem.
 */
@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Die Einträge eines Zeitraums, chronologisch.
   *
   * Sortiert nach Tag und Beginn und nicht nach Anlagezeitpunkt: Wer
   * Freitag nachträgt, was er Montag gemacht hat, will die Zeile trotzdem
   * am Montag stehen sehen.
   */
  async list(query: TimeEntryRangeQuery): Promise<TimeEntryResponse[]> {
    const entries = await this.prisma.timeEntry.findMany({
      where: this.rangeFilter(query),
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }, { id: 'asc' }],
      ...WITH_CUSTOMER,
    });

    return entries.map((entry) => this.toResponse(entry));
  }

  async findById(id: number): Promise<TimeEntryResponse> {
    return this.toResponse(await this.load(id));
  }

  async create(payload: TimeEntryPayload): Promise<TimeEntryResponse> {
    await this.assertCustomerExists(payload.customerId);

    const entry = await this.prisma.timeEntry.create({
      data: this.toData(payload),
      ...WITH_CUSTOMER,
    });
    return this.toResponse(entry);
  }

  /**
   * Ändert einen Eintrag — solange er offen ist.
   *
   * Ein abgerechneter Eintrag steht auf einem Nachweis, der beim Kunden
   * liegt. Ihn danach zu ändern hieße, ein Dokument stillschweigend von
   * seiner Grundlage zu lösen: Der Kunde hätte 8:00 auf dem Papier und die
   * Datenbank 6:00, ohne dass irgendwo stünde, warum. Wer wirklich
   * korrigieren muss, nimmt die Abrechnung zurück und rechnet neu ab —
   * dann stimmt der nächste Nachweis wieder mit den Daten überein.
   */
  async update(id: number, payload: TimeEntryPayload): Promise<TimeEntryResponse> {
    this.assertOpen(await this.load(id), 'ändern');
    await this.assertCustomerExists(payload.customerId);

    const entry = await this.prisma.timeEntry.update({
      where: { id },
      data: this.toData(payload),
      ...WITH_CUSTOMER,
    });
    return this.toResponse(entry);
  }

  async remove(id: number): Promise<void> {
    this.assertOpen(await this.load(id), 'löschen');
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  /**
   * Sperrt Änderungen an abgerechneten Einträgen.
   *
   * Der Weg zurück steht in der Meldung: Erst die Abrechnung zurücknehmen,
   * dann ändern. Das ist kein Umweg, sondern die einzige Reihenfolge, nach
   * der Nachweis und Datenbank am Ende wieder dasselbe sagen.
   */
  private assertOpen(entry: TimeEntryWithCustomer, action: string): void {
    if (entry.billedAt !== null) {
      throw ApiError.validation(
        `Dieser Eintrag ist bereits abgerechnet und lässt sich nicht mehr ${action}. ` +
          'Nimm die Abrechnung zurück, wenn du ihn korrigieren möchtest.',
      );
    }
  }

  /**
   * Rechnet die offenen Zeiten eines Kunden ab.
   *
   * Markiert statt zu löschen: Die Einträge verschwinden aus der offenen
   * Liste, bleiben aber vollständig erhalten. Der Zeitnachweis ist eine
   * reine Ableitung aus ihnen und lässt sich deshalb jederzeit neu erzeugen
   * — es muss kein PDF aufbewahrt werden.
   *
   * Zurückgegeben werden die Einträge, wie sie **vor** dem Markieren
   * aussahen: Der Aufrufer druckt daraus den Nachweis und hält ihre Ids
   * fest, um die Abrechnung zurücknehmen zu können.
   *
   * Läuft in einer Transaktion und markiert nur, was beim Lesen offen war.
   * Ohne das könnte ein Eintrag, der zwischen Lesen und Schreiben entsteht,
   * als abgerechnet gelten, ohne je auf dem Nachweis gestanden zu haben.
   */
  async bill(customerId: number): Promise<{ entries: TimeEntryResponse[]; billedAt: string }> {
    await this.assertCustomerExists(customerId);

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.timeEntry.findMany({
        where: { customerId, billedAt: null },
        orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }, { id: 'asc' }],
        ...WITH_CUSTOMER,
      });

      if (open.length === 0) {
        throw ApiError.validation('Für diesen Kunden sind keine Zeiten offen.');
      }

      const billedAt = new Date();
      await tx.timeEntry.updateMany({
        where: { id: { in: open.map((entry) => entry.id) } },
        data: { billedAt },
      });

      return {
        entries: open.map((entry) => this.toResponse({ ...entry, billedAt })),
        billedAt: billedAt.toISOString(),
      };
    });
  }

  /**
   * Nimmt eine Abrechnung zurück.
   *
   * Gegenstück zum Abrechnen ohne Rückfrage: Ein Klick daneben nähme sonst
   * still ein Dutzend Einträge aus der offenen Liste, und beim nächsten
   * echten Abrechnen fehlten sie — ein Fehler, der erst beim Nachrechnen
   * auffällt. Angesprochen werden die Ids, die das Abrechnen geliefert hat.
   *
   * Bereits offene Ids werden übergangen statt als Fehler gemeldet: Wer
   * zweimal auf „Rückgängig" klickt, will denselben Zustand, nicht eine
   * Fehlermeldung.
   */
  async unbill(ids: readonly number[]): Promise<number> {
    const result = await this.prisma.timeEntry.updateMany({
      where: { id: { in: [...ids] }, billedAt: { not: null } },
      data: { billedAt: null },
    });
    return result.count;
  }

  /**
   * Die offenen Zeiten je Kunde — die Reiterleiste der Oberfläche.
   *
   * Als eigene Abfrage und nicht aus der Liste gerechnet: Die Leiste zeigt
   * alle Kunden mit offenen Zeiten, die Liste immer nur einen davon. Sie
   * beantwortet damit die Frage, die man sonst durch Durchklicken
   * beantworten müsste — wo liegt noch unabgerechnete Arbeit.
   */
  async openSummary(): Promise<TimeEntryOpenSummary[]> {
    const entries = await this.prisma.timeEntry.findMany({
      where: { billedAt: null },
      select: {
        customerId: true,
        startMinutes: true,
        endMinutes: true,
        breakMinutes: true,
        date: true,
        customer: { select: { companyName: true } },
      },
    });

    const byCustomer = new Map<number, TimeEntryOpenSummary>();
    for (const entry of entries) {
      const duration = entry.endMinutes - entry.startMinutes - entry.breakMinutes;
      const existing = byCustomer.get(entry.customerId);

      if (existing === undefined) {
        byCustomer.set(entry.customerId, {
          customerId: entry.customerId,
          customerName: entry.customer.companyName,
          entryCount: 1,
          durationMinutes: duration,
          from: entry.date,
          to: entry.date,
        });
      } else {
        existing.entryCount += 1;
        existing.durationMinutes += duration;
        if (entry.date < existing.from) existing.from = entry.date;
        if (entry.date > existing.to) existing.to = entry.date;
      }
    }

    return [...byCustomer.values()].sort((a, b) =>
      a.customerName.localeCompare(b.customerName, 'de'),
    );
  }

  /**
   * Der Filter hinter Liste und PDF.
   *
   * `from` und `to` schließen beide Tage ein. Der Vergleich läuft
   * lexikografisch über die ISO-Strings — bei "YYYY-MM-DD" ist das
   * dieselbe Reihenfolge wie chronologisch.
   */
  private rangeFilter(query: TimeEntryRangeQuery): Prisma.TimeEntryWhereInput {
    const where: Prisma.TimeEntryWhereInput = {};

    // Ein Zeitraum ist die Ausnahme, nicht die Regel: Der Normalbetrieb
    // fragt ohne Datum nach allem Offenen. Nur was angegeben ist, grenzt ein.
    if (query.from !== null || query.to !== null) {
      where.date = {
        ...(query.from !== null ? { gte: query.from } : {}),
        ...(query.to !== null ? { lte: query.to } : {}),
      };
    }
    if (query.customerId !== null) where.customerId = query.customerId;

    if (query.billing === TIME_ENTRY_BILLING_FILTER.OPEN) where.billedAt = null;
    if (query.billing === TIME_ENTRY_BILLING_FILTER.BILLED) where.billedAt = { not: null };

    return where;
  }

  private toData(payload: TimeEntryPayload): Prisma.TimeEntryUncheckedCreateInput {
    return {
      date: payload.date,
      customerId: payload.customerId,
      startMinutes: payload.startMinutes,
      endMinutes: payload.endMinutes,
      breakMinutes: payload.breakMinutes,
      description: payload.description,
    };
  }

  /**
   * Prüft den Kunden, bevor geschrieben wird.
   *
   * Ohne das käme der Fremdschlüsselfehler als Serverfehler beim Benutzer
   * an, obwohl es sich um eine Auswahl im Formular handelt.
   */
  private async assertCustomerExists(id: number): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (customer === null) {
      throw ApiError.validation('Der gewählte Kunde existiert nicht.', [
        { field: 'customerId', message: 'Dieser Kunde existiert nicht.' },
      ]);
    }
  }

  private async load(id: number): Promise<TimeEntryWithCustomer> {
    const entry = await this.prisma.timeEntry.findUnique({ where: { id }, ...WITH_CUSTOMER });
    if (entry === null) {
      throw ApiError.notFound(`Der Zeiteintrag ${id} existiert nicht.`);
    }
    return entry;
  }

  private toResponse(entry: TimeEntryWithCustomer): TimeEntryResponse {
    return {
      id: entry.id,
      date: entry.date,
      customerId: entry.customerId,
      customerName: entry.customer.companyName,
      startMinutes: entry.startMinutes,
      endMinutes: entry.endMinutes,
      breakMinutes: entry.breakMinutes,
      // Gerechnet und nicht gespeichert: Eine mitgeschriebene Dauer wäre ein
      // zweiter Ort für dieselbe Wahrheit und liefe bei jeder Änderung an
      // Beginn, Ende oder Pause Gefahr, stehen zu bleiben.
      durationMinutes: entry.endMinutes - entry.startMinutes - entry.breakMinutes,
      description: entry.description,
      billedAt: entry.billedAt === null ? null : entry.billedAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
