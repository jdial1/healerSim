import type { Dungeon } from '../types.ts';

export const sunken_temple: Dungeon = {
  id: 'sunken_temple',
  name: 'The Sunken Temple',
  difficulty: 5,
  levelMin: 13,
  levelMax: 15,
  bossName: 'Shade of Eranikus',
  bossHealth: 25000,
  bossIcon: 'lorc/dragon-breath',
  cardIcon: 'delapouite/temple-gate',
  enemies: [
    { name: "Atal'ai Exile", icon: 'lorc/alien-stare' },
    { name: 'Nightmare Wyrm', icon: 'lorc/dragon-head' },
    { name: 'Dragonkin', icon: 'lorc/double-dragon' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'eranikus_corruption',
        name: 'Deep Slumber',
        icon: 'lorc/evil-bud',
        durationTicks: 250,
        damagePerTick: 0.5,
        targeting: 'two_random',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'eranikus_frenzy',
        name: 'Nightmare Haze',
        icon: 'lorc/dragon-breath',
        durationTicks: 200,
        partyDamageMultiplier: 1.36,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'eranikus_acid',
        name: 'Acid Breath',
        icon: 'lorc/dragon-breath',
        damage: 42,
        targeting: 'all_living',
      },
    ],
  },
};
