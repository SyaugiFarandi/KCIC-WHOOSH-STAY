import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ListParamDefaults = Record<string, string>;

export function useListParams(defaults: ListParamDefaults) {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultsRef = useRef(defaults);

  const values = useMemo(() => {
    const next: Record<string, string> = {};
    for (const [key, fallback] of Object.entries(defaultsRef.current)) {
      next[key] = searchParams.get(key) ?? fallback;
    }
    return next;
  }, [searchParams]);

  const page = Math.max(1, Number(values.page) || 1);
  const pageSize = Math.max(1, Number(values.pageSize) || 15);

  const setFilters = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          let resetsPage = false;
          for (const [key, value] of Object.entries(patch)) {
            const fallback = defaultsRef.current[key] ?? '';
            if (value === null || value === undefined || String(value) === fallback) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
            if (key !== 'page') resetsPage = true;
          }
          if (resetsPage && !('page' in patch)) {
            const fallbackPage = defaultsRef.current.page ?? '1';
            if (fallbackPage === '1') next.delete('page');
            else next.set('page', fallbackPage);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (nextPage: number) => setFilters({ page: String(Math.max(1, nextPage)) }),
    [setFilters],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => setFilters({ pageSize: String(nextPageSize) }),
    [setFilters],
  );

  return { values, page, pageSize, setFilters, setPage, setPageSize };
}
