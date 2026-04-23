/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  GameState, Unit, ClassType, Spell, Buff, 
  SpellType, Dungeon, DungeonRunOutcome, DungeonFailureReason 
} from '../types.ts';
import {
  TICK_RATE,
  MANA_REGEN_PER_TICK,
  MANA_POTION_USES_PER_DUNGEON,
  SPELLS,
  cloneTalentsForClass,
  generateRandomParty,
} from '../constants.ts';
import {
  readStoredProgress,
  writeStoredProgress,
  computeMetaFromProgress,
} from '../gameStorage.ts';

function createInitialGameState(): GameState {
  const party = generateRandomParty();
  const base: GameState = {
    playerClass: null,
    party,
    mana: 100,
    maxMana: 100,
    manaRegenBuffTicksRemaining: 0,
    manaPotionsUsedThisDungeon: 0,
    xp: 0,
    level: 1,
    talentPoints: 5,
    talents: [],
    unlockedSpells: [],
    activeActionBars: [],
    currentDungeon: null,
    dungeonProgress: 0,
    combatPhase: 'TRASH',
    trashPullsRemaining: 3,
    enemyHealth: 100,
    enemyMaxHealth: 100,
    isCombatActive: false,
    completedDungeonIds: [],
  };
  const patch = readStoredProgress();
  if (!patch) return base;
  const cap = patch.maxMana ?? base.maxMana;
  return {
    ...base,
    ...patch,
    talents: patch.talents ?? base.talents,
    party,
    mana: Math.min(cap, patch.mana ?? cap),
    completedDungeonIds: patch.completedDungeonIds ?? [],
  };
}

