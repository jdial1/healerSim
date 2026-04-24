import type { Dungeon } from '../types.ts';

export const scholomance: Dungeon = {
  id: 'scholomance',
  name: 'Scholomance',
  difficulty: 8,
  levelMin: 22,
  levelMax: 24,
  bossName: 'Darkmaster Gandling',
  bossHealth: 250000,
  bossIcon: 'delapouite/graduate-cap',
  cardIcon: 'delapouite/spooky-house',
  enemies: [
    { name: 'Risen Guard', icon: 'delapouite/shambling-zombie' },
    { name: 'Necromancer', icon: 'lorc/death-note' },
    { name: 'Voidwalker', icon: 'lorc/shadow-follower' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'gandling_curse',
        name: 'Incinerate Soul',
        icon: 'lorc/cursed-star',
        durationTicks: 50,
        damagePerTick: 4.4,
        targeting: 'single_random',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'gandling_darkmastery',
        name: 'Dark Mastery',
        icon: 'delapouite/graduate-cap',
        durationTicks: 180,
        partyDamageMultiplier: 1.7,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'gandling_shadow_bolt',
        name: 'Shadow Volley',
        icon: 'lorc/death-note',
        damage: 58,
        targeting: 'all_living',
      },
    ],
  },
};
