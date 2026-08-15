// ABOUTME: Task grouping — Overdue / Today / This week / Later / Done, in Montreal days.
// ABOUTME: Pure; takes `now` so the buckets are testable and so no device clock decides what "today" is.
import { daysBetweenKeys, montrealDayKey } from './time';

export type Task = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  source: 'auto' | 'exec' | 'coach' | 'self';
  linked_type: 'case' | 'event' | 'document' | null;
  linked_id: string | null;
  is_system: boolean;
  completed_at: string | null;
};

export const TASK_GROUPS = ['overdue', 'today', 'week', 'later', 'done'] as const;
export type TaskGroup = (typeof TASK_GROUPS)[number];

/**
 * Which bucket a task belongs in.
 *
 * Overdue is measured in calendar days, not elapsed hours: a task due at 9am is
 * not "overdue" at 10am the same day, it is still today's problem. It turns over
 * at midnight in Montreal, which is when a delegate would say it slipped.
 *
 * A task with no due date is "later" rather than "today" — an undated task is
 * something you meant to do, not something you owe by tonight, and putting it in
 * Today makes Today untrustworthy.
 */
export function groupOf(task: Task, now: number): TaskGroup {
  if (task.completed_at) return 'done';
  if (!task.due_at) return 'later';

  const days = daysBetweenKeys(montrealDayKey(now), montrealDayKey(task.due_at));
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  return 'later';
}

export type GroupedTasks = Record<TaskGroup, Task[]>;

export function groupTasks(tasks: Task[], now: number): GroupedTasks {
  const out: GroupedTasks = { overdue: [], today: [], week: [], later: [], done: [] };
  for (const task of tasks) out[groupOf(task, now)].push(task);

  for (const group of TASK_GROUPS) {
    out[group].sort((a, b) => {
      if (group === 'done') {
        // Most recently finished first: the useful question about a done list is
        // "what did I just do", not "what did I do in September".
        return Date.parse(b.completed_at ?? '') - Date.parse(a.completed_at ?? '');
      }
      // Undated tasks sit below dated ones inside a group rather than sorting as
      // the epoch and floating to the top.
      if (!a.due_at) return b.due_at ? 1 : 0;
      if (!b.due_at) return -1;
      return Date.parse(a.due_at) - Date.parse(b.due_at);
    });
  }
  return out;
}

/** The count the screen leads with: what is actually outstanding. */
export function outstandingCount(tasks: Task[]): number {
  return tasks.filter((t) => !t.completed_at).length;
}

/**
 * Whether the delete affordance should exist at all.
 *
 * DESIGN_BRIEF §5.4: system tasks "can't be deleted, only completed — this keeps
 * waivers from vanishing". The policy in migration 0005 is what enforces it; this
 * is so the UI does not offer a button that would come back refused.
 */
export function canDelete(task: Task): boolean {
  return !task.is_system;
}
