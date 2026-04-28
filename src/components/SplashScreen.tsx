import { motion } from 'motion/react';
import { Settings, Github } from 'lucide-react';

type SplashScreenProps = {
  onEnter: () => void;
  version: string;
  onOpenSettings?: () => void;
  communityUrl?: string;
};

export function SplashScreen({
  onEnter,
  version,
  onOpenSettings,
  communityUrl = 'https://x.com',
}: SplashScreenProps) {
  return (
    <motion.div
      role="dialog"
      aria-labelledby="app-splash-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="ui-splash-root"
    >
      <div className="ui-splash-aurora" aria-hidden>
        <div className="ui-splash-art" style={{ backgroundImage: 'url(/game_bg.png)' }} />
        <div className="ui-splash-blob ui-splash-blob-1" />
        <div className="ui-splash-blob ui-splash-blob-2" />
        <div className="ui-splash-blob ui-splash-blob-3" />
        <div className="ui-splash-shimmer" />
        <div className="ui-splash-grid" />
        <div className="ui-splash-mote ui-splash-mote-1" />
        <div className="ui-splash-mote ui-splash-mote-2" />
        <div className="ui-splash-mote ui-splash-mote-3" />
        <div className="ui-splash-mote ui-splash-mote-4" />
        <div className="ui-splash-vignette" />
      </div>
      <div className="ui-splash-foreground" aria-hidden>
        <div className="ui-splash-ember ui-splash-ember-1" />
        <div className="ui-splash-ember ui-splash-ember-2" />
        <div className="ui-splash-ember ui-splash-ember-3" />
        <div className="ui-splash-ember ui-splash-ember-4" />
        <div className="ui-splash-ember ui-splash-ember-5" />
      </div>
      <div className="relative z-10 flex min-h-dvh flex-col px-6 pb-10 pt-10 sm:pb-12">
        <div className="flex items-start justify-end">
          <button
            type="button"
            onClick={onOpenSettings}
            className="ui-splash-utility-icon"
            aria-label="Open settings"
          >
            <Settings size={16} strokeWidth={2.25} />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-[22vh] sm:pb-[18vh]">
        <motion.div
          className="text-center"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1
            id="app-splash-title"
            className="ui-heading text-5xl leading-[0.95] tracking-[0.08em] text-white sm:text-7xl md:text-8xl"
          >
            AEGIS
          </h1>
          <p className="ui-splash-subtitle">THE HEALER&apos;S OATH</p>
        </motion.div>
        <motion.button
          type="button"
          onClick={onEnter}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1, scale: [1, 1.02, 1] }}
          transition={{
            y: { delay: 0.28, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
            opacity: { delay: 0.28, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
            scale: { delay: 0.9, duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="ui-splash-cta group"
        >
          Tap to Begin
        </motion.button>
        </div>
        <div className="flex items-end justify-between">
          <span className="ui-splash-meta">v{version}</span>
          <a
            href={communityUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-splash-utility-icon"
            aria-label="Community"
          >
            <Github size={16} strokeWidth={2.25} />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
