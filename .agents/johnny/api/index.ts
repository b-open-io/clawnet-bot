import type { VercelRequest, VercelResponse } from "@vercel/node";
import { app } from "../src/index.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const url = new URL(req.url ?? "/", `https://${req.headers.host ?? "localhost"}`);

	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (typeof value === "string") headers.set(key, value);
		else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
	}

	const method = req.method ?? "GET";
	const hasBody = method !== "GET" && method !== "HEAD";

	const request = new Request(url.toString(), {
		method,
		headers,
		body: hasBody ? JSON.stringify(req.body) : undefined,
	});

	const response = await app.fetch(request);

	res.status(response.status);
	response.headers.forEach((value, key) => {
		res.setHeader(key, value);
	});

	if (response.body) {
		const reader = response.body.getReader();
		const pump = async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				res.write(value);
			}
			res.end();
		};
		await pump();
	} else {
		const text = await response.text();
		res.end(text);
	}
}
