import { Body, Controller, Inject, Put } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { THEME_HOST, THEME_PREFERENCE_VALUES, type ThemeHost } from './theme-host';

const themeSchema = z.object({
  preference: z.enum(THEME_PREFERENCE_VALUES as [string, ...string[]]),
});

/**
 * Nimmt die Wahl des Erscheinungsbilds entgegen und reicht sie an den
 * Gastgeber weiter.
 *
 * Ohne Gastgeber — der Browserbetrieb bei `pnpm dev` — passiert nichts, und
 * das ist richtig so: Dort gibt es kein Fenster, dessen Hintergrundfarbe
 * beim nächsten Start stimmen müsste. Die Oberfläche merkt sich die Wahl
 * ohnehin selbst im Browser; dieser Weg hier dient allein dem Fenster.
 */
@Controller('app/theme')
export class AppThemeController {
  constructor(@Inject(THEME_HOST) private readonly host: ThemeHost | null) {}

  @Put()
  set(@Body(new ZodValidationPipe(themeSchema)) body: { preference: string }): { ok: true } {
    this.host?.setPreference(body.preference as Parameters<ThemeHost['setPreference']>[0]);
    return { ok: true };
  }
}
