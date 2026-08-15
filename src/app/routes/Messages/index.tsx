// ABOUTME: The channel list — grouped by kind, unread first, with group-chat creation.
// ABOUTME: Unread is a count badge and a bold name. No red dots everywhere (DESIGN_BRIEF §5.5).
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale, useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { groupChannels, preview, totalUnread } from '../../lib/messaging';
import type { ChannelType } from '../../lib/messaging';
import { useChannels } from '../../lib/messagingData';
import { formatRelative } from '../../lib/time';
import { useServerNow } from '../../lib/serverTime';
import NewGroup from './NewGroup';

const SECTION_LABEL: Record<ChannelType, TranslationKey> = {
  announcement: 'messages.announcements',
  competition: 'messages.competition',
  team: 'messages.teams',
  group: 'messages.groups',
  dm: 'messages.direct',
};

export default function Messages() {
  const t = useT();
  const { locale } = useLocale();
  const { now } = useServerNow(60_000);
  const { channels, loading, reload } = useChannels();
  const [composing, setComposing] = useState(false);

  const sections = groupChannels(channels);
  const unread = totalUnread(channels);

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-unbounded text-title font-bold text-primary">
          {t('nav.messages')}
          {unread > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-meta font-bold text-cream">
              {unread}
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="min-h-11 rounded-sm border border-primary px-3 text-body font-semibold text-primary"
        >
          {t('messages.newGroup')}
        </button>
      </header>

      {loading && channels.length === 0 && (
        <div role="status" aria-label={t('nav.messages')} className="h-24 rounded-md bg-muted/15" />
      )}

      {!loading && channels.length === 0 && (
        <p className="text-body text-muted">{t('messages.none')}</p>
      )}

      {sections.map((section) => (
        <section key={section.type} className="flex flex-col gap-2">
          <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
            {t(SECTION_LABEL[section.type])}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {section.channels.map((channel) => (
              <li key={channel.id}>
                <Link
                  to={`/messages/${channel.id}`}
                  className={[
                    'flex items-center gap-3 rounded-sm border px-3 py-2.5',
                    // Announcement channels look visually distinct (§5.5).
                    channel.type === 'announcement'
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-muted/20 bg-white',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={[
                        'block truncate text-body text-ink',
                        channel.unread_count > 0 ? 'font-bold' : 'font-semibold',
                      ].join(' ')}
                    >
                      {channel.name ?? t('messages.untitled')}
                    </span>
                    <span className="block truncate text-meta text-muted">
                      {preview(channel.last_message_body) || t('messages.empty')}
                    </span>
                  </span>

                  {channel.last_message_at && (
                    <span className="flex-none text-meta text-muted">
                      {formatRelative(channel.last_message_at, now, locale)}
                    </span>
                  )}

                  {channel.unread_count > 0 && (
                    <span
                      aria-label={t('messages.unread', { n: channel.unread_count })}
                      className="grid size-6 flex-none place-items-center rounded-full bg-primary text-meta font-bold text-cream"
                    >
                      {channel.unread_count}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {composing && (
        <NewGroup
          onClose={() => setComposing(false)}
          onCreated={() => {
            setComposing(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
