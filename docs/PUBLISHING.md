# Publishing chekr to npm

Only **two packages** are published to npm:

| Package | Purpose |
|---------|---------|
| `@chekr/cli` | `chekr` binary + bundled engine & rule utilities |
| `@chekr/types` | TypeScript definitions and Zod config schema |

`@chekr/helpers`, `@chekr/utils`, and `@chekr/core` are **private** monorepo packages. They ship **inside** `@chekr/cli` under `vendor/` with `file:` dependencies — not as separate registry packages.

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

`@chekr/cli` lists internal packages as **`file:vendor/@chekr/*`** so npm/bun never fetch them from the registry.

### 2. Dry-run the CLI tarball

From repo root (vendors internal packages first — required with Bun workspaces):

```bash
node scripts/sync-cli-vendor.mjs
node scripts/verify-cli-pack.mjs
```

Confirm the tarball includes:

```
vendor/@chekr/core
vendor/@chekr/core/node_modules/@chekr/helpers
vendor/@chekr/core/node_modules/@chekr/utils
vendor/@chekr/core/node_modules/ignore
vendor/@chekr/core/node_modules/simple-git
vendor/@chekr/helpers
vendor/@chekr/utils
```

`sync-cli-vendor.mjs` vendors internal packages and nests runtime deps under `vendor/@chekr/core/node_modules/` so the CLI works when Bun/npm execute from the published tarball (no registry lookup for private `@chekr/*` packages).

`npm publish` runs these steps automatically via `prepublishOnly`.

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
2. Update `file:vendor` paths in `packages/cli/package.json` if vendor layout changes
3. `bun run verify`
4. Publish `@chekr/types` and `@chekr/cli`
5. Tag git: `git tag v0.2.0 && git push origin v0.2.0`

## Troubleshooting

| Error | Fix |
|-------|-----|
| `402 You must sign up for private packages` | Add `--access public` |
| `403 Forbidden` | Not a member of `@chekr` org |
| `409 Cannot publish over existing version` | Bump version |
| `404 @chekr/core` on install | Republish `@chekr/cli` ≥0.1.1 (uses `file:vendor` deps, not registry semver) |
| Bundled packages missing from tarball | Run `node scripts/sync-cli-vendor.mjs` before publish |
| `415 invalid path: package/../../node_modules` | Bun symlinks — run prepare script; do not `npm pack` without it |
| `workspace:*` in published package | Use exact semver in `packages/cli` dependencies |

## What stays private

- Root `package.json` (`"private": true`) — monorepo dev tooling
- `@chekr/helpers`, `@chekr/utils`, `@chekr/core` — bundled into CLI, not published separately

## CI publish (optional)

Use `NPM_TOKEN` with `npm publish --access public` in GitHub Actions after tests pass.
