import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
export function useApi(path, token, initial = []) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    if (!path) { setLoading(false); return () => controller.abort(); }
    setLoading(true); setError('');
    apiRequest(path, { token, signal: controller.signal }).then(setData)
      .catch(error => { if (error.name !== 'AbortError') setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, token, version]);
  return { data, setData, loading, error, reload };
}
