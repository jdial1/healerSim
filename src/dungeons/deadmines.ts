import type { Dungeon } from '../types.ts';

export const deadmines: Dungeon = {
  id: 'deadmines',
  name: 'The Deadmines',
  difficulty: 1,
  levelMin: 1,
  levelMax: 3,
  bossName: 'Edwin VanCleef',
  bossHealth: 1000,
  bossIcon: 'delapouite/pirate-captain',
  cardIcon: 'delapouite/gold-mine',
  enemies: [
    { name: 'Defias Pirate', icon: 'lorc/pirate-skull' },
    { name: 'Defias Miner', icon: 'delapouite/miner' },
    { name: 'Smite', icon: 'lorc/spiked-mace' },
  ],
  bossCombat: {
    debuffTemplates: [
      {
        abilityId: 'vc_gut_slash',
        name: 'Gut Slash',
        icon: 'lorc/bleeding-wound',
        durationTicks: 120,
        damagePerTick: 0.7,
        targeting: 'single_random',
      },
    ],
    selfBuffTemplates: [
      {
        abilityId: 'vc_blade_flurry',
        name: 'Blade Flurry',
        icon: 'lorc/sword-clash',
        durationTicks: 100,
        partyDamageMultiplier: 1.3,
      },
    ],
    attackTemplates: [
      {
        abilityId: 'vc_ambush',
        name: 'Ambush',
        icon: 'lorc/crossed-swords',
        damage: 26,
        targeting: 'single_random',
      },
    ],
  },
};
