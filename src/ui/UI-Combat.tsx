import {
  memo,
  useEffect,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  Fragment,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { DragEvent } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import type { StatusEffect, Unit, FloatingCombatTextEntry, PlayerCombatStats } from '../types';
import { SPELLS } from '../data/index';
import { Shield, Zap, User } from 'lucide-react';
import {
  TICKS_PER_SECOND,
  INTRO_DEBUFF_ABILITY,
  INTRO_DEBUFF_DATA_ID,
  TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
} from '../constants';
import { TRASH_PACK_COUNT, getEndlessMultiplier } from '../formulas';
import { useGhostBarPercent } from '../hooks';
import { GameIcon, getSpellGlow, getAbilityGlow, getSelfBuffGlow } from './UI-Shared';
// ========= Dummy Functions =========

function bossBuffTooltipText(buff: StatusEffect): string {
  return buff.name || 'Buff';
}

// ========= Dummy Components =========

function TrashPackSkull({ defeated }: { defeated: boolean }) {
  return <GameIcon iconPath="lorc/skull" size="sm" className={defeated ? 'opacity-50' : ''} />;
}

function BossSkull({ bossActive }: { bossActive: boolean }) {
  return <GameIcon iconPath="lorc/skull" size="lg" className={bossActive ? 'opacity-100' : 'opacity-50'} />;
}

export type GameHUDProps = {
  combatPhase: string;
  trashPacks: number;
  enemyHealth: number;
  enemyMaxHealth: number;
  bossName: string;
  trashEnemyName: string;
  bossEffects?: StatusEffect[];
  endlessStacks: number;
};

function GameHUDInner({
  combatPhase,
  trashPacks,
  enemyHealth,
  enemyMaxHealth,
  bossName,
  trashEnemyName,
  bossEffects = [],
  endlessStacks,
}: GameHUDProps) {
  const [bossBuffTip, setBossBuffTip] = useState<{
    buff: StatusEffect;
    x: number;
    y: number;
  } | null>(null);
  const [bossBuffTipShiftX, setBossBuffTipShiftX] = useState(0);
  const bossBuffTipRef = useRef<HTMLDivElement>(null);

  const enemyPercent = enemyMaxHealth > 0 ? (enemyHealth / enemyMaxHealth) * 100 : 0;
  const { ghostPercent, ghostEaseDuration } = useGhostBarPercent(enemyPercent);

  const packsCleared = TRASH_PACK_COUNT - trashPacks;
  const bossActive = combatPhase === 'BOSS';
  const enemyBarHeightClass = bossActive
    ? 'h-[3.6rem] sm:h-[4.75rem]'
    : 'h-[4.5rem] sm:h-[4.75rem]';
  const enemyBarFill = bossActive
    ? 'bg-gradient-to-r from-[#2b0f0f] via-[#4a1d1a] to-[#6a2c1e]'
    : 'bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#334155]';
  const displayBossName = bossName || 'FINAL BOSS';
  
  const bossBarRowClass = (() => {
    if (bossActive && bossEffects.length > 0) return 'justify-between gap-2';
    if (bossActive) return 'justify-end';
    return 'justify-between gap-3';
  })();

  useEffect(() => {
    if (!bossBuffTip) return;
    const close = () => setBossBuffTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [bossBuffTip]);

  useEffect(() => {
    if (!bossBuffTip) return;
    const close = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.closest('[data-boss-buff-tip]')) return;
      setBossBuffTip(null);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [bossBuffTip]);

  useLayoutEffect(() => {
    if (!bossBuffTip) {
      setBossBuffTipShiftX(0);
      return;
    }
    const tip = bossBuffTipRef.current;
    if (!tip) return;
    const vw = window.visualViewport;
    const viewWidth = vw?.width ?? window.innerWidth;
    if (!viewWidth) return;
    const margin = 12;
    const rect = tip.getBoundingClientRect();
    let dx = 0;
    if (rect.right > viewWidth - margin) dx += viewWidth - margin - rect.right;
    if (rect.left + dx < margin) dx += margin - (rect.left + dx);
    setBossBuffTipShiftX(dx);
  }, [bossBuffTip]);

  return (
    <>
      <div className="ui-frame-divider-bottom fixed top-0 left-0 right-0 z-40 bg-slate-950/90 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-2 px-3 pb-3 pt-3 sm:gap-2.5 sm:px-4 sm:pb-3.5 sm:pt-4">
          <div className="mx-auto w-full max-w-6xl">
            {bossActive ? (
              <div className="flex w-full flex-col items-center gap-2 sm:gap-2.5">
                <div className="flex w-full flex-wrap items-center justify-center gap-2">
                  {endlessStacks !== undefined ? (
                    <span className="ui-frame rounded bg-fuchsia-950/45 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200 sm:text-[9px]">
                      Endless x{getEndlessMultiplier(endlessStacks).toFixed(2)}
                    </span>
                  ) : null}
                </div>
                <h1 className="ui-heading w-full max-w-full text-balance text-center text-2xl leading-[1.05] tracking-[0.06em] text-white sm:text-3xl md:text-4xl">
                  {displayBossName}
                </h1>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-tight text-slate-300 sm:text-sm">
                  {trashEnemyName}
                </span>
                {!bossActive ? (
                  <div className="mx-auto flex w-full items-center justify-evenly">
                    {Array.from({ length: TRASH_PACK_COUNT }, (_, i) => (
                      <Fragment key={i}>
                        <TrashPackSkull defeated={packsCleared > i} />
                      </Fragment>
                    ))}
                    <BossSkull bossActive={bossActive} />
                  </div>
                ) : null}
              </div>
            )}
            {endlessStacks !== undefined && !bossActive ? (
              <div className="mt-1.5 flex justify-center sm:mt-2">
                <span className="ui-frame rounded bg-fuchsia-950/45 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200 tabular-nums sm:text-[9px]">
                  Endless Ãƒâ€”{getEndlessMultiplier(endlessStacks).toFixed(2)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl">
        <div className={`ui-enemy-target-frame ${enemyBarHeightClass} w-full`}>
          <motion.div
            className="ui-enemy-hp-ghost"
            initial={false}
            animate={{ width: `${ghostPercent}%` }}
            transition={{
              duration: ghostEaseDuration,
              ease: ghostEaseDuration > 0 ? [0.4, 0, 0.2, 1] : 'linear',
            }}
          />

          <motion.div
            className={`ui-enemy-hp-fill ${enemyBarFill}`}
            initial={false}
            animate={{ width: `${enemyPercent}%` }}
            transition={{ duration: 0 }}
          />

          <div className="ui-enemy-hp-sheen" aria-hidden />
          
          <div
            className={`relative z-10 flex h-full items-center px-4 sm:px-4 ${bossBarRowClass}`}
          >
            {bossActive && bossEffects.length > 0 ? (
              <div className="flex min-w-0 shrink items-center gap-1 sm:gap-1.5">
                {bossEffects.map((b) => {
                  const secondsLeft = Math.ceil(b.remainingTicks / 10);
                  const showCountdown = b.remainingTicks < 50;

                  return (
                    <button
                      key={b.id}
                      type="button"
                      data-boss-buff-tip
                      className="ui-state-frame ui-state-hover relative inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-md active:scale-95 sm:p-0.5"
                      aria-label={`${b.name}, show details`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setBossBuffTip((prev) =>
                          prev?.buff.id === b.id
                            ? null
                            : { buff: b, x: r.left + r.width / 2, y: r.bottom },
                        );
                      }}
                    >
                      <GameIcon
                        iconPath={b.icon}
                        glow={getSelfBuffGlow(b.sourceId)}
                        size="xs"

                      />
                      {showCountdown ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-slate-950/90 px-0.5 text-[10px] font-bold tabular-nums text-amber-300 sm:text-[7px]">
                          {secondsLeft}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!bossActive ? (
              <span className="ui-state-frame min-w-0 max-w-[min(100%,14rem)] truncate rounded-md bg-slate-950/80 px-3 py-1.5 text-left text-xs font-bold leading-none tracking-[0.14em] text-slate-100 ring-1 ring-red-950/50 sm:max-w-[min(100%,18rem)] sm:text-sm">
                <span className="font-normal text-red-300/95">Target</span>
                <span className="mx-1.5 font-light text-slate-500" aria-hidden>
                  Ã‚Â·
                </span>
                <span className="normal-case tracking-normal text-slate-50">{trashEnemyName}</span>
              </span>
            ) : null}
            <span className="shrink-0 font-mono text-lg font-bold tabular-nums tracking-tight text-white sm:text-xl">
              {Math.max(0, Math.floor(enemyHealth))}
              <span className="text-base font-normal text-slate-400">/{Math.floor(enemyMaxHealth)}</span>
            </span>
          </div>
        </div>
      </div>

      {bossBuffTip
        ? createPortal(
            <div
              ref={bossBuffTipRef}
              className="ui-debuff-tooltip-wrap pointer-events-none relative"
              style={{
                position: 'fixed',
                left: bossBuffTip.x,
                top: bossBuffTip.y,
                transform: `translate(calc(-50% + ${bossBuffTipShiftX}px), 10px)`,
                zIndex: 400,
              }}
            >
              <div className="ui-spell-tooltip-arrow-up" aria-hidden />
              <GameIcon
                iconPath={bossBuffTip.buff.icon}
                glow={getSelfBuffGlow(bossBuffTip.buff.sourceId)}
                size="md"
                className="ui-spell-tooltip-icon"

              />
              <div className="ui-spell-tooltip-body">
                <div className="ui-spell-tooltip-title">
                  <span className="ui-spell-tooltip-title-text">{bossBuffTip.buff.name}</span>
                </div>
                <div className="ui-spell-tooltip-desc mt-1.5 text-amber-100/95">
                  {bossBuffTooltipText(bossBuffTip.buff)}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export const GameHUD = memo(GameHUDInner);

function fmtDebuffNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function unitRoleLabel(role: Unit['role']): string {
  if (role === 'DPS') return 'DPS';
  if (role === 'TANK') return 'Tank';
  return 'Healer';
}

function partyDebuffTooltipText(d: StatusEffect): string {
  const perSec = (d.valuePerTick ?? 0) * 10;
  const total = (d.valuePerTick ?? 0) * d.remainingTicks;
  const sec = d.remainingTicks / 10;
  const lines = [
    `Deals ${fmtDebuffNumber(perSec)} damage per second.`,
    `${fmtDebuffNumber(total)} damage over ${fmtDebuffNumber(sec)} sec remaining.`,
  ];
  if (d.isDispellable) lines.push('Can be dispelled.');
  return lines.join('\n');
}

function hotMaxTicks(buff: StatusEffect): number {
  if (typeof buff.durationTicksMax === 'number' && buff.durationTicksMax > 0) {
    return buff.durationTicksMax;
  }
  return Math.max(1, buff.remainingTicks);
}

function HoTBuffIcon({ buff }: { buff: StatusEffect }) {
  const maxT = Math.max(1, buff.durationTicksMax ?? hotMaxTicks(buff));
  const sweep = Math.max(0, Math.min(1, buff.remainingTicks / maxT));
  const deg = sweep * 360;
  const secondsLeft = Math.ceil(buff.remainingTicks / 10);
  const urgent = buff.remainingTicks <= 30;

  return (
    <div className="relative h-8 w-8 shrink-0" title={buff.name}>
      <div
        className="ui-hot-ring-outer"
        style={{
          background: `conic-gradient(from -90deg, rgba(52,211,153,0.92) ${deg}deg, rgba(15,23,42,0.96) 0deg)`,
        }}
      />
      <div className="ui-hot-inner">
        <GameIcon iconPath={buff.icon} glow={getSpellGlow(buff.sourceId)} size="xs" className="scale-90" />
      </div>
      <div className={`ui-hot-timer ${urgent ? 'ui-hot-timer-urgent' : 'ui-hot-timer-ok'}`}>{secondsLeft}</div>
    </div>
  );
}

function ManaRegenBuffIcon({ buff }: { buff: StatusEffect }) {
  const showCountdown = buff.remainingTicks < 50;
  return (
    <div className="relative sm:p-0.5" title={buff.name}>
       <GameIcon iconPath={buff.icon} glow={getSpellGlow(buff.sourceId)} size="xs" />
      {showCountdown ? (
        <div className="ui-mana-regen-overlay">{Math.ceil(buff.remainingTicks / 10)}</div>
      ) : null}
    </div>
  );
}

interface HealGridProps {
  party: Unit[];
  onTargetSelect: (id: string) => void;
  selectedId: string | null;
  combatFloats: FloatingCombatTextEntry[];
  syncIntroDebuffTip?: boolean;
  debuffTipZIndex?: number;
  holdIntroDebuffTip?: boolean;
}

function HealGridFloatingLayer({ entries }: { entries: FloatingCombatTextEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="ui-heal-grid-fct-root" aria-hidden>
      {entries.map((f, i) => {
        const spread = (i - (entries.length - 1) / 2) * 14;
        const isCritHeal = f.kind === 'heal' && f.crit;
        return (
          <motion.span
            key={f.id}
            className={
              f.kind === 'heal'
                ? isCritHeal
                  ? 'ui-heal-grid-fct-heal ui-heal-grid-fct-crit'
                  : 'ui-heal-grid-fct-heal'
                : 'ui-heal-grid-fct-absorb'
            }
            initial={{ y: 10, opacity: 0, x: spread }}
            animate={{ y: -56, opacity: [1, 1, 0], x: spread }}
            transition={{ duration: 1.12, ease: [0.22, 1, 0.36, 1] }}
          >
            {f.kind === 'absorb' ? '+' : ''}
            {f.amount}
          </motion.span>
        );
      })}
    </div>
  );
}

function healthTierClasses(percent: number) {
  // BASE TEXTURE: Applies a top gloss (white inset) and bottom shadow (black inset) 
  // to mimic the classic WoW "UI-StatusBar" texture.
  const baseTexture = 'bg-gradient-to-b shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.4)]';

  // CRITICAL (Under 25%) - Deep vibrant red, pulsing to indicate danger
  if (percent < 25) {
    return {
      fill: `${baseTexture} from-red-400 via-red-600 to-red-800 animate-pulse`,
      edge: 'border-r-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]', 
    };
  }
  
  // LOW (Under 50%) - Vibrant warning orange
  if (percent < 50) {
    return {
      fill: `${baseTexture} from-orange-300 via-orange-500 to-orange-700`,
      edge: 'border-r-orange-200 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]',
    };
  }
  
  // MEDIUM (Under 75%) - Yellow/Gold
  if (percent < 75) {
    return {
      fill: `${baseTexture} from-yellow-200 via-yellow-400 to-yellow-600`,
      edge: 'border-r-yellow-100',
    };
  }
  
  // HIGH (75% and above) - Classic bright "Healthy" WoW Green
  return {
    fill: `${baseTexture} from-green-300 via-green-500 to-green-700`,
    edge: 'border-r-green-200',
  };
}
function healGridRowClass(isSelected: boolean, isDead: boolean, edgeClass: string) {
  const border = isSelected
    ? 'z-10 scale-[1.02] border-l-[5px] brightness-110 ui-state-selected'
    : `ui-state-frame border-l-4 ${edgeClass}`;
  const dead = isDead ? 'cursor-not-allowed ui-state-disabled shadow-inner' : 'ui-state-hover';
  return `ui-heal-grid-row group ${border} ${dead}`;
}

function HealGridInner({
  party,
  onTargetSelect,
  selectedId,
  combatFloats,
  syncIntroDebuffTip = false,
  debuffTipZIndex = 400,
  holdIntroDebuffTip = false,
}: HealGridProps) {
  const [debuffTip, setDebuffTip] = useState<{
    debuff: StatusEffect;
    x: number;
    y: number;
  } | null>(null);
  const [debuffTipShiftX, setDebuffTipShiftX] = useState(0);
  const debuffTipRef = useRef<HTMLDivElement>(null);
  const partyRef = useRef(party);
  partyRef.current = party;

  const floatsByUnit = useMemo(() => {
    const m = new Map<string, FloatingCombatTextEntry[]>();
     for (const e of combatFloats) {
      const arr = m.get(e.unitId);
      if (arr) arr.push(e);
      else m.set(e.unitId, [e]);
    }
    return m;
  }, [combatFloats]);

  useEffect(() => {
    if (!debuffTip) return;
    if (holdIntroDebuffTip) return;
    const close = () => setDebuffTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [debuffTip, holdIntroDebuffTip]);

  useLayoutEffect(() => {
    if (!syncIntroDebuffTip) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      const el = document.querySelector(`[data-tutorial-id="${CSS.escape(INTRO_DEBUFF_DATA_ID)}"]`);
       let debuff: StatusEffect | undefined;
       for (const u of partyRef.current) {
         debuff = u.effects.find((d) => d.sourceId === INTRO_DEBUFF_ABILITY);
        if (debuff) break;
      }
      if (!(el instanceof HTMLElement) || !debuff) return;
      const r = el.getBoundingClientRect();
      setDebuffTip({ debuff, x: r.left + r.width / 2, y: r.top });
    };
    run();
    const a = window.requestAnimationFrame(run);
    const b = window.requestAnimationFrame(() => window.requestAnimationFrame(run));
    const t = window.setTimeout(run, 80);
    return () => {
      alive = false;
      window.cancelAnimationFrame(a);
      window.cancelAnimationFrame(b);
      window.clearTimeout(t);
    };
  }, [syncIntroDebuffTip]);

  const prevSyncIntroDebuffRef = useRef(false);
  useEffect(() => {
    if (prevSyncIntroDebuffRef.current && !syncIntroDebuffTip) {
      setDebuffTip(null);
    }
    prevSyncIntroDebuffRef.current = syncIntroDebuffTip;
  }, [syncIntroDebuffTip]);

  useLayoutEffect(() => {
    if (!debuffTip) {
      setDebuffTipShiftX(0);
      return;
    }
    const tip = debuffTipRef.current;
    if (!tip) return;
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    if (!vw) return;
    const margin = 12;
    const rect = tip.getBoundingClientRect();
    let dx = 0;
    if (rect.right > vw - margin) dx += vw - margin - rect.right;
    if (rect.left + dx < margin) dx += margin - (rect.left + dx);
    setDebuffTipShiftX(dx);
  }, [debuffTip]);

  return (
    <div className="ui-heal-grid-root">
      {party.map((unit) => {
        const healthPercent = (unit.health / unit.maxHealth) * 100;
        const hpCur = Math.round(Math.max(0, unit.health));
        const hpMax = Math.round(unit.maxHealth);
        const isDead = unit.health <= 0;
        const isSelected = selectedId === unit.id;
        const tier = healthTierClasses(isDead ? 0 : healthPercent);
        const shieldWedge = unit.shield > 0 ? Math.min(100, (unit.shield / Math.max(1, unit.maxHealth)) * 100) : 0;
        const hpBarTop = unit.shield > 0 ? 'top-1.5' : 'top-0';
        const rowFloats = floatsByUnit.get(unit.id) ?? [];

        return (
          <Fragment key={unit.id}>
            <HealGridUnitRow
              unit={unit}
              isDead={isDead}
              isSelected={isSelected}
              tierEdge={tier.edge}
              healthPercent={healthPercent}
              shieldWedge={shieldWedge}
              hpBarTop={hpBarTop}
              tierFill={tier.fill}
              hpCur={hpCur}
              hpMax={hpMax}
              rowFloats={rowFloats}
              onTargetSelect={onTargetSelect}
              setDebuffTip={setDebuffTip}
            />
          </Fragment>
        );
      })}
      {debuffTip
        ? createPortal(
            <div
              ref={debuffTipRef}
              className="ui-debuff-tooltip-wrap relative"
              style={{
                position: 'fixed',
                left: debuffTip.x,
                top: debuffTip.y,
                transform: `translate(calc(-50% + ${debuffTipShiftX}px), calc(-100% - 10px))`,
                zIndex: debuffTipZIndex,
              }}
            >
              <GameIcon
                iconPath={debuffTip.debuff.icon}
                glow={getAbilityGlow(debuffTip.debuff.sourceId)}
                size="md"
                className="ui-spell-tooltip-icon"
              />
              <div className="ui-spell-tooltip-body">
                <div className="ui-spell-tooltip-title">
                  <span className="ui-spell-tooltip-title-text">{debuffTip.debuff.name}</span>
                </div>
                <div className="ui-spell-tooltip-desc mt-1.5 text-red-100/95">
                  {partyDebuffTooltipText(debuffTip.debuff)}
                </div>
              </div>
              <div className="ui-spell-tooltip-arrow" aria-hidden />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export const HealGrid = memo(HealGridInner);

interface HealGridUnitRowProps {
  unit: Unit;
  isDead: boolean;
  isSelected: boolean;
  tierEdge: string;
  healthPercent: number;
  shieldWedge: number;
  hpBarTop: string;
  tierFill: string;
  hpCur: number;
  hpMax: number;
  rowFloats: FloatingCombatTextEntry[];
  onTargetSelect: (id: string) => void;
  setDebuffTip: Dispatch<SetStateAction<{ debuff: StatusEffect; x: number; y: number } | null>>;
}

function HealGridUnitRow(props: HealGridUnitRowProps) {
  const {
    unit,
    isDead,
    isSelected,
    tierEdge,
    healthPercent,
    shieldWedge,
    hpBarTop,
    tierFill,
    hpCur,
    hpMax,
    rowFloats,
    onTargetSelect,
    setDebuffTip,
  } = props;
  const [shakePulse, setShakePulse] = useState(0);
  const lastCritFloatId = useRef<string | null>(null);
  const { ghostPercent, ghostEaseDuration } = useGhostBarPercent(healthPercent);

  useEffect(() => {
    const newestCrit = [...rowFloats].reverse().find((e) => e.kind === 'heal' && e.crit);
    if (!newestCrit || newestCrit.id === lastCritFloatId.current) return;
    lastCritFloatId.current = newestCrit.id;
    setShakePulse((n) => n + 1);
  }, [rowFloats]);

  return (
    <div className="ui-heal-grid-row-wrap">
      <div
        className="w-full"
        data-tutorial-id={unit.role === 'TANK' ? TUTORIAL_SPOTLIGHT_TANK_DATA_ID : `unit-${unit.id}`}
      >
      <motion.button
        type="button"
        key={shakePulse > 0 ? `${unit.id}-crit-${shakePulse}` : unit.id}
        id={`unit-${unit.id}`}
        disabled={isDead}
        onClick={() => {
          if (!isDead) onTargetSelect(unit.id);
        }}
        className={healGridRowClass(isSelected, isDead, tierEdge)}
        initial={{ x: 0 }}
        animate={shakePulse > 0 ? { x: [0, -5, 5, -4, 4, -2, 2, 0] } : { x: 0 }}
        transition={{ duration: 0.34, ease: 'easeOut' }}
        whileTap={isDead ? undefined : { scale: 0.98 }}
      >
            <div className="relative w-full h-6 bg-zinc-900 border-2 border-zinc-950 rounded-sm overflow-hidden shadow-lg">
              {unit.shield > 0 ? (
                <div className="ui-heal-grid-shield-track absolute inset-0">
                  <motion.div
                    className="ui-heal-grid-shield-fill h-full"
                    initial={false}
                    animate={{ width: `${shieldWedge}%` }}
                    transition={{ type: 'tween', duration: 0.2 }}
                    style={{ originX: 0 }}
                  />
                </div>
              ) : null}
              <div className="absolute inset-0 bg-red-950/20" />
              <motion.div
                className={`absolute top-0 left-0 h-full transition-all duration-300 ease-out border-r-[1px] ${tierFill} ${tierEdge}`}
                initial={false}
                animate={{ width: `${ghostPercent}%` }}
                transition={{
                  duration: ghostEaseDuration,
                  ease: ghostEaseDuration > 0 ? [0.4, 0, 0.2, 1] : 'linear',
                }}
                style={{ originX: 0 }}
              />
              <motion.div
                className={`absolute top-0 left-0 h-full transition-all duration-300 ease-out border-r-[1px] ${tierFill} ${tierEdge}`}
                initial={false}
                animate={{ width: `${healthPercent}%` }}
                transition={{ duration: 0 }}
                style={{ originX: 0 }}
              />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 200 200%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.65%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.08%27/%3E%3C/svg%3E')] mix-blend-overlay pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center font-bold text-white text-xs drop-shadow-[0_1px_1px_rgba(0,0,0,1)]">
                {hpCur}/{hpMax}
              </div>
            </div>

            <div className="ui-heal-grid-content">
              <div className="ui-heal-grid-name">{unit.name}</div>
              <div className="ui-heal-grid-meta">
                <span>{unitRoleLabel(unit.role)}</span>
                <span className="ui-heal-grid-level-pill">Lv {unit.level}</span>
                {unit.shield > 0 ? (
                  <span className="ui-numeric font-mono text-sky-200">
                    +{Math.round(unit.shield)} absorb
                  </span>
                ) : null}
              </div>
              <div className="ui-heal-grid-buff-row">
                  {unit.effects.filter((e) => e.category === 'helpful').map((buff) => {
                    if (buff.isManaRegen) {
                      return (
                        <div
                          key={buff.id}
                          data-tutorial-id={
                              buff.sourceId === 'echo_of_light'
                              ? 'tutorial-passive-priest-echo'
                              : undefined
                          }
                        >
                          <ManaRegenBuffIcon buff={buff} />
                        </div>
                      );
                    }
                      const useHoTRing =
                        buff.rendersAsHoTRing === true || (buff.valuePerTick ?? 0) > 0;
                    if (useHoTRing) {
                      return (
                        <div
                          key={buff.id}
                          data-tutorial-id={
                              buff.sourceId === 'echo_of_light'
                              ? 'tutorial-passive-priest-echo'
                              : undefined
                          }
                        >
                          <HoTBuffIcon buff={buff} />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={buff.id}
                        className="relative sm:p-0.5"
                        title={buff.name}
                        data-tutorial-id={
                          buff.sourceId === 'echo_of_light'
                            ? 'tutorial-passive-priest-echo'
                            : undefined
                        }
                      >
                        <GameIcon
                          iconPath={buff.icon}
                          glow={getSpellGlow(buff.sourceId)}
                          size="xs"
                        />
                      </div>
                    );
                  })}
                  {unit.effects.filter((e) => e.category === 'harmful').map((debuff: StatusEffect) => {
                    const secondsLeft = Math.ceil(debuff.remainingTicks / 10);
                    const showCountdown = debuff.remainingTicks < 50;
                    return (
                      <div
                        key={debuff.id}
                        className="ui-debuff-frame pointer-events-auto cursor-pointer touch-manipulation"
                        data-tutorial-id={
                              debuff.sourceId === INTRO_DEBUFF_ABILITY
                  ? INTRO_DEBUFF_DATA_ID
                            : undefined
                        }
                        onPointerEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setDebuffTip({
                            debuff,
                            x: r.left + r.width / 2,
                            y: r.top,
                          });
                        }}
                        onPointerLeave={(e) => {
                          if (e.pointerType === 'mouse') setDebuffTip(null);
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          setDebuffTip((prev) =>
                            prev?.debuff.id === debuff.id
                              ? null
                              : { debuff, x: r.left + r.width / 2, y: r.top },
                          );
                        }}
                      >
                        <GameIcon
                          iconPath={debuff.icon}
                          glow={getAbilityGlow(debuff.sourceId)}
                          size="xs"
                        />
                        {showCountdown && <div className="ui-debuff-countdown">{secondsLeft}</div>}
                      </div>
                    );
                  })}
                  {isDead && <span className="ui-heal-grid-fallen">FALLEN</span>}
              </div>
            </div>

            <div className="ui-heal-grid-role-icons">
               {unit.role === 'TANK' && <Shield className="text-sky-400" size={32} strokeWidth={1.5} />}
               {unit.role === 'DPS' && <Zap className="text-amber-400" size={32} strokeWidth={1.5} />}
               {unit.role === 'HEALER' && <User className="text-emerald-400" size={32} strokeWidth={1.5} />}
            </div>
      </motion.button>
      </div>
      <HealGridFloatingLayer entries={rowFloats} />
    </div>
  );
}

type ActionBarsProps = {
  playerCombatStats: PlayerCombatStats;
  spellIds: string[];
  cooldowns: Record<string, number>;
  onCast: (spellId: string) => void;
  allowReorder: boolean;
  onReorderSlots: (from: number, to: number) => void;
  hideResourcePanels: boolean;
};

function ActionBarsInner({
  playerCombatStats,
  spellIds,
  cooldowns,
  onCast,
  allowReorder,
  onReorderSlots,
  hideResourcePanels,
}: ActionBarsProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);

  const onDragStart = useCallback(
    (i: number) => () => {
      if (!allowReorder) return;
      setDragFrom(i);
    },
    [allowReorder],
  );

  const onDragEnd = useCallback(() => {
    setDragFrom(null);
    setDropOver(null);
  }, []);

  const onDragOverSlot = useCallback(
    (i: number) => (e: DragEvent) => {
      if (!allowReorder || dragFrom === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropOver(i);
    },
    [allowReorder, dragFrom],
  );

  const onDropOnSlot = useCallback(
    (to: number) => (e: DragEvent) => {
      e.preventDefault();
      if (!allowReorder || dragFrom === null) return;
      if (dragFrom !== to) onReorderSlots(dragFrom, to);
      setDragFrom(null);
      setDropOver(null);
    },
    [allowReorder, dragFrom, onReorderSlots],
  );

  const manaPct =
    playerCombatStats.maxMana > 0
      ? Math.min(100, (100 * playerCombatStats.mana) / playerCombatStats.maxMana)
      : 0;

  return (
    <div className="ui-action-bar-column fixed inset-x-0 bottom-0 z-50 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
      {!hideResourcePanels && (
        <div className="ui-mana-pool-panel mx-auto w-full max-w-2xl px-2 sm:px-3">
          <div
            className="ui-mana-pool-underlay"
            style={{ width: `${manaPct}%` }}
            aria-hidden
          />
          <div className="ui-mana-pool-row">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Mana</span>
            <span className="ui-mana-pool-readout">
              {Math.round(playerCombatStats.mana)}
              <span className="ui-mana-pool-readout-max">/{Math.round(playerCombatStats.maxMana)}</span>
            </span>
          </div>
        </div>
      )}
      <div className="ui-spell-bar-tray">
        <div className="ui-spell-bar-row">
          {spellIds.map((spellId, i) => {
            const spell = spellId ? SPELLS[spellId] : undefined;
            const cdTicks = spell ? cooldowns[spellId] ?? 0 : 0;
            const cdSec = cdTicks > 0 ? Math.ceil(cdTicks / TICKS_PER_SECOND) : 0;
            const empty = !spellId || !spell;
            const enabled = playerCombatStats.spellsEnabled && spell && playerCombatStats.mana >= spell.manaCost;
            const highlight = spell ? playerCombatStats.actionBarHighlights[spellId] : false;
            const glow = spell ? getSpellGlow(spellId) : 'spell';
            const dropTarget = allowReorder && dropOver === i;

            return (
              <div
                key={`${i}-${spellId || 'empty'}`}
                className={dropTarget ? 'ui-spell-slot-drop-target rounded-[var(--ui-radius-panel)]' : ''}
                onDragOver={onDragOverSlot(i)}
                onDrop={onDropOnSlot(i)}
                onDragLeave={() => setDropOver((v) => (v === i ? null : v))}
              >
                <button
                  type="button"
                  draggable={allowReorder && !!spellId}
                  onDragStart={onDragStart(i)}
                  onDragEnd={onDragEnd}
                  disabled={!spell || !enabled}
                  onClick={() => {
                    if (spell && enabled) onCast(spell.id);
                  }}
                  className={`ui-spell-slot-base ${empty ? 'ui-spell-slot-empty' : ''} ${highlight ? 'ring-2 ring-amber-400/80' : ''} ${spell?.actionBarBorderClass ?? ''}`}
                >
                  <span className={`ui-spell-slot-index ${empty ? '' : 'ui-spell-slot-index-filled'}`}>{i + 1}</span>
                  {!empty && spell ? (
                    <>
                      <GameIcon iconPath={spell.icon} glow={glow} size="lg" />
                      <span className="ui-spell-name-label">{spell.name}</span>
                      <span
                        className={`ui-spell-mana-cost ui-spell-mana-cost-combat ${playerCombatStats.mana < spell.manaCost ? 'ui-spell-mana-cost-blocked' : ''}`}
                      >
                        {spell.manaCost}
                      </span>
                      {cdSec > 0 ? (
                        <div className="ui-spell-cd-overlay">
                          <span className="ui-spell-cd-text">{cdSec}</span>
                        </div>
                      ) : null}
                      {playerCombatStats.mana < spell.manaCost && playerCombatStats.spellsEnabled ? (
                        <div className="ui-spell-oom-overlay" aria-hidden />
                      ) : null}
                    </>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const ActionBars = memo(ActionBarsInner);