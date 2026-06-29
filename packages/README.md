# checkr packages

## Published to npm

| Package | Description |
|---------|-------------|
| `@checkr/cli` | `checkr` binary; bundles engine + internal utilities |
| `@checkr/types` | TypeScript definitions and Zod config schema |

```bash
npm install -D @checkr/cli @checkr/types
```

## Internal (monorepo only)

These are **not** published separately. They ship inside `@checkr/cli` via `bundledDependencies`:

| Package | Role |
|---------|------|
| `@checkr/helpers` | Config parse/merge, naming, paths |
| `@checkr/utils` | File walker, ignore blocks, terminal colors |
| `@checkr/core` | Engine — discover rules, scan, report |

## Development

```bash
bun install
bun run verify
```

## Publishing

See [docs/PUBLISHING.md](../docs/PUBLISHING.md).
