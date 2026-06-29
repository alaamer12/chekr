# @chekr/cli

Terminal command for running project-defined chekr rules. Engine, helpers, and utilities live in `src/lib/` as plain modules — one installable package.

```bash
npm install -D @chekr/cli
```

Programmatic API:

```js
import { run } from "@chekr/cli/engine";
```

Rule-author utilities:

```js
import { walkFiles, buildIgnoredLines, createMeshOptimizer } from "@chekr/cli/utils";
```

For O(N²) repo checks, enable `optimize: true` on the step and use mesh in `repoFn`:

```js
export function checkDuplicationRepo(_scanPath, _files, onProgress, context) {
  const mesh = createMeshOptimizer(context);
  mesh.announce();

  const violations = [];
  for (const pair of allPairs) {
    if (mesh.skipPair(pair.a.file, pair.b.file)) continue;
    // compare...
  }

  return mesh.complete(violations);
}
```

If `optimize: true` but you skip `createMeshOptimizer()`, chekr warns that pair skipping is disabled.
