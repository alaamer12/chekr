# Publishing checkr to npm

First-time guide for publishing the `@checkr` scope from this monorepo.

## Prerequisites

1. **npm account** — [https://www.npmjs.com/signup](https://www.npmjs.com/signup)
2. **Scoped org or user** — packages are `@checkr/cli`, `@checkr/core`, etc.
   - If you do not own the `@checkr` org on npm, create it under your user or request the scope.
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

## Publish order

Packages depend on each other. Publish in this order (dependencies first):

```
1. @checkr/helpers   (no @checkr deps)
2. @checkr/utils     (no @checkr deps)
3. @checkr/types     (optional; zod dependency)
4. @checkr/core      (helpers, utils, simple-git, ignore)
5. @checkr/cli       (core, helpers)
```

## Before each publish

### 1. Align versions

All `@checkr/*` packages should share the same version (e.g. `0.1.0`).

### 2. Replace workspace deps for npm

Published tarballs **cannot** use `workspace:*`. Each package `package.json` must list semver ranges:

```json
"@checkr/helpers": "^0.1.0"
```

*(This repo already uses `^0.1.0` in publishable packages.)*

### 3. Dry-run the tarball

From each package directory:

```bash
cd packages/helpers
npm pack --dry-run
```

Confirm only `src/` (or declared `files`) are included — no tests, no `.env`.

### 4. Public access for scoped packages

Scoped packages are private by default. Always use:

```bash
npm publish --access public
```

## First publish (step by step)

From repository root, after `bun run verify` passes:

```bash
cd packages/helpers
npm publish --access public
```

```bash
cd ../utils
npm publish --access public
```

```bash
cd ../../types
npm publish --access public
```

```bash
cd ../packages/core
npm publish --access public
```

```bash
cd ../cli
npm publish --access public
```

## Verify install

In a temp directory:

```bash
mkdir /tmp/checkr-smoke && cd /tmp/checkr-smoke
npm init -y
npm install -D @checkr/cli @checkr/types
npx checkr init
npx checkr run
```

## Version bumps (after v0.1.0)

1. Bump version in **all** `packages/*/package.json` and `types/package.json`
2. Update internal dependency ranges if needed (`^0.2.0`)
3. `bun run verify`
4. Publish in dependency order again
5. Tag git: `git tag v0.2.0 && git push origin v0.2.0`

Consider [Changesets](https://github.com/changesets/changesets) for automated versioning later.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `402 You must sign up for private packages` | Add `--access public` |
| `403 Forbidden` | Not a member of `@checkr` org; publish under your scope or join org |
| `409 Cannot publish over existing version` | Bump version in package.json |
| `E404 @checkr/helpers not found` | Publish dependencies before dependents |
| `workspace:*` in published package | Replace with semver before publish |

## What stays private

Root `package.json` has `"private": true` — the monorepo itself is **not** published. Only `@checkr/*` packages go to npm.

## CI publish (optional)

Use `NPM_TOKEN` with `npm publish --access public` in GitHub Actions after tests pass. Store token as repository secret; never commit it.
