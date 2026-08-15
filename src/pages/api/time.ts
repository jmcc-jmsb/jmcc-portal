// ABOUTME: Server clock endpoint — the authority every countdown in the vault syncs to.
// ABOUTME: Deliberately tiny and unauthenticated; the current time is not a secret.
import type { APIRoute } from 'astro';
import { json } from '../../lib/server/api';

export const prerender = false;

/**
 * HANDOFF §6: the countdown must not depend on the device clock.
 *
 * Unauthenticated on purpose. Requiring a session here would mean the clock
 * stops resyncing exactly when a token is mid-refresh, which is a strange way to
 * make a timer wrong. It leaks nothing that the `Date` response header of any
 * other request does not already carry.
 */
export const GET: APIRoute = () => json({ serverNow: new Date().toISOString() });
