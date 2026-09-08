import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router.js';
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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
