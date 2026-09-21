// ABOUTME: Pick one or many people from the roster RLS already decided this caller may see.
// ABOUTME: Checkboxes in a fieldset, not a combobox — native gives keyboard and screen reader for free.
import { useId, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import {
  displayName,
  filterRecipients,
  selectedRecipients,
  toggleRecipient,
} from '../../lib/recipients';
import type { Recipient } from '../../lib/recipients';

type Props = {
  people: Recipient[];
  value: string[];
  onChange: (next: string[]) => void;
  /** The legend. A picker with no stated purpose is a list of names. */
  label: string;
  mode?: 'single' | 'multi';
  loading?: boolean;
  disabled?: boolean;
};

export default function RecipientPicker({
  people,
  value,
  onChange,
  label,
  mode = 'multi',
  loading = false,
  disabled = false,
}: Props) {
  const t = useT();
  const [query, setQuery] = useState('');
  const searchId = useId();

  const visible = useMemo(() => filterRecipients(people, query, value), [people, query, value]);
  const chosen = useMemo(() => selectedRecipients(people, value), [people, value]);

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-muted/20 bg-white p-3">
      <legend className="px-1 text-meta font-bold uppercase tracking-widest text-primary">
        {label}
      </legend>

      {/* Not a <label> wrapping the input, because the legend above already names
          the group and a second visible label would read twice. */}
      <label htmlFor={searchId} className="sr-only">
        {t('picker.search')}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        disabled={disabled}
        placeholder={t('picker.search')}
        onChange={(event) => setQuery(event.target.value)}
        className="min-h-11 rounded-sm border border-muted/30 px-3 text-lead text-ink disabled:opacity-50"
      />

      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chosen.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(toggleRecipient(value, person.id, mode))}
                aria-label={t('picker.remove', { name: displayName(person) })}
                className="min-h-11 rounded-xs bg-primary px-2 text-meta font-semibold text-cream disabled:opacity-50"
              >
                {displayName(person)} ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Announced, so that ticking a box is confirmed out loud. The filter does
          not change this number — it is the selection, which is the thing a
          screen reader user cannot see happening down the list. */}
      <p role="status" className="text-meta text-muted">
        {loading ? t('picker.loading') : t('picker.selectedCount', { n: value.length })}
      </p>

      {!loading && visible.length === 0 ? (
        <p className="text-body text-muted">{t('picker.none')}</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto">
          {visible.map((person) => {
            const held = value.includes(person.id);
            return (
              <li key={person.id}>
                <label className="flex min-h-11 items-center gap-2 px-1 text-body text-ink">
                  <input
                    type="checkbox"
                    checked={held}
                    disabled={disabled}
                    onChange={() => onChange(toggleRecipient(value, person.id, mode))}
                    className="size-5 shrink-0"
                  />
                  <span>{displayName(person)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
