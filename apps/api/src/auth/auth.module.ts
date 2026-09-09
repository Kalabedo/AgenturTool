import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

/**
 * Das Auth-Modul ist immer geladen, auch wenn die Anmeldung aus ist (D1).
 *
 * Ein Modul, das nur im Produktivbetrieb existiert, ist ein Modul, das im
 * Produktivbetrieb zum ersten Mal läuft. So ist der Unterschied zwischen
 * lokal und im Netz eine Umgebungsvariable und kein anderer Code.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthConfig, AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthConfig, AuthService],
})
export class AuthModule {}
