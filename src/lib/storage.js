import { useEffect, useState } from 'react';

export const MAX_RESULTS = 10;
export const MAX_FRIENDS = 10;

export const KEYS = {
  results: 'vslab.results.v1',
  friends: 'vslab.friends.v1',
  settings: 'vslab.settings.v1',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** useState mirrored to localStorage. */
export function useStored(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable – keep in memory */
    }
  }, [key, value]);
  return [value, setValue];
}
