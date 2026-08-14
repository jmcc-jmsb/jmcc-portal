// ABOUTME: Mobile bottom tab bar. Carries pb-safe-b so it clears the iPhone home indicator.
// ABOUTME: Deep screens reached through More keep the More tab lit, matching the prototype.
import { Link, useLocation } from 'react-router';
import { useT } from '../../i18n';
import { TAB_ITEMS, activeTabFor } from '../../lib/nav';

export default function TabBar() {
  const t = useT();
  const location = useLocation();
  const active = activeTabFor(location.pathname);

  return (
    <nav
      data-surface="dark"
      aria-label={t('shell.tabNav')}
      /* pb-safe-b is the whole point. The prototype fakes this with a drawn
         home-indicator bar; on a real iPhone, without it, the tab row sits
         underneath the system indicator and the last row of taps goes nowhere. */
      className="flex-none border-t border-gold/20 bg-primary pb-safe-b pl-safe-l pr-safe-r md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TAB_ITEMS.map((item) => {
          const on = active === item.key;
          return (
            <li key={item.key}>
              {/* Link, not NavLink. NavLink only applies aria-current when react
                  -router itself considers the link active, and a deep screen like
                  /cabinet lights the More tab without matching its path — so the
                  tab read as current visually while exposing nothing to a screen
                  reader. One source of truth (`on`) drives both. */}
              <Link
                to={item.path}
                aria-current={on ? 'page' : undefined}
                className="flex min-h-11 flex-col items-center justify-center gap-1 py-1.5"
              >
                {/* Shape-cue placeholders, carried over from the prototype (export
                    line 801) — a real icon set is not specified anywhere in the
                    brief, and inventing one now would be a design decision made
                    by the wrong person. */}
                <span
                  aria-hidden="true"
                  style={{ borderRadius: item.iconRadius }}
                  className={[
                    'size-[18px] border-2',
                    on ? 'border-gold bg-gold/30' : 'border-cream/70',
                  ].join(' ')}
                />
                <span
                  className={[
                    'text-meta font-semibold',
                    on ? 'text-gold' : 'text-cream/70',
                  ].join(' ')}
                >
                  {t(item.labelKey)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
