import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HostModule, type HostOptions } from './common/host.module';
import { PrismaModule } from './common/prisma.module';
import { CompanyModule } from './company/company.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { CustomersModule } from './customers/customers.module';
import { TaxProfilesModule } from './tax-profiles/tax-profiles.module';
import { TemplateSettingsModule } from './template-settings/template-settings.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { AppThemeModule } from './app-theme/app-theme.module';
import { AppUpdateModule } from './app-update/app-update.module';
import { BackupModule } from './backup/backup.module';
import { AuthModule } from './auth/auth.module';
import { WebModule } from './web/web.module';
import { EinvoiceModule } from './einvoice/einvoice.module';
import { SmallBusinessModule } from './small-business/small-business.module';
import { StatisticsModule } from './statistics/statistics.module';
import { TaxAdvisorExportModule } from './tax-advisor/tax-advisor-export.module';
import { MailModule } from './mail/mail.module';

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
        AppThemeModule,
        AppUpdateModule,
        CompanyModule,
        OnboardingModule,
        CustomersModule,
        TaxProfilesModule,
        TemplateSettingsModule,
        InvoicesModule,
        TimeEntriesModule,
        BackupModule,
        SmallBusinessModule,
        StatisticsModule,
        TaxAdvisorExportModule,
        MailModule,
        // Zuletzt: Der statische Ausliefer-Zweig darf erst greifen, wenn
        // keine API-Route gepasst hat.
        WebModule.forRoot(),
      ],
    };
  }
}
