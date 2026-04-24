import type { Dungeon } from '../types.ts';

export const stratholme: Dungeon = {
  id: 'stratholme',
  name: 'Stratholme',
  difficulty: 7,
  levelMin: 19,
  levelMax: 21,
  bossName: 'Baron Rivendare',
  bossHealth: 110000,
  bossIcon: 'lorc/horse-head',
  cardIcon: 'delapouite/plague-doctor-profile',
  enemies: [
    { name: 'Plague Ghoul', icon: 'lorc/fanged-skull' },
    { name: 'Patchwork Horror', icon: 'lorc/frankenstein-creature' },
    { name: 'Banshee', icon: 'lorc/ghost' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'rivendare_plague',
        name: 'Necrotic Plague',
        icon: 'delapouite/plague-doctor-profile',
        durationTicks: 150,
        damagePerTick: 1.3,
        targeting: 'two_random',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'rivendare_deathwish',
        name: "Death's Advance",
        icon: 'lorc/horse-head',
        durationTicks: 160,
        partyDamageMultiplier: 1.56,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'rivendare_death_coil',
        name: 'Death Coil',
        icon: 'lorc/death-zone',
        damage: 82,
        targeting: 'single_random',
      },
    ],
  },
};
