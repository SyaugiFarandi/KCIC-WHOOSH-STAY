import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * Keeps a debounced search input and the URL query in sync without letting a
 * stale input value overwrite history navigation (Back/Forward).
 */
export function useUrlSyncedSearch(
  urlValue: string,
  commit: (value: string) => void,
  delay = 300,
) {
  const [value, setValue] = useState(urlValue);
  const debounced = useDebouncedValue(value, delay);
  const lastSynced = useRef(urlValue);
  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    if (urlValue === lastSynced.current) return;
    lastSynced.current = urlValue;
    setValue(urlValue);
  }, [urlValue]);

  useEffect(() => {
    const next = debounced.trim();
    if (next === lastSynced.current) return;
    lastSynced.current = next;
    commitRef.current(next);
  }, [debounced]);

  return { value, setValue };
}
