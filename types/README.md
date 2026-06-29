# @chekr/types

TypeScript definitions for `chekr.config.js` and rule contracts.

## Install

```bash
npm install -D @chekr/types
```

## Usage

```js
/** @type {import('chekr').ChekrConfig} */
export default {
  checksDir: "./.chekr/checks",
  gitignore: ".gitignore",
};
```

## Exports

| Import | Content |
|--------|---------|
| `chekr` | `ChekrConfig`, `StepConfig`, `PathLike`, `CheckId`, … |
| `@chekr/types/primitives` | Primitive type aliases |
| `@chekr/types/schema` | Zod `chekrConfigSchema` (runtime validation) |

See [Configuration guide](https://github.com/alaamer12/chekr/blob/main/docs/CONFIG.md).
