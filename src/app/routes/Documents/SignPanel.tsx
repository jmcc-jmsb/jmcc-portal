// ABOUTME: The embedded DocuSeal signing panel, framed and captioned so the handoff reads as intentional.
// ABOUTME: Points at the submitter slug only — never the admin surface, which would expose every submission.
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type { DocumentAssignment } from '../../lib/feedback';

export default function SignPanel({
  assignment,
  title,
  onClose,
}: {
  assignment: DocumentAssignment;
  title: string;
  onClose: () => void;
}) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);

  /* Resolved server-side rather than assembled here. The slug is per submitter,
     so the URL is that one person's copy — and the endpoint re-checks that the
     assignment is theirs before handing it over, because an embed URL *is* a
     signing session. The admin surface lives on the same host and must never be
     framed here (HANDOFF §7); keeping the host out of the client is what makes
     that impossible rather than merely avoided. */
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/documents/${assignment.id}/embed`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { url?: string } | null) => {
        if (!cancelled) setSrc(body?.url ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [assignment.id]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-30 flex flex-col bg-cream pt-safe-t pb-safe-b"
    >
      <header className="flex items-center justify-between gap-3 border-b border-muted/20 px-4 py-3">
        <h2 className="min-w-0 truncate font-unbounded text-body font-bold text-primary">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-none rounded-sm border border-muted/30 px-3 text-body font-semibold text-ink"
        >
          {t('common.close')}
        </button>
      </header>

      {src ? (
        <iframe
          src={src}
          title={title}
          /* allow-same-origin is required for DocuSeal's own session cookie to
             work inside the frame; without it the signer is anonymous to their
             own document. The `portal.` and `sign.` hosts are same-site under
             jmccjmsb.ca, which is what keeps Safari's tracking prevention from
             breaking this — and why HANDOFF §7 says not to test it against a
             *.vercel.app URL, where the cookie conditions differ. */
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
          className="min-h-0 flex-1 border-0 bg-white"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-body text-muted">{t('documents.embedUnavailable')}</p>
        </div>
      )}

      {/* DESIGN_BRIEF §5.3: the shift into a third-party surface should read as
          intentional rather than broken. */}
      <p className="border-t border-muted/20 px-4 py-2 text-center text-meta text-muted">
        {t('documents.poweredBy')}
      </p>
    </div>
  );
}
