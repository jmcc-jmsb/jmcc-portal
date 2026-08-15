// ABOUTME: Tasks — grouped Overdue / Today / This week / Later / Done, with system tasks locked.
// ABOUTME: A system task can be completed but never deleted; the policy enforces it, this stops offering the button.
import { useState } from 'react';
import { useLocale, useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { TASK_GROUPS, canDelete, groupTasks, outstandingCount } from '../../lib/tasks';
import type { Task, TaskGroup } from '../../lib/tasks';
import { addTask, deleteTask, setTaskDone, useTasks } from '../../lib/phase3Data';
import { useSession } from '../../lib/session';
import { useServerNow } from '../../lib/serverTime';
import { formatDayLabel, montrealDayKey, montrealLocalToIso } from '../../lib/time';

const GROUP_LABEL: Record<TaskGroup, TranslationKey> = {
  overdue: 'tasks.overdue',
  today: 'tasks.today',
  week: 'tasks.week',
  later: 'tasks.later',
  done: 'tasks.done',
};

const SOURCE_LABEL: Record<Task['source'], TranslationKey> = {
  auto: 'tasks.sourceAuto',
  exec: 'tasks.sourceExec',
  coach: 'tasks.sourceCoach',
  self: 'tasks.sourceSelf',
};

export default function Tasks() {
  const t = useT();
  const { session } = useSession();
  const { now } = useServerNow(60_000);
  const { tasks, loading, reload } = useTasks();

  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  const grouped = groupTasks(tasks, now);
  const outstanding = outstandingCount(tasks);

  async function add() {
    if (!title.trim() || !session) return;
    setBusy(true);
    await addTask(session.user.id, title.trim(), due ? montrealLocalToIso(due) : null);
    setTitle('');
    setDue('');
    setBusy(false);
    reload();
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <header>
        <h1 className="font-unbounded text-title font-bold text-primary">{t('nav.tasks')}</h1>
        <p className="mt-1 text-body text-muted">{t('tasks.outstanding', { n: outstanding })}</p>
      </header>

      {/* Delegates add their own freely (DESIGN_BRIEF §5.4). Assigning downward
          is an exec and coach flow and lands with the admin console in Phase 7 —
          the policy for it is already in migration 0005. */}
      <section className="flex flex-col gap-2 rounded-md border border-muted/20 bg-white p-3">
        <label className="flex flex-col gap-1">
          <span className="text-meta font-bold uppercase tracking-widest text-muted">
            {t('tasks.addLabel')}
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('tasks.addPlaceholder')}
            className="min-h-11 rounded-sm border border-muted/30 px-3 text-body"
          />
        </label>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={due}
            onChange={(event) => setDue(event.target.value)}
            aria-label={t('tasks.dueLabel')}
            className="min-h-11 flex-1 rounded-sm border border-muted/30 px-3 text-body"
          />
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={add}
            className="min-h-11 rounded-sm bg-primary px-4 text-body font-semibold text-cream disabled:opacity-50"
          >
            {t('tasks.add')}
          </button>
        </div>
      </section>

      {loading && tasks.length === 0 && (
        <div role="status" aria-label={t('nav.tasks')} className="h-24 rounded-md bg-muted/15" />
      )}

      {!loading && tasks.length === 0 && (
        <p className="text-body text-muted">{t('tasks.none')}</p>
      )}

      {TASK_GROUPS.filter((group) => grouped[group].length > 0).map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h2
            className={[
              'text-meta font-bold uppercase tracking-widest',
              group === 'overdue' ? 'text-danger' : 'text-primary',
            ].join(' ')}
          >
            {t(GROUP_LABEL[group])}
          </h2>
          <ul className="flex flex-col gap-2">
            {grouped[group].map((item) => (
              <TaskRow key={item.id} task={item} onChanged={reload} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TaskRow({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);

  const done = Boolean(task.completed_at);

  async function toggle() {
    setBusy(true);
    await setTaskDone(task.id, !done);
    setBusy(false);
    onChanged();
  }

  async function remove() {
    setBusy(true);
    await deleteTask(task.id);
    setBusy(false);
    onChanged();
  }

  return (
    <li className="flex items-start gap-3 rounded-sm border border-muted/20 bg-white px-3 py-2.5">
      {/* "Completion should feel good — a single crisp micro-interaction, gold
          check on maroon. One moment, not a confetti storm." (§5.4) */}
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        disabled={busy}
        onClick={toggle}
        className={[
          'mt-0.5 grid size-6 flex-none place-items-center rounded-xs border-2 transition-colors',
          done ? 'border-primary bg-primary' : 'border-muted/40 bg-white',
        ].join(' ')}
      >
        {done && <span aria-hidden="true" className="text-meta font-bold leading-none text-gold">✓</span>}
      </button>

      <div className="min-w-0 flex-1">
        <p className={['text-body', done ? 'text-muted line-through' : 'font-semibold text-ink'].join(' ')}>
          {task.title}
        </p>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-meta text-muted">
          <span className="rounded-xs bg-muted/15 px-1.5 py-0.5 font-semibold uppercase tracking-wide">
            {t(SOURCE_LABEL[task.source])}
          </span>
          {task.due_at && <span>{formatDayLabel(montrealDayKey(task.due_at), locale)}</span>}
          {/* Says why there is no delete, rather than leaving a missing button
              to look like a bug. */}
          {task.is_system && <span className="font-semibold">{t('tasks.locked')}</span>}
        </p>
      </div>

      {canDelete(task) && (
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          aria-label={t('tasks.delete', { title: task.title })}
          className="min-h-11 flex-none px-2 text-meta font-semibold text-muted"
        >
          {t('tasks.deleteShort')}
        </button>
      )}
    </li>
  );
}
