import { Injectable } from '@nestjs/common';
import type { Company } from '@prisma/client';
import type { CompanyResponse, UpdateCompanyPayload } from '@agentur-tool/shared';
import { PrismaService } from '../common/prisma.service';
import { FilesService } from '../files/files.service';

/** Die Firmendaten sind ein Singleton mit fester id (per CHECK erzwungen). */
const COMPANY_ID = 1;

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /**
   * Liefert die Firmendaten und legt sie beim ersten Aufruf leer an.
   *
   * Der Seed tut das ebenfalls, aber die Anwendung darf sich nicht darauf
   * verlassen: Eine aus einem Backup wiederhergestellte oder von Hand
   * angelegte Datenbank soll genauso funktionieren.
   */
  async get(): Promise<CompanyResponse> {
    const company = await this.prisma.company.upsert({
      where: { id: COMPANY_ID },
      update: {},
      create: { id: COMPANY_ID, country: 'DE' },
    });
    return this.toResponse(company);
  }

  async update(payload: UpdateCompanyPayload): Promise<CompanyResponse> {
    const company = await this.prisma.company.upsert({
      where: { id: COMPANY_ID },
      update: payload,
      create: { id: COMPANY_ID, ...payload },
    });
    return this.toResponse(company);
  }

  async setLogo(buffer: Buffer, originalFilename: string | null): Promise<CompanyResponse> {
    const asset = await this.files.storeImage(buffer, originalFilename);
    const previous = await this.prisma.company.findUnique({ where: { id: COMPANY_ID } });

    const company = await this.prisma.company.upsert({
      where: { id: COMPANY_ID },
      update: { logoAssetId: asset.id },
      create: { id: COMPANY_ID, country: 'DE', logoAssetId: asset.id },
    });

    // Das alte Logo erst nach dem erfolgreichen Wechsel entfernen, damit bei
    // einem Fehler nicht beide weg sind. Der Vergleich der ids fängt den
    // Fall ab, dass dieselbe Datei erneut hochgeladen wurde — dann liefert
    // storeImage() das bestehende Asset zurück, und ein Löschen würde das
    // gerade gesetzte Logo entfernen.
    if (previous?.logoAssetId != null && previous.logoAssetId !== asset.id) {
      await this.files.delete(previous.logoAssetId);
    }

    return this.toResponse(company);
  }

  async removeLogo(): Promise<CompanyResponse> {
    const previous = await this.prisma.company.findUnique({ where: { id: COMPANY_ID } });

    const company = await this.prisma.company.upsert({
      where: { id: COMPANY_ID },
      update: { logoAssetId: null },
      create: { id: COMPANY_ID, country: 'DE' },
    });

    if (previous?.logoAssetId != null) {
      await this.files.delete(previous.logoAssetId);
    }

    return this.toResponse(company);
  }

  /**
   * Bildet die Prisma-Entität auf den API-Vertrag ab.
   *
   * Kein direktes Durchreichen der Datenbankzeile: Persistenz und
   * Außenschnittstelle dürfen sich unabhängig voneinander entwickeln, und
   * `logoUrl` erspart dem Frontend, die Adresse selbst zusammenzusetzen.
   */
  private toResponse(company: Company): CompanyResponse {
    return {
      id: company.id,
      companyName: company.companyName,
      street: company.street,
      postalCode: company.postalCode,
      city: company.city,
      country: company.country,
      email: company.email,
      website: company.website,
      phone: company.phone,
      vatId: company.vatId,
      taxNumber: company.taxNumber,
      electronicAddress: company.electronicAddress,
      electronicAddressScheme: company.electronicAddressScheme,
      bankAccountHolder: company.bankAccountHolder,
      iban: company.iban,
      bic: company.bic,
      bankName: company.bankName,
      defaultPaymentTermDays: company.defaultPaymentTermDays,
      logoAssetId: company.logoAssetId,
      logoUrl: company.logoAssetId === null ? null : `/api/assets/${company.logoAssetId}`,
      updatedAt: company.updatedAt.toISOString(),
    };
  }
}
