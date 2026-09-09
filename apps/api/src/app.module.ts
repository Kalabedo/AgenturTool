import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
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
    // Zuletzt: Der statische Ausliefer-Zweig darf erst greifen, wenn keine
    // API-Route gepasst hat.
    WebModule.forRoot(),
  ],
})
export class AppModule {}
