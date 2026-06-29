# checkr packages

Monorepo packages published under the `@checkr` npm scope.

## Install (users)

```bash
npm install -g @checkr/cli
npm install -D @checkr/types
```

## Packages

| Package | Publish order | Description |
|---------|---------------|-------------|
| `@checkr/helpers` | 1 | Config parse/merge, naming |
| `@checkr/utils` | 2 | Rule-author utilities |
| `@checkr/types` | 3 | TypeScript + Zod schema |
| `@checkr/core` | 4 | Engine |
| `@checkr/cli` | 5 | `checkr` binary |

## Development

```bash
bun install
bun run verify
```

## Publishing

See [docs/PUBLISHING.md](../docs/PUBLISHING.md).
