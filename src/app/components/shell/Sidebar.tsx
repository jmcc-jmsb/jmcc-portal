// ABOUTME: Desktop sidebar — the full nav list, hidden below md where the tab bar takes over.
// ABOUTME: Same NAV_ITEMS as the tab bar, so the two can never drift apart.
import { NavLink } from 'react-router';
import shieldUrl from '../../../assets/brand/jmcc-shield-color.png?url';
import { useT } from '../../i18n';
import { NAV_ITEMS, MORE_ITEMS, visibleTo } from '../../lib/nav';
import { useSession } from '../../lib/session';

export default function Sidebar() {
  const t = useT();
  const { effectiveRole, profile } = useSession();

  // DESIGN_BRIEF §2: roles differ by density, not layout. Admin is the one item
  // that disappears; everything else is the same list for everyone.
  const items = [...visibleTo(NAV_ITEMS, effectiveRole), ...MORE_ITEMS.filter((i) => i.key === 'profile')];

  return (
    <nav
      data-surface="dark"
      aria-label={t('shell.sideNav')}
      className="hidden w-59 flex-none flex-col gap-1 border-r border-gold/20 bg-primary px-3 py-4 pl-safe-l md:flex"
    >
      <div className="flex items-center gap-2.5 px-1.5 pb-4">
        <span className="grid size-10 flex-none place-items-center rounded-sm bg-cream">
          <img src={shieldUrl} alt="" width="32" height="32" className="block size-8 object-contain" />
        </span>
        <span className="min-w-0">
          <span className="block font-unbounded text-body font-bold text-cream">{t('app.name')}</span>
          <span className="mt-0.5 block text-meta font-bold uppercase tracking-widest text-sand">
            {t('app.portal')}
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                [
                  'flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-left',
                  isActive ? 'bg-primary-700' : '',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    style={{ borderRadius: item.iconRadius }}
                    className={[
                      'size-3.5 flex-none border-2',
                      isActive ? 'border-gold bg-gold/30' : 'border-cream/70',
                    ].join(' ')}
                  />
                  <span
                    className={[
                      'text-body font-semibold',
                      isActive ? 'text-gold' : 'text-cream',
                    ].join(' ')}
                  >
                    {t(item.labelKey)}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto border-t border-cream/15 px-2 pt-3 text-meta leading-relaxed text-cream/60">
        {/* /60, not the /55 the prototype uses — that measures 4.25:1 on primary
            and fails AA at this size. See COMPONENT_MAP §4. */}
        {profile?.preferred_name ?? profile?.full_name ?? ''}
        <br />
        {t('app.season')}
      </div>
    </nav>
  );
}
