// ABOUTME: Roster CSV import — preview locally, then send. Problems come back with line numbers.
// ABOUTME: Parsed client-side first so a malformed spreadsheet is caught before 120 accounts are created.
import { useState } from 'react';
import { useT } from '../../i18n';
import { readRoster } from '../../../lib/csv';
import type { RosterProblem, RosterRow } from '../../../lib/csv';

export default function Import() {
  const t = useT();

  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ rows: RosterRow[]; problems: RosterProblem[] } | null>(null);
  const [result, setResult] = useState<{ imported: number; problems: RosterProblem[] } | null>(null);
  const [busy, setBusy] = useState(false);

  function read(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      setText(content);
      // The same parser the server uses. Previewing with a different one would
      // mean the preview could disagree with the import, which is worse than no
      // preview at all.
      setPreview(readRoster(content));
      setResult(null);
    };
    reader.readAsText(file);
  }

  async function send() {
    setBusy(true);
    const res = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: text,
    });
    const body = (await res.json().catch(() => ({}))) as { imported?: number; problems?: RosterProblem[] };
    setBusy(false);
    setResult({ imported: body.imported ?? 0, problems: body.problems ?? [] });
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="text-body text-muted">{t('admin.importHelp')}</p>
      <code className="rounded-sm bg-white px-3 py-2 text-meta text-ink">
        email,full_name,preferred_name,role,team
      </code>

      <label className="flex flex-col gap-1">
        <span className="text-meta font-bold uppercase tracking-widest text-muted">
          {t('admin.chooseCsv')}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) read(file);
          }}
          className="min-h-11 text-body"
        />
      </label>

      {preview && (
        <div className="rounded-sm border border-muted/20 bg-white p-3">
          <p className="text-body font-semibold text-ink">
            {t('admin.previewCount', { rows: preview.rows.length, problems: preview.problems.length })}
          </p>

          {preview.problems.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {preview.problems.slice(0, 20).map((problem) => (
                <li key={`${problem.line}-${problem.reason}`} className="text-meta text-danger">
                  {t('admin.lineProblem', { line: problem.line, reason: problem.reason })}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={busy || preview.rows.length === 0}
            onClick={send}
            className="mt-3 min-h-11 rounded-sm bg-primary px-4 text-body font-bold text-cream disabled:opacity-50"
          >
            {busy ? t('admin.importing') : t('admin.importNow', { n: preview.rows.length })}
          </button>
        </div>
      )}

      {result && (
        <div role="status" className="rounded-sm border border-success/40 bg-success/10 p-3">
          <p className="text-body font-semibold text-ink">
            {t('admin.imported', { n: result.imported })}
          </p>
          {/* Rows the server could not use, including teams that did not exist.
              Reported rather than swallowed: silently importing someone without
              their team is how half a roster turns out to be unassigned in
              January. */}
          {result.problems.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {result.problems.map((problem) => (
                <li key={`${problem.line}-${problem.reason}`} className="text-meta text-ink-800">
                  {t('admin.lineProblem', { line: problem.line, reason: problem.reason })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
