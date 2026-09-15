import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CUSTOMER_ARCHIVE_FILTER,
  type CustomerListQuery,
  type CustomerPayload,
  type CustomerResponse,
} from '@privatura/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

/** Kunde samt Rechnungszähler — der entscheidet über die Löschbarkeit. */
type CustomerWithCount = Prisma.CustomerGetPayload<{
  include: { _count: { select: { invoices: true } } };
}>;

const WITH_INVOICE_COUNT = {
  include: { _count: { select: { invoices: true } } },
} as const;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerListQuery): Promise<CustomerResponse[]> {
    const where: Prisma.CustomerWhereInput = {};

    if (query.archived === CUSTOMER_ARCHIVE_FILTER.ACTIVE) {
      where.archivedAt = null;
    } else if (query.archived === CUSTOMER_ARCHIVE_FILTER.ARCHIVED) {
      where.archivedAt = { not: null };
    }

    const term = query.q?.trim();
    if (term !== undefined && term !== '') {
      // Über die Felder, nach denen man tatsächlich sucht. SQLite kennt kein
      // `mode: 'insensitive'`, vergleicht bei `contains` mit ASCII-Zeichen
      // aber ohnehin ohne Rücksicht auf Groß- und Kleinschreibung.
      where.OR = [
        { companyName: { contains: term } },
        { contactName: { contains: term } },
        { customerNumber: { contains: term } },
        { city: { contains: term } },
        { email: { contains: term } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: [{ companyName: 'asc' }],
      ...WITH_INVOICE_COUNT,
    });

    return customers.map((customer) => this.toResponse(customer));
  }

  async findById(id: number): Promise<CustomerResponse> {
    return this.toResponse(await this.load(id));
  }

  async create(payload: CustomerPayload): Promise<CustomerResponse> {
    await this.assertTaxProfileExists(payload.defaultTaxProfileId);
    try {
      const customer = await this.prisma.customer.create({
        data: payload,
        ...WITH_INVOICE_COUNT,
      });
      return this.toResponse(customer);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: number, payload: CustomerPayload): Promise<CustomerResponse> {
    await this.load(id);
    await this.assertTaxProfileExists(payload.defaultTaxProfileId);
    try {
      const customer = await this.prisma.customer.update({
        where: { id },
        data: payload,
        ...WITH_INVOICE_COUNT,
      });
      return this.toResponse(customer);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Archiviert einen Kunden.
   *
   * Der Regelfall statt echtem Löschen: Ein Kunde, an den einmal eine
   * Rechnung ging, muss als Datensatz bestehen bleiben — sonst verlöre die
   * Rechnungsliste ihren Bezugspunkt für Filter und Auswertungen. Auf dem
   * Dokument selbst steht ohnehin der Snapshot, nicht dieser Datensatz.
   */
  async archive(id: number): Promise<CustomerResponse> {
    await this.load(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { archivedAt: new Date() },
      ...WITH_INVOICE_COUNT,
    });
    return this.toResponse(customer);
  }

  async unarchive(id: number): Promise<CustomerResponse> {
    await this.load(id);
    const customer = await this.prisma.customer.update({
      where: { id },
      data: { archivedAt: null },
      ...WITH_INVOICE_COUNT,
    });
    return this.toResponse(customer);
  }

  /**
   * Löscht einen Kunden endgültig — nur, solange keine Rechnung auf ihn zeigt.
   *
   * Gedacht für den vertippten Doppeleintrag, der sonst für immer im Archiv
   * läge. Sobald Rechnungshistorie existiert, ist Archivieren der einzige Weg.
   */
  async deletePermanently(id: number): Promise<void> {
    const customer = await this.load(id);

    if (customer._count.invoices > 0) {
      throw ApiError.validation(
        `Zu diesem Kunden gibt es ${customer._count.invoices} Rechnung(en). ` +
          'Er kann deshalb nur archiviert, nicht gelöscht werden.',
      );
    }

    // Zeiterfassung: Der Fremdschlüssel steht auf RESTRICT, das Löschen
    // schlüge also ohnehin fehl — aber als roher Datenbankfehler mit 500.
    // Hier wird daraus derselbe erklärende Hinweis wie bei den Rechnungen.
    const timeEntries = await this.prisma.timeEntry.count({ where: { customerId: id } });
    if (timeEntries > 0) {
      throw ApiError.validation(
        `Zu diesem Kunden gibt es ${timeEntries} erfasste Zeit(en). ` +
          'Er kann deshalb nur archiviert, nicht gelöscht werden.',
      );
    }

    await this.prisma.customer.delete({ where: { id } });
  }

  /**
   * Prüft das gewählte Steuerprofil, bevor gespeichert wird.
   *
   * Ohne das würde Prisma einen Fremdschlüsselfehler werfen, der als
   * Serverfehler beim Benutzer ankäme — statt als Hinweis am Auswahlfeld.
   */
  private async assertTaxProfileExists(id: number | null): Promise<void> {
    if (id === null) return;

    const profile = await this.prisma.taxProfile.findUnique({ where: { id } });
    if (profile === null) {
      throw ApiError.validation('Das gewählte Steuerprofil existiert nicht.', [
        { field: 'defaultTaxProfileId', message: 'Dieses Steuerprofil existiert nicht.' },
      ]);
    }
  }

  private async load(id: number): Promise<CustomerWithCount> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      ...WITH_INVOICE_COUNT,
    });
    if (customer === null) {
      throw ApiError.notFound(`Kunde ${id} existiert nicht.`);
    }
    return customer;
  }

  /**
   * Übersetzt eine verletzte Eindeutigkeit in eine Meldung am richtigen Feld.
   *
   * Ohne das käme ein roher Prisma-Fehler als 500 heraus, obwohl es sich um
   * eine ganz gewöhnliche Eingabekorrektur handelt.
   */
  private translate(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.['target'] ?? '').includes('customerNumber')
    ) {
      return ApiError.validation('Diese Kundennummer ist bereits vergeben.', [
        { field: 'customerNumber', message: 'Diese Kundennummer ist bereits vergeben.' },
      ]);
    }
    return error;
  }

  private toResponse(customer: CustomerWithCount): CustomerResponse {
    return {
      id: customer.id,
      customerNumber: customer.customerNumber,
      companyName: customer.companyName,
      contactName: customer.contactName,
      addressLine: customer.addressLine,
      street: customer.street,
      postalCode: customer.postalCode,
      city: customer.city,
      country: customer.country,
      email: customer.email,
      vatId: customer.vatId,
      buyerReference: customer.buyerReference,
      electronicAddress: customer.electronicAddress,
      electronicAddressScheme: customer.electronicAddressScheme,
      notes: customer.notes,
      defaultPaymentTermDays: customer.defaultPaymentTermDays,
      defaultTaxProfileId: customer.defaultTaxProfileId,
      archivedAt: customer.archivedAt?.toISOString() ?? null,
      invoiceCount: customer._count.invoices,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
