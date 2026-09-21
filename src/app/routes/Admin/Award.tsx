// ABOUTME: Grant a cabinet piece to a set of delegates — the exec-facing half of /api/admin/award.
// ABOUTME: Deferred from Phase 7 for want of a recipient picker, which is now the component below.
import { useEffect, useState } from 'react';
import RecipientPicker from '../../components/ui/RecipientPicker';
import { useLocale, useT } from '../../i18n';
import type { Recipient } from '../../lib/recipients';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';

type Piece = {
  id: string;
  name_en: string;
  name_fr: string;
  category: string;
  sort_order: number | null;
};

export default function Award() {
  const t = useT();
  const { locale } = useLocale();

  const [people, setPeople] = useState<Recipient[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);

  const [pieceId, setPieceId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    void (async () => {
      const supabase = getSupabase();
      /* Both reads go through the caller's own client. `pieces_read` already
         shows an exec the secret pieces and hides them from everyone else, so
         this screen does not get a say in what is grantable. */
      const [roster, catalog] = await Promise.all([
        supabase.from('profiles').select('id, full_name, preferred_name').order('full_name'),
        supabase
          .from('cabinet_pieces')
          .select('id, name_en, name_fr, category, sort_order')
          .order('sort_order', { ascending: true, nullsFirst: false }),
      ]);
      if (cancelled) return;

      setPeople((roster.data as Recipient[] | null) ?? []);
      setPieces((catalog.data as Piece[] | null) ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const pieceLabel = (piece: Piece) => (locale === 'fr' ? piece.name_fr : piece.name_en);

  async function grant() {
    setBusy(true);
    setError(null);
    setResult(null);

    const res = await fetch('/api/admin/award', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pieceId,
        userIds: recipients,
        note: note.trim() || null,
      }),
    });

    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? t('award.failed'));
      return;
    }

    const body = (await res.json()) as { granted: number };
    setResult(t('award.granted', { n: body.granted }));
    /* The piece stays chosen and the recipients clear. Granting the same
       commendation to a second batch of people is the common second action;
       granting a different piece to the same people is not. */
    setRecipients([]);
    setNote('');
  }

  const ready = pieceId !== '' && recipients.length > 0 && !busy;

  return (
    <section className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-meta font-bold uppercase tracking-widest text-primary">
          {t('award.piece')}
        </span>
        <select
          value={pieceId}
          disabled={busy}
          onChange={(event) => setPieceId(event.target.value)}
          className="min-h-11 rounded-sm border border-muted/30 bg-white px-3 text-lead text-ink disabled:opacity-50"
        >
          <option value="">{t('award.choosePiece')}</option>
          {pieces.map((piece) => (
            <option key={piece.id} value={piece.id}>
              {pieceLabel(piece)}
            </option>
          ))}
        </select>
      </label>

      {!loading && pieces.length === 0 && (
        <p className="text-body text-muted">{t('award.noPieces')}</p>
      )}

      <RecipientPicker
        people={people}
        value={recipients}
        onChange={setRecipients}
        label={t('award.recipients')}
        loading={loading}
        disabled={busy}
      />

      <label className="flex flex-col gap-1">
        <span className="text-meta font-bold uppercase tracking-widest text-primary">
          {t('award.note')}
        </span>
        <textarea
          value={note}
          rows={2}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
          className="rounded-sm border border-muted/30 px-3 py-2 text-lead text-ink disabled:opacity-50"
        />
      </label>

      <button
        type="button"
        disabled={!ready}
        onClick={grant}
        className="min-h-11 self-start rounded-sm bg-primary px-4 text-body font-semibold text-cream disabled:opacity-50"
      >
        {busy ? t('award.granting') : t('award.grant', { n: recipients.length })}
      </button>

      {result && (
        <p role="status" className="text-body text-primary">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body text-muted">
          {error}
        </p>
      )}
    </section>
  );
}
