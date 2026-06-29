# checkr packages

Monorepo packages for [checkr](https://github.com/alaamer12/chekr) — a project rule runner for design-system and architectural contracts.

## Install

```bash
# CLI (global)
npm install -g @checkr/cli

# Programmatic engine
npm install @checkr/core

# Rule-author utilities
npm install @checkr/utils @checkr/helpers
```

## Usage

```bash
# From a project with .checkr/checks/
checkr run
checkr run --changed
checkr list
checkr validate
checkr init
```

```js
import { run } from "@checkr/core";

const result = await run({ cwd: process.cwd() });
console.log(result.summary);
```

## Packages

| Package | Description |
|---------|-------------|
| `@checkr/helpers` | Config parsing, path helpers, naming utilities |
| `@checkr/utils` | File walking, ignore handling, terminal colors |
| `@checkr/core` | Engine: scanning, rule loading, reporting |
| `@checkr/cli` | `checkr` command-line interface |

## Publish checklist

Before publishing any package to npm:

- [ ] Root tests pass: `bun test`
- [ ] Lint passes: `bun run lint`
- [ ] Version bumped in all affected `package.json` files (keep workspace versions aligned)
- [ ] Internal deps use semver ranges (`^0.1.0`), not `workspace:*`
- [ ] `files` field includes only shippable sources (`src/`)
- [ ] `exports` map matches public entry points
- [ ] `engines.node` is `>=18`
- [ ] No secrets or `.env` files in the tarball (`npm pack --dry-run`)
- [ ] Logged in: `npm whoami`
- [ ] Publish order: `helpers` → `utils` → `core` → `cli`
- [ ] Tag release: `npm publish --access public` from each package directory

Root workspace stays `"private": true`; only `@checkr/*` packages are published.
