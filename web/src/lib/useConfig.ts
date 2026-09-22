import { useCallback, useEffect, useState } from 'react';
import { errMsg, fetchDays, fetchSlots } from './api';
import type { Day, Slot } from './types';

export function useConfig() {
  const [allDays, setAllDays] = useState<Day[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([fetchDays(), fetchSlots()]);
      setAllDays(d);
      setSlots(s);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const days = allDays.filter((d) => d.active);
  return { allDays, days, slots, loading, error, reload };
}
