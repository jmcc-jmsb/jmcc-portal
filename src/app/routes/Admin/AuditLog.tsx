// ABOUTME: The audit log viewer — who did what, newest first.
// ABOUTME: Read-only by construction: audit_log has a select policy and no insert policy for any JWT.
import { useEffect, useState } from 'react';
import { useLocale, useT } from '../../i18n';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatDateTime } from '../../lib/time';

type Entry = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export default function AuditLog() {
  const t = useT();
  const { locale } = useLocale();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('audit_log')
        .select('id, actor_id, action, entity_type, entity_id, metadata, created_at')
        .order('created_at', { ascending: false })
        // The last 200. An audit log is append-only and grows forever; the
        // useful question here is "what just happened", and an export belongs
        // with the reporting nobody has asked for yet.
        .limit(200);

      if (cancelled) return;
      const rows = (data as Entry[] | null) ?? [];
      setEntries(rows);

      const actors = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => !!id))];
      if (actors.length > 0) {
        const { data: named } = await supabase.rpc('visible_profile_names', { ids: actors });
        if (!cancelled) {
          setNames(
            new Map(
              ((named as { id: string; display_name: string }[] | null) ?? []).map((row) => [
                row.id,
                row.display_name,
              ]),
            ),
          );
        }
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const shown = filter
    ? entries.filter((entry) => entry.action.includes(filter) || entry.entity_type.includes(filter))
    : entries;

  return (
    <section className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-meta font-bold uppercase tracking-widest text-muted">
          {t('admin.filter')}
        </span>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="case.submit"
          className="min-h-11 rounded-sm border border-muted/30 px-3 text-body"
        />
      </label>

      {loading && <div role="status" aria-label={t('admin.audit')} className="h-24 rounded-md bg-muted/15" />}

      {!loading && shown.length === 0 && <p className="text-body text-muted">{t('admin.noEntries')}</p>}

      <ul className="flex flex-col gap-1.5">
        {shown.map((entry) => (
          <li key={entry.id} className="rounded-sm border border-muted/20 bg-white px-3 py-2">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-meta font-bold text-primary">{entry.action}</span>
              <span className="text-meta text-muted">
                {formatDateTime(entry.created_at, locale)}
              </span>
            </p>
            <p className="mt-0.5 text-meta text-muted">
              {/* An actor with no readable name is shown as such rather than as a
                  raw uuid — a deleted account should read as absent, not as an
                  identifier to go looking up. */}
              {entry.actor_id ? (names.get(entry.actor_id) ?? t('admin.unknownActor')) : t('admin.system')}
              {' · '}
              {entry.entity_type}
            </p>
            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
              <p className="mt-0.5 break-words font-mono text-meta text-muted">
                {JSON.stringify(entry.metadata)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
