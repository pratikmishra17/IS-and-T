import { WritableSignal, effect, signal } from '@angular/core';

/**
 * A signal whose value the browser remembers, so a page opens the way it was left: the same tab,
 * filter or view. remembered('users.tab', 'students') works like signal('students'), but starts
 * from the saved value and saves every change.
 *
 * - Kept in localStorage by default (survives closing the browser); with { session: true }, in
 *   sessionStorage (until the browser is closed), for things like searches and dates.
 * - `allowed` rejects saved values that are no longer valid (a tab that was renamed, say).
 * - Must be created where inject() works (a component's fields), because it uses effect().
 */
export function remembered<T>(key: string, initial: T, options: { session?: boolean; allowed?: readonly T[] } = {}): WritableSignal<T> {
  const storageKey = `isandt.${key}`;
  const storage = (): Storage | null => {
    try {
      return options.session ? sessionStorage : localStorage;
    } catch {
      return null; // storage blocked, or rendering on the server
    }
  };

  let start = initial;
  try {
    const saved = storage()?.getItem(storageKey);
    if (saved != null) {
      const value = JSON.parse(saved) as T;
      if (!options.allowed || options.allowed.includes(value)) {
        start = value;
      }
    }
  } catch {
    // unreadable: start fresh
  }

  const value = signal<T>(start);
  effect(() => {
    const current = value();
    try {
      storage()?.setItem(storageKey, JSON.stringify(current));
    } catch {
      // storage full or blocked: just not remembered
    }
  });
  return value;
}
