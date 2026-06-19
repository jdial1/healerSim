import { ClassRegistry } from "../classes/index.js";
function getTalents(cls) {
  const src = ClassRegistry.getTalents(cls);
  return src.map((t) => ({ ...t }));
}
export {
  getTalents
};
