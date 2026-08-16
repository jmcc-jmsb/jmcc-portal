// ABOUTME: The one promo slot — dark maroon, gold CTA, dismissible.
// ABOUTME: One card, from a function that returns at most one row, so two on a screen is impossible.
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { useSession } from '../../lib/session';

export type Promo = {
  id: string;
  title: string;
  hook: string | null;
  image_path: string | null;
  cta_label: string | null;
  cta_url: string | null;
  event_id: string | null;
};

/**
 * DESIGN_BRIEF §5.9 gives this exactly two placements and one slot. It is
 * rendered mid-stack on Home and nowhere near the vault or the signing panel —
 * "it never interrupts a case timer or a signing flow" is a placement decision,
 * so it is honoured by not mounting the component there rather than by a runtime
 * check that someone can forget.
 */
export default function PromoCard() {
  const t = useT();
  const { session } = useSession();
  const [promo, setPromo] = useState<Promo | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    void getSupabase()
      .rpc('active_promo')
      .then(({ data }) => {
        if (cancelled) return;
        setPromo(((data as Promo[] | null) ?? [])[0] ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!promo) return null;

  async function dismiss() {
    if (!session || !promo) return;
    setPromo(null);
    // Recorded rather than kept in local state: dismissing on a phone should
    // mean it stays dismissed on a laptop.
    await getSupabase()
      .from('promo_dismissals')
      .insert({ promo_id: promo.id, user_id: session.user.id });
  }

  const image = promo.image_path
    ? getSupabase().storage.from('promo-images').getPublicUrl(promo.image_path).data.publicUrl
    : null;

  return (
    /* This is where the dark-only tokens earn their keep (§5.9): gold and sand
       on maroon, which the rest of the app is not allowed to do on cream. */
    <section
      data-surface="dark"
      className="relative overflow-hidden rounded-md bg-primary text-cream"
    >
      {image && (
        <img
          src={image}
          alt=""
          className="h-32 w-full object-cover opacity-70"
          loading="lazy"
        />
      )}

      <div className="flex flex-col gap-1.5 p-4">
        <p className="text-meta font-bold uppercase tracking-widest text-sand">{t('promo.eyebrow')}</p>
        <h2 className="font-unbounded text-lead font-bold text-cream">{promo.title}</h2>
        {promo.hook && <p className="text-body leading-relaxed text-cream/90">{promo.hook}</p>}

        {promo.cta_label && promo.cta_url && (
          <a
            href={promo.cta_url}
            target="_blank"
            rel="noopener"
            className="mt-1.5 inline-flex min-h-11 items-center justify-center self-start rounded-sm bg-gold px-4 text-body font-bold text-ink"
          >
            {promo.cta_label}
          </a>
        )}
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label={t('promo.dismiss')}
        className="absolute right-1 top-1 min-h-11 min-w-11 text-lead font-bold text-cream/80"
      >
        ×
      </button>
    </section>
  );
}
