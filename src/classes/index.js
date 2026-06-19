import * as druid from "./druid/hooks.js";
import druidClassJson from "./druid/class.json" with { type: "json" };
import druidSpellsJson from "./druid/spells.json" with { type: "json" };
import druidTalentsJson from "./druid/talents.json" with { type: "json" };
import * as priest from "./priest/hooks.js";
import priestClassJson from "./priest/class.json" with { type: "json" };
import priestSpellsJson from "./priest/spells.json" with { type: "json" };
import priestTalentsJson from "./priest/talents.json" with { type: "json" };
import * as paladin from "./paladin/hooks.js";
import paladinClassJson from "./paladin/class.json" with { type: "json" };
import paladinSpellsJson from "./paladin/spells.json" with { type: "json" };
import paladinTalentsJson from "./paladin/talents.json" with { type: "json" };
const classRegistry = {
  DRUID: {
    metadata: druidClassJson,
    spells: druidSpellsJson,
    talents: druidTalentsJson,
    hooks: druid
  },
  PRIEST: {
    metadata: priestClassJson,
    spells: priestSpellsJson,
    talents: priestTalentsJson,
    hooks: priest
  },
  PALADIN: {
    metadata: paladinClassJson,
    spells: paladinSpellsJson,
    talents: paladinTalentsJson,
    hooks: paladin
  }
};
const ClassRegistry = {
  get(classId) {
    return classRegistry[classId.toUpperCase()];
  },
  getAll() {
    return Object.values(classRegistry);
  },
  getSpells(classId) {
    return classRegistry[classId.toUpperCase()]?.spells ?? {};
  },
  getTalents(classId) {
    return classRegistry[classId.toUpperCase()]?.talents ?? [];
  },
  getMetadata(classId) {
    return classRegistry[classId.toUpperCase()]?.metadata;
  },
  getHooks(classId) {
    return classRegistry[classId.toUpperCase()]?.hooks;
  }
};
var stdin_default = ClassRegistry;
export {
  ClassRegistry,
  stdin_default as default
};
