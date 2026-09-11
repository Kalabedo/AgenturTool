import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TaxCategoryCode,
  TaxProfileKind,
  TaxProfileListQuery,
  TaxProfilePayload,
  TaxProfileResponse,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

type TaxProfileWithCounts = Prisma.TaxProfileGetPayload<{
  include: { _count: { select: { invoices: true; customers: true } } };
}>;

const WITH_COUNTS = {
  include: { _count: { select: { invoices: true, customers: true } } },
} as const;

@Injectable()
export class TaxProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: TaxProfileListQuery): Promise<TaxProfileResponse[]> {
    const profiles = await this.prisma.taxProfile.findMany({
      where: query.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      ...WITH_COUNTS,
    });
    return profiles.map((profile) => this.toResponse(profile));
  }

  async findById(id: number): Promise<TaxProfileResponse> {
    return this.toResponse(await this.load(id));
  }

  async create(payload: TaxProfilePayload): Promise<TaxProfileResponse> {
    try {
      const profile = await this.prisma.$transaction(async (tx) => {
        if (payload.isDefault) await this.clearDefault(tx);
        return tx.taxProfile.create({ data: payload, ...WITH_COUNTS });
      });
      return this.toResponse(profile);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: number, payload: TaxProfilePayload): Promise<TaxProfileResponse> {
    await this.load(id);
    try {
      const profile = await this.prisma.$transaction(async (tx) => {
        // Den bisherigen Standard zurücksetzen, bevor der neue gesetzt wird —
        // sonst greift der partielle Unique-Index, der höchstens ein
        // Standardprofil zulässt.
        if (payload.isDefault) await this.clearDefault(tx, id);
        return tx.taxProfile.update({ where: { id }, data: payload, ...WITH_COUNTS });
      });
      return this.toResponse(profile);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Archiviert ein Profil.
   *
   * War es das Standardprofil, rückt das nächste aktive nach. Ohne das bliebe
   * die Anwendung ohne Vorgabe zurück, und das Rechnungsformular hätte beim
   * Anlegen nichts vorzuschlagen.
   */
  async archive(id: number): Promise<TaxProfileResponse> {
    const existing = await this.load(id);

    const profile = await this.prisma.$transaction(async (tx) => {
      const archived = await tx.taxProfile.update({
        where: { id },
        data: { archivedAt: new Date(), isDefault: false },
        ...WITH_COUNTS,
      });

      if (existing.isDefault) {
        const successor = await tx.taxProfile.findFirst({
          where: { archivedAt: null, id: { not: id } },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        if (successor !== null) {
          await tx.taxProfile.update({ where: { id: successor.id }, data: { isDefault: true } });
        }
      }

      return archived;
    });

    return this.toResponse(profile);
  }

  async unarchive(id: number): Promise<TaxProfileResponse> {
    await this.load(id);
    const profile = await this.prisma.taxProfile.update({
      where: { id },
      data: { archivedAt: null },
      ...WITH_COUNTS,
    });
    return this.toResponse(profile);
  }

  /**
   * Löscht ein Profil endgültig — nur, solange weder Rechnungen noch Kunden
   * darauf verweisen.
   *
   * Bei einer finalisierten Rechnung steckt der Steuerhinweis ohnehin im
   * taxSnapshot, das Dokument bliebe also unversehrt. Ein Entwurf oder eine
   * Kundenvorgabe verlöre aber stillschweigend seine Zuordnung, weil der
   * Fremdschlüssel auf null gesetzt würde.
   */
  async deletePermanently(id: number): Promise<void> {
    const profile = await this.load(id);

    const usages: string[] = [];
    if (profile._count.invoices > 0) usages.push(`${profile._count.invoices} Rechnung(en)`);
    if (profile._count.customers > 0) usages.push(`${profile._count.customers} Kunde(n)`);

    if (usages.length > 0) {
      throw ApiError.validation(
        `Dieses Steuerprofil wird von ${usages.join(' und ')} verwendet. ` +
          'Es kann deshalb nur archiviert, nicht gelöscht werden.',
      );
    }

    await this.prisma.taxProfile.delete({ where: { id } });
  }

  /** Das Profil, das neuen Rechnungen vorgeschlagen wird. */
  async findDefault(): Promise<TaxProfileResponse | null> {
    const profile = await this.prisma.taxProfile.findFirst({
      where: { isDefault: true, archivedAt: null },
      ...WITH_COUNTS,
    });
    return profile === null ? null : this.toResponse(profile);
  }

  private async clearDefault(tx: Prisma.TransactionClient, exceptId?: number): Promise<void> {
    await tx.taxProfile.updateMany({
      where: { isDefault: true, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
      data: { isDefault: false },
    });
  }

  private async load(id: number): Promise<TaxProfileWithCounts> {
    const profile = await this.prisma.taxProfile.findUnique({ where: { id }, ...WITH_COUNTS });
    if (profile === null) {
      throw ApiError.notFound(`Steuerprofil ${id} existiert nicht.`);
    }
    return profile;
  }

  private translate(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String(error.meta?.['target'] ?? '');

      if (target.includes('name')) {
        return ApiError.validation('Ein Steuerprofil mit diesem Namen existiert bereits.', [
          { field: 'name', message: 'Dieser Name ist bereits vergeben.' },
        ]);
      }

      // Der partielle Index hat gegriffen: Es gäbe zwei Standardprofile.
      // Das sollte der Service verhindern; kommt es doch vor, ist es ein
      // Fehler im Code und keine Eingabekorrektur.
      if (target.includes('isDefault')) {
        return ApiError.validation('Es kann nur ein Standardprofil geben. Bitte erneut versuchen.');
      }
    }
    return error;
  }

  private toResponse(profile: TaxProfileWithCounts): TaxProfileResponse {
    return {
      id: profile.id,
      name: profile.name,
      kind: profile.kind as TaxProfileKind,
      defaultRateBasisPoints: profile.defaultRateBasisPoints,
      noteText: profile.noteText,
      taxCategoryCode: profile.taxCategoryCode as TaxCategoryCode,
      exemptionReasonCode: profile.exemptionReasonCode,
      exemptionReasonText: profile.exemptionReasonText,
      showTaxColumn: profile.showTaxColumn,
      isDefault: profile.isDefault,
      sortOrder: profile.sortOrder,
      archivedAt: profile.archivedAt?.toISOString() ?? null,
      invoiceCount: profile._count.invoices,
      customerCount: profile._count.customers,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
