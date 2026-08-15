// ABOUTME: One channel — pinned message, the thread, and the composer (when the caller gets one).
// ABOUTME: Live over Supabase Realtime; an announcement channel gives delegates acknowledgement instead of a composer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useLocale, useT } from '../../i18n';
import { byDay, canPost, isSendable, startsRun } from '../../lib/messaging';
import {
  acknowledge,
  markRead,
  pinMessage,
  sendMessage,
  useChannelMessages,
  useChannels,
} from '../../lib/messagingData';
import { useIsExecLike, useSession } from '../../lib/session';
import { enqueue, useOutbox } from '../../lib/outbox';
import type { QueuedMessage } from '../../lib/outbox';
import { formatDayLabel, formatTimeOnly } from '../../lib/time';

export default function Channel() {
  const t = useT();
  const { locale } = useLocale();
  const { id } = useParams();
  const { session } = useSession();
  const isExecLike = useIsExecLike();

  const { channels } = useChannels();
  const { messages, loading } = useChannelMessages(id ?? null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acked, setAcked] = useState<string[]>([]);

  const bottom = useRef<HTMLDivElement>(null);
  const channel = channels.find((c) => c.id === id) ?? null;

  /* The offline queue from HANDOFF §8. Flushes on reconnect and when the tab
     becomes visible; the count below the composer is the "visible pending
     state" the brief asks for. Only messages queue — a submission that arrived
     four minutes late would be a missed deadline reported as a success. */
  const flushSend = useCallback(
    (queued: QueuedMessage) => sendMessage(queued.channelId, queued.authorId, queued.body),
    [],
  );
  const outbox = useOutbox(flushSend);

  // Marking read on open, not on scroll. A channel you opened is a channel you
  // saw; tracking viewport position to decide would make the badge argue with
  // the user about what they read.
  useEffect(() => {
    if (id) void markRead(id);
  }, [id, messages.length]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const pinned = channel?.pinned_message_id
    ? messages.find((m) => m.id === channel.pinned_message_id)
    : null;

  async function send() {
    if (!isSendable(draft) || !session || !id) return;
    setSending(true);
    setError(null);

    // HANDOFF §8 queues message sends offline in IndexedDB and flushes on
    // reconnect. That belongs with the service worker in Phase 6; until then a
    // send that fails says so rather than pretending.
    const body = draft;
    // Cleared first: a composer that keeps the text while the row is already
    // queued invites sending it twice.
    setDraft('');

    const failure = navigator.onLine ? await sendMessage(id, session.user.id, body) : 'offline';
    setSending(false);

    if (!failure) return;

    try {
      await enqueue({ id: crypto.randomUUID(), channelId: id, authorId: session.user.id, body });
      outbox.refresh();
    } catch {
      // No IndexedDB (private browsing refuses it outright). Nothing to queue
      // into, so this falls back to the old behaviour: say so, and give the
      // text back rather than losing it.
      setDraft(body);
      setError(t('messages.sendFailed'));
    }
  }

  if (!channel && !loading) {
    return (
      <div className="px-4 py-5">
        <p className="text-body text-muted">{t('messages.gone')}</p>
      </div>
    );
  }

  const days = byDay(messages);
  const mayPost = channel ? canPost(channel, isExecLike) : false;

  return (
    <div className="flex min-h-full flex-col">
      {channel?.type === 'announcement' && (
        /* The maroon header band §5.5 asks for: an announcement should not look
           like a room you can talk in. */
        <div data-surface="dark" className="bg-primary px-4 py-2.5">
          <p className="text-meta font-bold uppercase tracking-widest text-sand">
            {t('messages.announcements')}
          </p>
          <p className="font-unbounded text-body font-bold text-cream">{channel.name}</p>
        </div>
      )}

      {pinned && (
        <div className="border-b border-gold/40 bg-gold/10 px-4 py-2">
          <p className="text-meta font-bold uppercase tracking-widest text-primary">
            {t('messages.pinned')}
          </p>
          <p className="mt-0.5 text-body text-ink">{pinned.body}</p>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        {loading && messages.length === 0 && (
          <div role="status" aria-label={t('nav.messages')} className="h-24 rounded-md bg-muted/15" />
        )}

        {!loading && messages.length === 0 && (
          <p className="text-body text-muted">{t('messages.empty')}</p>
        )}

        {days.map((day) => (
          <section key={day.key} className="flex flex-col gap-1.5">
            <h2 className="self-center rounded-full bg-muted/15 px-2.5 py-0.5 text-meta font-semibold text-muted">
              {formatDayLabel(day.key, locale, { weekday: 'long', month: 'short', day: 'numeric' })}
            </h2>

            {day.messages.map((message, index) => {
              const mine = message.author_id === session?.user.id;
              const opens = startsRun(day.messages, index);

              return (
                <article
                  key={message.id}
                  className={[
                    'max-w-[85%] rounded-sm px-3 py-2',
                    mine ? 'self-end bg-primary text-cream' : 'self-start bg-white text-ink',
                    opens ? 'mt-1.5' : '',
                  ].join(' ')}
                  data-surface={mine ? 'dark' : undefined}
                >
                  {opens && !mine && (
                    <p className="text-meta font-bold text-primary">{message.authorName}</p>
                  )}
                  <p className="whitespace-pre-wrap text-body leading-relaxed">{message.body}</p>
                  <p className={['mt-0.5 text-meta', mine ? 'text-cream/70' : 'text-muted'].join(' ')}>
                    <time dateTime={message.created_at}>{formatTimeOnly(message.created_at, locale)}</time>
                  </p>

                  {/* Acknowledgement, so an exec can confirm a message landed. */}
                  {channel?.is_readonly && !mine && session && (
                    <button
                      type="button"
                      disabled={acked.includes(message.id)}
                      onClick={async () => {
                        await acknowledge(message.id, session.user.id);
                        setAcked((held) => [...held, message.id]);
                      }}
                      className="mt-1.5 min-h-11 rounded-xs border border-primary px-2.5 text-meta font-semibold text-primary disabled:opacity-60"
                    >
                      {acked.includes(message.id) ? t('messages.acknowledged') : t('messages.acknowledge')}
                    </button>
                  )}

                  {isExecLike && id && (
                    <button
                      type="button"
                      onClick={() =>
                        void pinMessage(id, channel?.pinned_message_id === message.id ? null : message.id)
                      }
                      className={[
                        'mt-1 min-h-11 px-1 text-meta font-semibold',
                        mine ? 'text-cream/80' : 'text-muted',
                      ].join(' ')}
                    >
                      {channel?.pinned_message_id === message.id
                        ? t('messages.unpin')
                        : t('messages.pin')}
                    </button>
                  )}
                </article>
              );
            })}
          </section>
        ))}

        <div ref={bottom} />
      </div>

      {mayPost ? (
        <div className="sticky bottom-0 flex items-end gap-2 border-t border-muted/20 bg-cream px-4 py-2.5">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line. On a phone the on-screen
              // keyboard sends a plain Enter, which is what people expect here.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={t('messages.placeholder')}
            aria-label={t('messages.placeholder')}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-sm border border-muted/30 px-3 py-2.5 text-body"
          />
          <button
            type="button"
            disabled={sending || !isSendable(draft)}
            onClick={send}
            className="min-h-11 flex-none rounded-sm bg-primary px-4 text-body font-bold text-cream disabled:opacity-50"
          >
            {t('messages.send')}
          </button>
        </div>
      ) : (
        <p className="border-t border-muted/20 px-4 py-3 text-center text-meta text-muted">
          {t('messages.readOnly')}
        </p>
      )}

      {outbox.count > 0 && (
        <p role="status" className="border-t border-gold/40 bg-gold/15 px-4 py-1.5 text-meta text-ink-800">
          {t('messages.queued', { n: outbox.count })}
        </p>
      )}

      {error && (
        <p role="alert" className="field-error px-4 pb-2 text-body text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
