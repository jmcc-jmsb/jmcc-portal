// ABOUTME: One nav definition shared by the tab bar, the desktop sidebar and the router.
// ABOUTME: Also decides which routes are tab roots, which is what drives the back affordance.
import type { TranslationKey } from '../i18n';
import type { Role } from './session';

export type NavItem = {
  key: string;
  /** Route path inside the SPA. The router's basename is /app. */
  path: string;
  labelKey: TranslationKey;
  /** Tab roots appear in the bottom bar and clear the back affordance. */
  tab: boolean;
  /** Which tab lights up when this route is active. */
  tabParent?: string;
  /** Omit for "everyone". */
  roles?: Role[];
  /** Mirrors the export's per-item shape cue (lines 58, 801) until real icons exist. */
  iconRadius: string;
};

// Order matches DESIGN_BRIEF §4. The first five are the mobile tab bar; the
// desktop sidebar shows the whole list.
export const NAV_ITEMS: NavItem[] = [
  { key: 'home', path: '/', labelKey: 'nav.home', tab: true, iconRadius: '3px' },
  { key: 'calendar', path: '/calendar', labelKey: 'nav.calendar', tab: true, iconRadius: '4px' },
  { key: 'cases', path: '/cases', labelKey: 'nav.cases', tab: true, iconRadius: '2px' },
  { key: 'tasks', path: '/tasks', labelKey: 'nav.tasks', tab: false, tabParent: 'more', iconRadius: '3px' },
  { key: 'messages', path: '/messages', labelKey: 'nav.messages', tab: true, iconRadius: '50%' },
  { key: 'documents', path: '/documents', labelKey: 'nav.documents', tab: false, tabParent: 'more', iconRadius: '2px' },
  { key: 'feedback', path: '/feedback', labelKey: 'nav.feedback', tab: false, tabParent: 'more', iconRadius: '50%' },
  { key: 'cabinet', path: '/cabinet', labelKey: 'nav.cabinet', tab: false, tabParent: 'more', iconRadius: '5px' },
  {
    key: 'admin',
    path: '/admin',
    labelKey: 'nav.admin',
    tab: false,
    tabParent: 'more',
    roles: ['superuser', 'executive'],
    iconRadius: '3px',
  },
];

/** The bottom bar. `more` is not a destination in NAV_ITEMS — it is the drawer. */
export const MORE_ITEM: NavItem = {
  key: 'more',
  path: '/more',
  labelKey: 'nav.more',
  tab: true,
  iconRadius: '3px',
};

export const TAB_ITEMS: NavItem[] = [...NAV_ITEMS.filter((i) => i.tab), MORE_ITEM];

/** Everything reachable from the More drawer, in order. */
export const MORE_ITEMS: NavItem[] = [
  ...NAV_ITEMS.filter((i) => i.tabParent === 'more'),
  { key: 'profile', path: '/profile', labelKey: 'nav.profile', tab: false, tabParent: 'more', iconRadius: '50%' },
];

export function visibleTo(items: NavItem[], role: Role): NavItem[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

/**
 * Which tab is lit for a given path.
 *
 * The export does this at line 1213 — deep screens reached through More keep the
 * More tab highlighted rather than lighting nothing.
 */
export function activeTabFor(pathname: string): string {
  const match = matchItem(pathname);
  if (!match) return 'home';
  return match.tab ? match.key : (match.tabParent ?? 'home');
}

export function matchItem(pathname: string): NavItem | undefined {
  const all = [...NAV_ITEMS, MORE_ITEM, ...MORE_ITEMS];
  // Longest path first, so /messages/general matches /messages, not /.
  const sorted = [...all].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((i) => (i.path === '/' ? pathname === '/' : pathname.startsWith(i.path)));
}

/**
 * Is this route a tab root?
 *
 * This is the whole back-affordance rule. The prototype tracked an explicit
 * `stack` array (export lines 1062–1064) because it had no router; with a real
 * router the browser history *is* that stack, so the only thing left to decide
 * is whether to show the control — and a route is "deep" exactly when it is not
 * one of the five tab roots.
 */
export function isTabRoot(pathname: string): boolean {
  return TAB_ITEMS.some((i) => (i.path === '/' ? pathname === '/' : pathname === i.path));
}
