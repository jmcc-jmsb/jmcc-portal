// ABOUTME: Documents — a delegate's signing checklist, and the executive matrix over everyone.
// ABOUTME: Roles differ by density, not layout (DESIGN_BRIEF §2): same screen, one more table.
import { useState } from 'react';
import { useLocale, useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { documentOrder, documentProgress } from '../../lib/feedback';
import type { DocumentAssignment, DocumentStatus } from '../../lib/feedback';
import { useAssignments, useTemplates, signedPdfUrl } from '../../lib/phase4Data';
import { useIsExecLike, useSession } from '../../lib/session';
import { formatDayLabel, montrealDayKey } from '../../lib/time';
import SignPanel from './SignPanel';
import ExecMatrix from './ExecMatrix';

const STATUS_LABEL: Record<DocumentStatus, TranslationKey> = {
  not_started: 'documents.notStarted',
  in_progress: 'documents.inProgress',
  signed: 'documents.signed',
};

export default function Documents() {
  const t = useT();
  const { locale } = useLocale();
  const { session } = useSession();
  const isExecLike = useIsExecLike();

  const { templates } = useTemplates();
  const { assignments, loading, reload } = useAssignments();
  const [signing, setSigning] = useState<DocumentAssignment | null>(null);

  const mine = assignments.filter((a) => a.user_id === session?.user.id);
  const { label, percent } = documentProgress(
    mine.length,
    mine.filter((a) => a.status === 'signed').length,
  );

  const templateName = (id: string) => {
    const template = templates.find((x) => x.id === id);
    if (!template) return t('documents.untitled');
    return locale.startsWith('fr') ? template.name_fr : template.name_en;
  };

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <header>
        <h1 className="font-unbounded text-title font-bold text-primary">{t('nav.documents')}</h1>
        {mine.length > 0 && (
          <>
            <p className="mt-1 text-body text-muted">
              {t('documents.progress', { done: label })}
            </p>
            {/* A bar rather than a ring, and floored rather than rounded — 4 of 5
                showing as complete is how a waiver gets forgotten. */}
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('documents.progress', { done: label })}
              className="mt-2 h-2 overflow-hidden rounded-xs bg-muted/20"
            >
              <div className="h-full rounded-xs bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </>
        )}
      </header>

      {loading && assignments.length === 0 && (
        <div role="status" aria-label={t('nav.documents')} className="h-24 rounded-md bg-muted/15" />
      )}

      {!loading && mine.length === 0 && (
        <p className="text-body text-muted">{t('documents.none')}</p>
      )}

      {mine.length > 0 && (
        <ul className="flex flex-col gap-2">
          {documentOrder(mine).map((assignment) => (
            <li
              key={assignment.id}
              className="flex items-center gap-3 rounded-sm border border-muted/20 bg-white px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className={[
                  'grid size-7 flex-none place-items-center rounded-full text-meta font-bold',
                  assignment.status === 'signed'
                    ? 'bg-success/15 text-success'
                    : 'bg-muted/15 text-muted',
                ].join(' ')}
              >
                {assignment.status === 'signed' ? '✓' : '·'}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-ink">
                  {templateName(assignment.template_id)}
                </span>
                <span className="block text-meta text-muted">
                  {t(STATUS_LABEL[assignment.status])}
                  {assignment.due_at
                    ? ` · ${formatDayLabel(montrealDayKey(assignment.due_at), locale)}`
                    : ''}
                </span>
              </span>

              {assignment.status === 'signed' ? (
                <DownloadButton assignment={assignment} />
              ) : (
                <button
                  type="button"
                  onClick={() => setSigning(assignment)}
                  className="min-h-11 flex-none rounded-sm bg-primary px-3 text-body font-semibold text-cream"
                >
                  {t('documents.sign')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isExecLike && <ExecMatrix assignments={assignments} templates={templates} />}

      {signing && (
        <SignPanel
          assignment={signing}
          title={templateName(signing.template_id)}
          onClose={() => {
            setSigning(null);
            // The webhook is what actually marks it signed, and it may land a
            // moment after the panel closes. Re-reading on close is what makes
            // the row flip without a manual refresh.
            reload();
          }}
        />
      )}
    </div>
  );
}

function DownloadButton({ assignment }: { assignment: DocumentAssignment }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    const url = await signedPdfUrl(assignment.id);
    setBusy(false);
    // A new tab rather than a download attribute: the URL is short-lived and
    // cross-origin, and Safari ignores `download` on a cross-origin href anyway.
    if (url) window.open(url, '_blank', 'noopener');
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={open}
      className="min-h-11 flex-none rounded-sm border border-primary px-3 text-body font-semibold text-primary"
    >
      {t('documents.download')}
    </button>
  );
}
