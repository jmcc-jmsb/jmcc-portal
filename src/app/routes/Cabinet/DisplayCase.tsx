// ABOUTME: The cabinet itself — shelves, plinths, and the empty outlines that are the point of the screen.
// ABOUTME: Filled and empty must read as the same cabinet, so both render as plinths and differ only in what sits on them.
import { useLocale, useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { byCategory, pieceHint, pieceName } from '../../lib/cabinet';
import type { CabinetPiece } from '../../lib/cabinet';

const SHELF_LABEL: Record<string, TranslationKey> = {
  placement: 'cabinet.placements',
  season: 'cabinet.seasons',
  milestone: 'cabinet.milestones',
  commendation: 'cabinet.commendations',
};

export default function DisplayCase({
  pieces,
  onSelect,
}: {
  pieces: CabinetPiece[];
  onSelect: (piece: CabinetPiece) => void;
}) {
  const t = useT();

  return (
    /* DESIGN_BRIEF §5.8 asks for a physical case: depth, shelf edges, light
       falling across maroon. The depth is one inset shadow and a lighter top
       edge per shelf — enough to read as a case rather than a list, without a
       texture nobody can maintain. */
    <div
      data-surface="dark"
      className="flex flex-col gap-4 rounded-lg bg-primary p-3 shadow-[inset_0_1px_0_rgba(250,187,32,0.18),inset_0_-12px_24px_-12px_rgba(0,0,0,0.55)]"
    >
      {byCategory(pieces).map((shelf) => (
        <section key={shelf.category}>
          <h2 className="px-1 pb-2 text-meta font-bold uppercase tracking-widest text-sand">
            {t(SHELF_LABEL[shelf.category])}
          </h2>

          <div className="relative">
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {shelf.pieces.map((piece) => (
                <li key={piece.piece_id}>
                  <Plinth piece={piece} onSelect={onSelect} />
                </li>
              ))}
            </ul>

            {/* The shelf edge the pieces sit on. Purely decorative, and the one
                thing that makes a row of plinths read as furniture. */}
            <div
              aria-hidden="true"
              className="mt-1 h-1.5 rounded-b-xs bg-gradient-to-b from-gold/25 to-transparent"
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function Plinth({
  piece,
  onSelect,
}: {
  piece: CabinetPiece;
  onSelect: (piece: CabinetPiece) => void;
}) {
  const t = useT();
  const { locale } = useLocale();

  const earned = piece.earned_count > 0;
  const name = pieceName(piece, locale);
  const hint = pieceHint(piece, locale);

  // An unearned piece is announced by what earns it, not by its name — the name
  // of an unearned commendation is a spoiler, and the hint is the useful half.
  const label = earned
    ? piece.earned_count > 1
      ? t('cabinet.earnedTimes', { name, n: piece.earned_count })
      : name
    : (hint ?? t('cabinet.secretLabel'));

  return (
    <button
      type="button"
      onClick={() => onSelect(piece)}
      aria-label={label}
      className={[
        'flex min-h-24 w-full flex-col items-center justify-end gap-1.5 rounded-sm px-1.5 pb-1.5 pt-2',
        earned ? 'bg-primary-700' : 'bg-primary-900',
      ].join(' ')}
    >
      <Shape piece={piece} earned={earned} />

      <span
        className={[
          'line-clamp-2 text-center text-meta leading-tight',
          earned ? 'font-semibold text-cream' : 'text-cream/60',
        ].join(' ')}
      >
        {earned ? name : (hint ?? '')}
      </span>

      {earned && piece.earned_count > 1 && (
        <span className="text-meta font-bold text-gold">×{piece.earned_count}</span>
      )}
    </button>
  );
}

/**
 * Disc, diamond or bar — earned in gold or sand, unearned as a recessed outline.
 *
 * The same glyph in both states on purpose. DESIGN_BRIEF §5.8: filled and empty
 * must read as the *same* cabinet, not as a progress bar with icons.
 */
function Shape({ piece, earned }: { piece: CabinetPiece; earned: boolean }) {
  const fill = piece.tone === 'gold' ? 'bg-gold' : 'bg-sand';

  const geometry =
    piece.shape === 'bar'
      ? 'h-3 w-10 rounded-xs'
      : piece.shape === 'diamond'
        ? 'size-7 rotate-45 rounded-xs'
        : 'size-8 rounded-full';

  return (
    <span
      aria-hidden="true"
      className={[
        geometry,
        earned
          ? `${fill} shadow-[0_1px_6px_rgba(250,187,32,0.35)]`
          : 'border-2 border-dashed border-cream/25 bg-ink/20',
      ].join(' ')}
    />
  );
}
