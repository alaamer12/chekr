# @checkr/utils

**Internal monorepo package** — not published to npm separately. Shipped inside `@checkr/cli` via `bundledDependencies`.

Rule authors import from `@checkr/utils` after installing `@checkr/cli`:

```js
import { walkFiles, buildIgnoredLines } from "@checkr/utils";
```
