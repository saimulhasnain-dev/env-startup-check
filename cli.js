#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { checkAgainstExample, EnvCheckError } from './index.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: env-startup-check [path/to/.env.example] [--env-file .env]\nExits 1 and lists every missing variable. Never prints values.');
  process.exit(0);
}
const flag = args.indexOf('--env-file');
const envFile = flag >= 0 ? args[flag + 1] : null;
const example = args.find((a, i) => !a.startsWith('-') && i !== (flag < 0 ? -1 : flag + 1)) ?? '.env.example';
if (!existsSync(example)) { console.error(`Not found: ${example}`); process.exit(2); }

const env = { ...process.env };
if (envFile) {
  if (!existsSync(envFile)) { console.error(`Not found: ${envFile}`); process.exit(2); }
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
try {
  const names = checkAgainstExample(example, env);
  console.log(`OK: ${names.length} variables checked`);
} catch (e) {
  if (e instanceof EnvCheckError) { console.error(e.message); process.exit(1); }
  throw e;
}
