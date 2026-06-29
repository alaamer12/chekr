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
import { walkFiles, buildIgnoredLines } from "@chekr/cli/utils";
```
