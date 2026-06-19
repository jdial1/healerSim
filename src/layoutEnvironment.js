const FORCED_DESKTOP_MIN_WIDTH = 980;
const ZOOM_SCALE_TOLERANCE = 0.05;
const DPR_TOLERANCE = 0.05;
function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches;
}
function detectForcedDesktop() {
  return isTouchDevice() && window.innerWidth >= FORCED_DESKTOP_MIN_WIDTH;
}
function detectCustomZoom(baselineDpr) {
  if (!isTouchDevice()) return false;
  const scale = window.visualViewport?.scale ?? 1;
  if (Math.abs(scale - 1) > ZOOM_SCALE_TOLERANCE) return true;
  return Math.abs(window.devicePixelRatio - baselineDpr) > DPR_TOLERANCE;
}
function detectLayoutEnvironmentIssues(baselineDpr) {
  const issues = [];
  if (detectForcedDesktop()) issues.push("forced-desktop");
  if (detectCustomZoom(baselineDpr)) issues.push("custom-zoom");
  return issues;
}
function clampTooltipX(tipRect, viewportWidth, margin = 12) {
  let dx = 0;
  if (tipRect.right > viewportWidth - margin) dx += viewportWidth - margin - tipRect.right;
  if (tipRect.left + dx < margin) dx += margin - (tipRect.left + dx);
  return dx;
}
export {
  clampTooltipX,
  detectCustomZoom,
  detectForcedDesktop,
  detectLayoutEnvironmentIssues,
  isTouchDevice
};
