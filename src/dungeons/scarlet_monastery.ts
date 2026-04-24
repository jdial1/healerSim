import type { Dungeon } from '../types.ts';

export const scarlet_monastery: Dungeon = {
  id: 'scarlet_monastery',
  name: 'Scarlet Monastery',
  difficulty: 3,
  levelMin: 7,
  levelMax: 9,
  bossName: 'High Inspector Whitemane',
  bossHealth: 5000,
  bossIcon: 'lorc/crowned-heart',
  cardIcon: 'delapouite/church',
  enemies: [
    { name: 'Scarlet Knight', icon: 'delapouite/knight-banner' },
    { name: 'Scarlet Monk', icon: 'delapouite/monk-face' },
    { name: 'Mograine', icon: 'lorc/crowned-skull' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'smite_sear',
        name: 'Holy Fire',
        icon: 'lorc/sunbeams',
        durationTicks: 40,
        damagePerTick: 2.4,
        targeting: 'two_random',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'smite_fury',
        name: 'Resurrection Fury',
        icon: 'lorc/crowned-skull',
        durationTicks: 80,
        partyDamageMultiplier: 1.8,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'smite_penance',
        name: 'Penitent Flare',
        icon: 'lorc/glowing-hands',
        damage: 40,
        targeting: 'single_random',
      },
    ],
  },
};
