import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  onboardingStatusSchema,
  type OnboardingStateResponse,
  type OnboardingStatusPayload,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OnboardingService } from './onboarding.service';

/**
 * Die Einrichtung hat einen eigenen Endpunkt und hängt nicht an
 * `/company`.
 *
 * Sie beantwortet eine andere Frage: nicht „wie lauten die Firmendaten",
 * sondern „was steht noch aus". Ihre Antwort liest mehrere Tabellen und
 * ändert sich, ohne dass jemand die Firmendaten anfasst — als Anhängsel
 * an der Firma müsste jeder Aufruf von `/company` das mitschleppen.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  state(): Promise<OnboardingStateResponse> {
    return this.onboarding.state();
  }

  /**
   * Nur die Haltung wird gesetzt — die Daten selbst schreiben die
   * bestehenden Endpunkte. Ein eigener Sammel-Endpunkt für die Einrichtung
   * hätte jede Validierung ein zweites Mal ausdrücken müssen.
   */
  @Put()
  setStatus(
    @Body(new ZodValidationPipe(onboardingStatusSchema)) payload: OnboardingStatusPayload,
  ): Promise<OnboardingStateResponse> {
    return this.onboarding.setStatus(payload.status);
  }
}
