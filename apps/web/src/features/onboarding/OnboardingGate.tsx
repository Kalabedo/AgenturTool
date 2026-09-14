import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ONBOARDING_STATUS } from '@agentur-tool/shared';
import { useOnboardingState } from './useOnboarding.js';

/**
 * Einmal je Programmstart, und nur bei leerer Datenbank.
 *
 * `redirected` steht absichtlich außerhalb der Komponente. Ohne dieses
 * Gedächtnis wäre die Weiche eine Falle: Wer die Einrichtung öffnet, sie
 * nicht abschließt und in der Navigation auf „Kunden" klickt, würde sofort
 * wieder zurückgeworfen — die Bedingung „leer und offen" gilt ja weiterhin.
 * So führt der erste Start hin, und danach entscheidet der Benutzer.
 *
 * Der Umweg über einen Effekt statt eines `<Navigate>` im Render hat
 * denselben Grund in klein: Im StrictMode rendert React zweimal, und ein im
 * Render gesetztes Merkmal hätte den zweiten Durchgang leer ausgehen
 * lassen — die Weiche hätte nie ausgelöst.
 */
let redirected = false;

export function OnboardingGate(): null {
  const navigate = useNavigate();
  const location = useLocation();
  const onboarding = useOnboardingState();

  useEffect(() => {
    if (redirected || onboarding.data === undefined) return;
    if (onboarding.data.status !== ONBOARDING_STATUS.OPEN || !onboarding.data.fresh) return;

    redirected = true;
    if (location.pathname !== '/onboarding') {
      // `replace`: Der Weg „zurück" soll nicht auf eine Seite führen, die
      // nie jemand gesehen hat.
      void navigate('/onboarding', { replace: true });
    }
  }, [onboarding.data, location.pathname, navigate]);

  return null;
}
