import { readFileSync } from 'node:fs';

export class EnvCheckError extends Error {
  constructor(problems) {
    super(`Invalid environment:\n${problems.map((p) => `  - ${p.name}: ${p.problem}`).join('\n')}`);
    this.name = 'EnvCheckError';
    this.problems = problems;
  }
}

const TYPES = {
  string: (v) => v,
  number: (v) => { if (v.trim() === '' || Number.isNaN(Number(v))) throw new Error('must be a number'); return Number(v); },
  int: (v) => { if (!/^-?\d+$/.test(v.trim())) throw new Error('must be an integer'); return Number(v); },
  port: (v) => { const n = Number(v); if (!/^\d+$/.test(v.trim()) || n < 1 || n > 65535) throw new Error('must be a port (1-65535)'); return n; },
  boolean: (v) => { const s = v.trim().toLowerCase(); if (['true', '1', 'yes', 'on'].includes(s)) return true; if (['false', '0', 'no', 'off'].includes(s)) return false; throw new Error('must be a boolean (true/false/1/0/yes/no/on/off)'); },
  url: (v) => { try { new URL(v); } catch { throw new Error('must be a valid URL'); } return v; },
  json: (v) => { try { return JSON.parse(v); } catch { throw new Error('must be valid JSON'); } },
  list: (v) => v.split(',').map((s) => s.trim()).filter(Boolean),
};

/**
 * Validate env against a schema. Returns parsed values or throws EnvCheckError listing ALL problems.
 * schema: { NAME: 'port' | { type, required=true, default, oneOf, min, max, pattern, minLength } }
 * Values are never included in error messages.
 */
export function checkEnv(schema, env = process.env) {
  const problems = [];
  const out = {};
  for (const [name, raw] of Object.entries(schema)) {
    const spec = typeof raw === 'string' ? { type: raw } : { ...raw };
    const type = spec.type ?? 'string';
    if (!TYPES[type]) throw new TypeError(`Unknown type "${type}" for ${name}. Use one of: ${Object.keys(TYPES).join(', ')}`);
    const value = env[name];
    if (value === undefined || value === '') {
      if ('default' in spec) { out[name] = spec.default; continue; }
      if (spec.required === false) { out[name] = undefined; continue; }
      problems.push({ name, problem: 'is missing' + (spec.description ? ` (${spec.description})` : '') });
      continue;
    }
    try {
      const parsed = TYPES[type](value);
      if (spec.oneOf && !spec.oneOf.includes(parsed)) throw new Error(`must be one of: ${spec.oneOf.join(', ')}`);
      if (spec.min !== undefined && parsed < spec.min) throw new Error(`must be >= ${spec.min}`);
      if (spec.max !== undefined && parsed > spec.max) throw new Error(`must be <= ${spec.max}`);
      if (spec.minLength !== undefined && String(parsed).length < spec.minLength) throw new Error(`must be at least ${spec.minLength} characters`);
      if (spec.pattern && !spec.pattern.test(String(parsed))) throw new Error('has an invalid format');
      out[name] = parsed;
    } catch (e) {
      problems.push({ name, problem: e.message });
    }
  }
  if (problems.length) throw new EnvCheckError(problems);
  return out;
}

/** Like checkEnv, but prints the problems and exits the process instead of throwing. Call at the very top of your entry file. */
export function requireEnv(schema, { env = process.env, exit = true, log = console.error } = {}) {
  try {
    return checkEnv(schema, env);
  } catch (e) {
    if (!(e instanceof EnvCheckError)) throw e;
    log(e.message);
    log('Set these in your environment or .env file and restart.');
    if (exit) process.exit(1);
    throw e;
  }
}

/** Parse the variable names out of .env.example text. Lines like `NAME=`, `export NAME=x`; `# comment` and blank lines are ignored. A trailing `# optional` comment marks a var optional. */
export function parseExample(text) {
  const vars = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!m) continue;
    const optional = /#\s*optional\b/i.test(m[2]);
    vars.push({ name: m[1], optional });
  }
  return vars;
}

/** Require every non-optional variable listed in a .env.example file. Only checks presence. */
export function checkAgainstExample(path = '.env.example', env = process.env) {
  const vars = parseExample(readFileSync(path, 'utf8'));
  const problems = vars.filter((v) => !v.optional && (env[v.name] === undefined || env[v.name] === '')).map((v) => ({ name: v.name, problem: 'is missing' }));
  if (problems.length) throw new EnvCheckError(problems);
  return vars.map((v) => v.name);
}
