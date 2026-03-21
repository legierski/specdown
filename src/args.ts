/**
 * CLI argument parsing for specdown.
 */

import type { SpecConfig } from './config.js';

export interface CliOptions {
  command: string;
  targets: string[];
  format: 'pretty' | 'json';
  config: SpecConfig;
  filter: string | null;
  baseOverridden: boolean;
  verbose: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const command = args[0] || 'run';
  const targets: string[] = [];
  let format: 'pretty' | 'json' = 'pretty';
  let filter: string | null = null;
  let base = 'http://localhost:3000';
  let baseOverridden = false;

  let verbose = false;

  let i = 1;
  while (i < args.length) {
    if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1] as 'pretty' | 'json';
      i += 2;
    } else if (args[i] === '--base' && args[i + 1]) {
      base = args[i + 1];
      baseOverridden = true;
      i += 2;
    } else if (args[i] === '--test' && args[i + 1]) {
      filter = args[i + 1];
      i += 2;
    } else if (args[i] === '--verbose') {
      verbose = true;
      i++;
    } else if (!args[i].startsWith('-')) {
      targets.push(args[i]);
      i++;
    } else {
      i++;
    }
  }

  const config: SpecConfig = {
    http: {
      base,
      headers: {},
    },
  };

  return { command, targets, format, config, filter, baseOverridden, verbose };
}
