# @checkr/types

TypeScript definitions for `checkr.config.js` and rule contracts.

## Install

```bash
npm install -D @checkr/types
```

## Usage

```js
/** @type {import('checkr').CheckrConfig} */
export default {
  checksDir: "./.checkr/checks",
  gitignore: ".gitignore",
};
```

## Exports

| Import | Content |
|--------|---------|
| `checkr` | `CheckrConfig`, `StepConfig`, `PathLike`, `CheckId`, … |
| `@checkr/types/primitives` | Primitive type aliases |
| `@checkr/types/schema` | Zod `checkrConfigSchema` (runtime validation) |

See [Configuration guide](https://github.com/alaamer12/chekr/blob/main/docs/CONFIG.md).
