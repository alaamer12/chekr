import { describe, test, expect } from "vitest";
import { checkTypiaValidation, RULES } from "../check-typia-validation.js";

const CAP_FILE = "capabilities/demo/panels/Form.tsx";
const TOOLKIT_FILE = "packages/toolkit/checks/fixture.ts";
const PRIMITIVES_FILE = "packages/primitives/base/utils/foo.ts";

describe("checkTypiaValidation — instanceof", () => {
	test("flags instanceof on domain class", () => {
		const src = `if (payload instanceof WorkflowNode) { return payload; }`;
		const v = checkTypiaValidation(src, CAP_FILE);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("typia");
		expect(v[0].fix).toContain("validatePayload.ts");
	});

	test("allows err instanceof Error", () => {
		const src = `if (err instanceof Error) { console.error(err.message); }`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});

	test("allows e instanceof HTMLElement", () => {
		const src = `if (e instanceof HTMLElement) { e.focus(); }`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});
});

describe("checkTypiaValidation — typeof guards", () => {
	test("flags typeof x === string guard", () => {
		const src = `if (typeof value === "string") { return value; }`;
		const v = checkTypiaValidation(src, CAP_FILE);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("typia");
	});

	test("allows typeof window probe", () => {
		const src = `const hasWindow = typeof window !== "undefined";`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});

	test("allows typeof x === undefined", () => {
		const src = `if (typeof maybe === "undefined") { return; }`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});
});

describe("checkTypiaValidation — return as", () => {
	test("flags return x as Foo", () => {
		const src = `return data as Foo;`;
		const v = checkTypiaValidation(src, CAP_FILE);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("return");
		expect(v[0].fix).toContain("typia.assert");
	});

	test("allows return x as const", () => {
		const src = `return ["a", "b"] as const;`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});

	test("does not flag inner cast inside object return", () => {
		const src = `return { ok: true, data: result.data as StepPayload };`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});
});

describe("checkTypiaValidation — scope and ignore", () => {
	test("skips packages/toolkit/", () => {
		const src = `if (x instanceof Custom) {}`;
		expect(checkTypiaValidation(src, TOOLKIT_FILE)).toHaveLength(0);
	});

	test("skips packages/primitives/", () => {
		const src = `if (typeof x === "string") {}`;
		expect(checkTypiaValidation(src, PRIMITIVES_FILE)).toHaveLength(0);
	});

	test("skips story files", () => {
		const src = `return [] as T`;
		expect(checkTypiaValidation(src, "capabilities/demo/stories/Form.stories.tsx")).toHaveLength(0);
	});

	test("respects @symphony-ignore blocks", () => {
		const src = `// @symphony-ignore-start
if (typeof value === "string") {}
return x as Foo;
// @symphony-ignore-end`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});
});

describe("checkTypiaValidation — manual is* type predicates", () => {
	test("flags manual function isUser with input is User", () => {
		const src = `function isUser(input: unknown): input is User {
  return typeof input === "object" && input !== null && "id" in input;
}`;
		const v = checkTypiaValidation(src, CAP_FILE);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v.some(x => x.message.includes("isUser") || x.message.includes("type predicate"))).toBe(true);
		expect(v[0].fix).toContain("typia.createIs");
		expect(v[0].fix).toContain("@typia/unplugin");
	});

	test("allows typia.createIs<User>()", () => {
		const src = `const isUser = typia.createIs<User>();
if (isUser(data)) { console.log(data.id); }`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});

	test("allows typia.createIs split across lines", () => {
		const src = `const isUser =
  typia.createIs<User>();`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});

	test("allows isLoading boolean state without type predicate", () => {
		const src = `const [isLoading, setIsLoading] = useState(false);
const isOpen = false;`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});

	test("flags const isUser arrow with type predicate", () => {
		const src = `const isUser = (input: unknown): input is User =>
  typeof input === "object" && input !== null;`;
		const v = checkTypiaValidation(src, CAP_FILE);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].fix).toContain("createIs");
	});

	test("flags const isUser manual typeof/in guard without type predicate", () => {
		const src = `const isUser = (input: unknown) =>
  typeof input === "object" && input !== null && "id" in input;`;
		const v = checkTypiaValidation(src, CAP_FILE);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("isUser");
		expect(v[0].fix).toContain("typia.createIs<User>()");
		expect(v[0].fix).toContain("createEquals");
		expect(v[0].fix).toContain("ts-patch");
	});

	test("allows typia.createValidate and typia.is", () => {
		const src = `const validateUser = typia.createValidate<User>();
if (typia.is<User>(data)) { console.log(data); }
const assertUser = typia.createAssert<User>();
typia.assert<User>(data);`;
		expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
	});

	test("fix hint documents transformer and extra-property behavior", () => {
		const src = `function isUser(input: unknown): input is User { return false; }`;
		const v = checkTypiaValidation(src, CAP_FILE);
		expect(v[0].fix).toContain("Prefer `const isUser = typia.createIs<User>()`");
		expect(v[0].fix).toContain("extra properties");
		expect(v[0].fix).toContain("@typia/unplugin");
		expect(v[0].fix).toContain("ts-patch");
	});
});

describe("RULES toggles", () => {
	test("banTypeofGuards off skips typeof violations", () => {
		const prev = RULES.banTypeofGuards.enabled;
		RULES.banTypeofGuards.enabled = false;
		try {
			const src = `if (typeof value === "string") {}`;
			expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
		} finally {
			RULES.banTypeofGuards.enabled = prev;
		}
	});

	test("banManualTypePredicates off skips manual is* violations", () => {
		const prev = RULES.banManualTypePredicates.enabled;
		RULES.banManualTypePredicates.enabled = false;
		try {
			const src = `function isUser(input: unknown): input is User { return false; }`;
			expect(checkTypiaValidation(src, CAP_FILE)).toHaveLength(0);
		} finally {
			RULES.banManualTypePredicates.enabled = prev;
		}
	});
});
