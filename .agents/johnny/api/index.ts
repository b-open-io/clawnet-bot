export default {
	async fetch(request: Request): Promise<Response> {
		return Response.json({ name: "johnny", status: "ok", runtime: "bun" });
	},
};