export function useGameEngine() {
  const [state, setState] = useState<GameState>(createInitialGameState);

  const cooldownsRef = useRef<Record<string, number>>({});
  const critRollRef = useRef(0);
  const [, setCooldownTick] = useState(0);
  const [dungeonOutcome, setDungeonOutcome] = useState<DungeonRunOutcome | null>(null);

  const selectClass = useCallback((cls: ClassType) => {
    setState((s) => {
      const talents = cloneTalentsForClass(cls);
      const meta = computeMetaFromProgress(s.xp, cls, talents);
      return {
        ...s,
        playerClass: cls,
        talents: meta.talents,
        unlockedSpells: meta.unlockedSpells,
        activeActionBars: meta.activeActionBars,
        talentPoints: meta.talentPoints,
        maxMana: meta.maxMana,
        level: meta.level,
        mana: Math.min(meta.maxMana, s.mana),
      };
    });
  }, []);

  const dismissDungeonOutcome = useCallback(() => {
    setDungeonOutcome(null);
  }, []);

  const abandonDungeon = useCallback(() => {
    setDungeonOutcome(null);
    setState((s) => ({
      ...s,
      currentDungeon: null,
      isCombatActive: false,
      dungeonProgress: 0,
      manaRegenBuffTicksRemaining: 0,
      manaPotionsUsedThisDungeon: 0,
    }));
  }, []);

  const startDungeon = useCallback((dungeon: Dungeon) => {
    setDungeonOutcome(null);
    setState(s => ({
      ...s,
      currentDungeon: dungeon,
      dungeonProgress: 0,
      combatPhase: 'TRASH',
      trashPullsRemaining: 3,
      enemyHealth: 100,
      enemyMaxHealth: 100,
      isCombatActive: true,
      party: generateRandomParty(),
      mana: s.maxMana,
      manaRegenBuffTicksRemaining: 0,
      manaPotionsUsedThisDungeon: 0,
    }));
  }, []);

  const unlockTalent = useCallback((talentId: string) => {
    setState(s => {
      const talent = s.talents.find(t => t.id === talentId);
      if (!talent) return s;

      // Check prerequisites
      const hasPrereqs = !talent.prerequisites || talent.prerequisites.every(pid => {
          const p = s.talents.find(t => t.id === pid);
          return p && p.points > 0;
      });

      if (!hasPrereqs || talent.points >= talent.maxPoints || s.talentPoints < talent.cost || s.level < talent.levelReq) {
          return s;
      }

      const newTalents = s.talents.map(t => t.id === talentId ? { ...t, points: t.points + 1 } : t);
      
      // Unlock spell only on first point
      const isFirstPoint = talent.points === 0;
      const newUnlockedSpells = (isFirstPoint && talent.spellId) ? [...s.unlockedSpells, talent.spellId] : s.unlockedSpells;
      const newActionBars = (isFirstPoint && talent.spellId) ? [...s.activeActionBars, talent.spellId] : s.activeActionBars;
      
      let newMaxMana = s.maxMana;
      if (talent.statBonus?.manaPool) newMaxMana += talent.statBonus.manaPool;

      return {
        ...s,
        talents: newTalents,
        talentPoints: s.talentPoints - talent.cost,
        unlockedSpells: newUnlockedSpells,
        activeActionBars: newActionBars,
        maxMana: newMaxMana,
        mana: Math.min(newMaxMana, s.mana)
      };
    });
  }, []);

  const castSpell = useCallback((spellId: string, targetId: string) => {
    const spell = SPELLS[spellId];
    if (!spell) return;

    critRollRef.current = Math.random() * 100;

    setState(s => {
      if (s.mana < spell.manaCost) {
        return s;
      }

      if (
        spellId === 'mana_potion' &&
        s.manaPotionsUsedThisDungeon >= MANA_POTION_USES_PER_DUNGEON
      ) {
        return s;
      }

      if (cooldownsRef.current[spellId] > 0) {
        return s;
      }

      const newParty = s.party.map(unit => {
        if (unit.id === targetId || (spell.type === SpellType.AOE)) {
          const healingBoost = s.talents.reduce((acc, t) => acc + (t.statBonus?.healingBoost || 0) * t.points, 0);

          const critChance = s.talents.reduce((acc, t) => acc + (t.statBonus?.critChance || 0) * t.points, 0);
          const isCrit = critRollRef.current < critChance;
          const critMod = isCrit ? 1.5 : 1.0;

          const totalHealing = spell.healing * (1 + healingBoost / 100) * critMod;
          const totalHotHealing = (spell.hotHealingPerTick || 0) * (1 + healingBoost / 100) * critMod;

          let newHealth = Math.min(unit.maxHealth, unit.health + totalHealing);
          let newBuffs = [...unit.buffs];

          if (spell.type === SpellType.HOT || spell.hotDuration) {
            newBuffs.push({
              id: `${spell.id}-${Date.now()}`,
              name: spell.name,
              remainingTicks: spell.hotDuration || 0,
              healingPerTick: totalHotHealing,
              icon: spell.icon,
            });
          }

          return { ...unit, health: newHealth, buffs: newBuffs };
        }
        return unit;
      });

      // Update cooldown
      let castCooldown = spell.cooldown;
      const hasteBonus = s.talents.reduce((acc, t) => acc + (t.statBonus?.haste || 0) * t.points, 0);
      castCooldown = Math.round(castCooldown * (1 - hasteBonus / 100));

      if (castCooldown > 0) {
        const cd = castCooldown;
        const sid = spellId;
        queueMicrotask(() => {
          cooldownsRef.current[sid] = cd;
          setCooldownTick((x) => x + 1);
        });
      }

      // Mana return logic
      const manaReturn = s.talents.reduce((acc, t) => acc + (t.statBonus?.manaReturnOnDirectHeal || 0) * t.points, 0);
      const isDirect = spell.type === SpellType.DIRECT;
      const actualManaReturn = isDirect ? manaReturn : 0;

      const newMana = Math.min(s.maxMana, s.mana - spell.manaCost + (spell.manaRestore || 0) + actualManaReturn);

      const nextBuffTicks =
        spellId === 'mana_potion' && spell.manaRegenBuffDurationTicks !== undefined
          ? spell.manaRegenBuffDurationTicks
          : s.manaRegenBuffTicksRemaining;

      const nextPotionUses =
        spellId === 'mana_potion'
          ? s.manaPotionsUsedThisDungeon + 1
          : s.manaPotionsUsedThisDungeon;

      return {
        ...s,
        party: newParty,
        mana: newMana,
        manaRegenBuffTicksRemaining: nextBuffTicks,
        manaPotionsUsedThisDungeon: nextPotionUses,
      };
    });
  }, []);

  // Game Loop
  useEffect(() => {
    if (!state.isCombatActive) return;

    const interval = setInterval(() => {
      setState(s => {
        if (!s.isCombatActive) return s;

        const tankIndex = s.party.findIndex(u => u.role === 'TANK');
        const newParty: Unit[] = [];
        for (let idx = 0; idx < s.party.length; idx++) {
          const unit = s.party[idx];
          let damage = 0;
          const chance = Math.random();
          if (unit.role === 'TANK' && chance < 0.4) damage = Math.random() * 8 + (s.currentDungeon?.difficulty || 1);
          else if (chance < 0.1) damage = Math.random() * 5 + (s.currentDungeon?.difficulty || 1);

          const tankHealthNow =
            tankIndex < 0
              ? 1
              : newParty[tankIndex] !== undefined
                ? newParty[tankIndex].health
                : s.party[tankIndex].health;
          if (tankHealthNow <= 0 && (unit.role === 'DPS' || unit.role === 'HEALER')) {
            damage *= 2;
          }

          let currentHealth = Math.max(0, unit.health - damage);

          const activeBuffs: Buff[] = [];
          unit.buffs.forEach(buff => {
            if (buff.remainingTicks > 0) {
              currentHealth = Math.min(unit.maxHealth, currentHealth + buff.healingPerTick);
              activeBuffs.push({ ...buff, remainingTicks: buff.remainingTicks - 1 });
            }
          });

          newParty.push({ ...unit, health: currentHealth, buffs: activeBuffs });
        }

        if (newParty.every(u => u.health <= 0) || newParty.find(u => u.role === 'HEALER')?.health === 0) {
          const d = s.currentDungeon;
          if (d) {
            const allDead = newParty.every(u => u.health <= 0);
            const reason: DungeonFailureReason = allDead ? 'PARTY_WIPE' : 'HEALER_DOWN';
            queueMicrotask(() => {
              setDungeonOutcome({ kind: 'failure', dungeonName: d.name, reason });
            });
          }
          return { ...s, party: newParty, isCombatActive: false, currentDungeon: null, manaRegenBuffTicksRemaining: 0 };
        }

        const partyDps = 2 + (s.level * 2);
        const deadDpsCount = newParty.filter(u => u.role === 'DPS' && u.health <= 0).length;
        const bossDpsMult =
          s.combatPhase === 'BOSS' ? Math.pow(0.7, deadDpsCount) : 1;
        const effectivePartyDps = partyDps * bossDpsMult;
        let currentEnemyHealth = s.enemyHealth - effectivePartyDps;
        let newTrashPulls = s.trashPullsRemaining;
        let newPhase = s.combatPhase;
        let newProgress = s.dungeonProgress;
        let newEnemyMaxHealth = s.enemyMaxHealth;

        if (currentEnemyHealth <= 0) {
          if (s.combatPhase === 'TRASH') {
            newTrashPulls -= 1;
            if (newTrashPulls > 0) {
              currentEnemyHealth = 100;
              newEnemyMaxHealth = 100;
            } else {
              newPhase = 'BOSS';
              currentEnemyHealth = s.currentDungeon?.bossHealth || 1000;
              newEnemyMaxHealth = s.currentDungeon?.bossHealth || 1000;
            }
          } else {
            const d = s.currentDungeon;
            const newXp = s.xp + 100;
            const meta = computeMetaFromProgress(newXp, s.playerClass, s.talents);
            const isLevelUp = meta.level > s.level;
            if (d) {
              queueMicrotask(() => {
                setDungeonOutcome({
                  kind: 'success',
                  dungeonName: d.name,
                  bossName: d.bossName,
                  xpGained: 100,
                  levelUp: isLevelUp,
                  loot: d.lootRewards,
                });
              });
            }
            const dungeonId = d?.id ?? '';
            const completedDungeonIds =
              dungeonId && !s.completedDungeonIds.includes(dungeonId)
                ? [...s.completedDungeonIds, dungeonId]
                : s.completedDungeonIds;
            return {
              ...s,
              xp: newXp,
              level: meta.level,
              talentPoints: meta.talentPoints,
              dungeonProgress: 100,
              isCombatActive: false,
              currentDungeon: null,
              manaRegenBuffTicksRemaining: 0,
              completedDungeonIds,
              maxMana: meta.maxMana,
              mana: Math.min(meta.maxMana, s.mana),
            };
          }
        }

        // Calculate visual progress 0-100%
        if (newPhase === 'TRASH') {
            const pullProgress = (3 - newTrashPulls) * 25;
            const currentPullPercent = Math.max(0, (100 - currentEnemyHealth) / 100) * 25;
            newProgress = Math.min(75, pullProgress + currentPullPercent);
        } else {
            const bossMax = s.currentDungeon?.bossHealth || 1000;
            const bossPercent = Math.max(0, (bossMax - currentEnemyHealth) / bossMax) * 25;
            newProgress = 75 + bossPercent;
        }

        const buffTicks = s.manaRegenBuffTicksRemaining;
        const regenMult =
          buffTicks > 0 && SPELLS.mana_potion.manaRegenBuffMultiplier !== undefined
            ? SPELLS.mana_potion.manaRegenBuffMultiplier
            : 1;
        const newMana = Math.min(s.maxMana, s.mana + MANA_REGEN_PER_TICK * regenMult);
        const nextManaRegenBuffTicks = buffTicks > 0 ? buffTicks - 1 : 0;

        // Update cooldowns
        Object.keys(cooldownsRef.current).forEach(key => {
            if (cooldownsRef.current[key] > 0) cooldownsRef.current[key] -= 1;
        });

        return {
          ...s,
          party: newParty,
          dungeonProgress: newProgress,
          mana: newMana,
          manaRegenBuffTicksRemaining: nextManaRegenBuffTicks,
          enemyHealth: currentEnemyHealth,
          enemyMaxHealth: newEnemyMaxHealth,
          trashPullsRemaining: newTrashPulls,
          combatPhase: newPhase,
        };
      });
    }, TICK_RATE);

    return () => clearInterval(interval);
  }, [state.isCombatActive]);

  useEffect(() => {
    writeStoredProgress(state);
  }, [state.xp, state.level, state.talentPoints, state.talents, state.playerClass, state.completedDungeonIds]);

  return {
    state,
    selectClass,
    startDungeon,
    abandonDungeon,
    castSpell,
    unlockTalent,
    cooldowns: cooldownsRef.current,
    dungeonOutcome,
    dismissDungeonOutcome,
  };
}
