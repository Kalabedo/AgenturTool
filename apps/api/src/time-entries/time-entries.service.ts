import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
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

  async update(id: number, payload: TimeEntryPayload): Promise<TimeEntryResponse> {
    await this.load(id);
    await this.assertCustomerExists(payload.customerId);

    const entry = await this.prisma.timeEntry.update({
      where: { id },
      data: this.toData(payload),
      ...WITH_CUSTOMER,
    });
    return this.toResponse(entry);
  }

  async remove(id: number): Promise<void> {
    await this.load(id);
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  /**
   * Der Filter hinter Liste und PDF.
   *
   * `from` und `to` schließen beide Tage ein. Der Vergleich läuft
   * lexikografisch über die ISO-Strings — bei "YYYY-MM-DD" ist das
   * dieselbe Reihenfolge wie chronologisch.
   */
  private rangeFilter(query: TimeEntryRangeQuery): Prisma.TimeEntryWhereInput {
    const where: Prisma.TimeEntryWhereInput = {
      date: { gte: query.from, lte: query.to },
    };
    if (query.customerId !== null) where.customerId = query.customerId;
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
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
