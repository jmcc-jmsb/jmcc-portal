// ABOUTME: My Cabinet — the retention screen. Header, the display case, and a piece detail sheet.
// ABOUTME: A delegate sees only their own; the policy enforces that, not this component.
import { useState } from 'react';
import { useLocale, useT } from '../../i18n';
import { fillState, nextPiece, pieceHint, pieceName, progress, resumeLine } from '../../lib/cabinet';
import type { CabinetPiece } from '../../lib/cabinet';
import { useSession } from '../../lib/session';
import { cabinetFixture, useCabinet } from '../../lib/phase3Data';
import { formatDateTime } from '../../lib/time';
import { useServerNow } from '../../lib/serverTime';
import CabinetFillSwitcher from '../../components/dev/CabinetFillSwitcher';
import type { ForcedFill } from '../../components/dev/CabinetFillSwitcher';
import DisplayCase from './DisplayCase';

export default function Cabinet() {
  const t = useT();
  const { locale } = useLocale();
  const { profile } = useSession();
  const { now } = useServerNow(60_000);

  const [forced, setForced] = useState<ForcedFill>(null);
  const [selected, setSelected] = useState<CabinetPiece | null>(null);

  const { pieces: live, loading } = useCabinet();
  const pieces = forced ? cabinetFixture(forced, now) : live;

  const { earned, total } = progress(pieces);
  const state = fillState(pieces);
  const next = nextPiece(pieces, locale);

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="font-unbounded text-title font-bold text-primary">
          {profile?.preferred_name ?? profile?.full_name ?? t('nav.cabinet')}
        </h1>
        {/* One quiet line of progress, Unbounded numerals. Not a progress bar:
            DESIGN_BRIEF §5.8 is explicit that this is not a scoreboard. */}
        <p className="mt-1 text-body text-muted">
          <span className="font-unbounded font-bold text-primary">{earned}</span>
          {' '}
          {t('cabinet.progress', { total })}
        </p>
      </header>

      {/* The highest-stakes moment on the screen. Never "Nothing here yet". */}
      {state === 'empty' && next && (
        <section className="rounded-md border border-gold/40 bg-gold/10 px-4 py-3">
          <h2 className="text-meta font-bold uppercase tracking-widest text-primary">
            {t('cabinet.firstPiece')}
          </h2>
          <p className="mt-1 text-body font-semibold text-ink">{pieceHint(next, locale)}</p>
          <p className="mt-1 text-meta leading-relaxed text-muted">{t('cabinet.emptyLede')}</p>
        </section>
      )}

      {loading && !forced && pieces.length === 0 ? (
        <div role="status" aria-label={t('nav.cabinet')} className="h-64 rounded-lg bg-muted/15" />
      ) : (
        <DisplayCase pieces={pieces} onSelect={setSelected} />
      )}

      <CabinetFillSwitcher value={forced} onChange={setForced} />

      {selected && (
        <PieceDetail piece={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/**
 * The piece detail sheet, and the résumé line.
 *
 * A dialog rather than a route: it is a detail *of* the cabinet, and pushing a
 * history entry for it would make Back mean "close the sheet" on one screen and
 * "leave the cabinet" on the next.
 */
function PieceDetail({ piece, onClose }: { piece: CabinetPiece; onClose: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);

  const earned = piece.earned_count > 0;
  const line = resumeLine(piece, locale, { awardedAt: piece.last_awarded_at });

  async function copy() {
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
    } catch {
      // Clipboard is permission-gated and blocked outright in some embedded
      // browsers. The line is on screen and selectable, so this is a downgrade
      // rather than a failure.
      setCopied(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pieceName(piece, locale)}
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 pb-safe-b"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-lg bg-cream p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-unbounded text-lead font-bold text-primary">
          {earned ? pieceName(piece, locale) : (pieceHint(piece, locale) ?? t('cabinet.secretLabel'))}
        </h2>

        {earned ? (
          <>
            {piece.earned_count > 1 && (
              <p className="mt-1 text-body text-muted">
                {t('cabinet.heldTimes', { n: piece.earned_count })}
              </p>
            )}
            {piece.last_awarded_at && (
              <p className="mt-1 text-body text-muted">
                {formatDateTime(piece.last_awarded_at, locale)}
              </p>
            )}

            <p className="mt-4 rounded-sm border border-muted/25 bg-white px-3 py-2 text-body text-ink">
              {line}
            </p>
            <button
              type="button"
              onClick={copy}
              className="mt-2 min-h-11 w-full rounded-sm bg-primary px-4 text-body font-semibold text-cream"
            >
              {copied ? t('cabinet.copied') : t('cabinet.copyResume')}
            </button>
          </>
        ) : (
          <p className="mt-2 text-body leading-relaxed text-muted">
            {pieceHint(piece, locale) ?? t('cabinet.secretExplain')}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-11 w-full rounded-sm border border-muted/30 px-4 text-body font-semibold text-ink"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
