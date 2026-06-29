# @checkr/cli

Terminal command for running project-defined checkr rules. Bundles the engine (`@checkr/core`) and rule-author utilities (`@checkr/utils`, `@checkr/helpers`).

```bash
npm install -D @checkr/cli
npx checkr init
npx checkr run
```

Programmatic API:

```js
import { run } from "@checkr/cli/engine";
```

See [checkr documentation](https://github.com/alaamer12/chekr#readme).
