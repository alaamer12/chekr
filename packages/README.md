# chekr packages

## Published to npm

| Package | Description |
|---------|-------------|
| `@chekr/cli` | `chekr` binary; bundles engine + internal utilities |
| `@chekr/types` | TypeScript definitions and Zod config schema |

```bash
npm install -D @chekr/cli @chekr/types
```

## Internal (monorepo only)

These are **not** published separately. They ship inside `@chekr/cli` via `bundledDependencies`:

| Package | Role |
|---------|------|
| `@chekr/helpers` | Config parse/merge, naming, paths |
| `@chekr/utils` | File walker, ignore blocks, terminal colors |
| `@chekr/core` | Engine — discover rules, scan, report |

## Development

```bash
bun install
bun run verify
```

## Publishing

See [docs/PUBLISHING.md](../docs/PUBLISHING.md).
