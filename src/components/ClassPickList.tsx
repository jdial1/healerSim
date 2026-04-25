import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { ClassType } from '../types.ts';
import { classUiRows, type ClassUiRow } from '../classUiData.ts';

export type ClassPickListProps = {
  title: ReactNode;
  isRowLocked: (row: ClassUiRow) => boolean;
  onRowActivate: (cls: ClassType) => void;
  subline?: (row: ClassUiRow) => ReactNode;
  showDescription?: boolean;
};

export function ClassPickList({
  title,
  isRowLocked,
  onRowActivate,
  subline,
  showDescription = false,
}: ClassPickListProps) {
  const rows = classUiRows();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
      <motion.div
        className="mb-12 text-center text-6xl font-black uppercase italic leading-none tracking-tighter text-white sm:text-8xl"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        {title}
      </motion.div>
      <div className="grid w-full max-w-xl gap-4">
        {rows.map((row) => {
          const locked = isRowLocked(row);
          const extra = subline?.(row);
          return (
            <motion.button
              key={row.id}
              type="button"
              disabled={locked}
              onClick={() => {
                if (!locked) onRowActivate(row.id);
              }}
              whileHover={!locked ? { x: 10, backgroundColor: '#1e293b' } : {}}
              whileTap={!locked ? { scale: 0.98 } : {}}
              className={`relative flex items-center gap-8 border-l-8 p-8 text-left transition-all ${
                locked
                  ? 'cursor-not-allowed border-slate-800 bg-slate-900/50 opacity-45'
                  : `border-slate-700 bg-slate-900 shadow-2xl ${row.hoverBorderClass}`
              }`}
            >
              <div className="flex shrink-0 items-center gap-3">
                {row.portraitUrl ? (
                  <img
                    src={row.portraitUrl}
                    alt=""
                    className="h-20 w-20 rounded-sm border border-slate-700 object-cover"
                  />
                ) : null}
                <div
                  className={`${row.color} -rotate-3 transform rounded-sm p-5 text-white shadow-[0_0_20px_rgba(0,0,0,0.5)]`}
                >
                  <row.icon size={40} strokeWidth={3} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={`text-3xl font-black uppercase italic tracking-tighter ${row.textColor}`}>
                  {row.name}
                </h3>
                {showDescription ? (
                  <p className="mt-2 max-w-xs text-base font-medium leading-tight text-slate-400 sm:text-sm">
                    {row.description}
                  </p>
                ) : extra ? (
                  <p className="mt-2 font-mono text-sm font-bold text-slate-400">{extra}</p>
                ) : null}
              </div>
              {locked ? (
                <div className="absolute right-4 top-2 text-xs font-black uppercase tracking-[0.3em] text-red-500 sm:text-[10px]">
                  Restricted
                </div>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
