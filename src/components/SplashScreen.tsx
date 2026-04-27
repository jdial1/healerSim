import { motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';

type SplashScreenProps = {
  onEnter: () => void;
};

export function SplashScreen({ onEnter }: SplashScreenProps) {
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
        <div className="ui-splash-blob ui-splash-blob-1" />
        <div className="ui-splash-blob ui-splash-blob-2" />
        <div className="ui-splash-blob ui-splash-blob-3" />
        <div className="ui-splash-shimmer" />
        <div className="ui-splash-grid" />
        <div className="ui-splash-vignette" />
      </div>
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-10 px-6 pb-24 pt-16">
        <motion.div
          className="text-center"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1
            id="app-splash-title"
            className="text-5xl font-black uppercase italic leading-[0.95] tracking-tighter text-white sm:text-7xl md:text-8xl"
          >
            healer
            <br />
            <span className="text-blue-500">Sim</span>
          </h1>
        </motion.div>
        <motion.button
          type="button"
          onClick={onEnter}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          className="group flex items-center gap-2 rounded border border-blue-500/60 bg-blue-600 px-8 py-3.5 text-sm font-black uppercase tracking-[0.2em] text-white shadow-[0_0_28px_rgba(37,99,235,0.35)] transition-shadow hover:border-blue-400 hover:shadow-[0_0_36px_rgba(59,130,246,0.45)]"
        >
          Roster
          <ChevronRight
            size={18}
            strokeWidth={2.5}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </motion.button>
      </div>
    </motion.div>
  );
}
