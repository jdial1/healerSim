import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectLayoutEnvironmentIssues,
  type LayoutEnvironmentIssue,
} from '../layoutEnvironment.ts';

export function useLayoutEnvironmentCheck() {
  const baselineDpr = useRef(window.devicePixelRatio);
  const dismissed = useRef(false);
  const [issues, setIssues] = useState<LayoutEnvironmentIssue[]>(() =>
    detectLayoutEnvironmentIssues(baselineDpr.current),
  );

  const runCheck = useCallback(() => {
    const next = detectLayoutEnvironmentIssues(baselineDpr.current);
    if (next.length === 0) {
      dismissed.current = false;
      setIssues([]);
      return;
    }
    setIssues(dismissed.current ? [] : next);
  }, []);

  useEffect(() => {
    const scheduleCheck = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(runCheck);
      });
    };

    scheduleCheck();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', runCheck);
    visualViewport?.addEventListener('scroll', runCheck);
    window.addEventListener('resize', runCheck);
    window.addEventListener('orientationchange', scheduleCheck);

    return () => {
      visualViewport?.removeEventListener('resize', runCheck);
      visualViewport?.removeEventListener('scroll', runCheck);
      window.removeEventListener('resize', runCheck);
      window.removeEventListener('orientationchange', scheduleCheck);
    };
  }, [runCheck]);

  const dismiss = useCallback(() => {
    dismissed.current = true;
    setIssues([]);
  }, []);

  return { issues, dismiss };
}
