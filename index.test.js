import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAgainstExample, checkEnv, EnvCheckError, parseExample, requireEnv } from './index.js';

test('parses and coerces typed values', () => {
  const v = checkEnv({ PORT: 'port', DEBUG: 'boolean', URL: 'url', TAGS: 'list', N: 'int', CFG: 'json', NAME: 'string' },
    { PORT: '3000', DEBUG: 'yes', URL: 'https://a.io', TAGS: 'a, b,,c', N: '-4', CFG: '{"a":1}', NAME: 'x' });
  assert.deepEqual(v, { PORT: 3000, DEBUG: true, URL: 'https://a.io', TAGS: ['a', 'b', 'c'], N: -4, CFG: { a: 1 }, NAME: 'x' });
});

test('reports ALL problems at once and never leaks values', () => {
  try {
    checkEnv({ DB_URL: 'url', PORT: 'port', API_KEY: 'string', MODE: { oneOf: ['dev', 'prod'] } }, { DB_URL: 'not a url secret-abc', PORT: '99999', MODE: 'staging-secret' });
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof EnvCheckError);
    assert.deepEqual(e.problems.map((p) => p.name).sort(), ['API_KEY', 'DB_URL', 'MODE', 'PORT']);
    assert.ok(!e.message.includes('secret-abc') && !e.message.includes('staging-secret') && !e.message.includes('99999'));
  }
});

test('defaults, optional and empty strings', () => {
  const v = checkEnv({ A: { type: 'int', default: 5 }, B: { required: false }, C: 'string' }, { C: 'x', A: '' });
  assert.equal(v.A, 5);
  assert.equal(v.B, undefined);
  assert.throws(() => checkEnv({ C: 'string' }, { C: '' }), EnvCheckError);
});

test('min/max/minLength/pattern', () => {
  assert.throws(() => checkEnv({ N: { type: 'int', min: 10 } }, { N: '3' }), /must be >= 10/);
  assert.throws(() => checkEnv({ N: { type: 'int', max: 10 } }, { N: '30' }), /must be <= 10/);
  assert.throws(() => checkEnv({ S: { minLength: 32 } }, { S: 'short' }), /at least 32/);
  assert.throws(() => checkEnv({ S: { pattern: /^sk_/ } }, { S: 'pk_1' }), /invalid format/);
});

test('unknown type is a programming error', () => {
  assert.throws(() => checkEnv({ A: 'nope' }, { A: '1' }), TypeError);
});

test('requireEnv logs and exits instead of throwing when exit is on', () => {
  const logs = [];
  const realExit = process.exit;
  let code;
  process.exit = (c) => { code = c; throw new Error('exit'); };
  try { assert.throws(() => requireEnv({ X: 'string' }, { env: {}, log: (m) => logs.push(m) }), /exit/); } finally { process.exit = realExit; }
  assert.equal(code, 1);
  assert.match(logs[0], /X: is missing/);
});

test('parseExample finds names and optional markers', () => {
  const vars = parseExample('# c\nA=\nexport B=x\nC= # optional\n\nlower_case=1\n1BAD=x\n');
  assert.deepEqual(vars, [{ name: 'A', optional: false }, { name: 'B', optional: false }, { name: 'C', optional: true }, { name: 'lower_case', optional: false }]);
});

test('checkAgainstExample + CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'esc-'));
  const ex = join(dir, '.env.example');
  writeFileSync(ex, 'DB_URL=\nSECRET=\nDEBUG= # optional\n');
  assert.throws(() => checkAgainstExample(ex, { DB_URL: 'x' }), /SECRET/);
  assert.deepEqual(checkAgainstExample(ex, { DB_URL: 'x', SECRET: 'y' }), ['DB_URL', 'SECRET', 'DEBUG']);

  const cli = new URL('./cli.js', import.meta.url).pathname;
  const bad = spawnSync('node', [cli, ex], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /DB_URL/);
  assert.match(bad.stderr, /SECRET/);
  const envFile = join(dir, '.env');
  writeFileSync(envFile, 'DB_URL="postgres://h"\nSECRET=abc\n');
  const out = execFileSync('node', [cli, ex, '--env-file', envFile], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.match(out, /OK: 3 variables/);
});
