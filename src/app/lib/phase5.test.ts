// ABOUTME: Unit tests for messaging logic — grouping, unread, day separators, message runs.
// ABOUTME: Ordering is the point: an announcement must not sink below a chatty study group.
import { describe, expect, it } from 'vitest';
import {
  byDay,
  canPost,
  groupChannels,
  isSendable,
  preview,
  startsRun,
  totalUnread,
} from './messaging';
import type { Channel, Message } from './messaging';

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'c1',
    type: 'team',
    name: 'Finance A',
    is_readonly: false,
    pinned_message_id: null,
    unread_count: 0,
    last_message_at: '2027-01-16T13:00:00Z',
    last_message_body: 'Hello',
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    channel_id: 'c1',
    author_id: 'a',
    body: 'Hello',
    created_at: '2027-01-16T13:00:00Z',
    edited_at: null,
    ...overrides,
  };
}

describe('groupChannels', () => {
  it('keeps the brief\'s section order regardless of recency', () => {
    // A bus time sinking below three study groups is how someone misses the bus.
    const sections = groupChannels([
      channel({ id: 'g', type: 'group', last_message_at: '2027-02-01T00:00:00Z' }),
      channel({ id: 'a', type: 'announcement', last_message_at: '2027-01-01T00:00:00Z' }),
      channel({ id: 'd', type: 'dm', last_message_at: '2027-03-01T00:00:00Z' }),
    ]);
    expect(sections.map((s) => s.type)).toEqual(['announcement', 'group', 'dm']);
  });

  it('omits sections with nothing in them', () => {
    const sections = groupChannels([channel({ type: 'team' })]);
    expect(sections.map((s) => s.type)).toEqual(['team']);
  });

  it('floats unread channels to the top of their own section', () => {
    const sections = groupChannels([
      channel({ id: 'quiet', type: 'team', last_message_at: '2027-03-01T00:00:00Z' }),
      channel({ id: 'unread', type: 'team', unread_count: 2, last_message_at: '2027-01-01T00:00:00Z' }),
    ]);
    expect(sections[0].channels.map((c) => c.id)).toEqual(['unread', 'quiet']);
  });

  it('puts a never-used channel last rather than first', () => {
    const sections = groupChannels([
      channel({ id: 'never', type: 'team', last_message_at: null }),
      channel({ id: 'used', type: 'team', last_message_at: '2027-01-01T00:00:00Z' }),
    ]);
    expect(sections[0].channels.map((c) => c.id)).toEqual(['used', 'never']);
  });
});

describe('totalUnread', () => {
  it('adds up to the one number the nav badge shows', () => {
    expect(totalUnread([channel({ unread_count: 3 }), channel({ unread_count: 2 })])).toBe(5);
    expect(totalUnread([])).toBe(0);
  });
});

describe('preview', () => {
  it('collapses whitespace so a pasted paragraph cannot break the row', () => {
    expect(preview('line one\n\n   line two')).toBe('line one line two');
  });

  it('clips with an ellipsis, and leaves short text alone', () => {
    expect(preview('x'.repeat(100))).toHaveLength(80);
    expect(preview('short')).toBe('short');
    expect(preview(null)).toBe('');
  });
});

describe('byDay', () => {
  it('groups by the Montreal day, not the UTC one', () => {
    // 01:00Z on the 17th is 8pm on the 16th in Montreal — same day as 18:00Z.
    const days = byDay([
      message({ id: 'evening', created_at: '2027-01-17T01:00:00Z' }),
      message({ id: 'afternoon', created_at: '2027-01-16T18:00:00Z' }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].key).toBe('2027-01-16');
  });

  it('orders oldest first within and across days', () => {
    const days = byDay([
      message({ id: 'later', created_at: '2027-01-18T13:00:00Z' }),
      message({ id: 'earlier', created_at: '2027-01-16T13:00:00Z' }),
    ]);
    expect(days.map((d) => d.key)).toEqual(['2027-01-16', '2027-01-18']);
  });

  it('survives an empty channel', () => {
    expect(byDay([])).toEqual([]);
  });
});

describe('startsRun', () => {
  const run = [
    message({ id: '1', author_id: 'a', created_at: '2027-01-16T13:00:00Z' }),
    message({ id: '2', author_id: 'a', created_at: '2027-01-16T13:02:00Z' }),
    message({ id: '3', author_id: 'a', created_at: '2027-01-16T13:30:00Z' }),
    message({ id: '4', author_id: 'b', created_at: '2027-01-16T13:31:00Z' }),
  ];

  it('always names the first message', () => {
    expect(startsRun(run, 0)).toBe(true);
  });

  it('continues a run from the same author within five minutes', () => {
    expect(startsRun(run, 1)).toBe(false);
  });

  it('breaks the run after a gap', () => {
    expect(startsRun(run, 2)).toBe(true);
  });

  it('breaks the run when the author changes', () => {
    expect(startsRun(run, 3)).toBe(true);
  });
});

describe('composer rules', () => {
  it('will not send whitespace', () => {
    expect(isSendable('   \n ')).toBe(false);
    expect(isSendable('hi')).toBe(true);
  });

  it('gives an announcement channel a composer only to exec', () => {
    const announcement = channel({ type: 'announcement', is_readonly: true });
    expect(canPost(announcement, false)).toBe(false);
    expect(canPost(announcement, true)).toBe(true);
    expect(canPost(channel(), false)).toBe(true);
  });
});
