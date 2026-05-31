# checkr — Contributing Guide

---

## Repository structure

```
checkr/
  packages/
    core/          ← @checkr/core — engine
    cli/           ← @checkr/cli — CLI wrapper
    utils/         ← @checkr/utils — rule author utilities
  docs/            ← documentation source
  examples/        ← example rule sets
```

---

## Development setup

```bash
git clone https://github.com/your-org/checkr
cd checkr
bun install
bun build
```

---

## Running tests

```bash
bun test              # all packages
bun test packages/core
bun test packages/cli
bun test packages/utils
```

---

## Rule contract stability

The rule contract is the most important API surface. Changes to it are breaking changes.

**Stable (do not change without major version):**
- Check function signature: `(source: string, filePath: string) => Violation[]`
- Fix function signature: `(source: string, filePath: string, violations: Violation[], args?: string[]) => string`
- `Violation` required fields: `file`, `line`, `text`, `message`
- File naming convention: `check_*.js`, `fix_*.js`
- Export naming convention: function name starts with `check` or `fix`

**Unstable (may change in minor versions):**
- Reporter output format
- Cache format
- Internal engine APIs

---

## Adding a new utility to `@checkr/utils`

1. Add the function to `packages/utils/src/`
2. Export it from `packages/utils/src/index.js`
3. Add tests in `packages/utils/tests/`
4. Document it in `RULE_AUTHORING.md`

Utilities must have zero dependencies and work in both Node.js and Bun.

---

## Commit convention

```
feat: add --staged flag to checkr run
fix: handle Windows paths in file walker
docs: update CLI reference for v1.1
perf: parallelize file reading in scanner
test: add cache invalidation tests
chore: bump dependencies
```

---

## Release process

1. Update version in all `package.json` files
2. Update `ROADMAP.md` — mark completed items
3. Tag: `git tag v1.1.0`
4. Publish: `bun publish --access public`
