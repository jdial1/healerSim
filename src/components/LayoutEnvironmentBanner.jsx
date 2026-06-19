import React from "react";
import { motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
const ISSUE_COPY = {
  "forced-desktop": {
    title: "Desktop site mode is on",
    body: "Your browser is pretending this phone is a desktop screen, which breaks the layout.",
    fix: 'Open the browser menu and turn off "Desktop site" or "Request desktop site", then reload the app.'
  },
  "custom-zoom": {
    title: "Page zoom is not at 100%",
    body: "Browser zoom is scaling the interface away from its intended size.",
    fix: "Reset zoom to 100% (pinch out on the page or use the browser zoom controls), then reload if needed."
  }
};
function LayoutEnvironmentBanner({ issues, onDismiss }) {
  return React.createElement(
    motion.div,
    {
      role: "presentation",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      className: "fixed inset-0 z-[150] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    },
    React.createElement(
      motion.div,
      {
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": "layout-env-heading",
        initial: { opacity: 0, y: 24, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.98 },
        transition: { duration: 0.3, ease: [0.175, 0.885, 0.32, 1.275] },
        className: "ui-panel w-full max-w-md overflow-hidden ring-1 ring-inset ring-amber-500/35"
      },
      React.createElement("div", { className: "flex items-start gap-3 border-b border-amber-900/40 bg-amber-950/35 px-4 py-3 sm:px-5" }, React.createElement(
        AlertTriangle,
        {
          size: 22,
          strokeWidth: 2.25,
          className: "mt-0.5 shrink-0 text-amber-300",
          "aria-hidden": true
        }
      ), React.createElement("div", { className: "min-w-0" }, React.createElement(
        "h2",
        {
          id: "layout-env-heading",
          className: "ui-heading text-base leading-tight text-amber-50 sm:text-lg"
        },
        "Layout may look wrong"
      ), React.createElement("p", { className: "mt-1 text-sm leading-relaxed text-amber-100/85" }, "Fix these browser settings so AEGIS displays correctly."))),
      React.createElement("ul", { className: "space-y-3 px-4 py-4 sm:px-5" }, issues.map((issue) => {
        const copy = ISSUE_COPY[issue];
        return React.createElement(
          "li",
          {
            key: issue,
            className: "rounded-lg border border-slate-700/70 bg-slate-900/55 px-3 py-3 text-sm leading-relaxed text-slate-200"
          },
          React.createElement("p", { className: "font-bold text-amber-100" }, copy.title),
          React.createElement("p", { className: "mt-1 text-slate-300" }, copy.body),
          React.createElement("p", { className: "mt-2 text-sky-100/95" }, React.createElement("span", { className: "font-semibold text-sky-200" }, "Fix: "), copy.fix)
        );
      })),
      React.createElement(
        "div",
        {
          className: "flex flex-wrap gap-2 border-t border-slate-700/60 px-4 py-3 sm:px-5",
          style: { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }
        },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => window.location.reload(),
            className: "ui-button-primary ui-state-frame ui-state-hover flex-1 py-2.5 text-center text-xs font-black uppercase tracking-widest text-amber-50 sm:text-sm"
          },
          "Reload"
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: onDismiss,
            className: "ui-state-frame ui-state-hover flex-1 rounded-md border border-slate-600 bg-slate-900/80 py-2.5 text-center text-xs font-bold uppercase tracking-widest text-slate-300 sm:text-sm"
          },
          "Continue anyway"
        )
      )
    )
  );
}
export {
  LayoutEnvironmentBanner
};
