import type { Sandbox } from "@vercel/sandbox";

type SkillInstallRef = {
	ref: string;
	local?: boolean;
};

type BotDefinitionLike = {
	template?: string;
	template_repo?: string;
	template_path?: string;
};

type TemplateSource = {
	repo: string;
	path: string;
};

/**
 * Parse a skill reference in the format `owner/repo@skillName`.
 * Returns null for invalid, local-path, or malformed refs.
 */
export function parseSkillRef(
	ref: string,
): { owner: string; repo: string; skillName: string } | null {
	const match = ref.match(/^([^/@]+)\/([^/@]+)@(.+)$/);
	if (!match || !match[1] || !match[2] || !match[3]) return null;
	return { owner: match[1], repo: match[2], skillName: match[3] };
}

/**
 * Group skill install refs by their source repository.
 * Skips local refs and unparseable refs. Deduplicates skill names within each repo.
 */
export function groupSkillsByRepo(installs: SkillInstallRef[]): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const install of installs) {
		if (install.local) continue;
		const parsed = parseSkillRef(install.ref);
		if (!parsed) continue;
		const repoKey = `${parsed.owner}/${parsed.repo}`;
		const existing = groups.get(repoKey) ?? [];
		if (!existing.includes(parsed.skillName)) {
			existing.push(parsed.skillName);
		}
		groups.set(repoKey, existing);
	}
	return groups;
}

/**
 * Determine which template repo and path to use.
 * If the bot definition specifies a custom template_repo, use it.
 * Otherwise, fall back to the default gateway template.
 */
export function resolveTemplateSource(
	botDef: BotDefinitionLike | null,
	defaultRepo: string,
	defaultPath: string,
): TemplateSource {
	if (!botDef?.template_repo) {
		return { repo: defaultRepo, path: defaultPath };
	}
	return {
		repo: botDef.template_repo,
		path: botDef.template_path ?? `templates/${botDef.template ?? "gateway"}`,
	};
}

/**
 * Clone skill repos into a sandbox and copy individual skill directories
 * to the bot's skills/ directory. Groups by repo to minimize clones.
 *
 * Skills are installed to `${botDir}/skills/<skillName>/`.
 */
export async function installSkillsInSandbox(
	sandbox: Sandbox,
	installs: SkillInstallRef[],
	botDir: string,
	ghToken?: string,
): Promise<{ installed: string[]; skipped: string[] }> {
	const byRepo = groupSkillsByRepo(installs);
	const installed: string[] = [];
	const skipped: string[] = [];

	for (const [repoRef, skillNames] of byRepo) {
		const repoUrl = ghToken
			? `https://x-access-token:${ghToken}@github.com/${repoRef}.git`
			: `https://github.com/${repoRef}.git`;
		const tmpDir = `/tmp/skill-repo-${Date.now()}`;

		try {
			await sandbox.runCommand({
				cmd: "bash",
				args: ["-lc", `git clone --depth 1 ${repoUrl} ${tmpDir}`],
			});

			for (const name of skillNames) {
				const src = `${tmpDir}/skills/${name}`;
				const dest = `${botDir}/skills/${name}`;
				try {
					// Copy skill directory (fails if source doesn't exist)
					await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", `test -d ${src} && mkdir -p ${dest} && cp -r ${src}/. ${dest}/`],
					});
					// Make scripts executable if present
					await sandbox.runCommand({
						cmd: "bash",
						args: ["-lc", `[ -d ${dest}/scripts ] && chmod +x ${dest}/scripts/* 2>/dev/null; true`],
					});
					installed.push(name);
				} catch {
					skipped.push(`${repoRef}@${name}`);
				}
			}
		} catch {
			// Repo clone failed — skip all skills from this repo
			for (const name of skillNames) {
				skipped.push(`${repoRef}@${name}`);
			}
		} finally {
			try {
				await sandbox.runCommand({
					cmd: "bash",
					args: ["-lc", `rm -rf ${tmpDir}`],
				});
			} catch {
				// Ignore cleanup failures
			}
		}
	}

	return { installed, skipped };
}
