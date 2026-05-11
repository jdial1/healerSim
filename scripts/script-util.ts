import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Script Utility: Consistent path resolution for ESM scripts
 * 
 * This module provides a standardized way to get __filename and __dirname
 * in ESM scripts, working consistently across Windows and Linux.
 */

export function getScriptDir(importMetaUrl: string): { __filename: string; __dirname: string } {
  const __filename = fileURLToPath(importMetaUrl);
  const __dirname = path.dirname(__filename);
  return { __filename, __dirname };
}

/**
 * Resolve a path relative to the script's directory
 */
export function resolveFromScriptDir(importMetaUrl: string, ...paths: string[]): string {
  const { __dirname } = getScriptDir(importMetaUrl);
  return path.resolve(__dirname, ...paths);
}