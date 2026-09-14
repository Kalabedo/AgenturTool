import { Link } from 'react-router-dom';
import {
  DESIGN_SAMPLE_INVOICE,
  DESIGN_SAMPLE_LOGO,
  TEMPLATE_FONT_FAMILY_VALUES,
  templateSnapshotFromSettings,
  updateTemplateSettingsSchema,
  type CompanyResponse,
  type TemplateFontFamily,
  type TemplateKey,
  type TemplateSettingsResponse,
  type UpdateTemplateSettingsPayload,
} from '@agentur-tool/shared';
import { Field } from '../../../components/ui/Field.js';
import { Select } from '../../../components/ui/Select.js';
import { ColorField } from '../../design/ColorField.js';
import { DesignPicker } from '../../design/DesignPicker.js';
import { LogoUpload } from '../../settings/company/LogoUpload.js';

/** Die drei Regler, die in der Einrichtung überhaupt vorkommen. */
export interface AppearanceChoice {
  templateKey: TemplateKey;
  accentColor: string;
  fontFamily: TemplateFontFamily;
}

export function appearanceOf(settings: TemplateSettingsResponse): AppearanceChoice {
  return {
    templateKey: settings.templateKey,
    accentColor: settings.accentColor,
    fontFamily: settings.fontFamily,
  };
}

/**
 * Die drei gewählten Werte auf den vollständigen Datensatz legen.
 *
 * Der Endpunkt nimmt die Darstellungseinstellungen als Ganzes — er ersetzt,
 * was dasteht. Die übrigen Regler kommen deshalb unverändert aus der
 * geladenen Antwort zurück, statt auf ihre Vorgaben zurückzufallen.
 */
export function toTemplateSettingsPayload(
  stored: TemplateSettingsResponse,
  choice: AppearanceChoice,
): UpdateTemplateSettingsPayload {
  return updateTemplateSettingsSchema.parse({ ...stored, ...choice });
}

interface AppearanceFieldsProps {
  company: CompanyResponse;
  stored: TemplateSettingsResponse;
  choice: AppearanceChoice;
  onChoiceChange: (choice: AppearanceChoice) => void;
}

/**
 * Logo und Aussehen, auf das Nötigste gekürzt.
 *
 * Der vollständige Rechnungsdesigner hat gute Gründe für jeden seiner
 * Regler — aber nicht am ersten Tag. Hier stehen die drei Entscheidungen,
 * die das Blatt erkennbar verändern; der Rest ist einen Klick entfernt und
 * läuft niemandem davon.
 *
 * Die Farbe wird nicht auf einen ungültigen Wert geprüft, während jemand
 * tippt: Die Miniaturen ignorieren Unsinn im CSS von selbst, und eine
 * Vorschau, die beim Tippen verschwindet, wäre schlimmer als eine, die
 * kurz nichts Besonderes zeigt. Beanstandet wird der Wert beim Speichern.
 */
export function AppearanceFields({
  company,
  stored,
  choice,
  onChoiceChange,
}: AppearanceFieldsProps): JSX.Element {
  const preview = templateSnapshotFromSettings({ ...stored, ...choice });

  const sample = {
    ...DESIGN_SAMPLE_INVOICE,
    // Das eigene Logo, sobald es eines gibt — sonst ein neutrales.
    logoSrc: company.logoUrl ?? DESIGN_SAMPLE_LOGO,
    // Drei Positionen genügen in der Miniatur; mehr wären ohnehin nicht zu
    // unterscheiden.
    items: DESIGN_SAMPLE_INVOICE.items.slice(0, 3),
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-ink-muted">Logo</h3>
        <p className="mt-0.5 text-sm text-ink-subtle">
          Erscheint im Kopf der Rechnung. Ohne Logo bleibt dort der Firmenname stehen.
        </p>
        <div className="mt-3">
          <LogoUpload logoUrl={company.logoUrl} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ColorField
            label="Akzentfarbe"
            hint="Überschriften, Linien und Summenzeile."
            value={choice.accentColor}
            fallback={stored.accentColor}
            onChange={(accentColor) => onChoiceChange({ ...choice, accentColor })}
          />

          <Field
            label="Schrift"
            htmlFor="fontFamily"
            hint="Beide Schriften liegen im Programm; gedruckt wird ohne Netz."
          >
            <Select
              id="fontFamily"
              value={choice.fontFamily}
              onChange={(event) =>
                onChoiceChange({
                  ...choice,
                  fontFamily: event.target.value as TemplateFontFamily,
                })
              }
            >
              {TEMPLATE_FONT_FAMILY_VALUES.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <p className="text-sm font-medium text-ink-muted">Vorlage</p>
          <p className="mt-0.5 text-sm text-ink-subtle">Vier Aufbauten, dieselben Angaben.</p>
          <div className="mt-3">
            <DesignPicker
              value={choice.templateKey}
              onChange={(templateKey) =>
                onChoiceChange({ ...choice, templateKey: templateKey as TemplateKey })
              }
              sample={sample}
              template={preview}
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-ink-subtle">
        Feinheiten — weitere Farben, Zeilendichte, Fußzeile und Standardtexte — stehen unter{' '}
        <Link to="/design" className="underline">
          Design
        </Link>
        .
      </p>
    </div>
  );
}
