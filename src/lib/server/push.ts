// ABOUTME: Web push sending — the only module that holds the VAPID private key.
// ABOUTME: Server-only. Prunes subscriptions the push service reports as dead.
import webpush from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from 'astro:env/server';

/* The public key is not a secret — it is handed to every browser that
   subscribes. It stays a server variable anyway so the deployment has one
   VAPID_* naming convention rather than two, and /api/push/key serves it to the
   client. One extra round trip, no rename of a variable that is already set. */
import { createAdminClient } from './supabase';

export const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

export function publicKey(): string | null {
  return VAPID_PUBLIC_KEY ?? null;
}

let configured = false;

function configure() {
  if (configured) return;
  if (!isPushConfigured) throw new Error('Push is not configured.');

  webpush.setVapidDetails(
    // A contact the push service can reach if our sending misbehaves. Required
    // by the VAPID spec; a mailto: is the usual form.
    VAPID_SUBJECT || 'mailto:portal@jmccjmsb.ca',
    VAPID_PUBLIC_KEY!,
    VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Send to every device a set of users has registered.
 *
 * Failures are expected and mostly boring: a subscription dies when the app is
 * uninstalled, the browser is reset, or the push service expires it. 404 and 410
 * mean gone for good, so those rows are deleted rather than retried forever —
 * without that, a season of uninstalls turns every send into a slow loop over
 * dead endpoints.
 */
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!isPushConfigured || userIds.length === 0) return { sent: 0, pruned: 0 };
  configure();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .in('user_id', userIds);

  if (error) throw new Error(`push lookup failed: ${error.message}`);

  const subscriptions = (data as { id: string; endpoint: string; keys: { p256dh: string; auth: string } }[] | null) ?? [];
  const body = JSON.stringify(payload);

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          body,
        );
        sent += 1;
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(subscription.id);
        else console.error('[push] send failed', status, (cause as Error).message);
      }
    }),
  );

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', dead);
  }

  return { sent, pruned: dead.length };
}
