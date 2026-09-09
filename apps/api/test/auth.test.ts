import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { AuthConfig } from '../src/auth/auth.config';
import { AuthService, hashToken } from '../src/auth/auth.service';
import { AuthGuard } from '../src/auth/auth.guard';
import { readCookie, sessionCookieOptions } from '../src/auth/cookies';
import { ApiError } from '../src/common/api-error';
import { createTestDatabase, type TestDatabase } from './database.helper';

let db: TestDatabase;
let prisma: PrismaClient;

/** Ein AuthConfig ohne Nest — die Klasse liest nur aus dem ConfigService. */
function configFor(values: Record<string, string>): AuthConfig {
  return new AuthConfig({ get: (key: string) => values[key] } as never);
}

const ENABLED = { AUTH_ENABLED: 'true' };

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

async function createUser(service: AuthService, password: string): Promise<void> {
  await prisma.user.create({
    data: { email: 'chef@agentur.de', passwordHash: await service.hashPassword(password) },
  });
}

describe('Anmeldung', () => {
  it('meldet mit richtigem Passwort an und legt eine Sitzung an', async () => {
    const service = new AuthService(prisma as never, configFor(ENABLED));
    await createUser(service, 'ein-langes-passwort');

    const result = await service.login(
      { email: 'chef@agentur.de', password: 'ein-langes-passwort' },
      '::1',
    );

    expect(result.user.email).toBe('chef@agentur.de');

    // In der Datenbank steht nur der Hash: Wer sie liest, kommt nicht hinein.
    const session = await prisma.session.findFirst();
    expect(session?.tokenHash).toBe(hashToken(result.token));
    expect(session?.tokenHash).not.toBe(result.token);
  });

  it('nimmt die E-Mail-Adresse unabhängig von der Schreibweise', async () => {
    const service = new AuthService(prisma as never, configFor(ENABLED));
    await createUser(service, 'ein-langes-passwort');

    await expect(
      service.login({ email: 'Chef@Agentur.DE', password: 'ein-langes-passwort' }, '::1'),
    ).resolves.toBeDefined();
  });

  it('antwortet auf falsches Passwort und unbekannte Adresse gleich', async () => {
    const service = new AuthService(prisma as never, configFor(ENABLED));
    await createUser(service, 'ein-langes-passwort');

    const wrongPassword = await service
      .login({ email: 'chef@agentur.de', password: 'falsch' }, '::1')
      .catch((error: unknown) => error);
    const unknownUser = await service
      .login({ email: 'niemand@agentur.de', password: 'falsch' }, '::2')
      .catch((error: unknown) => error);

    expect(wrongPassword).toBeInstanceOf(ApiError);
    expect(unknownUser).toBeInstanceOf(ApiError);
    expect((wrongPassword as ApiError).message).toBe((unknownUser as ApiError).message);
  });

  it('sperrt nach zu vielen Fehlversuchen desselben Absenders', async () => {
    const service = new AuthService(
      prisma as never,
      configFor({ ...ENABLED, LOGIN_MAX_ATTEMPTS: '3' }),
    );
    await createUser(service, 'ein-langes-passwort');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        service.login({ email: 'chef@agentur.de', password: 'falsch' }, '10.0.0.1'),
      ).rejects.toThrow();
    }

    // Auch das richtige Passwort kommt jetzt nicht mehr durch — sonst wäre
    // die Sperre nur eine Bremse für Tippfehler.
    const blocked = await service
      .login({ email: 'chef@agentur.de', password: 'ein-langes-passwort' }, '10.0.0.1')
      .catch((error: unknown) => error);
    expect((blocked as ApiError).status).toBe(429);

    // Ein anderer Absender ist davon unberührt.
    await expect(
      service.login({ email: 'chef@agentur.de', password: 'ein-langes-passwort' }, '10.0.0.2'),
    ).resolves.toBeDefined();
  });

  it('setzt die Zählung nach einer erfolgreichen Anmeldung zurück', async () => {
    const service = new AuthService(
      prisma as never,
      configFor({ ...ENABLED, LOGIN_MAX_ATTEMPTS: '3' }),
    );
    await createUser(service, 'ein-langes-passwort');

    await expect(
      service.login({ email: 'chef@agentur.de', password: 'falsch' }, '10.0.0.3'),
    ).rejects.toThrow();
    await service.login({ email: 'chef@agentur.de', password: 'ein-langes-passwort' }, '10.0.0.3');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(
        service.login({ email: 'chef@agentur.de', password: 'falsch' }, '10.0.0.3'),
      ).rejects.toThrow();
    }
    // Zwei Fehlversuche nach dem Zurücksetzen sperren noch nicht.
    await expect(
      service.login({ email: 'chef@agentur.de', password: 'ein-langes-passwort' }, '10.0.0.3'),
    ).resolves.toBeDefined();
  });
});

describe('Sitzungen', () => {
  it('löst ein gültiges Token auf und vergisst es nach dem Abmelden', async () => {
    const service = new AuthService(prisma as never, configFor(ENABLED));
    await createUser(service, 'ein-langes-passwort');
    const { token } = await service.login(
      { email: 'chef@agentur.de', password: 'ein-langes-passwort' },
      '::1',
    );

    expect(await service.userForToken(token)).not.toBeNull();

    await service.logout(token);
    expect(await service.userForToken(token)).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it('lehnt eine abgelaufene Sitzung ab und räumt sie weg', async () => {
    const service = new AuthService(prisma as never, configFor(ENABLED));
    await createUser(service, 'ein-langes-passwort');
    const { token } = await service.login(
      { email: 'chef@agentur.de', password: 'ein-langes-passwort' },
      '::1',
    );

    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await service.userForToken(token)).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it('lehnt ein erfundenes Token ab', async () => {
    const service = new AuthService(prisma as never, configFor(ENABLED));
    expect(await service.userForToken('gibt-es-nicht')).toBeNull();
    expect(await service.userForToken(null)).toBeNull();
  });
});

describe('Wächter', () => {
  const handler = (): void => undefined;

  function contextWith(cookie?: string): ExecutionContext {
    const request = { headers: cookie === undefined ? {} : { cookie } };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  it('lässt bei abgeschalteter Anmeldung alles durch', async () => {
    const config = configFor({ AUTH_ENABLED: 'false' });
    const guard = new AuthGuard(new Reflector(), config, new AuthService(prisma as never, config));

    expect(await guard.canActivate(contextWith())).toBe(true);
  });

  it('weist ohne Cookie ab und lässt mit gültigem Cookie durch', async () => {
    const config = configFor(ENABLED);
    const service = new AuthService(prisma as never, config);
    const guard = new AuthGuard(new Reflector(), config, service);
    await createUser(service, 'ein-langes-passwort');

    await expect(guard.canActivate(contextWith())).rejects.toMatchObject({ status: 401 });

    const { token } = await service.login(
      { email: 'chef@agentur.de', password: 'ein-langes-passwort' },
      '::1',
    );
    expect(await guard.canActivate(contextWith(`agentur_session=${token}`))).toBe(true);
  });
});

describe('Cookies', () => {
  it('liest das richtige Cookie aus einer Kette heraus', () => {
    expect(readCookie('a=1; agentur_session=abc; b=2', 'agentur_session')).toBe('abc');
    expect(readCookie('a=1', 'agentur_session')).toBeNull();
    expect(readCookie(undefined, 'agentur_session')).toBeNull();
  });

  it('setzt httpOnly und SameSite=lax', () => {
    const options = sessionCookieOptions({ secure: true, maxAgeMs: 1000 });
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.secure).toBe(true);
  });
});
