/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Unit, Buff } from '../types.ts';
import { Shield, Zap, User } from 'lucide-react';
import { glowForSpellId, glowForBossAbilityId } from '../gameIcons.ts';
import { GameIcon } from './GameIcon.tsx';

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
        <GameIcon iconPath={buff.icon} glow={glowForSpellId(buff.sourceSpellId)} size="xs" className="scale-90" />
      </div>
      <div className={`ui-hot-timer ${urgent ? 'ui-hot-timer-urgent' : 'ui-hot-timer-ok'}`}>{secondsLeft}</div>
    </div>
  );
}

function ManaRegenBuffIcon({ buff }: { buff: Buff }) {
  const showCountdown = buff.remainingTicks < 50;
  return (
    <div className="relative sm:p-0.5" title={buff.name}>
      <GameIcon iconPath={buff.icon} glow={glowForSpellId(buff.sourceSpellId)} size="xs" />
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
}

function healthTierClasses(percent: number) {
  if (percent < 25) {
    return {
      fill: 'bg-gradient-to-r from-red-950 via-red-900 to-red-800',
      edge: 'border-l-red-900',
    };
  }
  if (percent < 50) {
    return {
      fill: 'bg-gradient-to-r from-amber-950 via-amber-900 to-amber-800',
      edge: 'border-l-amber-900',
    };
  }
  if (percent < 75) {
    return {
      fill: 'bg-gradient-to-r from-lime-950 via-emerald-900 to-emerald-800',
      edge: 'border-l-emerald-900',
    };
  }
  return {
    fill: 'bg-gradient-to-r from-emerald-950 via-emerald-800 to-emerald-700',
    edge: 'border-l-emerald-800',
  };
}

function healGridRowClass(isSelected: boolean, isDead: boolean, edgeClass: string) {
  const border = isSelected
    ? 'z-10 scale-[1.02] border-l-[6px] border-blue-300 ring-[3px] ring-blue-400 ring-inset brightness-110'
    : `border-l-4 border-y border-r border-slate-800 ${edgeClass}`;
  const dead = isDead ? 'cursor-not-allowed opacity-45 shadow-inner' : '';
  return `ui-heal-grid-row group ${border} ${dead}`;
}

function healGridHpReadoutClass(percent: number, isDead: boolean) {
  const base =
    'shrink-0 text-right font-mono text-xl font-black tabular-nums tracking-tight sm:text-2xl';
  if (percent < 25 && !isDead) return `${base} animate-pulse text-red-400`;
  return `${base} text-slate-100`;
}

export function HealGrid({ party, onTargetSelect, selectedId }: HealGridProps) {
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

        return (
          <button
            type="button"
            key={unit.id}
            id={`unit-${unit.id}`}
            disabled={isDead}
            onClick={() => {
              if (!isDead) onTargetSelect(unit.id);
            }}
            className={healGridRowClass(isSelected, isDead, tier.edge)}
          >
            {unit.shield > 0 ? (
              <div className="ui-heal-grid-shield-track">
                <motion.div
                  className="ui-heal-grid-shield-fill"
                  initial={false}
                  animate={{ width: `${shieldWedge}%` }}
                  transition={{ type: 'tween', duration: 0.2 }}
                  style={{ originX: 0 }}
                />
              </div>
            ) : null}
            <motion.div
              className={`ui-heal-grid-hp-fill ${hpBarTop} ${tier.fill}`}
              initial={false}
              animate={{ width: `${healthPercent}%` }}
              transition={{ type: 'tween', duration: 0.2 }}
              style={{ originX: 0 }}
            />

            <div className="ui-heal-grid-content">
              <div className="flex min-w-0 flex-1 flex-col pr-2">
                <div className="ui-heal-grid-name">{unit.name}</div>
                <div className="ui-heal-grid-meta">
                  <span>{unit.role}</span>
                  <span className="ui-heal-grid-level-pill">
                    Lv {unit.level}
                  </span>
                  {unit.shield > 0 ? (
                    <span className="font-mono text-sky-400">+{Math.round(unit.shield)} absorb</span>
                  ) : null}
                </div>

                <div className="ui-heal-grid-buff-row">
                  {unit.buffs.map((buff) => {
                    if (buff.isManaRegenBuff) {
                      return (
                        <div key={buff.id}>
                          <ManaRegenBuffIcon buff={buff} />
                        </div>
                      );
                    }
                    const useHoTRing =
                      buff.rendersAsHoTRing === true || buff.healingPerTick > 0;
                    if (useHoTRing) {
                      return (
                        <div key={buff.id}>
                          <HoTBuffIcon buff={buff} />
                        </div>
                      );
                    }
                    return (
                      <div key={buff.id} className="relative sm:p-0.5" title={buff.name}>
                        <GameIcon
                          iconPath={buff.icon}
                          glow={glowForSpellId(buff.sourceSpellId)}
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
                        className="ui-debuff-frame"
                        title={
                          debuff.dispellable ? `${debuff.name} (Dispellable)` : debuff.name
                        }
                      >
                        <GameIcon
                          iconPath={debuff.icon}
                          glow={glowForBossAbilityId(debuff.sourceAbilityId)}
                          size="xs"
                        />
                        {showCountdown && <div className="ui-debuff-countdown">{secondsLeft}</div>}
                      </div>
                    );
                  })}
                  {isDead && <span className="ui-heal-grid-fallen">FALLEN</span>}
                </div>
              </div>

              <div className={healGridHpReadoutClass(healthPercent, isDead)}>
                {hpCur}/{hpMax}
              </div>
            </div>

            <div className="ui-heal-grid-role-icons">
               {unit.role === 'TANK' && <Shield className="text-sky-400" size={32} strokeWidth={1.5} />}
               {unit.role === 'DPS' && <Zap className="text-amber-400" size={32} strokeWidth={1.5} />}
               {unit.role === 'HEALER' && <User className="text-emerald-400" size={32} strokeWidth={1.5} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
