import React from "react";
import { motion } from "motion/react";
import { Settings, Github } from "lucide-react";
function SplashScreen({
  onEnter,
  version,
  onOpenSettings,
  communityUrl = "https://x.com"
}) {
  return React.createElement(
    motion.div,
    {
      role: "dialog",
      "aria-labelledby": "app-splash-title",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, scale: 1.02 },
      transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
      className: "ui-splash-root"
    },
    React.createElement("div", { className: "ui-splash-aurora", "aria-hidden": true }, React.createElement("div", { className: "ui-splash-art", style: { backgroundImage: "url(https://i.imgur.com/0z2tbTQ.png)" } }), React.createElement("div", { className: "ui-splash-blob ui-splash-blob-1" }), React.createElement("div", { className: "ui-splash-blob ui-splash-blob-2" }), React.createElement("div", { className: "ui-splash-blob ui-splash-blob-3" }), React.createElement("div", { className: "ui-splash-shimmer" }), React.createElement("div", { className: "ui-splash-grid" }), React.createElement("div", { className: "ui-splash-mote ui-splash-mote-1" }), React.createElement("div", { className: "ui-splash-mote ui-splash-mote-2" }), React.createElement("div", { className: "ui-splash-mote ui-splash-mote-3" }), React.createElement("div", { className: "ui-splash-mote ui-splash-mote-4" }), React.createElement("div", { className: "ui-splash-vignette" })),
    React.createElement("div", { className: "ui-splash-foreground", "aria-hidden": true }, React.createElement("div", { className: "ui-splash-ember ui-splash-ember-1" }), React.createElement("div", { className: "ui-splash-ember ui-splash-ember-2" }), React.createElement("div", { className: "ui-splash-ember ui-splash-ember-3" }), React.createElement("div", { className: "ui-splash-ember ui-splash-ember-4" }), React.createElement("div", { className: "ui-splash-ember ui-splash-ember-5" })),
    React.createElement("div", { className: "relative z-10 flex min-h-dvh flex-col px-6 pb-10 pt-10 sm:pb-12" }, React.createElement("div", { className: "flex items-start justify-end" }, React.createElement(
      "button",
      {
        type: "button",
        onClick: onOpenSettings,
        className: "ui-splash-utility-icon",
        "aria-label": "Open settings"
      },
      React.createElement(Settings, { size: 16, strokeWidth: 2.25 })
    )), React.createElement("div", { className: "flex flex-1 flex-col items-center justify-center gap-5 pb-[22vh] sm:pb-[18vh]" }, React.createElement(
      motion.div,
      {
        className: "text-center",
        initial: { y: 24, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        transition: { delay: 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
      },
      React.createElement(
        "h1",
        {
          id: "app-splash-title",
          className: "ui-heading text-5xl leading-[0.95] tracking-[0.04em] text-white sm:text-7xl md:text-8xl"
        },
        "AEGIS"
      ),
      React.createElement("p", { className: "ui-splash-subtitle" }, "THE HEALER'S OATH")
    ), React.createElement(
      motion.button,
      {
        type: "button",
        onClick: onEnter,
        initial: { y: 16, opacity: 0 },
        animate: { y: 0, opacity: 1, scale: [1, 1.02, 1] },
        transition: {
          y: { delay: 0.28, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          opacity: { delay: 0.28, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          scale: { delay: 0.9, duration: 2.8, repeat: Infinity, ease: "easeInOut" }
        },
        whileHover: { scale: 1.03 },
        whileTap: { scale: 0.98 },
        className: "ui-splash-cta group"
      },
      "Tap to Begin"
    )), React.createElement("div", { className: "flex items-end justify-between" }, React.createElement("span", { className: "ui-splash-meta" }, "v", version), React.createElement(
      "a",
      {
        href: communityUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "ui-splash-utility-icon",
        "aria-label": "Community"
      },
      React.createElement(Github, { size: 16, strokeWidth: 2.25 })
    )))
  );
}
export {
  SplashScreen
};
