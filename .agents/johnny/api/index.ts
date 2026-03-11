import { app } from "../src/index.ts";

export default {
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request);
	},
};
