// ABOUTME: Feedback — a delegate's timeline and self-reflections, a coach's composer, an exec's coverage view.
// ABOUTME: Internal notes are absent from a delegate's data, not hidden in their UI. See migration 0006.
import { useState } from 'react';
import { useLocale, useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { RUBRIC_AXES, newestFirst, rubricAverage } from '../../lib/feedback';
import type { FeedbackNote, Rubric, RubricAxis } from '../../lib/feedback';
import { addNote, deleteNote, useCoachedDelegates, useCoverage, useNotes } from '../../lib/phase4Data';
import { useIsExecLike, useSession } from '../../lib/session';
import { formatDateTime } from '../../lib/time';

const AXIS_LABEL: Record<RubricAxis, TranslationKey> = {
  content: 'feedback.axisContent',
  delivery: 'feedback.axisDelivery',
  qa: 'feedback.axisQa',
  teamwork: 'feedback.axisTeamwork',
};

export default function Feedback() {
  const t = useT();
  const { session, roles } = useSession();
  const isExecLike = useIsExecLike();
  const isCoach = roles.includes('coach') || isExecLike;

  const [subject, setSubject] = useState<string | null>(null);
  const { notes, loading, reload } = useNotes(subject);

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <header>
        <h1 className="font-unbounded text-title font-bold text-primary">{t('nav.feedback')}</h1>
      </header>

      {isCoach && <CoachPanel subject={subject} onSubject={setSubject} onSaved={reload} />}

      {isExecLike && <Coverage />}

      {!subject && session && <SelfReflection userId={session.user.id} onSaved={reload} />}

      {loading && notes.length === 0 ? (
        <div role="status" aria-label={t('nav.feedback')} className="h-24 rounded-md bg-muted/15" />
      ) : notes.length === 0 ? (
        /* "An invitation, not an apology" (DESIGN_BRIEF §5.6). And deliberately
           the same sentence whether or not internal notes exist about this
           delegate — the empty state must not become a tell. */
        <p className="rounded-md border border-muted/20 bg-white px-4 py-3 text-body text-muted">
          {t('feedback.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {newestFirst(notes).map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              mine={note.author_id === session?.user.id}
              onDeleted={reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteCard({
  note,
  mine,
  onDeleted,
}: {
  note: FeedbackNote;
  mine: boolean;
  onDeleted: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const average = rubricAverage(note.rubric);

  return (
    <li
      className={[
        'rounded-md border bg-white p-3',
        note.visibility === 'internal' ? 'border-gold/50' : 'border-muted/20',
      ].join(' ')}
    >
      <p className="flex flex-wrap items-center gap-2 text-meta">
        <span className="font-bold uppercase tracking-widest text-primary">
          {t(
            note.note_type === 'self_reflection'
              ? 'feedback.selfReflection'
              : note.visibility === 'internal'
                ? 'feedback.internal'
                : 'feedback.fromCoach',
          )}
        </span>
        <span className="text-muted">{formatDateTime(note.created_at, locale)}</span>
      </p>

      <p className="mt-1.5 whitespace-pre-wrap text-body leading-relaxed text-ink">{note.body}</p>

      {note.rubric && (
        <dl className="mt-2 flex flex-col gap-1">
          {RUBRIC_AXES.filter((axis) => typeof note.rubric?.[axis] === 'number').map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <dt className="w-20 flex-none text-meta text-muted">{t(AXIS_LABEL[axis])}</dt>
              <dd className="flex items-center gap-1">
                {/* Dots rather than a number alone: five of them read at a glance
                    and survive being printed in monochrome. */}
                <span aria-hidden="true" className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <span
                      key={step}
                      className={[
                        'size-2 rounded-full',
                        step <= (note.rubric?.[axis] ?? 0) ? 'bg-primary' : 'bg-muted/25',
                      ].join(' ')}
                    />
                  ))}
                </span>
                <span className="text-meta font-semibold text-ink">{note.rubric?.[axis]}/5</span>
              </dd>
            </div>
          ))}
          {average !== null && (
            <p className="mt-0.5 text-meta text-muted">{t('feedback.average', { n: average })}</p>
          )}
        </dl>
      )}

      {mine && (
        <button
          type="button"
          onClick={async () => {
            await deleteNote(note.id);
            onDeleted();
          }}
          className="mt-2 min-h-11 text-meta font-semibold text-muted"
        >
          {t('common.delete')}
        </button>
      )}
    </li>
  );
}

function CoachPanel({
  subject,
  onSubject,
  onSaved,
}: {
  subject: string | null;
  onSubject: (id: string | null) => void;
  onSaved: () => void;
}) {
  const t = useT();
  const { session } = useSession();
  const { delegates } = useCoachedDelegates();

  const [body, setBody] = useState('');
  const [rubric, setRubric] = useState<Rubric>({});
  const [visibility, setVisibility] = useState<'shared' | 'internal'>('shared');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!subject || !body.trim() || !session) return;
    setBusy(true);
    setError(null);
    const message = await addNote({
      authorId: session.user.id,
      subjectUserId: subject,
      noteType: 'coach_note',
      body: body.trim(),
      rubric,
      visibility,
    });
    setBusy(false);
    if (message) setError(message);
    else {
      setBody('');
      setRubric({});
      onSaved();
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-muted/20 bg-white p-3">
      <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
        {t('feedback.newNote')}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-meta font-bold uppercase tracking-widest text-muted">
          {t('feedback.delegate')}
        </span>
        <select
          value={subject ?? ''}
          onChange={(event) => onSubject(event.target.value || null)}
          className="min-h-11 rounded-sm border border-muted/30 px-3 text-body"
        >
          <option value="">{t('feedback.allNotes')}</option>
          {delegates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.preferred_name ?? person.full_name}
            </option>
          ))}
        </select>
      </label>

      {subject && (
        <>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder={t('feedback.placeholder')}
            aria-label={t('feedback.newNote')}
            className="w-full rounded-sm border border-muted/30 px-3 py-2 text-body"
          />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-meta font-bold uppercase tracking-widest text-muted">
              {t('feedback.rubric')}
            </legend>
            {RUBRIC_AXES.map((axis) => (
              <div key={axis} className="flex items-center gap-2">
                <span className="w-20 flex-none text-meta text-muted">{t(AXIS_LABEL[axis])}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      aria-label={`${t(AXIS_LABEL[axis])} ${score}`}
                      aria-pressed={rubric[axis] === score}
                      onClick={() =>
                        setRubric((held) => ({ ...held, [axis]: held[axis] === score ? undefined : score }))
                      }
                      className={[
                        'size-9 rounded-xs text-meta font-bold',
                        rubric[axis] === score
                          ? 'bg-primary text-cream'
                          : 'border border-muted/30 bg-white text-muted',
                      ].join(' ')}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          {/* The visibility choice is the whole reason this table has a policy.
              Stated plainly rather than as a checkbox someone misreads. */}
          <fieldset className="flex flex-col gap-1">
            <legend className="text-meta font-bold uppercase tracking-widest text-muted">
              {t('feedback.visibility')}
            </legend>
            <label className="flex min-h-11 items-center gap-2 text-body">
              <input
                type="radio"
                checked={visibility === 'shared'}
                onChange={() => setVisibility('shared')}
              />
              {t('feedback.visShared')}
            </label>
            <label className="flex min-h-11 items-center gap-2 text-body">
              <input
                type="radio"
                checked={visibility === 'internal'}
                onChange={() => setVisibility('internal')}
              />
              {t('feedback.visInternal')}
            </label>
          </fieldset>

          {error && <p role="alert" className="field-error text-body text-danger">{error}</p>}

          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={save}
            className="min-h-11 rounded-sm bg-primary px-4 text-body font-bold text-cream disabled:opacity-50"
          >
            {t('feedback.save')}
          </button>
        </>
      )}
    </section>
  );
}

function SelfReflection({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const t = useT();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    // Always private, and the database refuses anything else via a check
    // constraint — so this is not the only thing standing between a private
    // thought and a coach reading it.
    await addNote({
      authorId: userId,
      subjectUserId: userId,
      noteType: 'self_reflection',
      body: body.trim(),
      rubric: null,
      visibility: 'private',
    });
    setBody('');
    setBusy(false);
    onSaved();
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-muted/20 bg-white p-3">
      <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
        {t('feedback.selfReflection')}
      </h2>
      <p className="text-meta text-muted">{t('feedback.selfExplain')}</p>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        aria-label={t('feedback.selfReflection')}
        className="w-full rounded-sm border border-muted/30 px-3 py-2 text-body"
      />
      <button
        type="button"
        disabled={busy || !body.trim()}
        onClick={save}
        className="min-h-11 self-start rounded-sm bg-primary px-4 text-body font-semibold text-cream disabled:opacity-50"
      >
        {t('feedback.saveReflection')}
      </button>
    </section>
  );
}

/** The exec aggregate: who has been missed. Counts only — never a body. */
function Coverage() {
  const t = useT();
  const { coverage } = useCoverage();

  if (coverage.length === 0) return null;
  const missing = coverage.filter((row) => row.note_count === 0);

  return (
    <section className="flex flex-col gap-2 rounded-md border border-muted/20 bg-white p-3">
      <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
        {t('feedback.coverage')}
      </h2>
      <p className="text-body text-muted">
        {t('feedback.coverageCount', { missing: missing.length, total: coverage.length })}
      </p>
      {missing.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {missing.slice(0, 20).map((row) => (
            <li
              key={row.user_id}
              className="rounded-xs bg-gold/20 px-2 py-1 text-meta font-semibold text-ink-800"
            >
              {row.display_name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
