// ABOUTME: Dev-only role preview, gated on PUBLIC_ENABLE_DEV_CONTROLS. Renders nothing in production.
// ABOUTME: Changes what the UI offers; grants nothing, because RLS answers to the JWT and not to this.
import { PUBLIC_ENABLE_DEV_CONTROLS } from 'astro:env/client';
import { useT } from '../../i18n';
import { ROLES, useSession } from '../../lib/session';
import type { Role } from '../../lib/session';

/**
 * The prototype's `cycleRole` (export line 1366), kept as a cycle rather than a
 * menu so it stays one tap for a reviewer.
 *
 * Worth being blunt about what this is: a *preview*. The session's real JWT is
 * unchanged, so a delegate account previewing "Executive" gets the executive
 * shell over empty screens — every query still comes back RLS-filtered. That is
 * the correct and safe behaviour, and it is why this control can exist at all.
 */
export default function RoleSwitcher() {
  const t = useT();
  const { effectiveRole, setRoleOverride } = useSession();

  if (!PUBLIC_ENABLE_DEV_CONTROLS) return null;

  const label = t(`role.${effectiveRole}` as const);

  function cycle() {
    const next = ROLES[(ROLES.indexOf(effectiveRole) + 1) % ROLES.length] as Role;
    setRoleOverride(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      /* Dashed gold border, exactly as the prototype marks it — a reviewer must
         never mistake this for a real control. */
      className="flex h-8 items-center gap-1.5 rounded-sm border border-dashed border-gold/60 bg-cream/10 px-2.5"
    >
      <span className="text-meta font-bold tracking-widest text-gold">{t('dev.label')}</span>
      <span className="text-meta font-semibold text-cream">{label}</span>
    </button>
  );
}
