export type EnvType = 'string' | 'number' | 'int' | 'port' | 'boolean' | 'url' | 'json' | 'list';
export interface EnvVarSpec {
  type?: EnvType; required?: boolean; default?: unknown; description?: string;
  oneOf?: unknown[]; min?: number; max?: number; minLength?: number; pattern?: RegExp;
}
export type EnvSchema = Record<string, EnvType | EnvVarSpec>;
export interface EnvProblem { name: string; problem: string }
export class EnvCheckError extends Error { readonly problems: EnvProblem[] }
export function checkEnv<T = Record<string, any>>(schema: EnvSchema, env?: Record<string, string | undefined>): T;
export function requireEnv<T = Record<string, any>>(schema: EnvSchema, options?: { env?: Record<string, string | undefined>; exit?: boolean; log?: (msg: string) => void }): T;
export function parseExample(text: string): { name: string; optional: boolean }[];
export function checkAgainstExample(path?: string, env?: Record<string, string | undefined>): string[];
