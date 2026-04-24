import type { Dungeon } from '../types.ts';

export const blackrock_depths: Dungeon = {
  id: 'blackrock_depths',
  name: 'Blackrock Depths',
  difficulty: 6,
  levelMin: 16,
  levelMax: 18,
  bossName: 'Emperor Thaurissan',
  bossHealth: 55000,
  bossIcon: 'delapouite/imperial-crown',
  cardIcon: 'lorc/anvil',
  enemies: [
    { name: 'Dark Iron Dwarf', icon: 'delapouite/dwarf-face' },
    { name: 'Fire Elemental', icon: 'lorc/campfire' },
    { name: 'Houndmaster', icon: 'lorc/hound' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'thaurissan_inferno',
        name: 'Magma Splash',
        icon: 'lorc/fire-ray',
        durationTicks: 60,
        damagePerTick: 1.8,
        targeting: 'all_living',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'thaurissan_avatar',
        name: 'Avatar of Flame',
        icon: 'lorc/campfire',
        durationTicks: 135,
        partyDamageMultiplier: 1.7,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'thaurissan_dominate',
        name: 'Hand of Thaurissan',
        icon: 'lorc/crown-of-thorns',
        damage: 72,
        targeting: 'single_random',
      },
    ],
  },
};
