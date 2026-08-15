// ABOUTME: The VAPID public key, for a browser about to subscribe.
// ABOUTME: Public by definition — every subscribing client receives it — so this needs no session.
import type { APIRoute } from 'astro';
import { json } from '../../../lib/server/api';
import { isPushConfigured, publicKey } from '../../../lib/server/push';

export const prerender = false;

export const GET: APIRoute = () => {
  if (!isPushConfigured) return json({ error: 'push_not_configured' }, 503);
  return json({ key: publicKey() });
};
