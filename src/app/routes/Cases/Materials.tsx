// ABOUTME: The materials list once a case is open — case, exhibits, data, rubric.
// ABOUTME: Links are short-lived signed URLs; nothing here is addressable without the server.
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { formatBytes } from '../../lib/caseState';
import type { Material } from '../../lib/vaultData';

const KIND_LABEL: Record<string, TranslationKey> = {
  case: 'vault.kindCase',
  exhibit: 'vault.kindExhibit',
  data: 'vault.kindData',
  rubric: 'vault.kindRubric',
};

export default function Materials({ materials }: { materials: Material[] }) {
  const t = useT();

  if (materials.length === 0) {
    return <p className="text-body text-muted">{t('vault.noMaterials')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {materials.map((material) => (
        <li key={material.id}>
          <a
            href={material.url}
            target="_blank"
            rel="noopener"
            className="flex min-h-11 items-center gap-3 rounded-sm border border-muted/20 bg-white px-3 py-2"
          >
            <span
              aria-hidden="true"
              className="grid size-9 flex-none place-items-center rounded-xs bg-primary/10 text-meta font-bold uppercase text-primary"
            >
              {material.filename.split('.').pop()?.slice(0, 4)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold text-ink">
                {material.filename}
              </span>
              <span className="block text-meta text-muted">
                {t(KIND_LABEL[material.kind] ?? 'vault.kindExhibit')}
                {material.sizeBytes ? ` · ${formatBytes(material.sizeBytes)}` : ''}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
