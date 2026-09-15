import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LOGO_ACCEPT_ATTRIBUTE,
  LOGO_MAX_BYTES,
  LOGO_RECOMMENDED_MIN_WIDTH_PX,
  formatBytes,
  type CompanyResponse,
} from '@privatura/shared';
import { ApiRequestError, apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { Button } from '../../../components/ui/Button.js';

interface LogoUploadProps {
  logoUrl: string | null;
}

export function LogoUpload({ logoUrl }: LogoUploadProps): JSX.Element {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lowResolution, setLowResolution] = useState(false);

  const applyResult = (company: CompanyResponse): void => {
    queryClient.setQueryData(queryKeys.company, company);
  };

  const upload = useMutation({
    mutationFn: (file: File) => apiClient.upload<CompanyResponse>('/company/logo', file),
    onSuccess: applyResult,
    onError: (cause: unknown) => {
      setError(cause instanceof ApiRequestError ? cause.message : 'Der Upload ist fehlgeschlagen.');
    },
  });

  const remove = useMutation({
    mutationFn: () => apiClient.delete<CompanyResponse>('/company/logo'),
    onSuccess: (company) => {
      applyResult(company);
      setLowResolution(false);
    },
  });

  const handleFile = (file: File): void => {
    setError(null);
    setLowResolution(false);

    // Größe schon hier prüfen: Eine 8-MB-Datei erst hochzuladen, um dann
    // eine Absage zu bekommen, ist unnötig langsam. Der Server prüft
    // trotzdem noch einmal — die Prüfung hier ist Bequemlichkeit, keine
    // Absicherung.
    if (file.size > LOGO_MAX_BYTES) {
      setError(
        `Die Datei ist ${formatBytes(file.size)} groß, erlaubt sind höchstens ${formatBytes(LOGO_MAX_BYTES)}.`,
      );
      return;
    }

    upload.mutate(file);
  };

  return (
    <div>
      <div className="flex items-start gap-5">
        {/*
         * Diese Fläche bleibt in jedem Modus hell, und das ist Absicht:
         * Firmenlogos sind meist dunkle Tinte auf durchsichtigem Grund. Auf
         * einer dunklen Platte verschwänden sie — und das Logo soll hier so
         * aussehen wie später auf dem weißen Blatt der Rechnung.
         */}
        <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong bg-white">
          {logoUrl === null ? (
            <span className="text-xs text-slate-400">kein Logo</span>
          ) : (
            <img
              src={logoUrl}
              alt="Aktuelles Logo"
              className="max-h-20 max-w-36 object-contain"
              onLoad={(event) => {
                // Ein zu kleines Logo wird im PDF sichtbar unscharf. Das
                // fällt sonst erst auf der fertigen Rechnung auf.
                setLowResolution(event.currentTarget.naturalWidth < LOGO_RECOMMENDED_MIN_WIDTH_PX);
              }}
            />
          )}
        </div>

        <div className="min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept={LOGO_ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) handleFile(file);
              // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
              event.target.value = '';
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending
                ? 'wird hochgeladen …'
                : logoUrl === null
                  ? 'Logo wählen'
                  : 'Logo ersetzen'}
            </Button>
            {logoUrl !== null && (
              <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Entfernen
              </Button>
            )}
          </div>

          <p className="mt-2 text-sm text-ink-subtle">
            PNG, JPEG oder WebP, höchstens {formatBytes(LOGO_MAX_BYTES)}. Für scharfen Druck
            mindestens {LOGO_RECOMMENDED_MIN_WIDTH_PX} px breit.
          </p>

          {lowResolution && error === null && (
            <p className="mt-1 text-sm text-attention-ink">
              Das Logo ist schmaler als {LOGO_RECOMMENDED_MIN_WIDTH_PX} px und wird im PDF
              wahrscheinlich unscharf.
            </p>
          )}
          {error !== null && (
            <p role="alert" className="mt-1 text-sm text-danger-strong">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
