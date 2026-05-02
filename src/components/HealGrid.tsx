import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Unit, Buff, PartyDebuff, FloatingCombatTextEntry } from '../types.ts';
import { Shield, Zap, User } from 'lucide-react';
import { getSpellGlow, getAbilityGlow } from '../gameIcons.ts';
import { GameIcon } from './GameIcon.tsx';
import {
  INTRO_TUTORIAL_DEBUFF_ABILITY,
  INTRO_TUTORIAL_DEBUFF_DATA_ID,
  TUTORIAL_SPOTLIGHT_TANK_DATA_ID,
} from '../tutorialConfig.ts';
import { useGhostBarPercent } from '../useGhostBarPercent.ts';

function fmtDebuffNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function unitRoleLabel(role: Unit['role']): string {
  if (role === 'DPS') return 'DPS';
  if (role === 'TANK') return 'Tank';
  return 'Healer';
}

function partyDebuffTooltipText(d: PartyDebuff): string {
  const perSec = d.damagePerTick * 10;
  const total = d.damagePerTick * d.remainingTicks;
  const sec = d.remainingTicks / 10;
  const lines = [
    `Deals ${fmtDebuffNumber(perSec)} damage per second.`,
    `${fmtDebuffNumber(total)} damage over ${fmtDebuffNumber(sec)} sec remaining.`,
  ];
  if (d.dispellable) lines.push('Can be dispelled.');
  return lines.join('\n');
}

function hotMaxTicks(buff: Buff): number {
  if (typeof buff.durationTicksMax === 'number' && buff.durationTicksMax > 0) {
    return buff.durationTicksMax;
  }
  return Math.max(1, buff.remainingTicks);
}

function HoTBuffIcon({ buff }: { buff: Buff }) {
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
        <GameIcon iconPath={buff.icon} glow={getSpellGlow(buff.sourceSpellId)} size="xs" className="scale-90" />
      </div>
      <div className={`ui-hot-timer ${urgent ? 'ui-hot-timer-urgent' : 'ui-hot-timer-ok'}`}>{secondsLeft}</div>
    </div>
  );
}

function ManaRegenBuffIcon({ buff }: { buff: Buff }) {
  const showCountdown = buff.remainingTicks < 50;
  return (
    <div className="relative sm:p-0.5" title={buff.name}>
      <GameIcon iconPath={buff.icon} glow={getSpellGlow(buff.sourceSpellId)} size="xs" />
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
  floatingCombatTexts: FloatingCombatTextEntry[];
  syncIntroTutorialDebuffTip?: boolean;
  debuffTipZIndex?: number;
  holdTutorialDebuffTip?: boolean;
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

export function HealGrid({
  party,
  onTargetSelect,
  selectedId,
  floatingCombatTexts,
  syncIntroTutorialDebuffTip = false,
  debuffTipZIndex = 400,
  holdTutorialDebuffTip = false,
}: HealGridProps) {
  const [debuffTip, setDebuffTip] = useState<{
    debuff: PartyDebuff;
    x: number;
    y: number;
  } | null>(null);
  const [debuffTipShiftX, setDebuffTipShiftX] = useState(0);
  const debuffTipRef = useRef<HTMLDivElement>(null);
  const partyRef = useRef(party);
  partyRef.current = party;

  const floatsByUnit = useMemo(() => {
    const m = new Map<string, FloatingCombatTextEntry[]>();
    for (const e of floatingCombatTexts) {
      const arr = m.get(e.unitId);
      if (arr) arr.push(e);
      else m.set(e.unitId, [e]);
    }
    return m;
  }, [floatingCombatTexts]);

  useEffect(() => {
    if (!debuffTip) return;
    if (holdTutorialDebuffTip) return;
    const close = () => setDebuffTip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [debuffTip, holdTutorialDebuffTip]);

  useLayoutEffect(() => {
    if (!syncIntroTutorialDebuffTip) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      const el = document.querySelector(`[data-tutorial-id="${CSS.escape(INTRO_TUTORIAL_DEBUFF_DATA_ID)}"]`);
      let debuff: PartyDebuff | undefined;
      for (const u of partyRef.current) {
        debuff = u.debuffs.find((d) => d.sourceAbilityId === INTRO_TUTORIAL_DEBUFF_ABILITY);
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
  }, [syncIntroTutorialDebuffTip]);

  const prevSyncIntroDebuffRef = useRef(false);
  useEffect(() => {
    if (prevSyncIntroDebuffRef.current && !syncIntroTutorialDebuffTip) {
      setDebuffTip(null);
    }
    prevSyncIntroDebuffRef.current = syncIntroTutorialDebuffTip;
  }, [syncIntroTutorialDebuffTip]);

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
                glow={getAbilityGlow(debuffTip.debuff.sourceAbilityId)}
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
  setDebuffTip: Dispatch<SetStateAction<{ debuff: PartyDebuff; x: number; y: number } | null>>;
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
                  {unit.buffs.map((buff) => {
                    if (buff.isManaRegenBuff) {
                      return (
                        <div
                          key={buff.id}
                          data-tutorial-id={
                            buff.sourceSpellId === 'echo_of_light'
                              ? 'tutorial-passive-priest-echo'
                              : undefined
                          }
                        >
                          <ManaRegenBuffIcon buff={buff} />
                        </div>
                      );
                    }
                    const useHoTRing =
                      buff.rendersAsHoTRing === true || buff.healingPerTick > 0;
                    if (useHoTRing) {
                      return (
                        <div
                          key={buff.id}
                          data-tutorial-id={
                            buff.sourceSpellId === 'echo_of_light'
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
                          buff.sourceSpellId === 'echo_of_light'
                            ? 'tutorial-passive-priest-echo'
                            : undefined
                        }
                      >
                        <GameIcon
                          iconPath={buff.icon}
                          glow={getSpellGlow(buff.sourceSpellId)}
                          size="xs"
                        />
                      </div>
                    );
                  })}
                  {unit.debuffs.map((debuff) => {
                    const secondsLeft = Math.ceil(debuff.remainingTicks / 10);
                    const showCountdown = debuff.remainingTicks < 50;
                    return (
                      <div
                        key={debuff.id}
                        className="ui-debuff-frame pointer-events-auto cursor-pointer touch-manipulation"
                        data-tutorial-id={
                          debuff.sourceAbilityId === INTRO_TUTORIAL_DEBUFF_ABILITY
                            ? INTRO_TUTORIAL_DEBUFF_DATA_ID
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
                          glow={getAbilityGlow(debuff.sourceAbilityId)}
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
