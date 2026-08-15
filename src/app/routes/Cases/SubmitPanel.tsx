// ABOUTME: Upload, version history, and live team state — states 3 and 4 of the vault.
// ABOUTME: Any team member may submit, so the panel's job is to stop two of them racing at minute 58.
import { useRef, useState } from 'react';
import { useLocale, useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { formatBytes, formatCaseDateTime, formatRelative } from '../../lib/caseState';
import {
  ALLOWED_SUBMISSION_EXTENSIONS,
  MAX_SUBMISSION_FILES,
  MAX_SUBMISSION_FILE_BYTES,
  rejectSubmissionFile,
} from '../../../lib/limits';
import type { Submission } from '../../lib/vaultData';

/* Every refusal the server can return, mapped to a sentence. Anything unlisted
   falls back rather than rendering a raw code at someone against a deadline. */
const SUBMIT_ERRORS: Record<string, TranslationKey> = {
  not_open: 'vault.submitError.notOpen',
  closed: 'vault.submitError.closed',
  not_on_a_team: 'vault.submitError.notOnATeam',
  no_files: 'vault.submitError.noFiles',
  too_many_files: 'vault.submitError.tooMany',
  file_type: 'vault.reject.type',
  file_size: 'vault.reject.size',
  file_empty: 'vault.reject.empty',
  version_conflict: 'vault.submitError.conflict',
  unauthenticated: 'vault.submitError.signedOut',
};

const REJECTIONS: Record<'type' | 'size' | 'empty', TranslationKey> = {
  type: 'vault.reject.type',
  size: 'vault.reject.size',
  empty: 'vault.reject.empty',
};

type Props = {
  caseId: string;
  submissions: Submission[];
  now: number;
  /** False once the window closes: history stays, the form goes. */
  open: boolean;
  onSubmitted: () => void;
};

export default function SubmitPanel({ caseId, submissions, now, open, onSubmitted }: Props) {
  const t = useT();
  const { locale } = useLocale();

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const latest = submissions[0] ?? null;

  function accept(incoming: FileList | null) {
    if (!incoming) return;
    const next = Array.from(incoming).slice(0, MAX_SUBMISSION_FILES);

    // Rejected here for the message, and again on the server for the outcome.
    // The client copy exists so a 90MB file fails in a second rather than after
    // a five-minute upload on a phone.
    for (const file of next) {
      const reason = rejectSubmissionFile(file);
      if (reason) {
        setError(t(REJECTIONS[reason], { name: file.name }));
        return;
      }
    }
    setError(null);
    setFiles(next);
  }

  async function submit() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);

    const body = new FormData();
    for (const file of files) body.append('files', file);

    try {
      const res = await fetch(`/api/cases/${caseId}/submit`, { method: 'POST', body });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        // HANDOFF §8: submissions never queue offline, they fail loudly. The
        // server's refusal is the truth even when the local countdown disagrees.
        setError(t(SUBMIT_ERRORS[detail.error ?? ''] ?? 'vault.submitError.unknown'));
        return;
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      onSubmitted();
    } catch {
      setError(t('vault.submitError.offline'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Live team state, first. Someone arriving at minute 58 needs to know a
          teammate already handed something in before they see an upload box. */}
      {latest && (
        <p className="rounded-sm border border-success/30 bg-success/10 px-3 py-2 text-body text-ink">
          {t('vault.lastSubmitted', {
            name: latest.submittedByName || t('vault.aTeammate'),
            file: latest.files[0]?.name ?? '',
            when: formatRelative(latest.submittedAt, now, locale),
          })}
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-3">
          <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
            {latest ? t('vault.resubmit') : t('vault.submit')}
          </h2>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              accept(event.dataTransfer.files);
            }}
            className={[
              'rounded-md border-2 border-dashed px-4 py-5 text-center',
              dragging ? 'border-primary bg-primary/5' : 'border-muted/30',
            ].join(' ')}
          >
            {/* One control, not two. An sr-only input behind a styled button
                puts both in the accessibility tree, so a screen reader announces
                the same action twice — found by reading the tree, invisible on
                screen. The native input is keyboard accessible and already
                labelled by the text below it. */}
            <label className="flex flex-col items-center gap-2">
              <span className="text-body font-semibold text-ink">{t('vault.chooseFiles')}</span>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="min-h-11 w-full text-body"
                onChange={(event) => accept(event.target.files)}
              />
            </label>
            <p className="mt-2 text-meta text-muted">{t('vault.dropHint')}</p>
            <p className="mt-1 text-meta text-muted">
              {t('vault.limits', {
                formats: ALLOWED_SUBMISSION_EXTENSIONS.join(', '),
                size: formatBytes(MAX_SUBMISSION_FILE_BYTES),
                count: MAX_SUBMISSION_FILES,
              })}
            </p>
          </div>

          {files.length > 0 && (
            <ul className="flex flex-col gap-1">
              {files.map((file) => (
                <li key={file.name} className="flex items-baseline justify-between gap-3 text-body">
                  <span className="min-w-0 truncate text-ink">{file.name}</span>
                  <span className="flex-none text-meta text-muted">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="field-error text-body text-danger">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy || files.length === 0}
            onClick={submit}
            className="min-h-11 rounded-sm bg-gold px-4 text-body font-bold text-ink disabled:opacity-50"
          >
            {busy ? t('vault.submitting') : t('vault.submitNow')}
          </button>

          <p className="text-meta leading-relaxed text-muted">{t('vault.policy')}</p>
        </div>
      )}

      {submissions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
            {t('vault.versions')}
          </h2>
          <ul className="flex flex-col gap-2">
            {submissions.map((submission) => (
              <li
                key={submission.version}
                className={[
                  'rounded-sm border px-3 py-2',
                  submission === latest ? 'border-gold bg-gold/10' : 'border-muted/20 bg-white',
                ].join(' ')}
              >
                <p className="flex items-baseline justify-between gap-2 text-body">
                  <span className="font-semibold text-ink">
                    {t('vault.version', { n: submission.version })}
                  </span>
                  {/* Which one counts, stated rather than implied by position. */}
                  {submission === latest && (
                    <span className="text-meta font-bold uppercase tracking-widest text-primary">
                      {t('vault.counts')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-meta text-muted">
                  {submission.submittedByName || t('vault.aTeammate')} ·{' '}
                  {formatCaseDateTime(submission.submittedAt, locale)}
                </p>
                <p className="mt-0.5 text-meta text-muted">
                  {submission.files.map((f) => f.name).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
