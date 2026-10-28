// The color theme: follow the system, or the light or dark theme the user picked (kept in this browser).

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'paradox-diagram:theme';
export const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export function readTheme(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ThemeChoice {
  try {
    const v = storage?.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Show the theme now and keep the choice; "system" removes the override so the CSS follows the system. */
export function applyTheme(choice: ThemeChoice, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage()): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') storage?.removeItem(KEY);
    else storage?.setItem(KEY, choice);
  } catch {
    // no storage: the choice lasts until the page closes
  }
}

export const nextTheme = (c: ThemeChoice): ThemeChoice => THEME_ORDER[(THEME_ORDER.indexOf(c) + 1) % THEME_ORDER.length];

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
