import { describe, test, expect } from "vitest";
import { checkStyledBacktick } from "../checks/check-styled-backtick.js";

const APP = "capabilities/x/blockiyas/XBlock/index.tsx";

describe("checkStyledBacktick", () => {
	test("flags styled(Box) backtick", () => {
		const v = checkStyledBacktick("const X = styled(Box)`padding: 4;`", APP);
		expect(v.length).toBeGreaterThan(0);
	});

	test("allows styled(Box) object form", () => {
		const v = checkStyledBacktick("const X = styled(Box)({ padding: 4 })", APP);
		expect(v).toHaveLength(0);
	});
});
