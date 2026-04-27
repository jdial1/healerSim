function argvLooksLikeTestScript(): boolean {
  const av = (process.argv[1] ?? '').replace(/\\/g, '/');
  return /\/scripts\/test-[^/]+\.ts$/.test(av);
}

export function useTestAnsi(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    return false;
  }
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') {
    return true;
  }
  const ev = process.env.npm_lifecycle_event;
  if (ev === 'test' || ev === 'tests' || (typeof ev === 'string' && ev.startsWith('test'))) {
    return true;
  }
  if (argvLooksLikeTestScript()) {
    return true;
  }
  return process.stdout.isTTY === true;
}

export function testPalette(): {
  r: string;
  dim: string;
  green: string;
  red: string;
  yellow: string;
  cyan: string;
  magenta: string;
} {
  if (!useTestAnsi()) {
    return { r: '', dim: '', green: '', red: '', yellow: '', cyan: '', magenta: '' };
  }
  return {
    r: '\x1b[0m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
  };
}
