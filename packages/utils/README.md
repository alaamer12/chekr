# @checkr/utils

Utilities for checkr rule authors.

```js
import { walkFiles, buildIgnoredLines } from "@checkr/utils";

const ignored = buildIgnoredLines(lines, { marker: "@checkr-ignore" });
```

See [Rule authoring guide](https://github.com/alaamer12/chekr/blob/main/docs/RULE_AUTHORING.md).
