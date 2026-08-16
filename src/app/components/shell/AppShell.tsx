// ABOUTME: The persistent frame — sidebar, top bar, offline bar, scrolling main, tab bar.
// ABOUTME: Only <main> scrolls, so the chrome and its safe-area padding never move.
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useT } from '../../i18n';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import TabBar from './TabBar';
import OfflineBar from './OfflineBar';
import UpdatePrompt from '../pwa/UpdatePrompt';

export default function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const location = useLocation();

  return (
    /* dvh, not vh: on iOS Safari the URL bar makes vh taller than the visible
       viewport, which pushes the tab bar off-screen until the user scrolls. */
    <div className="flex h-dvh overflow-hidden bg-cream">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-sm focus:bg-cream focus:px-3 focus:py-2 focus:text-body focus:font-semibold focus:text-primary"
        >
          {t('shell.skipToContent')}
        </a>

        <TopBar />
        <OfflineBar />
        {/* Above the scroll area, so an available update is visible without
            scrolling and never covers the content it is offering to replace. */}
        <UpdatePrompt />

        <main
          id="main"
          /* key on pathname resets scroll position between screens — without it a
             deep screen inherits the previous one's scroll offset. */
          key={location.pathname}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-cream pl-safe-l pr-safe-r"
        >
          {children}
        </main>

        <TabBar />
      </div>
    </div>
  );
}
