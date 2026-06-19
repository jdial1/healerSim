import { ClassRegistry } from "./classes/index.js";
import { getTheme } from "./classTheme.js";
function classUiRows() {
  return ClassRegistry.getAll().map((module) => {
    const row = module.metadata;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      iconKey: row.iconKey,
      iconPath: row.portraitIcon,
      color: row.color,
      textColor: row.textColor,
      hoverBorderClass: row.hoverBorderClass,
      jsonLocked: row.locked,
      portraitUrl: row.portraitUrl,
      portraitIcon: row.portraitIcon,
      portraitGlow: row.portraitGlow,
      passiveTraitName: row.passiveTraitName ?? "",
      passiveTraitDescription: row.passiveTraitDescription ?? "",
      passiveTraitIcon: row.passiveTraitIcon ?? "wow/spell_holy_sealofwisdom",
      theme: getTheme(row.id)
    };
  });
}
function classDisplayName(cls) {
  return ClassRegistry.getMetadata(cls)?.name ?? cls;
}
function getUiRow(cls) {
  const row = classUiRows().find((x) => x.id === cls);
  if (!row) throw new Error(`Unknown class ${cls}`);
  return row;
}
export {
  classDisplayName,
  classUiRows,
  getUiRow
};
