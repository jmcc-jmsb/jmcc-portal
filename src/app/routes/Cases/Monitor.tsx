// ABOUTME: The live submission monitor — which teams are in, which are outstanding, and when.
// ABOUTME: The roster comes from the server already scoped, so this counts what the caller may count.
import { useLocale, useT } from '../../i18n';
import { formatCaseDateTime, formatRelative } from '../../lib/caseState';
import type { Monitor as MonitorData } from '../../lib/vaultData';

export default function Monitor({
  roster,
  submissions,
  now,
}: MonitorData & { now: number }) {
  const t = useT();
  const { locale } = useLocale();

  if (roster.length === 0) return null;

  // Highest version per team; the monitor cares whether a team is in, not how
  // many drafts it took to get there.
  const latestByTeam = new Map<string, (typeof submissions)[number]>();
  for (const submission of submissions) {
    const held = latestByTeam.get(submission.teamId);
    if (!held || submission.version > held.version) latestByTeam.set(submission.teamId, submission);
  }

  const submitted = roster.filter((team) => latestByTeam.has(team.team_id));

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
        {t('vault.monitor')}
      </h2>
      <p className="text-body text-muted">
        {t('vault.monitorCount', { in: submitted.length, total: roster.length })}
      </p>

      <ul className="flex flex-col gap-1">
        {roster.map((team) => {
          const latest = latestByTeam.get(team.team_id);
          return (
            <li
              key={team.team_id}
              className="flex items-baseline justify-between gap-3 rounded-sm border border-muted/20 bg-white px-3 py-2"
            >
              <span className="min-w-0 truncate text-body font-semibold text-ink">
                {team.team_name}
              </span>
              {latest ? (
                <span className="flex-none text-meta text-muted">
                  {t('vault.version', { n: latest.version })} ·{' '}
                  <time dateTime={latest.submittedAt} title={formatCaseDateTime(latest.submittedAt, locale)}>
                    {formatRelative(latest.submittedAt, now, locale)}
                  </time>
                </span>
              ) : (
                /* Not a red alarm: outstanding is the normal state for most of a
                   window, and colouring it as failure would make the monitor
                   unreadable at the exact moment it matters most. */
                <span className="flex-none text-meta font-semibold text-muted">
                  {t('vault.outstanding')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
