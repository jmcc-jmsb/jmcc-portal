// ABOUTME: Magic-link sign-in. The one form the brief asks to prove the FR layout against.
// ABOUTME: No password field by design — Supabase emails a one-time link.
import { useState } from 'react';
import { PUBLIC_APP_URL } from 'astro:env/client';
import { LocaleProvider, useT } from '../../i18n';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import LanguageToggle from '../ui/LanguageToggle';

type State = { status: 'idle' | 'sending' | 'sent' | 'error'; email: string };

function Form({ next }: { next: string }) {
  const t = useT();
  const [state, setState] = useState<State>({ status: 'idle', email: '' });

  // Takes no event: React 19's types deprecate FormEvent, and letting JSX infer
  // the handler's type below means there is nothing here to annotate.
  async function send() {
    if (!isSupabaseConfigured) {
      setState((s) => ({ ...s, status: 'error' }));
      return;
    }

    setState((s) => ({ ...s, status: 'sending' }));

    const redirect = new URL('/auth/callback', PUBLIC_APP_URL ?? window.location.origin);
    redirect.searchParams.set('next', next);

    const { error } = await getSupabase().auth.signInWithOtp({
      email: state.email,
      options: {
        emailRedirectTo: redirect.toString(),
        // No self-service accounts. A delegate exists because an exec put them on
        // a roster; an unknown address gets nothing rather than a new user row.
        shouldCreateUser: false,
      },
    });

    setState((s) => ({ ...s, status: error ? 'error' : 'sent' }));
  }

  if (state.status === 'sent') {
    return (
      <div role="status" className="rounded-md border border-muted/20 bg-white p-5">
        <h2 className="font-unbounded text-title font-bold text-primary">{t('auth.sent')}</h2>
        <p className="mt-2 text-body text-muted">
          {t('auth.sentDetail', { email: state.email })}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="rounded-md border border-muted/20 bg-white p-5"
    >
      <label htmlFor="email" className="block text-body font-semibold text-ink-800">
        {t('auth.email')}
      </label>

      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder={t('auth.emailPlaceholder')}
        value={state.email}
        onChange={(e) => setState((s) => ({ ...s, email: e.target.value, status: 'idle' }))}
        /* text-lead is 16px. Anything smaller and iOS Safari zooms the viewport
           when this field takes focus, which on a phone reads as the page
           jumping. See COMPONENT_MAP §5. */
        className="mt-2 min-h-12 w-full rounded-sm border border-muted/40 px-3 text-lead text-ink-800"
      />

      {/* The slot reserves its line height, so showing an error never reflows
          the form. Same pattern as the main site. */}
      <p className="field-error mt-2 min-h-5 text-meta text-danger">
        {state.status === 'error' ? t('auth.error') : ''}
      </p>

      <button
        type="submit"
        disabled={state.status === 'sending'}
        className="mt-2 min-h-12 w-full rounded-sm bg-primary px-4 text-body font-semibold text-cream disabled:opacity-70"
      >
        {state.status === 'sending' ? t('auth.sending') : t('auth.send')}
      </button>
    </form>
  );
}

export default function SignInForm({ next = '/app' }: { next?: string }) {
  return (
    <LocaleProvider>
      <Header />
      <Form next={next} />
    </LocaleProvider>
  );
}

function Header() {
  const t = useT();
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-unbounded text-title font-bold text-primary">{t('auth.title')}</h1>
        <p className="mt-1 max-w-prose text-body text-muted">{t('auth.lede')}</p>
      </div>
      <div className="flex-none">
        <LanguageToggle tone="light" />
      </div>
    </div>
  );
}
