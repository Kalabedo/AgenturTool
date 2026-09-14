import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type OnboardingStateResponse, type OnboardingStatus } from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';

/**
 * Der Zustand der Einrichtung.
 *
 * Drei Stellen fragen danach — die Weiche beim Start, die Liste auf dem
 * Dashboard und der Ablauf selbst. Sie teilen sich einen Abfrageschlüssel,
 * damit ein abgeschlossener Schritt überall zugleich verschwindet.
 */
export function useOnboardingState() {
  return useQuery({
    queryKey: queryKeys.onboarding,
    queryFn: () => apiClient.get<OnboardingStateResponse>('/onboarding'),
  });
}

/** Setzt die Haltung des Benutzers — übersprungen oder abgeschlossen. */
export function useOnboardingStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: OnboardingStatus) =>
      apiClient.put<OnboardingStateResponse>('/onboarding', { status }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.onboarding, state);
    },
  });
}
