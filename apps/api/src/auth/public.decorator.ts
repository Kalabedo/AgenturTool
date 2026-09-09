import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:public';

/**
 * Nimmt eine Route von der Anmeldepflicht aus.
 *
 * Der Wächter wirkt global — jede neue Route ist damit von sich aus
 * geschützt, und wer sie öffnen will, sagt es ausdrücklich. Andersherum
 * (jede Route offen, Schutz einzeln anschalten) wäre die erste vergessene
 * Zeile ein offenes Scheunentor.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
