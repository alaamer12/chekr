import { describe, test, expect } from "vitest";
import { checkIconLibrary } from "../checks/check-icon-library.js";

const FILE = "capabilities/x/blockiyas/XBlock/index.tsx";

const SUPPRESSED = src => `// ---------- @symphony-ignore-start
${src}
// ---------- @symphony-ignore-end`;

describe("checkIconLibrary", () => {
	// ── Forbidden imports ──────────────────────────────────────────────────────

	test("detects lucide-react import", () => {
		const violations = checkIconLibrary(`import { Home } from 'lucide-react'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("lucide-react");
		expect(violations[0].fix).toContain("@symphony/ui");
	});

	test("detects @heroicons import", () => {
		const violations = checkIconLibrary(`import { HomeIcon } from '@heroicons/react/24/solid'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@heroicons");
	});

	test("detects phosphor-react import", () => {
		const violations = checkIconLibrary(`import { House } from 'phosphor-react'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("phosphor-react");
	});

	test("detects @phosphor-icons import", () => {
		const violations = checkIconLibrary(`import { House } from '@phosphor-icons/react'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@phosphor-icons");
	});

	test("detects @tabler/icons-react import", () => {
		const violations = checkIconLibrary(`import { IconHome } from '@tabler/icons-react'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@tabler/icons-react");
	});

	test("detects react-icons import", () => {
		const violations = checkIconLibrary(`import { FaHome } from 'react-icons/fa'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("react-icons");
	});

	test("detects @radix-ui/react-icons import", () => {
		const violations = checkIconLibrary(`import { HomeIcon } from '@radix-ui/react-icons'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@radix-ui/react-icons");
	});

	test("detects @mui/icons-material import", () => {
		const violations = checkIconLibrary(`import HomeIcon from '@mui/icons-material/Home'`, FILE);
		expect(violations).toHaveLength(0);
	});

	test("detects @ant-design/icons import", () => {
		const violations = checkIconLibrary(`import { HomeOutlined } from '@ant-design/icons'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@ant-design/icons");
	});

	test("detects bootstrap-icons import", () => {
		const violations = checkIconLibrary(`import { House } from 'react-bootstrap-icons'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("react-bootstrap-icons");
	});

	test("detects @primer/octicons-react import", () => {
		const violations = checkIconLibrary(`import { HomeIcon } from '@primer/octicons-react'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@primer/octicons-react");
	});

	test("allows Icon from @symphony/ui", () => {
		const violations = checkIconLibrary(`import { Icon } from '@symphony/ui'`, FILE);
		expect(violations).toHaveLength(0);
	});

	test("allows @mui/material (SvgIcon base)", () => {
		const violations = checkIconLibrary(`import type { SvgIconProps } from '@mui/material/SvgIcon'`, FILE);
		expect(violations).toHaveLength(0);
	});

	// ── Fix message ────────────────────────────────────────────────────────────

	test("provides fix pointing to @symphony/ui and MUI icons", () => {
		const violations = checkIconLibrary(`import { Home } from 'lucide-react'`, FILE);
		expect(violations[0].fix).toContain("@symphony/ui");
		expect(violations[0].fix).toContain("@mui/icons-material");
	});

	// ── Suppression ────────────────────────────────────────────────────────────

	test("respects @symphony-ignore block", () => {
		const violations = checkIconLibrary(SUPPRESSED(`import { Home } from 'lucide-react'`), FILE);
		expect(violations).toHaveLength(0);
	});

	// ── Multiple violations ────────────────────────────────────────────────────

	test("reports multiple forbidden libraries in one file", () => {
		const src = [
			`import { Home } from 'lucide-react'`,
			`import { HomeIcon } from '@heroicons/react/24/solid'`,
			`import HomeIcon from '@mui/icons-material/Home'`,
		].join("\n");
		const violations = checkIconLibrary(src, FILE);
		expect(violations).toHaveLength(2);
	});

	test("detects @fortawesome import", () => {
		const violations = checkIconLibrary(`import { faHome } from '@fortawesome/free-solid-svg-icons'`, FILE);
		expect(violations).toHaveLength(1);
		expect(violations[0].message).toContain("@fortawesome");
	});
});
