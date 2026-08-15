// ABOUTME: The executive matrix — delegates down, templates across, status in the cell.
// ABOUTME: Built for 120 × 5 on a phone: condensed cells, a sticky name column, and one scroll container.
import { useMemo, useState } from 'react';
import { useLocale, useT } from '../../i18n';
import type { DocumentAssignment, DocumentStatus } from '../../lib/feedback';
import type { DocumentTemplate } from '../../lib/phase4Data';
import { useCoachedDelegates } from '../../lib/phase4Data';

type Row = DocumentAssignment & { user_id: string; template_id: string };

const GLYPH: Record<DocumentStatus, string> = {
  not_started: '·',
  in_progress: '◔',
  signed: '✓',
};

const TONE: Record<DocumentStatus, string> = {
  not_started: 'bg-muted/10 text-muted',
  in_progress: 'bg-gold/20 text-ink-800',
  signed: 'bg-success/15 text-success',
};

export default function ExecMatrix({
  assignments,
  templates,
}: {
  assignments: Row[];
  templates: DocumentTemplate[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const { delegates } = useCoachedDelegates();

  const [outstandingFirst, setOutstandingFirst] = useState(true);
  const [detail, setDetail] = useState<{ name: string; template: string; status: DocumentStatus } | null>(null);

  const byUser = useMemo(() => {
    const map = new Map<string, Map<string, DocumentStatus>>();
    for (const row of assignments) {
      const held = map.get(row.user_id) ?? new Map<string, DocumentStatus>();
      held.set(row.template_id, row.status);
      map.set(row.user_id, held);
    }
    return map;
  }, [assignments]);

  const rows = useMemo(() => {
    const people = delegates
      .filter((person) => byUser.has(person.id))
      .map((person) => {
        const cells = byUser.get(person.id)!;
        const outstanding = [...cells.values()].filter((s) => s !== 'signed').length;
        return { person, cells, outstanding };
      });

    // Sorted by outstanding count by default (DESIGN_BRIEF §5.3): the useful
    // question is who still owes something, and on 120 rows that has to be the
    // top of the list rather than something you scroll for.
    return outstandingFirst
      ? [...people].sort((a, b) => b.outstanding - a.outstanding)
      : people;
  }, [delegates, byUser, outstandingFirst]);

  if (templates.length === 0 || rows.length === 0) return null;

  const templateName = (template: DocumentTemplate) =>
    locale.startsWith('fr') ? template.name_fr : template.name_en;

  function exportCsv() {
    const header = ['name', ...templates.map(templateName)];
    const body = rows.map((row) => [
      row.person.preferred_name ?? row.person.full_name,
      ...templates.map((template) => row.cells.get(template.id) ?? ''),
    ]);
    // Quote everything: a delegate called "Tremblay, Marie" would otherwise
    // become two columns and silently shift the whole row.
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'documents.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
          {t('documents.matrix')}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={outstandingFirst}
            onClick={() => setOutstandingFirst((held) => !held)}
            className="min-h-11 rounded-sm border border-muted/30 px-3 text-meta font-semibold text-ink"
          >
            {t('documents.sortOutstanding')}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="min-h-11 rounded-sm border border-primary px-3 text-meta font-semibold text-primary"
          >
            {t('documents.exportCsv')}
          </button>
        </div>
      </div>

      {/* One scroll container, and the name column pinned inside it. Without the
          pin, a 5-column matrix on a 390px screen scrolls the names out of view
          and every cell becomes unattributable. */}
      <div className="overflow-x-auto rounded-md border border-muted/20 bg-white">
        <table className="w-full border-collapse text-meta">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-bold uppercase tracking-wide text-muted"
              >
                {t('documents.delegate')}
              </th>
              {templates.map((template) => (
                <th
                  key={template.id}
                  scope="col"
                  className="px-1 py-2 text-center font-bold uppercase tracking-wide text-muted"
                >
                  {/* Vertical headers would be unreadable at this size; a short
                      code with the full name in `title` keeps the columns narrow
                      enough that five fit without scrolling on most phones. */}
                  <abbr title={templateName(template)} className="no-underline">
                    {templateName(template).slice(0, 4)}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ person, cells, outstanding }) => (
              <tr key={person.id} className="border-t border-muted/15">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-32 truncate bg-white px-2 py-1.5 text-left font-semibold text-ink"
                >
                  {person.preferred_name ?? person.full_name}
                  {outstanding > 0 && (
                    <span className="ml-1 font-normal text-muted">({outstanding})</span>
                  )}
                </th>
                {templates.map((template) => {
                  const status = cells.get(template.id);
                  return (
                    <td key={template.id} className="px-1 py-1.5 text-center">
                      {status ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDetail({
                              name: person.preferred_name ?? person.full_name,
                              template: templateName(template),
                              status,
                            })
                          }
                          aria-label={`${person.full_name}, ${templateName(template)}, ${status}`}
                          className={[
                            'grid size-7 place-items-center rounded-xs font-bold',
                            TONE[status],
                          ].join(' ')}
                        >
                          <span aria-hidden="true">{GLYPH[status]}</span>
                        </button>
                      ) : (
                        <span aria-hidden="true" className="text-muted/40">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The tap detail the brief asks for: a condensed cell has to be able to
          say what it means. */}
      {detail && (
        <p role="status" className="rounded-sm border border-muted/20 bg-cream px-3 py-2 text-body text-ink">
          {detail.name} · {detail.template} · {t(`documents.${detail.status === 'not_started' ? 'notStarted' : detail.status === 'in_progress' ? 'inProgress' : 'signed'}` as const)}
        </p>
      )}
    </section>
  );
}
