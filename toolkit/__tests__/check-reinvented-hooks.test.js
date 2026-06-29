import { describe, test, expect } from "vitest";
import { checkReinventedHooks } from "../checks/check-reinvented-hooks.js";

const FEAT = "capabilities/settings/NumberSetting.tsx";
const FEAT_TS = "capabilities/settings/utils/helpers.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Pattern A: Behavioral usePrevious
// useRef(x) + ref.current = x INSIDE useEffect
// ═══════════════════════════════════════════════════════════════════════════

const BEHAVIORAL_PREV_BASIC = `
const ref = useRef(count)
useEffect(() => {
  if (count !== ref.current) {
    doSomething(ref.current, count)
  }
  ref.current = count
}, [count])
`;

const BEHAVIORAL_PREV_NAMED_DIFFERENTLY = `
const valueTracker = useRef(score)
useEffect(() => {
  valueTracker.current = score
}, [score])
`;

const BEHAVIORAL_PREV_NOT_MATCHING = `
const ref = useRef(count)
useEffect(() => {
  ref.current = somethingElse
}, [somethingElse])
`;

describe("Pattern A: Behavioral usePrevious", () => {
	test("detects useRef(x) + ref.current = x inside useEffect", () => {
		const v = checkReinventedHooks(BEHAVIORAL_PREV_BASIC, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("usePrevious");
		expect(v[0].message).toContain("useStableValue");
	});

	test("detects regardless of variable naming", () => {
		const v = checkReinventedHooks(BEHAVIORAL_PREV_NAMED_DIFFERENTLY, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("useStableValue");
	});

	test("ignores when init and effect assignment are different values", () => {
		const v = checkReinventedHooks(BEHAVIORAL_PREV_NOT_MATCHING, FEAT);
		const prevViolations = v.filter(x => x.message.includes("usePrevious"));
		expect(prevViolations).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Pattern A2: Naming heuristic usePrevious
// ═══════════════════════════════════════════════════════════════════════════

const NAMING_PREV_REF = `const prevValueRef = useRef(value)`;
const NAMING_PREV_TYPED = `const previousCountRef = useRef<number>(count)`;
const NAMING_PRIOR = `const priorIndexRef = useRef<number>(0)`;
const NAMING_NO_SUFFIX = `const prevValue = useRef(value)`;
const NAMING_DOM_REF = `const prevElementRef = useRef<HTMLDivElement>(null)`;
const NORMAL_REF = `const inputRef = useRef<HTMLInputElement>(null)`;
const CLEAN_STABLE = `const prevValue = useStableValue(value)`;

const SUPPRESSED_PREV = `// ---------- @symphony-ignore-start
const prevValueRef = useRef(value)
// ---------- @symphony-ignore-end`;

describe("Pattern A2: Naming heuristic usePrevious", () => {
	test("detects useRef named prevValueRef", () => {
		const v = checkReinventedHooks(NAMING_PREV_REF, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
		const naming = v.find(x => x.message.includes("prev*"));
		expect(naming).toBeTruthy();
	});

	test("detects useRef named previousCountRef with generics", () => {
		const v = checkReinventedHooks(NAMING_PREV_TYPED, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
	});

	test("detects useRef named priorIndexRef", () => {
		const v = checkReinventedHooks(NAMING_PRIOR, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
	});

	test("detects useRef named prevValue (no Ref suffix)", () => {
		const v = checkReinventedHooks(NAMING_NO_SUFFIX, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
	});

	test("ignores DOM refs with prev prefix (false positive guard)", () => {
		const v = checkReinventedHooks(NAMING_DOM_REF, FEAT);
		expect(v).toHaveLength(0);
	});

	test("ignores normal refs without prev prefix", () => {
		const v = checkReinventedHooks(NORMAL_REF, FEAT);
		expect(v).toHaveLength(0);
	});

	test("passes clean useStableValue usage", () => {
		const v = checkReinventedHooks(CLEAN_STABLE, FEAT);
		expect(v).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const v = checkReinventedHooks(SUPPRESSED_PREV, FEAT);
		expect(v).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Pattern B: Behavioral useStableCallback
// useRef(fn) + ref.current = fn OUTSIDE useEffect
// ═══════════════════════════════════════════════════════════════════════════

const STABLE_CB_BASIC = `const callbackRef = useRef(handler)
callbackRef.current = handler;`;

const STABLE_CB_TYPED = `const fnRef = useRef<(v: string) => void>(onChange)
fnRef.current = onChange;`;

const STABLE_CB_FULL_PATTERN = `function MyComponent({ onSave }) {
  const saveRef = useRef(onSave)
  saveRef.current = onSave;

  const stableSave = useCallback((...args) => {
    return saveRef.current(...args)
  }, [])
}`;

const STABLE_CB_INSIDE_EFFECT = `const cbRef = useRef(handler)
useEffect(() => {
  cbRef.current = handler
}, [handler])`;

const STABLE_CB_DIFF_VALUES = `const callbackRef = useRef(handlerA)
callbackRef.current = handlerB;`;

const STABLE_CB_NULL_INIT = `const callbackRef = useRef(null)
callbackRef.current = handler;`;

const CLEAN_STABLE_CB = `const stableHandler = useStableCallback(handler)`;

describe("Pattern B: Behavioral useStableCallback", () => {
	test("detects useRef(fn) + .current = fn outside useEffect", () => {
		const v = checkReinventedHooks(STABLE_CB_BASIC, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
		const stab = v.find(x => x.message.includes("useStableCallback"));
		expect(stab).toBeTruthy();
	});

	test("detects with complex generic types", () => {
		const v = checkReinventedHooks(STABLE_CB_TYPED, FEAT);
		const stab = v.find(x => x.message.includes("useStableCallback"));
		expect(stab).toBeTruthy();
	});

	test("detects full useStableCallback reimplementation", () => {
		const v = checkReinventedHooks(STABLE_CB_FULL_PATTERN, FEAT);
		const stab = v.find(x => x.message.includes("useStableCallback"));
		expect(stab).toBeTruthy();
	});

	test("does NOT flag .current = fn inside useEffect (that is Pattern A)", () => {
		const v = checkReinventedHooks(STABLE_CB_INSIDE_EFFECT, FEAT);
		const stab = v.filter(x => x.message.includes("useStableCallback"));
		expect(stab).toHaveLength(0);
	});

	test("ignores when init and reassign values differ", () => {
		const v = checkReinventedHooks(STABLE_CB_DIFF_VALUES, FEAT);
		expect(v).toHaveLength(0);
	});

	test("ignores useRef(null) + .current reassignment", () => {
		const v = checkReinventedHooks(STABLE_CB_NULL_INIT, FEAT);
		const stab = v.filter(x => x.message.includes("useStableCallback"));
		expect(stab).toHaveLength(0);
	});

	test("passes clean useStableCallback usage", () => {
		const v = checkReinventedHooks(CLEAN_STABLE_CB, FEAT);
		expect(v).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Pattern C: Manual useUpdateEffect
// useRef(true/false) named isFirst*, isMounted*, etc.
// ═══════════════════════════════════════════════════════════════════════════

const FIRST_MOUNT_BASIC = `const isFirstRender = useRef(true)`;
const FIRST_MOUNT_MOUNTED = `const isMountedRef = useRef(false)`;
const FIRST_MOUNT_SKIP = `const skipFirstRun = useRef(true)`;
const FIRST_MOUNT_INITIAL = `const initialRenderDone = useRef(false)`;

const FIRST_MOUNT_FULL = `const isFirstMount = useRef(true)
useEffect(() => {
  if (isFirstMount.current) {
    isFirstMount.current = false
    return
  }
  doSomethingOnUpdate()
}, [dep])`;

const NOT_FIRST_MOUNT = `const isReady = useRef(false)`;

describe("Pattern C: Manual lifecycle guards", () => {
	test("detects isFirstRender ref", () => {
		const v = checkReinventedHooks(FIRST_MOUNT_BASIC, FEAT);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("first-mount guard");
		expect(v[0].fix).toContain("useFirstMountState");
	});

	test("detects isMountedRef", () => {
		const v = checkReinventedHooks(FIRST_MOUNT_MOUNTED, FEAT);
		const c = v.filter(x => x.message.includes("mount-status"));
		expect(c.length).toBeGreaterThanOrEqual(1);
		expect(c[0].fix).toContain("useIsMounted");
	});

	test("detects skipFirstRun", () => {
		const v = checkReinventedHooks(FIRST_MOUNT_SKIP, FEAT);
		const c = v.filter(x => x.message.includes("first-mount guard"));
		expect(c.length).toBeGreaterThanOrEqual(1);
	});

	test("detects initialRenderDone", () => {
		const v = checkReinventedHooks(FIRST_MOUNT_INITIAL, FEAT);
		const c = v.filter(x => x.message.includes("first-mount guard"));
		expect(c.length).toBeGreaterThanOrEqual(1);
	});

	test("detects full first-mount guard pattern", () => {
		const v = checkReinventedHooks(FIRST_MOUNT_FULL, FEAT);
		const c = v.filter(x => x.message.includes("first-mount guard"));
		expect(c.length).toBeGreaterThanOrEqual(1);
	});

	test("ignores unrelated boolean refs", () => {
		const v = checkReinventedHooks(NOT_FIRST_MOUNT, FEAT);
		const c = v.filter(x => x.message.includes("guard") || x.message.includes("status"));
		expect(c).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Pattern D: Manual debounce
// setTimeout + clearTimeout inside same useEffect
// ═══════════════════════════════════════════════════════════════════════════

const MANUAL_DEBOUNCE = `useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedValue(value)
  }, 300)
  return () => clearTimeout(timer)
}, [value])`;

const TIMEOUT_WITHOUT_CLEAR = `useEffect(() => {
  setTimeout(() => doThing(), 100)
}, [dep])`;

const CLEAR_WITHOUT_TIMEOUT = `useEffect(() => {
  return () => clearTimeout(someTimer)
}, [])`;

const CLEAN_DEBOUNCE = `const { value } = useDebounceInput(query, { delay: 300 })`;

describe("Pattern D: Manual debounce", () => {
	test("detects setTimeout + clearTimeout in same useEffect", () => {
		const v = checkReinventedHooks(MANUAL_DEBOUNCE, FEAT);
		const d = v.filter(x => x.message.includes("debounce"));
		expect(d.length).toBeGreaterThanOrEqual(1);
	});

	test("ignores setTimeout without clearTimeout (not a debounce)", () => {
		const v = checkReinventedHooks(TIMEOUT_WITHOUT_CLEAR, FEAT);
		const d = v.filter(x => x.message.includes("debounce"));
		expect(d).toHaveLength(0);
	});

	test("ignores clearTimeout without setTimeout", () => {
		const v = checkReinventedHooks(CLEAR_WITHOUT_TIMEOUT, FEAT);
		const d = v.filter(x => x.message.includes("debounce"));
		expect(d).toHaveLength(0);
	});

	test("passes clean useDebounceInput", () => {
		const v = checkReinventedHooks(CLEAN_DEBOUNCE, FEAT);
		expect(v).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Pattern E: Manual useToggle
// useState(bool) + setter that negates
// ═══════════════════════════════════════════════════════════════════════════

const TOGGLE_ARROW = `const [open, setOpen] = useState(false)
const toggle = () => setOpen(prev => !prev)`;

const TOGGLE_DIRECT = `const [visible, setVisible] = useState(true)
function handleToggle() { setVisible(!visible) }`;

const TOGGLE_PAREN = `const [active, setActive] = useState(false)
const flip = () => setActive((v) => !v)`;

const NOT_TOGGLE = `const [count, setCount] = useState(0)
setCount(prev => prev + 1)`;

const BOOL_STATE_NO_TOGGLE = `const [loading, setLoading] = useState(false)
setLoading(true)`;

const CLEAN_TOGGLE = `const { value: open, toggle } = useToggleState()`;

describe("Pattern E: Manual useToggle", () => {
	test("detects useState(false) + setX(prev => !prev)", () => {
		const v = checkReinventedHooks(TOGGLE_ARROW, FEAT);
		const t = v.filter(x => x.message.includes("useToggle"));
		expect(t.length).toBeGreaterThanOrEqual(1);
	});

	test("detects useState(true) + setX(!stateName)", () => {
		const v = checkReinventedHooks(TOGGLE_DIRECT, FEAT);
		const t = v.filter(x => x.message.includes("useToggle"));
		expect(t.length).toBeGreaterThanOrEqual(1);
	});

	test("detects useState(false) + setX((v) => !v)", () => {
		const v = checkReinventedHooks(TOGGLE_PAREN, FEAT);
		const t = v.filter(x => x.message.includes("useToggle"));
		expect(t.length).toBeGreaterThanOrEqual(1);
	});

	test("ignores non-boolean useState", () => {
		const v = checkReinventedHooks(NOT_TOGGLE, FEAT);
		const t = v.filter(x => x.message.includes("useToggle"));
		expect(t).toHaveLength(0);
	});

	test("ignores boolean useState without negation pattern", () => {
		const v = checkReinventedHooks(BOOL_STATE_NO_TOGGLE, FEAT);
		const t = v.filter(x => x.message.includes("useToggle"));
		expect(t).toHaveLength(0);
	});

	test("passes clean useToggleState", () => {
		const v = checkReinventedHooks(CLEAN_TOGGLE, FEAT);
		expect(v).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Pattern F: Raw timers
// ═══════════════════════════════════════════════════════════════════════════

const RAW_TIMEOUT = `setTimeout(() => doThing(), 300)`;
const RAW_INTERVAL = `setInterval(() => poll(), 1000)`;
const CLEAN_TIMEOUT = `useTimeoutEffect(() => doThing(), 300)`;

const SUPPRESSED_TIMER = `// ---------- @symphony-ignore-start
setTimeout(() => doThing(), 300)
// ---------- @symphony-ignore-end`;

describe("Pattern F: Raw timers", () => {
	test("detects setTimeout in .tsx files", () => {
		const v = checkReinventedHooks(RAW_TIMEOUT, FEAT);
		const t = v.filter(x => x.message.includes("setTimeout"));
		expect(t.length).toBeGreaterThanOrEqual(1);
	});

	test("detects setInterval in .tsx files", () => {
		const v = checkReinventedHooks(RAW_INTERVAL, FEAT);
		const t = v.filter(x => x.message.includes("setInterval"));
		expect(t.length).toBeGreaterThanOrEqual(1);
	});

	test("ignores timers in .ts files (utilities)", () => {
		const v = checkReinventedHooks(RAW_TIMEOUT, FEAT_TS);
		expect(v).toHaveLength(0);
	});

	test("ignores timers in blockiya files (handled by step 10)", () => {
		const v = checkReinventedHooks(RAW_TIMEOUT, "capabilities/settings/blockiyas/NumberBlock.tsx");
		expect(v).toHaveLength(0);
	});

	test("passes clean hook-based timer", () => {
		const v = checkReinventedHooks(CLEAN_TIMEOUT, FEAT);
		expect(v).toHaveLength(0);
	});

	test("respects @symphony-ignore block", () => {
		const v = checkReinventedHooks(SUPPRESSED_TIMER, FEAT);
		expect(v).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Path exclusions
// ═══════════════════════════════════════════════════════════════════════════

describe("Path exclusions", () => {
	test("allows in primitives layer", () => {
		const v = checkReinventedHooks(BEHAVIORAL_PREV_BASIC, "packages/shared/hooks/primitives/index.ts");
		expect(v).toHaveLength(0);
	});

	test("allows in composites layer", () => {
		const v = checkReinventedHooks(BEHAVIORAL_PREV_BASIC, "packages/shared/hooks/composites/useStableValue.ts");
		expect(v).toHaveLength(0);
	});

	test("allows in blockiya-core hooks", () => {
		const v = checkReinventedHooks(STABLE_CB_BASIC, "packages/shared/blockiya-core/hooks/useStableCallback.ts");
		expect(v).toHaveLength(0);
	});

	test("allows in test files", () => {
		const v = checkReinventedHooks(BEHAVIORAL_PREV_BASIC, "capabilities/settings/__tests__/NumberSetting.test.tsx");
		expect(v).toHaveLength(0);
	});

	test("allows in story files", () => {
		const v = checkReinventedHooks(BEHAVIORAL_PREV_BASIC, "capabilities/settings/NumberSetting.stories.tsx");
		expect(v).toHaveLength(0);
	});

	test("allows in adapters", () => {
		const v = checkReinventedHooks(NAMING_PREV_REF, "packages/adapters/tauri/useInvoke.ts");
		expect(v).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-pattern: No double-reporting
// ═══════════════════════════════════════════════════════════════════════════

describe("Deduplication", () => {
	test("behavioral Pattern A does not double-report with naming A2", () => {
		// prevRef + useEffect update — should report behavioral A, not also naming A2
		const source = `const prevCount = useRef(count)
useEffect(() => {
  prevCount.current = count
}, [count])`;
		const v = checkReinventedHooks(source, FEAT);
		// Should have exactly 1 usePrevious violation, not 2
		const prevViolations = v.filter(x => x.message.includes("usePrevious") || x.message.includes("previous-value"));
		expect(prevViolations).toHaveLength(1);
	});
});
