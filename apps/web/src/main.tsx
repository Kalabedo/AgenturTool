import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router.js';
import { AuthGate } from './features/auth/AuthGate.js';
import { ErrorBoundary } from './app/ErrorBoundary.js';
import { ThemeProvider } from './components/ThemeProvider.js';
import { ToastProvider } from './components/ui/Toast.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Einzelbenutzer-Anwendung: Die Daten ändern sich nur durch eigenes
      // Zutun, deshalb kein Nachladen beim Fensterwechsel.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root-Element nicht gefunden');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {/* Über allem außer dem Fehlerfang: Auch die Anmeldeseite und die
          ganzflächigen Zustände des AuthGate sollen im richtigen Modus
          stehen — sie erscheinen, bevor die Anwendung selbst da ist. */}
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {/* Über dem Router: Eine Meldung soll den Seitenwechsel überleben,
              den sie oft selbst ausgelöst hat — „Kunde gelöscht." erscheint
              erst, wenn die Kundenliste schon steht. */}
          <ToastProvider>
            <AuthGate>
              <RouterProvider router={router} />
            </AuthGate>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
