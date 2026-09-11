import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HostModule, type HostOptions } from './common/host.module';
import { PrismaModule } from './common/prisma.module';
import { CompanyModule } from './company/company.module';
import { CustomersModule } from './customers/customers.module';
import { TaxProfilesModule } from './tax-profiles/tax-profiles.module';
import { TemplateSettingsModule } from './template-settings/template-settings.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { BackupModule } from './backup/backup.module';
import { AuthModule } from './auth/auth.module';
import { WebModule } from './web/web.module';
import { EinvoiceModule } from './einvoice/einvoice.module';

/**
 * Die Anwendung.
 *
 * `forRoot` statt eines festen Moduls, weil der Gastgeber etwas mitbringen
 * kann: Die Desktop-Anwendung reicht ihren PDF-Renderer herein, bevor
 * irgendetwas gebaut wird. Ohne Angabe verhält sich alles wie zuvor.
 */
@Module({})
export class AppModule {
  static forRoot(options: HostOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EinvoiceModule,
        HostModule.forRoot(options),
        // Die .env liegt im Repository neben den Paketen. In einer
        // gepackten Anwendung gibt es sie nicht — dort setzt der
        // Hauptprozess die Werte direkt in die Umgebung, und ConfigModule
        // liest sie von dort.
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
        PrismaModule,
        AuthModule,
        FilesModule,
        HealthModule,
        CompanyModule,
        CustomersModule,
        TaxProfilesModule,
        TemplateSettingsModule,
        InvoicesModule,
        TimeEntriesModule,
        BackupModule,
        // Zuletzt: Der statische Ausliefer-Zweig darf erst greifen, wenn
        // keine API-Route gepasst hat.
        WebModule.forRoot(),
      ],
    };
  }
}
