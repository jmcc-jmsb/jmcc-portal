// ABOUTME: Maroon top bar — logo or back affordance, screen title, language toggle, dev role switcher.
// ABOUTME: Carries pt-safe-t so it clears the notch in standalone mode.
import { useLocation, useNavigate } from 'react-router';
import shieldUrl from '../../../assets/brand/jmcc-shield-color.png?url';
import { useT } from '../../i18n';
import { isTabRoot, matchItem } from '../../lib/nav';
import LanguageToggle from '../ui/LanguageToggle';
import RoleSwitcher from '../dev/RoleSwitcher';

export default function TopBar() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();

  const deep = !isTabRoot(location.pathname);
  const current = matchItem(location.pathname);

  /* Standalone mode has no browser back button, so a deep screen with no back
     affordance is a dead end — the most common way a PWA feels broken. */
  function goBack() {
    // A cold start on a deep link has nothing to pop, so fall back to the tab
    // root rather than leaving the app.
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }

  return (
    <header
      data-surface="dark"
      className="flex-none bg-primary text-cream pt-safe-t pl-safe-l pr-safe-r"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          {deep ? (
            <>
              <button
                type="button"
                onClick={goBack}
                aria-label={t('shell.back')}
                className="-ml-2 grid size-11 flex-none place-items-center rounded-sm text-cream"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M12.5 4 6.5 10l6 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span className="truncate font-unbounded text-body font-bold">
                {current ? t(current.labelKey) : t('app.portal')}
              </span>
            </>
          ) : (
            <>
              {/* Cream chip behind the shield. jmcc-shield-color.png has an opaque
                  white background and no transparent variant exists yet — the main
                  site works around it the same way, and so did the prototype.
                  See docs/BRAND.md, "Known gap". */}
              <span className="grid size-9 flex-none place-items-center rounded-sm bg-cream">
                <img src={shieldUrl} alt="" width="27" height="27" className="block size-7 object-contain" />
              </span>
              <span className="font-unbounded text-lead font-bold tracking-wide">{t('app.name')}</span>
            </>
          )}
        </div>

        <div className="flex flex-none items-center gap-1">
          <LanguageToggle />

          <button
            type="button"
            aria-label={t('shell.notifications')}
            className="relative grid size-11 place-items-center rounded-sm"
          >
            <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M4 15h12l-1.6-2.4V9a4.4 4.4 0 0 0-8.8 0v3.6Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <circle cx="10" cy="17.4" r="1.4" fill="currentColor" />
            </svg>
          </button>

          <RoleSwitcher />
        </div>
      </div>
    </header>
  );
}
