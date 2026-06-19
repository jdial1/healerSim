import { getTheme } from "./classTheme.js";
import { ClassRegistry } from "./classes/index.js";
function classIconFile(cls) {
  return ClassRegistry.getMetadata(cls)?.portraitIcon?.split("/").pop()?.replace(".svg", "") ?? "default";
}
function getIconUrl(cls) {
  const iconFile = classIconFile(cls);
  return `${import.meta.env.BASE_URL}icons/class-icons/${iconFile}.png`;
}
function getBorderClass(cls) {
  return getTheme(cls).iconFrame;
}
function getTransformClass(cls) {
  return ClassRegistry.getMetadata(cls)?.uiTransform ?? "";
}
function getWrapperTransformClass() {
  return "-rotate-3 transform";
}
export {
  getBorderClass,
  getIconUrl,
  getTransformClass,
  getWrapperTransformClass
};
