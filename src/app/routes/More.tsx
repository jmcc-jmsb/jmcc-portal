// ABOUTME: The More drawer — everything not in the five tab roots, plus sign out.
// ABOUTME: Mirrors the prototype's More list (export lines 778–791).
import { Link } from 'react-router';
import { useT } from '../i18n';
import { MORE_ITEMS, NAV_ITEMS, visibleTo } from '../lib/nav';
import { useSession } from '../lib/session';

export default function More() {
  const t = useT();
  const { profile, effectiveRole, signOut } = useSession();

  // Admin lives in NAV_ITEMS with a role gate; the rest of the drawer is fixed.
  const admin = visibleTo(NAV_ITEMS, effectiveRole).filter((i) => i.key === 'admin');
  const items = [...MORE_ITEMS, ...admin];

  return (
    <div className="px-4 py-5">
      <h1 className="font-unbounded text-title font-bold text-primary">{t('nav.more')}</h1>

      <ul className="mt-4 overflow-hidden rounded-md border border-muted/20 bg-white">
        {items.map((item) => (
          <li key={item.key} className="border-b border-muted/20 last:border-b-0">
            <Link
              to={item.path}
              className="flex min-h-13 items-center justify-between gap-2.5 px-4 py-3.5"
            >
              <span className="text-body font-semibold text-ink-800">{t(item.labelKey)}</span>
              <span aria-hidden="true" className="text-lead text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-4 min-h-13 w-full rounded-md border border-primary px-4 text-body font-semibold text-primary"
      >
        {t('shell.signOut')}
      </button>

      <p className="mt-4 text-meta leading-relaxed text-muted">
        {t('shell.signedInAs')} {profile?.email ?? '—'}
        <br />
        {t('app.season')}
      </p>
    </div>
  );
}
