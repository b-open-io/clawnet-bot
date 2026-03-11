import { app } from "../src/index.js";

export default {
	async fetch(request: Request): Promise<Response> {
		return app.fetch(request);
	},
};
