import { describe, expect, test } from "bun:test";
import { groupSkillsByRepo, parseSkillRef, resolveTemplateSource } from "./deploy-utils";

// --- Task 1: parseSkillRef ---

describe("parseSkillRef", () => {
	test("parses owner/repo@skillName", () => {
		const result = parseSkillRef("b-open-io/prompts@humanize");
		expect(result).toEqual({
			owner: "b-open-io",
			repo: "prompts",
			skillName: "humanize",
		});
	});

	test("parses skill name with hyphens", () => {
		const result = parseSkillRef("b-open-io/gemskills@optimize-images");
		expect(result).toEqual({
			owner: "b-open-io",
			repo: "gemskills",
			skillName: "optimize-images",
		});
	});

	test("returns null for invalid ref (no @)", () => {
		expect(parseSkillRef("b-open-io/prompts")).toBeNull();
	});

	test("returns null for invalid ref (no /)", () => {
		expect(parseSkillRef("prompts@humanize")).toBeNull();
	});

	test("returns null for empty string", () => {
		expect(parseSkillRef("")).toBeNull();
	});

	test("returns null for local path", () => {
		expect(parseSkillRef("/home/user/skills/humanize")).toBeNull();
	});
});

// --- Task 2: groupSkillsByRepo ---

describe("groupSkillsByRepo", () => {
	test("groups multiple skills from the same repo", () => {
		const installs = [
			{ ref: "b-open-io/prompts@humanize" },
			{ ref: "b-open-io/prompts@x-research" },
			{ ref: "b-open-io/gemskills@optimize-images" },
		];
		const groups = groupSkillsByRepo(installs);
		expect(groups.get("b-open-io/prompts")).toEqual(["humanize", "x-research"]);
		expect(groups.get("b-open-io/gemskills")).toEqual(["optimize-images"]);
		expect(groups.size).toBe(2);
	});

	test("skips local refs", () => {
		const installs = [
			{ ref: "/home/user/skills/humanize", local: true },
			{ ref: "b-open-io/prompts@x-research" },
		];
		const groups = groupSkillsByRepo(installs);
		expect(groups.size).toBe(1);
		expect(groups.get("b-open-io/prompts")).toEqual(["x-research"]);
	});

	test("skips unparseable refs", () => {
		const installs = [{ ref: "not-a-valid-ref" }];
		const groups = groupSkillsByRepo(installs);
		expect(groups.size).toBe(0);
	});

	test("returns empty map for empty input", () => {
		const groups = groupSkillsByRepo([]);
		expect(groups.size).toBe(0);
	});

	test("deduplicates skill names within same repo", () => {
		const installs = [{ ref: "b-open-io/prompts@humanize" }, { ref: "b-open-io/prompts@humanize" }];
		const groups = groupSkillsByRepo(installs);
		expect(groups.get("b-open-io/prompts")).toEqual(["humanize"]);
	});
});

// --- Task 3: resolveTemplateSource ---

describe("resolveTemplateSource", () => {
	const defaultRepo = "b-open-io/clawnet-bot";
	const defaultPath = "templates/gateway";

	test("returns defaults when botDef is null", () => {
		const result = resolveTemplateSource(null, defaultRepo, defaultPath);
		expect(result).toEqual({ repo: defaultRepo, path: defaultPath });
	});

	test("returns defaults when botDef has no template_repo", () => {
		const result = resolveTemplateSource({ template: "gateway" }, defaultRepo, defaultPath);
		expect(result).toEqual({ repo: defaultRepo, path: defaultPath });
	});

	test("uses template_repo and template_path from botDef", () => {
		const result = resolveTemplateSource(
			{
				template_repo: "someone/custom-bot",
				template_path: "templates/special",
			},
			defaultRepo,
			defaultPath,
		);
		expect(result).toEqual({
			repo: "someone/custom-bot",
			path: "templates/special",
		});
	});

	test("uses template_repo with inferred path from template name", () => {
		const result = resolveTemplateSource(
			{
				template: "moltbook",
				template_repo: "someone/custom-bot",
			},
			defaultRepo,
			defaultPath,
		);
		expect(result).toEqual({
			repo: "someone/custom-bot",
			path: "templates/moltbook",
		});
	});

	test("uses template_repo with default gateway path when no template specified", () => {
		const result = resolveTemplateSource(
			{ template_repo: "someone/custom-bot" },
			defaultRepo,
			defaultPath,
		);
		expect(result).toEqual({
			repo: "someone/custom-bot",
			path: "templates/gateway",
		});
	});
});
