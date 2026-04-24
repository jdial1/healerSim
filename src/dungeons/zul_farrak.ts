import type { Dungeon } from '../types.ts';

export const zul_farrak: Dungeon = {
  id: 'zul_farrak',
  name: "Zul'Farrak",
  difficulty: 4,
  levelMin: 10,
  levelMax: 12,
  bossName: 'Chief Ukorz Sandscalp',
  bossHealth: 12000,
  bossIcon: 'lorc/tribal-mask',
  cardIcon: 'delapouite/egyptian-pyramids',
  enemies: [
    { name: 'Sandfury Troll', icon: 'skoll/troll' },
    { name: 'Shadowcaster', icon: 'lorc/crystal-ball' },
    { name: 'Basilisk', icon: 'lorc/lizardman' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'ukorz_sand',
        name: 'Sandstorm',
        icon: 'delapouite/sandstorm',
        durationTicks: 110,
        damagePerTick: 1.0,
        targeting: 'all_living',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'ukorz_bloodlust',
        name: 'Berserker Rage',
        icon: 'skoll/troll',
        durationTicks: 140,
        partyDamageMultiplier: 1.5,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'ukorz_impale',
        name: 'Impale',
        icon: 'lorc/barbute',
        damage: 54,
        targeting: 'single_random',
      },
    ],
  },
};
