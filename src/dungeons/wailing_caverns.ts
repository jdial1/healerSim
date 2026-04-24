import type { Dungeon } from '../types.ts';

export const wailing_caverns: Dungeon = {
  id: 'wailing_caverns',
  name: 'Wailing Caverns',
  difficulty: 2,
  levelMin: 4,
  levelMax: 6,
  bossName: 'Verdan the Everliving',
  bossHealth: 2500,
  bossIcon: 'cathelineau/tree-face',
  cardIcon: 'delapouite/cave-entrance',
  enemies: [
    { name: 'Raptor', icon: 'delapouite/velociraptor' },
    { name: 'Ooze', icon: 'delapouite/slime' },
    { name: 'Druid of the Fang', icon: 'lorc/snake-totem' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'verdan_strangle',
        name: 'Strangling Roots',
        icon: 'delapouite/vines',
        durationTicks: 180,
        damagePerTick: 0.6,
        targeting: 'single_random',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'verdan_thrive',
        name: 'Thrive',
        icon: 'lorc/lotus',
        durationTicks: 150,
        partyDamageMultiplier: 1.4,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'verdan_spore_burst',
        name: 'Spore Burst',
        icon: 'lorc/poison-gas',
        damage: 30,
        targeting: 'all_living',
      },
    ],
  },
};
