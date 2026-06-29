# @chekr/utils

**Internal monorepo package** — not published to npm separately. Shipped inside `@chekr/cli` via `bundledDependencies`.

Rule authors import from `@chekr/utils` after installing `@chekr/cli`:

```js
import { walkFiles, buildIgnoredLines } from "@chekr/utils";
```
