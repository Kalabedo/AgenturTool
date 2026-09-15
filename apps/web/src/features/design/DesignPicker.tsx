import { buildRenderModel, embeddedFontCss, listTemplates } from '@privatura/invoice-template';
import type { TemplateSnapshot } from '@privatura/shared';
import { TemplateFrame } from '../../components/TemplateFrame.js';

interface DesignPickerProps {
  value: string;
  onChange: (key: string) => void;
  /** Die Musterrechnung, gekürzt — mit dem jeweiligen Design im Snapshot. */
  sample: Omit<Parameters<typeof buildRenderModel>[0], 'template'>;
  template: TemplateSnapshot;
}

/**
 * Die Auswahl des Designs, als vier Miniaturblätter.
 *
 * Lebendig gerendert und nicht als abgelegte Bilder: Ein Bild veraltet beim
 * ersten Umbau eines Designs, und niemand merkt es — man sieht ja ein Bild.
 * Die Miniaturen zeigen dieselbe Musterrechnung mit denselben Einstellungen,
 * nur je Design ein anderes; der Unterschied im Kasten ist genau der
 * Unterschied, den ein Klick bewirkt.
 *
 * Die Verkleinerung erledigt `TemplateFrame` von selbst: Es skaliert auf die
 * verfügbare Breite, und 160 px ergeben Maßstab 0,2 — genug, um den Aufbau
 * zu erkennen, zu wenig, um zu lesen. Das ist hier richtig so.
 */
export function DesignPicker({
  value,
  onChange,
  sample,
  template,
}: DesignPickerProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3">
      {listTemplates().map((design) => {
        const active = design.key === value;
        const model = buildRenderModel({
          ...sample,
          template: { ...template, templateKey: design.key },
        });

        return (
          <button
            key={design.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(design.key)}
            title={design.description}
            className={[
              'group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              active
                ? 'border-ink bg-surface-raised'
                : 'border-border bg-surface hover:border-border-strong',
            ].join(' ')}
          >
            {/*
             * `pointer-events-none`: Die Miniatur ist ein Bild, kein Blatt
             * zum Anfassen. Ohne das schluckte das iframe den Klick, der
             * eigentlich das Design wählen soll.
             */}
            <span className="pointer-events-none block">
              <TemplateFrame
                css={`
                  ${embeddedFontCss(template.fontFamily)}${design.css}
                `}
                title={`Miniatur: ${design.label}`}
              >
                {design.render(model)}
              </TemplateFrame>
            </span>

            <span className="block px-0.5">
              <span className="block text-sm font-medium text-ink">{design.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-subtle">
                {design.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
