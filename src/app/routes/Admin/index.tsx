// ABOUTME: The admin console — members and roles, roster import, and the audit log.
// ABOUTME: Role controls are visibly gated for executives rather than hidden (DESIGN_BRIEF §5.11).
import { useState } from 'react';
import { useT } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { useSession } from '../../lib/session';
import Members from './Members';
import Import from './Import';
import AuditLog from './AuditLog';

const TABS = ['members', 'import', 'audit'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, TranslationKey> = {
  members: 'admin.members',
  import: 'admin.import',
  audit: 'admin.audit',
};

export default function Admin() {
  const t = useT();
  const { roles, effectiveRole } = useSession();
  const [tab, setTab] = useState<Tab>('members');

  /* Read from the real roles, not the effective one. The dev switcher changes
     what the UI offers; it must not change what this screen claims a person is
     allowed to do, because the answer here is about a permission rather than a
     layout. */
  const isSuperuser = roles.includes('superuser');

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <header>
        <h1 className="font-unbounded text-title font-bold text-primary">{t('nav.admin')}</h1>
        <p className="mt-1 text-body text-muted">{t(`role.${effectiveRole}` as const)}</p>
      </header>

      <div role="tablist" aria-label={t('nav.admin')} className="flex gap-1.5">
        {TABS.map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
            className={[
              'min-h-11 flex-1 rounded-sm px-2 text-body font-semibold',
              tab === option ? 'bg-primary text-cream' : 'border border-muted/30 bg-white text-ink',
            ].join(' ')}
          >
            {t(TAB_LABEL[option])}
          </button>
        ))}
      </div>

      {tab === 'members' && <Members isSuperuser={isSuperuser} />}
      {tab === 'import' && <Import />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}
