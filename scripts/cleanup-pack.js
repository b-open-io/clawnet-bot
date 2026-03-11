import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const templatesDir = new URL("../templates/", import.meta.url);

for (const entry of readdirSync(templatesDir, { withFileTypes: true })) {
	if (!entry.isDirectory()) {
		continue;
	}

	const source = join(templatesDir.pathname, entry.name, ".gitignore");
	const target = join(templatesDir.pathname, entry.name, "gitignore");

	if (!existsSync(source) || !existsSync(target)) {
		continue;
	}

	if (readFileSync(source, "utf8") === readFileSync(target, "utf8")) {
		rmSync(target);
	}
}
