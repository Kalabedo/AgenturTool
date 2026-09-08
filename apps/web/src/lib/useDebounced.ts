import { useEffect, useState } from 'react';

/**
 * Verzögert einen Wert, damit nicht jeder Tastendruck eine Anfrage auslöst.
 *
 * Ohne das schickt eine Suche nach "Beispiel" acht Anfragen los, von denen
 * sieben verworfen werden — und deren Antworten je nach Laufzeit in
 * beliebiger Reihenfolge eintreffen.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
