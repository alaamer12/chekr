import { describe, test, expect } from "vitest";
import { checkPatternsDropdown } from "../checks/check-patterns-dropdown.js";

const CHAT_HEADER = "capabilities/ai-orchestration/panels/ai-chat/blockiyas/AIChatPanelHeader/index.tsx";

describe("checkPatternsDropdown", () => {
	test("flags custom ConversationItem styled.button", () => {
		const src = `
import { Dropdown } from '@symphony/patterns'
const ConversationItem = styled.button({ width: '100%' })
`;
		const v = checkPatternsDropdown(src, CHAT_HEADER);
		expect(v.length).toBeGreaterThan(0);
	});

	test("allows DropdownItem from patterns", () => {
		const src = `
import { Dropdown, DropdownItem, DropdownLabel } from '@symphony/patterns'
<DropdownItem onSelect={() => {}}>Item</DropdownItem>
`;
		const v = checkPatternsDropdown(src, CHAT_HEADER);
		expect(v).toHaveLength(0);
	});
});
