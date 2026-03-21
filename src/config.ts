/**
 * Configuration for specdown test execution.
 */

export interface SpecConfig {
  http: {
    base: string;
    headers: Record<string, string>;
    timeout?: number;
  };
}

/**
 * Default config when none is provided.
 */
export function defaultConfig(): SpecConfig {
  return {
    http: {
      base: 'http://localhost',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    },
  };
}
