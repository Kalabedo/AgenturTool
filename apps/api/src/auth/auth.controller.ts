import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  loginInputSchema,
  type AuthSessionResponse,
  type LoginPayload,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import { readCookie, sessionCookieOptions } from './cookies';
import { Public } from './public.decorator';
import type { AuthenticatedRequest } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
  ) {}

  /**
   * „Wer bin ich" — und gibt es hier überhaupt eine Anmeldung.
   *
   * Öffentlich, weil die Oberfläche diese Antwort braucht, bevor sie
   * entscheiden kann, ob sie ein Anmeldeformular zeigt. Sie verrät nichts:
   * ohne gültige Sitzung steht dort `user: null`.
   */
  @Public()
  @Get('session')
  async session(@Req() request: AuthenticatedRequest): Promise<AuthSessionResponse> {
    if (!this.config.enabled) return { enabled: false, hasUser: true, user: null };

    const token = readCookie(request.headers.cookie, this.config.cookieName);
    const [user, hasUser] = await Promise.all([this.auth.userForToken(token), this.auth.hasUser()]);
    return { enabled: true, hasUser, user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginInputSchema)) payload: LoginPayload,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const { token, user } = await this.auth.login(payload, request.ip ?? 'unbekannt');

    response.cookie(
      this.config.cookieName,
      token,
      sessionCookieOptions({
        secure: this.config.cookieSecure,
        maxAgeMs: this.config.sessionTtlDays * 24 * 60 * 60 * 1000,
      }),
    );

    return { enabled: true, hasUser: true, user };
  }

  /**
   * Abmelden.
   *
   * Öffentlich, weil ein Abmelden auch mit abgelaufener Sitzung
   * funktionieren muss — sonst hinge man mit einem toten Cookie fest.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(request.headers.cookie, this.config.cookieName));
    response.clearCookie(this.config.cookieName, { path: '/' });
  }
}
