// ABOUTME: Magic-link landing — exchanges the one-time code for a session cookie.
// ABOUTME: The exchange happens server-side so the session lands in an httpOnly cookie, not in JS.
import type { APIRoute } from 'astro';
import { createSessionClient } from '../../lib/server/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, request, redirect }) => {
  const code = url.searchParams.get('code');

  // Same open-redirect guard as the sign-in page: a sign-in link is exactly the
  // kind of URL someone will forward, so `next` never leaves this origin.
  const requested = url.searchParams.get('next') ?? '/app';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/app';

  if (!code) return redirect('/?error=expired');

  const supabase = createSessionClient(cookies, request.headers);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // A used or expired link is the ordinary failure here, not an exceptional one —
  // people click the link twice, or click it an hour later. Send them back to ask
  // for a fresh one rather than showing a stack trace.
  if (error) return redirect('/?error=expired');

  return redirect(next);
};
