import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { ClassType } from '../types.ts';
import { classUiRows, type ClassUiRow } from '../classUiData.ts';
import { classIconTransformClass, classIconUrl, classIconWrapperTransformClass } from '../classIcons.ts';

export type ClassPickListProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  isRowLocked: (row: ClassUiRow) => boolean;
  onRowActivate: (cls: ClassType) => void;
  subline?: (row: ClassUiRow) => ReactNode;
  showDescription?: boolean;
};

export function ClassPickList({
  title,
  subtitle,
  isRowLocked,
  onRowActivate,
  subline,
  showDescription = false,
}: ClassPickListProps) {
  const rows = classUiRows();
  const rowTapGlow = (cls: ClassType): string => {
    if (cls === 'PRIEST') return '0 0 0 2px rgba(250, 204, 21, 0.85), 0 0 34px rgba(250, 204, 21, 0.55)';
    if (cls === 'DRUID') return '0 0 0 2px rgba(34, 197, 94, 0.85), 0 0 34px rgba(34, 197, 94, 0.5)';
    return '0 0 0 2px rgba(96, 165, 250, 0.75), 0 0 32px rgba(96, 165, 250, 0.48)';
  };
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6">
      <motion.div
        className="mb-8 text-center sm:mb-9"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="ui-heading text-4xl leading-none tracking-[0.07em] text-white sm:text-6xl">{title}</div>
        {subtitle ? (
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-xs">{subtitle}</p>
        ) : null}
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
              whileTap={!locked ? { scale: 1.05, boxShadow: rowTapGlow(row.id) } : {}}
              className={`relative flex items-center gap-5 rounded-md border p-6 text-left transition-all sm:gap-6 sm:p-7 ${
                locked
                  ? 'ui-panel ui-state-frame ui-state-disabled cursor-not-allowed bg-slate-900/50'
                  : `ui-panel ui-state-frame ui-state-hover ${row.hoverBorderClass}`
              }`}
            >
              <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
                {row.portraitUrl ? (
                  <img
                    src={row.portraitUrl}
                    alt=""
                    className="h-20 w-20 rounded-sm object-cover"
                  />
                ) : null}
                <div className={classIconWrapperTransformClass()}>
                  <img
                    src={classIconUrl(row.id)}
                    alt=""
                    draggable={false}
                    className={`h-[5.5rem] w-[5.5rem] select-none object-contain [filter:drop-shadow(0_2px_2px_rgba(0,0,0,0.6))] sm:h-[6rem] sm:w-[6rem] ${classIconTransformClass(row.id)}`}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={`ui-heading text-xl tracking-[0.05em] sm:text-2xl ${row.textColor}`}>
                  {row.name}
                </h3>
                {showDescription ? (
                  <div className="mt-2 max-w-md space-y-2">
                    <p className="max-w-xs text-base font-medium leading-tight text-slate-400 sm:text-sm">
                      {row.description}
                    </p>
                    {extra ? <div className="text-slate-400">{extra}</div> : null}
                  </div>
                ) : extra ? (
                  <div className="mt-2 font-mono text-sm font-bold text-slate-400">{extra}</div>
                ) : null}
              </div>
              {locked ? (
                <div className="absolute right-4 top-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300 sm:text-[9px]">
                  <span aria-hidden>🔒</span>
                  <span>Reach lvl 30 to unlock</span>
                </div>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
