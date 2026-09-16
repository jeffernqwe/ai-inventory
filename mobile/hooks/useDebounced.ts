import { useEffect, useState } from 'react';

/** Returns `value` after it has been stable for `delay` ms (search fields). */
export default function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
