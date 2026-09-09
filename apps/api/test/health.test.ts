import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../src/health/health.controller';

describe('Gesundheitsprüfung', () => {
  it('meldet eine erreichbare Datenbank als gesund', async () => {
    const controller = new HealthController({ $queryRaw: async () => [1] } as never);

    await expect(controller.check()).resolves.toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('antwortet bei einer unerreichbaren Datenbank mit HTTP 503', async () => {
    const controller = new HealthController({
      $queryRaw: async () => Promise.reject(new Error('offline')),
    } as never);

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
