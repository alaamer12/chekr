import { describe, test, expect } from "vitest";
import { checkUserAvatarBlock } from "../checks/check-user-avatar-block.js";

const APP = "apps/xi-editor/src/Foo.tsx";
const SHELL = "packages/shell/components/ActivityBar/index.tsx";
const ALLOWED = "capabilities/user-identity/UserAvatarBlock/children/AvatarButton.tsx";

describe("check-user-avatar-block", () => {
	test("flags Avatar import from @symphony/ui in apps", () => {
		const source = `import { Avatar, AvatarFallback } from '@symphony/ui'`;
		const v = checkUserAvatarBlock(source, APP);
		expect(v.length).toBeGreaterThanOrEqual(1);
		expect(v[0].message).toContain("UserAvatarBlock");
	});

	test("flags profile-avatar class in shell", () => {
		const source = `<Box className="profile-avatar" />`;
		const v = checkUserAvatarBlock(source, SHELL);
		expect(v.length).toBeGreaterThanOrEqual(1);
	});

	test("allows UserAvatarBlock capability internals", () => {
		const source = `import { Avatar, AvatarFallback } from '@symphony/ui'`;
		const v = checkUserAvatarBlock(source, ALLOWED);
		expect(v).toHaveLength(0);
	});

	test("allows packages/ui Avatar primitive", () => {
		const source = `export const Avatar = styled(BaseAvatar)`;
		const v = checkUserAvatarBlock(source, "packages/ui/media/Avatar.tsx");
		expect(v).toHaveLength(0);
	});
});
