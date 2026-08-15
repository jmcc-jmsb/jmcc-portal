// ABOUTME: Group chat creation — name, pick members, done.
// ABOUTME: "Keep creation cheap" (DESIGN_BRIEF §5.5), so this is one sheet and two fields.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../i18n';
import { createGroup } from '../../lib/messagingData';
import { useCoachedDelegates } from '../../lib/phase4Data';
import { useSession } from '../../lib/session';

export default function NewGroup({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { session } = useSession();

  // Everyone the profiles policy already lets this caller see — teammates, and
  // their delegates if they coach. It is not a directory of the whole
  // organisation, which is the correct limit for a group chat picker.
  const { delegates } = useCoachedDelegates();

  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = delegates.filter((person) => person.id !== session?.user.id);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);

    const { id, error: message } = await createGroup(name.trim(), picked);
    setBusy(false);

    if (message || !id) {
      setError(message ?? t('messages.createFailed'));
      return;
    }
    onCreated();
    void navigate(`/messages/${id}`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('messages.newGroup')}
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/50 pb-safe-b"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-lg bg-cream p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-unbounded text-lead font-bold text-primary">{t('messages.newGroup')}</h2>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-meta font-bold uppercase tracking-widest text-muted">
            {t('messages.groupName')}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('messages.groupNamePlaceholder')}
            className="min-h-11 rounded-sm border border-muted/30 px-3 text-body"
          />
        </label>

        <fieldset className="mt-3 flex flex-col gap-1">
          <legend className="text-meta font-bold uppercase tracking-widest text-muted">
            {t('messages.members')}
          </legend>
          {candidates.length === 0 ? (
            <p className="text-body text-muted">{t('messages.noCandidates')}</p>
          ) : (
            candidates.map((person) => (
              <label key={person.id} className="flex min-h-11 items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={picked.includes(person.id)}
                  onChange={(event) =>
                    setPicked((held) =>
                      event.target.checked
                        ? [...held, person.id]
                        : held.filter((id) => id !== person.id),
                    )
                  }
                />
                {person.preferred_name ?? person.full_name}
              </label>
            ))
          )}
        </fieldset>

        {error && (
          <p role="alert" className="field-error mt-2 text-body text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={create}
          className="mt-3 min-h-11 w-full rounded-sm bg-primary px-4 text-body font-bold text-cream disabled:opacity-50"
        >
          {busy ? t('messages.creating') : t('messages.create')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-11 w-full rounded-sm border border-muted/30 px-4 text-body font-semibold text-ink"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
