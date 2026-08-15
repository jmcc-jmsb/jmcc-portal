// ABOUTME: Channel list logic — grouping, unread totals, and message day separators.
// ABOUTME: Pure. What a caller may see is decided by RLS; this only decides how it is arranged.
import { montrealDayKey } from './time';

export const CHANNEL_TYPES = ['announcement', 'competition', 'team', 'group', 'dm'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export type Channel = {
  id: string;
  type: ChannelType;
  name: string | null;
  is_readonly: boolean;
  pinned_message_id: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_body: string | null;
};

export type Message = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

/**
 * The channel list, grouped in the order DESIGN_BRIEF §5.5 lists them.
 *
 * Fixed order rather than most-recent-first across the whole list: announcements
 * are the ones that carry a deadline, and a bus time sinking below three study
 * groups because they are chattier is how someone misses the bus.
 */
export function groupChannels(channels: Channel[]): { type: ChannelType; channels: Channel[] }[] {
  return CHANNEL_TYPES.map((type) => ({
    type,
    channels: channels
      .filter((c) => c.type === type)
      .sort((a, b) => {
        // Unread first inside a section, then most recent.
        if ((a.unread_count > 0) !== (b.unread_count > 0)) return a.unread_count > 0 ? -1 : 1;
        return Date.parse(b.last_message_at ?? '0') - Date.parse(a.last_message_at ?? '0');
      }),
  })).filter((section) => section.channels.length > 0);
}

/** The one number the nav badge shows. "No red dots everywhere" (§5.5). */
export function totalUnread(channels: Channel[]): number {
  return channels.reduce((sum, channel) => sum + channel.unread_count, 0);
}

/** A one-line preview, collapsed and clipped so a pasted paragraph cannot break the row. */
export function preview(body: string | null, limit = 80): string {
  if (!body) return '';
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/**
 * Messages split into day groups, oldest first.
 *
 * Grouped by the Montreal day so the separators match the rest of the app — a
 * delegate reading at 9pm in Vancouver should not see tomorrow's date over a
 * message everyone else considers today's.
 */
export function byDay<T extends Message>(messages: T[]): { key: string; messages: T[] }[] {
  const order = [...messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  // Generic so a caller that has already resolved author names keeps them —
  // narrowing to Message here would quietly strip the field the UI needs.
  const out: { key: string; messages: T[] }[] = [];
  for (const message of order) {
    const key = montrealDayKey(message.created_at);
    const last = out[out.length - 1];
    if (last && last.key === key) last.messages.push(message);
    else out.push({ key, messages: [message] });
  }
  return out;
}

/**
 * Whether this message should show its author, or continue the one above it.
 *
 * Consecutive messages from the same person within five minutes read as one
 * turn in a conversation; repeating the name on each is noise.
 */
export function startsRun<T extends Message>(messages: T[], index: number): boolean {
  if (index === 0) return true;
  const previous = messages[index - 1];
  const current = messages[index];
  if (previous.author_id !== current.author_id) return true;
  return Date.parse(current.created_at) - Date.parse(previous.created_at) > 5 * 60 * 1000;
}

/** A message the composer will not send: empty, or whitespace someone leaned on. */
export function isSendable(draft: string): boolean {
  return draft.trim().length > 0;
}

/** Whether this caller gets a composer at all. An announcement channel gives one only to exec. */
export function canPost(channel: Channel, isExecLike: boolean): boolean {
  return !channel.is_readonly || isExecLike;
}
