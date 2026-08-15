// ABOUTME: Messaging data — channel list, messages, and the Realtime subscription that keeps a channel live.
// ABOUTME: Realtime respects RLS, so a subscription cannot deliver a message the caller could not have selected.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';
import type { Channel, Message } from './messaging';

export function useChannels(): {
  channels: Channel[];
  loading: boolean;
  reload: () => void;
} {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const { data } = await getSupabase().rpc('my_channels');
        if (!cancelled) setChannels((data as Channel[] | null) ?? []);
      } catch {
        // Offline. The list already on screen is better than an empty one.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { channels, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export type MessageWithAuthor = Message & { authorName: string };

/**
 * The messages in one channel, kept live.
 *
 * Realtime is subscribed per channel rather than globally: a delegate in twelve
 * channels does not need twelve streams open to read one of them, and the
 * channel list already carries its own unread counts.
 *
 * Supabase Realtime applies RLS to the rows it broadcasts, so this cannot
 * deliver a message the caller would have been refused on a plain select — the
 * subscription is not a second, quieter way in.
 */
export function useChannelMessages(channelId: string | null): {
  messages: MessageWithAuthor[];
  loading: boolean;
  reload: () => void;
} {
  const [messages, setMessages] = useState<MessageWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const names = useRef(new Map<string, string>());

  const resolveNames = useCallback(async (rows: Message[]): Promise<MessageWithAuthor[]> => {
    const missing = [...new Set(rows.map((m) => m.author_id))].filter((id) => !names.current.has(id));

    if (missing.length > 0) {
      // visible_profile_names, not a profiles select: a channel member is
      // entitled to the name of whoever is talking, not to their allergies.
      // See migration 0004.
      const { data } = await getSupabase().rpc('visible_profile_names', { ids: missing });
      for (const row of (data as { id: string; display_name: string }[] | null) ?? []) {
        names.current.set(row.id, row.display_name);
      }
    }

    return rows.map((m) => ({ ...m, authorName: names.current.get(m.author_id) ?? '' }));
  }, []);

  useEffect(() => {
    if (!channelId || !isSupabaseConfigured) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    let cancelled = false;
    let live: RealtimeChannel | null = null;
    setLoading(true);

    void (async () => {
      try {
        const { data } = await supabase
          .from('messages')
          .select('id, channel_id, author_id, body, created_at, edited_at')
          .eq('channel_id', channelId)
          // The last 200. A channel that has been running all season does not
          // need to arrive in one response, and the tail is what anyone reads.
          .order('created_at', { ascending: true })
          .limit(200);
        if (!cancelled) setMessages(await resolveNames((data as Message[] | null) ?? []));
      } catch {
        // Offline: Realtime will backfill nothing, but the composer still says so.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    live = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          if (cancelled) return;
          const incoming = payload.new as Message;
          const [resolved] = await resolveNames([incoming]);
          setMessages((held) =>
            // The sender already appended this optimistically, and a retry can
            // deliver the same row twice — so the id decides, not arrival.
            held.some((m) => m.id === resolved.id) ? held : [...held, resolved],
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const gone = payload.old as { id: string };
          setMessages((held) => held.filter((m) => m.id !== gone.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (live) void supabase.removeChannel(live);
    };
  }, [channelId, nonce, resolveNames]);

  return { messages, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export async function sendMessage(channelId: string, authorId: string, body: string): Promise<string | null> {
  const { error } = await getSupabase()
    .from('messages')
    .insert({ channel_id: channelId, author_id: authorId, body: body.trim() });
  return error?.message ?? null;
}

export async function markRead(channelId: string): Promise<void> {
  await getSupabase().rpc('mark_channel_read', { cid: channelId });
}

export async function pinMessage(channelId: string, messageId: string | null): Promise<string | null> {
  const { error } = await getSupabase()
    .from('channels')
    .update({ pinned_message_id: messageId })
    .eq('id', channelId);
  return error?.message ?? null;
}

export async function acknowledge(messageId: string, userId: string): Promise<string | null> {
  const { error } = await getSupabase()
    .from('message_acks')
    .upsert({ message_id: messageId, user_id: userId });
  return error?.message ?? null;
}

export async function openDm(other: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await getSupabase().rpc('open_dm', { other });
  return { id: (data as string | null) ?? null, error: error?.message ?? null };
}

export async function createGroup(name: string, members: string[]): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await getSupabase().rpc('create_group', { group_name: name, members });
  return { id: (data as string | null) ?? null, error: error?.message ?? null };
}

/** Who is in this channel, for the header and the members sheet. */
export function useChannelMembers(channelId: string | null) {
  const [members, setMembers] = useState<{ id: string; display_name: string }[]>([]);

  useEffect(() => {
    if (!channelId || !isSupabaseConfigured) return;
    let cancelled = false;

    void getSupabase()
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channelId)
      .then(async ({ data }) => {
        const ids = ((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id);
        if (ids.length === 0 || cancelled) return;
        const { data: named } = await getSupabase().rpc('visible_profile_names', { ids });
        if (!cancelled) setMembers((named as { id: string; display_name: string }[] | null) ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  return members;
}
