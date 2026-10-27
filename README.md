# env-startup-check

Stop your app from booting half-configured. `env-startup-check` validates environment variables at startup, tells you **every** missing or invalid one in a single message, and never prints the values (so secrets stay out of logs).

## What it does

- Checks required variables and parses them into real types: `string`, `number`, `int`, `port`, `boolean`, `url`, `json`, `list`.
- Collects all problems and reports them together, instead of failing on the first one and making you redeploy five times.
- Supports `default`, `required: false`, `oneOf`, `min`, `max`, `minLength`, `pattern`.
- Can derive the required variables from your `.env.example`, either in code or with a CLI you can run in CI or Docker entrypoints.
- Error messages contain names and reasons only, never values. Zero dependencies, TypeScript types included.

## Install

```sh
npm install env-startup-check
```

## Usage

```js
import { requireEnv } from 'env-startup-check';

const env = requireEnv({
  PORT: { type: 'port', default: 3000 },
  DATABASE_URL: 'url',
  JWT_SECRET: { minLength: 32 },
  NODE_ENV: { oneOf: ['development', 'production', 'test'], default: 'development' },
  SENTRY_DSN: { type: 'url', required: false },
});
// If anything is wrong, prints all problems and exits with code 1:
//   Invalid environment:
//     - DATABASE_URL: is missing
//     - JWT_SECRET: must be at least 32 characters
// Otherwise env.PORT is a number, env.DATABASE_URL a string, ...
```

## API

- `requireEnv(schema, { env?, exit?, log? })` validate and return parsed values. On failure it logs the problems and calls `process.exit(1)`. Pass `exit: false` to get a thrown `EnvCheckError` instead.
- `checkEnv(schema, env = process.env)` same validation, always throws `EnvCheckError` (with `.problems = [{ name, problem }]`). Use it in tests or custom boot code.
- `checkAgainstExample(path = '.env.example', env = process.env)` require every variable named in the example file. Mark one optional with a `# optional` comment: `SENTRY_DSN= # optional`. Presence only; empty counts as missing.
- `parseExample(text)` returns `[{ name, optional }]`.
- CLI: `npx env-startup-check [.env.example] [--env-file .env]` prints `OK: N variables checked` or lists the missing ones and exits 1.
- A schema entry is a type name or `{ type, required, default, description, oneOf, min, max, minLength, pattern }`. Empty string counts as unset.

## Where to use it

- Top of `server.js` / `main.ts`, before connecting to the database or starting the HTTP server.
- Docker or Kubernetes entrypoints and CI/CD steps (`npx env-startup-check`) so a bad deploy fails before it takes traffic.
- Onboarding: a new teammate copies `.env.example` to `.env`, runs the CLI, and sees exactly what is left to fill in.
- Serverless functions, where a missing variable otherwise surfaces as an unhelpful runtime error.

## Integrate

```js
// config.js (import this first, everywhere else import { config } from './config.js')
import { requireEnv } from 'env-startup-check';

export const config = requireEnv({
  PORT: { type: 'port', default: 3000 },
  DATABASE_URL: 'url',
  STRIPE_KEY: { pattern: /^sk_/ },
});
```

```json
{ "scripts": { "prestart": "env-startup-check .env.example" } }
```

It reads `process.env` only. To load a `.env` file in your app use `node --env-file=.env` (Node 20.6+) or dotenv, then call `requireEnv`.

## Limitations

- Does not load `.env` files into `process.env` itself (the CLI `--env-file` option only reads one for checking).
- `.env.example` mode checks presence, not types; use a schema for types.
- Values with `#` comments on the same line in `.env.example` are only inspected for the `# optional` marker.
