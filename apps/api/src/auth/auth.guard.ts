import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { AuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import { readCookie } from './cookies';
import { IS_PUBLIC } from './public.decorator';

/** Die Anfrage mit dem angemeldeten Benutzer, sobald der Wächter ihn kennt. */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Der Wächter vor allen Routen.
 *
 * Ist `AUTH_ENABLED` aus, lässt er alles durch — das ist der lokale Betrieb
 * aus D1, in dem die Anwendung auf 127.0.0.1 hört und niemand sonst
 * herankommt. Ist er an, braucht jede Anfrage außer den ausdrücklich
 * öffentlichen ein gültiges Session-Cookie.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AuthConfig,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.enabled) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.auth.userForToken(
      readCookie(request.headers.cookie, this.config.cookieName),
    );

    if (user === null) {
      throw ApiError.unauthenticated('Bitte anmelden.');
    }

    // Für spätere Mehrbenutzerfähigkeit: Ab hier weiß jede Route, wer
    // fragt, ohne die Sitzung erneut aufzulösen.
    request.user = user;
    return true;
  }
}
