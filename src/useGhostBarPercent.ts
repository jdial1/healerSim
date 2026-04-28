import { useEffect, useRef, useState } from 'react';

export function useGhostBarPercent(percent: number) {
  const prevRef = useRef(percent);
  const [ghostPercent, setGhostPercent] = useState(percent);
  const [ghostEaseDuration, setGhostEaseDuration] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = percent;
    if (percent >= prev - 0.02) {
      setGhostEaseDuration(0);
      setGhostPercent(percent);
      return;
    }
    setGhostEaseDuration(0);
    setGhostPercent(prev);
    const id = window.setTimeout(() => {
      setGhostEaseDuration(0.4);
      setGhostPercent(percent);
    }, 200);
    return () => window.clearTimeout(id);
  }, [percent]);

  return { ghostPercent, ghostEaseDuration };
}
