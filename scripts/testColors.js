function argvLooksLikeTestScript() {
  const av = (process.argv[1] ?? "").replace(/\\/g, "/");
  return /\/scripts\/test-[^/]+\.ts$/.test(av);
}
function useTestAnsi() {
  if (process.env.NO_COLOR !== void 0 && process.env.NO_COLOR !== "") {
    return false;
  }
  if (process.env.FORCE_COLOR !== void 0 && process.env.FORCE_COLOR !== "0") {
    return true;
  }
  const ev = process.env.npm_lifecycle_event;
  if (ev === "test" || ev === "tests" || typeof ev === "string" && ev.startsWith("test")) {
    return true;
  }
  if (argvLooksLikeTestScript()) {
    return true;
  }
  return process.stdout.isTTY === true;
}
function testPalette() {
  if (!useTestAnsi()) {
    return { r: "", dim: "", green: "", red: "", yellow: "", cyan: "", magenta: "" };
  }
  return {
    r: "\x1B[0m",
    dim: "\x1B[2m",
    green: "\x1B[32m",
    red: "\x1B[31m",
    yellow: "\x1B[33m",
    cyan: "\x1B[36m",
    magenta: "\x1B[35m"
  };
}
export {
  testPalette,
  useTestAnsi
};
