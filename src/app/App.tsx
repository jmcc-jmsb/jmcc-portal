// ABOUTME: SPA root — providers, router, and the route table for every /app screen.
// ABOUTME: One React root for the whole app, so the shell caches once and tab switches are instant.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LocaleProvider, useT } from './i18n';
import { SessionProvider, useSession } from './lib/session';
import AppShell from './components/shell/AppShell';
import Home from './routes/Home';
import More from './routes/More';
import Screen from './routes/Screen';

/** Matches the `scope` and `start_url` the manifest will declare in Phase 6. */
const BASENAME = '/app';

/* A banner rather than a takeover: the shell, the navigation, the language
   toggle and the role preview all work without a database, and being able to
   walk the shell on a fresh checkout is worth more than a hard stop.

   The one string in the app deliberately not routed through i18n. It can only
   render when there is no Supabase project configured, which never happens in a
   deployed build — it addresses whoever is setting the repo up, not a delegate. */
function NotConfiguredBanner() {
  return (
    <div className="border-b border-muted/20 bg-gold/15 px-4 py-3">
      <p className="text-meta leading-relaxed text-ink-800">
        <strong className="font-semibold">Supabase is not configured.</strong> Copy{' '}
        <code>.env.example</code> to <code>.env</code>, set <code>PUBLIC_SUPABASE_URL</code> and{' '}
        <code>PUBLIC_SUPABASE_ANON_KEY</code>, then restart the dev server. The shell is live — only
        the data layer is missing.
      </p>
    </div>
  );
}

function Loading() {
  const t = useT();
  // Skeleton, not a spinner (DESIGN_BRIEF §8). One block, because the shell is
  // already painted by the time this renders — only the greeting is pending.
  return (
    <div className="px-4 py-5" role="status" aria-label={t('app.portal')}>
      <div className="h-6 w-48 rounded-xs bg-muted/20" />
      <div className="mt-3 h-4 w-64 rounded-xs bg-muted/20" />
    </div>
  );
}

function Shell() {
  const { loading, configured } = useSession();

  return (
    <AppShell>
      {!configured && <NotConfiguredBanner />}
      {loading ? (
        <Loading />
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<Screen titleKey="nav.calendar" phaseKey="screen.phase3" />} />
          <Route path="/cases" element={<Screen titleKey="nav.cases" phaseKey="screen.phase2" />} />
          <Route path="/messages" element={<Screen titleKey="nav.messages" phaseKey="screen.phase5" />} />
          <Route path="/more" element={<More />} />
          <Route path="/tasks" element={<Screen titleKey="nav.tasks" phaseKey="screen.phase3" />} />
          <Route path="/documents" element={<Screen titleKey="nav.documents" phaseKey="screen.phase4" />} />
          <Route path="/feedback" element={<Screen titleKey="nav.feedback" phaseKey="screen.phase4" />} />
          <Route path="/cabinet" element={<Screen titleKey="nav.cabinet" phaseKey="screen.phase3" />} />
          <Route path="/profile" element={<Screen titleKey="nav.profile" phaseKey="screen.phase7" />} />
          <Route path="/admin" element={<Screen titleKey="nav.admin" phaseKey="screen.phase7" />} />
          {/* An unknown deep link inside a standalone app has no browser bar to
              correct it, so it goes home rather than showing a dead end. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </AppShell>
  );
}

export default function App() {
  return (
    <LocaleProvider>
      <SessionProvider>
        <BrowserRouter basename={BASENAME}>
          <Shell />
        </BrowserRouter>
      </SessionProvider>
    </LocaleProvider>
  );
}
