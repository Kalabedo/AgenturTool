import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { CompanyModule } from './company/company.module';
import { CustomersModule } from './customers/customers.module';
import { TaxProfilesModule } from './tax-profiles/tax-profiles.module';
import { InvoicesModule } from './invoices/invoices.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env'] }),
    PrismaModule,
    FilesModule,
    HealthModule,
    CompanyModule,
    CustomersModule,
    TaxProfilesModule,
    InvoicesModule,
  ],
})
export class AppModule {}
