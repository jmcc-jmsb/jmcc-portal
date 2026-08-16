// ABOUTME: Member directory with role assignment — superuser-only, and visibly so.
// ABOUTME: An executive sees the controls disabled with the reason, not a screen that pretends they do not exist.
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';

const ROLES = ['delegate', 'coach', 'executive', 'superuser'] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<Role, TranslationKey> = {
  delegate: 'role.delegate',
  coach: 'role.coach',
  executive: 'role.executive',
  superuser: 'role.superuser',
};

type Member = { id: string; full_name: string; preferred_name: string | null; email: string };

export default function Members({ isSuperuser }: { isSuperuser: boolean }) {
  const t = useT();
  const [members, setMembers] = useState<Member[]>([]);
  const [grants, setGrants] = useState<Map<string, Role[]>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    void (async () => {
      const supabase = getSupabase();
      const [people, roleRows] = await Promise.all([
        supabase.from('profiles').select('id, full_name, preferred_name, email').order('full_name'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (cancelled) return;

      setMembers((people.data as Member[] | null) ?? []);

      const map = new Map<string, Role[]>();
      for (const row of ((roleRows.data as { user_id: string; role: Role }[] | null) ?? [])) {
        map.set(row.user_id, [...(map.get(row.user_id) ?? []), row.role]);
      }
      setGrants(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  async function toggle(userId: string, role: Role, held: boolean) {
    setBusy(`${userId}:${role}`);
    setError(null);

    const res = await fetch('/api/admin/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, role, action: held ? 'revoke' : 'grant' }),
    });

    setBusy(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? t('admin.roleFailed'));
      return;
    }
    setNonce((n) => n + 1);
  }

  return (
    <section className="flex flex-col gap-3">
      {/* DESIGN_BRIEF §5.11: "role changes are Superuser-only and should be
          visibly gated for executives, not hidden". An executive who cannot find
          the control assumes it is missing and asks; one who can see it greyed
          out with the reason knows exactly who to ask. */}
      {!isSuperuser && (
        <p role="note" className="rounded-sm border border-gold/40 bg-gold/10 px-3 py-2 text-body text-ink-800">
          {t('admin.superuserOnly')}
        </p>
      )}

      {error && (
        <p role="alert" className="field-error text-body text-danger">
          {error}
        </p>
      )}

      {members.length === 0 ? (
        <p className="text-body text-muted">{t('admin.noMembers')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => {
            const held = grants.get(member.id) ?? [];
            return (
              <li key={member.id} className="rounded-sm border border-muted/20 bg-white p-3">
                <p className="text-body font-semibold text-ink">
                  {member.preferred_name ?? member.full_name}
                </p>
                <p className="text-meta text-muted">{member.email}</p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ROLES.map((role) => {
                    const has = held.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        role="switch"
                        aria-checked={has}
                        disabled={!isSuperuser || busy === `${member.id}:${role}`}
                        onClick={() => toggle(member.id, role, has)}
                        // The disabled reason lives on the control itself, so it
                        // is reachable by a screen reader rather than only by
                        // reading the banner at the top of the page.
                        title={isSuperuser ? undefined : t('admin.superuserOnly')}
                        className={[
                          'min-h-11 rounded-sm px-2.5 text-meta font-semibold',
                          has ? 'bg-primary text-cream' : 'border border-muted/30 bg-white text-muted',
                          !isSuperuser ? 'cursor-not-allowed opacity-50' : '',
                        ].join(' ')}
                      >
                        {t(ROLE_LABEL[role])}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
