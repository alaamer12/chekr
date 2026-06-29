# Publishing chekr to npm

Only **two packages** are published to npm:

| Package | Purpose |
|---------|---------|
| `@chekr/cli` | `chekr` binary + bundled engine & rule utilities |
| `@chekr/types` | TypeScript definitions and Zod config schema |

`@chekr/helpers`, `@chekr/utils`, and `@chekr/core` are **private** monorepo packages. They ship **inside** `@chekr/cli` via `bundledDependencies` — not as separate registry packages.

After `npm install -D @chekr/cli`, rule files can still use:

```js
import { walkFiles, buildIgnoredLines } from "@chekr/utils";
```

Those modules are hoisted from the CLI bundle into `node_modules`.

## Prerequisites

1. **npm account** — [https://www.npmjs.com/signup](https://www.npmjs.com/signup)
2. **`@chekr` scope** on npm (org or user)
3. **Logged in locally:**

```bash
npm login
npm whoami
```

4. **Clean tree** — from repo root:

```bash
bun install
bun run verify
```

## Before publishing

### 1. Align versions

`@chekr/cli`, `@chekr/types`, and all internal packages should share the same version (e.g. `0.1.0`).

`@chekr/cli` lists internal packages with **exact** versions (`0.1.0`, not `workspace:*`) so `npm pack` can bundle them.

### 2. Dry-run the CLI tarball

From `packages/cli`:

```bash
npm pack --dry-run
```

Confirm the tarball includes bundled packages:

```
node_modules/@chekr/core
node_modules/@chekr/helpers
node_modules/@chekr/utils
```

### 3. Public access

Scoped packages default to private. Always use:

```bash
npm publish --access public
```

## First publish

From repository root, after `bun run verify` passes:

```bash
cd types
npm publish --access public
```

```bash
cd ../packages/cli
npm publish --access public
```

Order does not matter between these two — they have no dependency on each other.

## Verify install

In a temp directory:

```bash
mkdir /tmp/chekr-smoke && cd /tmp/chekr-smoke
npm init -y
npm install -D @chekr/cli @chekr/types
npx chekr init
npx chekr run
```

(`npx chekr` resolves the `chekr` binary from `@chekr/cli` after install.)

Confirm rule utilities resolve:

```bash
node -e "import('@chekr/utils').then(m => console.log(Object.keys(m)))"
```

## Version bumps (after v0.1.0)

1. Bump version in `types/package.json`, `packages/cli/package.json`, and all internal `packages/*/package.json`
2. Update exact internal versions in `packages/cli/package.json` (`@chekr/core`, etc.)
3. `bun run verify`
4. Publish `@chekr/types` and `@chekr/cli`
5. Tag git: `git tag v0.2.0 && git push origin v0.2.0`

## Troubleshooting

| Error | Fix |
|-------|-----|
| `402 You must sign up for private packages` | Add `--access public` |
| `403 Forbidden` | Not a member of `@chekr` org |
| `409 Cannot publish over existing version` | Bump version |
| Bundled packages missing from tarball | Run `bun install` from root; ensure internal packages exist in `node_modules` |
| `workspace:*` in published package | Use exact semver in `packages/cli` dependencies |

## What stays private

- Root `package.json` (`"private": true`) — monorepo dev tooling
- `@chekr/helpers`, `@chekr/utils`, `@chekr/core` — bundled into CLI, not published separately

## CI publish (optional)

Use `NPM_TOKEN` with `npm publish --access public` in GitHub Actions after tests pass.
