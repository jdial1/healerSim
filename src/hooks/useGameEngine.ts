/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  GameState, Unit, ClassType, Spell, Buff, 
  SpellType, Dungeon 
} from '../types.ts';
import { 
  TICK_RATE, MANA_REGEN_PER_TICK, SPELLS, 
  DUNGEONS, INITIAL_TALENTS 
} from '../constants.ts';

const INITIAL_PARTY: Unit[] = [
  { id: '1', name: 'Tanky McShield', role: 'TANK', maxHealth: 200, health: 200, buffs: [] },
  { id: '2', name: 'Zappy Mage', role: 'DPS', maxHealth: 80, health: 80, buffs: [] },
  { id: '3', name: 'Sneaky Rogue', role: 'DPS', maxHealth: 90, health: 90, buffs: [] },
  { id: '4', name: 'Shadow Warlock', role: 'DPS', maxHealth: 85, health: 85, buffs: [] },
  { id: '5', name: 'Player (You)', role: 'HEALER', maxHealth: 75, health: 75, buffs: [] },
];

export function useGameEngine() {
  const [state, setState] = useState<GameState>({
    playerClass: null,
    party: INITIAL_PARTY,
    mana: 100,
    maxMana: 100,
    xp: 0,
    level: 1,
    talentPoints: 5,
    talents: INITIAL_TALENTS,
    unlockedSpells: [],
    activeActionBars: [],
    currentDungeon: null,
    dungeonProgress: 0,
    combatPhase: 'TRASH',
    trashPullsRemaining: 3,
    enemyHealth: 100,
    enemyMaxHealth: 100,
    isCombatActive: false,
    logs: [],
  });

  const cooldownsRef = useRef<Record<string, number>>({});

  const addLog = useCallback((msg: string) => {
    setState(s => ({
      ...s,
      logs: [msg, ...s.logs.slice(0, 19)]
    }));
  }, []);

  const selectClass = useCallback((cls: ClassType) => {
    let initialSpells: string[] = [];
    if (cls === ClassType.PRIEST) {
      initialSpells = ['flash_heal', 'renew', 'mana_potion'];
    } else if (cls === ClassType.DRUID) {
      initialSpells = ['rejuvenation', 'regrowth', 'mana_potion'];
    }

    setState(s => ({
      ...s,
      playerClass: cls,
      unlockedSpells: initialSpells,
      activeActionBars: initialSpells,
    }));
    addLog(`Class selected: ${cls}`);
  }, [addLog]);

  const startDungeon = useCallback((dungeon: Dungeon) => {
    setState(s => ({
      ...s,
      currentDungeon: dungeon,
      dungeonProgress: 0,
      combatPhase: 'TRASH',
      trashPullsRemaining: 3,
      enemyHealth: 100,
      enemyMaxHealth: 100,
      isCombatActive: true,
      party: s.party.map(u => ({ ...u, health: u.maxHealth, buffs: [] })),
      mana: s.maxMana,
    }));
    addLog(`Entering dungeon: ${dungeon.name}`);
  }, [addLog]);

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
          if (!hasPrereqs) addLog(`Prerequisite required for ${talent.name}`);
          return s;
      }

      const newTalents = s.talents.map(t => t.id === talentId ? { ...t, points: t.points + 1 } : t);
      
      // Unlock spell only on first point
      const isFirstPoint = talent.points === 0;
      const newUnlockedSpells = (isFirstPoint && talent.spellId) ? [...s.unlockedSpells, talent.spellId] : s.unlockedSpells;
      const newActionBars = (isFirstPoint && talent.spellId) ? [...s.activeActionBars, talent.spellId] : s.activeActionBars;
      
      let newMaxMana = s.maxMana;
      if (talent.statBonus?.manaPool) newMaxMana += talent.statBonus.manaPool;

      addLog(`Upgraded talent: ${talent.name} (${talent.points + 1}/${talent.maxPoints})`);
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
  }, [addLog]);

  const castSpell = useCallback((spellId: string, targetId: string) => {
    const spell = SPELLS[spellId];
    if (!spell) return;

    setState(s => {
      // Mana check
      if (s.mana < spell.manaCost) {
        addLog(`Not enough mana for ${spell.name}!`);
        return s;
      }

      // Cooldown check
      if (cooldownsRef.current[spellId] > 0) {
        addLog(`${spell.name} is on cooldown!`);
        return s;
      }

      const newParty = s.party.map(unit => {
        if (unit.id === targetId || (spell.type === SpellType.AOE)) {
          // Calculate talent healing boost
          const healingBoost = s.talents.reduce((acc, t) => acc + (t.statBonus?.healingBoost || 0) * t.points, 0);
          
          // Calculate crit
          const critChance = s.talents.reduce((acc, t) => acc + (t.statBonus?.critChance || 0) * t.points, 0);
          const isCrit = Math.random() * 100 < critChance;
          const critMod = isCrit ? 1.5 : 1.0;

          const totalHealing = spell.healing * (1 + healingBoost / 100) * critMod;
          const totalHotHealing = (spell.hotHealingPerTick || 0) * (1 + healingBoost / 100) * critMod;

          if (isCrit && unit.id === targetId) {
             addLog(`CRITICAL HEAL: ${spell.name} for ${Math.round(totalHealing)}!`);
          }

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
        cooldownsRef.current[spellId] = castCooldown;
      }

      // Mana return logic
      const manaReturn = s.talents.reduce((acc, t) => acc + (t.statBonus?.manaReturnOnDirectHeal || 0) * t.points, 0);
      const isDirect = spell.type === SpellType.DIRECT;
      const actualManaReturn = isDirect ? manaReturn : 0;

      const newMana = Math.min(s.maxMana, s.mana - spell.manaCost + (spell.manaRestore || 0) + actualManaReturn);

      return {
        ...s,
        party: newParty,
        mana: newMana,
      };
    });
  }, [addLog]);

  // Game Loop
  useEffect(() => {
    if (!state.isCombatActive) return;

    const interval = setInterval(() => {
      setState(s => {
        if (!s.isCombatActive) return s;

        // Damage calculation
        const newParty = s.party.map(unit => {
          // Random damage
          let damage = 0;
          const chance = Math.random();
          if (unit.role === 'TANK' && chance < 0.4) damage = Math.random() * 8 + (s.currentDungeon?.difficulty || 1);
          else if (chance < 0.1) damage = Math.random() * 5 + (s.currentDungeon?.difficulty || 1);

          let currentHealth = Math.max(0, unit.health - damage);

          // Buff/HoT ticking
          const activeBuffs: Buff[] = [];
          unit.buffs.forEach(buff => {
            if (buff.remainingTicks > 0) {
              currentHealth = Math.min(unit.maxHealth, currentHealth + buff.healingPerTick);
              activeBuffs.push({ ...buff, remainingTicks: buff.remainingTicks - 1 });
            }
          });

          return { ...unit, health: currentHealth, buffs: activeBuffs };
        });

        // Check for death/wipe
        if (newParty.every(u => u.health <= 0) || newParty.find(u => u.role === 'HEALER')?.health === 0) {
          addLog("Dungeon Failed: The party has wiped.");
          return { ...s, party: newParty, isCombatActive: false, currentDungeon: null };
        }

        // Progress and Combat Logic
        const partyDps = 2 + (s.level * 2);
        let currentEnemyHealth = s.enemyHealth - partyDps;
        let newTrashPulls = s.trashPullsRemaining;
        let newPhase = s.combatPhase;
        let newProgress = s.dungeonProgress;
        let newEnemyMaxHealth = s.enemyMaxHealth;

        if (currentEnemyHealth <= 0) {
          if (s.combatPhase === 'TRASH') {
            newTrashPulls -= 1;
            if (newTrashPulls > 0) {
              addLog(`Pack defeated! ${newTrashPulls} pulls remaining.`);
              currentEnemyHealth = 100;
              newEnemyMaxHealth = 100;
            } else {
              addLog(`All trash cleared. Entering boss fight: ${s.currentDungeon?.bossName}!`);
              newPhase = 'BOSS';
              currentEnemyHealth = s.currentDungeon?.bossHealth || 1000;
              newEnemyMaxHealth = s.currentDungeon?.bossHealth || 1000;
            }
          } else {
            // Boss victory
            addLog(`Victory! ${s.currentDungeon?.name} cleared.`);
            const newXp = s.xp + 100;
            const newLevel = Math.floor(newXp / 200) + 1;
            const isLevelUp = newLevel > s.level;
            
            if (isLevelUp) addLog(`Level Up! You are now level ${newLevel}. +1 Talent Point.`);
            
            return { 
              ...s, 
              xp: newXp, 
              level: newLevel,
              talentPoints: isLevelUp ? s.talentPoints + 1 : s.talentPoints,
              dungeonProgress: 100, 
              isCombatActive: false, 
              currentDungeon: null 
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

        // Mana regen
        const newMana = Math.min(s.maxMana, s.mana + MANA_REGEN_PER_TICK);

        // Update cooldowns
        Object.keys(cooldownsRef.current).forEach(key => {
            if (cooldownsRef.current[key] > 0) cooldownsRef.current[key] -= 1;
        });

        return {
          ...s,
          party: newParty,
          dungeonProgress: newProgress,
          mana: newMana,
          enemyHealth: currentEnemyHealth,
          enemyMaxHealth: newEnemyMaxHealth,
          trashPullsRemaining: newTrashPulls,
          combatPhase: newPhase,
        };
      });
    }, TICK_RATE);

    return () => clearInterval(interval);
  }, [state.isCombatActive, addLog]);

  return {
    state,
    selectClass,
    startDungeon,
    castSpell,
    cooldowns: cooldownsRef.current,
  };
}
