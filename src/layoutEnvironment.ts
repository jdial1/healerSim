export type LayoutEnvironmentIssue = 'forced-desktop' | 'custom-zoom';

const FORCED_DESKTOP_MIN_WIDTH = 980;
const ZOOM_SCALE_TOLERANCE = 0.05;
const DPR_TOLERANCE = 0.05;

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export function detectForcedDesktop(): boolean {
  return isTouchDevice() && window.innerWidth >= FORCED_DESKTOP_MIN_WIDTH;
}

export function detectCustomZoom(baselineDpr: number): boolean {
  if (!isTouchDevice()) return false;
  const scale = window.visualViewport?.scale ?? 1;
  if (Math.abs(scale - 1) > ZOOM_SCALE_TOLERANCE) return true;
  return Math.abs(window.devicePixelRatio - baselineDpr) > DPR_TOLERANCE;
}

export function detectLayoutEnvironmentIssues(baselineDpr: number): LayoutEnvironmentIssue[] {
  const issues: LayoutEnvironmentIssue[] = [];
  if (detectForcedDesktop()) issues.push('forced-desktop');
  if (detectCustomZoom(baselineDpr)) issues.push('custom-zoom');
  return issues;
}
