import aurasData from './data/auras.json';

type PartyUnitBuffAura = {
  sourceSpellId: string;
  displayName: string;
  icon: string;
  maxStacks: number;
  defaultDurationTicks: number;
  dispellable: boolean;
  healingPerStackLinearBonus: number;
};

type PlayerCombatAuraEntry = {
  defaultDurationTicks: number;
};

const raw = aurasData as {
  partyUnitBuffs: Record<string, PartyUnitBuffAura>;
  playerCombatAuras: Record<string, PlayerCombatAuraEntry>;
};

export const GRACE_PARTY_AURA = raw.partyUnitBuffs.priest_grace;
export const GRACE_SOURCE_ID = GRACE_PARTY_AURA.sourceSpellId;

export function playerCombatAuraTicks(buffId: string): number {
  const n = raw.playerCombatAuras[buffId]?.defaultDurationTicks;
  if (typeof n !== 'number' || n <= 0) {
    throw new Error(`Unknown player combat aura: ${buffId}`);
  }
  return n;
}
