function sentenceCaseLabel(text) {
  const t = text.trim();
  if (!t) return t;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return t;
  const upper = (t.match(/[A-Z]/g) ?? []).length;
  if (upper / letters.length < 0.55) return t;
  const lower = t.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function sentenceCaseBlock(text) {
  return text.split("\n").map((line) => sentenceCaseLabel(line)).join("\n");
}
export {
  sentenceCaseBlock,
  sentenceCaseLabel
};
