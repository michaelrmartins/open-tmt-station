import { useEffect, useRef, useState } from 'react';

/** Runs `fn` now and every `intervalMs`, re-running when `deps` change. Pauses while the tab is hidden. */
export function usePolling(fn, intervalMs, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    let timer;
    const run = async () => {
      clearTimeout(timer);
      try {
        const data = await fnRef.current();
        if (alive) setState({ data, error: null, loading: false });
      } catch (error) {
        if (alive) setState((s) => ({ ...s, error, loading: false }));
      }
      if (alive) timer = setTimeout(tick, intervalMs);
    };
    const tick = () => (document.hidden ? (timer = setTimeout(tick, intervalMs)) : run());
    const onVisible = () => !document.hidden && run();

    setState((s) => ({ ...s, loading: true }));
    run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return state;
}

/** Re-renders every `ms` (for live counters and relative times). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
