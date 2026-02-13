/**
 * One-time OAuth 2.0 PKCE authorization setup.
 *
 * Run: bun run setup
 *
 * Opens your browser to authorize the bot's X account, then prints
 * the X_REFRESH_TOKEN to set in Vercel environment variables.
 */

import { generateCodeChallenge, generateCodeVerifier } from "@xdevplatform/xdk";

const CLIENT_ID = process.env.X_CLIENT_SECRET_ID;
const CLIENT_SECRET = process.env.X_CLIENT_SECRET;
const CALLBACK_PORT = 3333;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

const SCOPES = [
	"tweet.read",
	"tweet.write",
	"users.read",
	"like.read",
	"like.write",
	"offline.access",
].join(" ");

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error("Missing required environment variables:");
	console.error("  X_CLIENT_SECRET_ID - your OAuth 2.0 Client ID");
	console.error("  X_CLIENT_SECRET    - your OAuth 2.0 Client Secret");
	console.error("");
	console.error("Set them in .env.local or export them before running setup.");
	process.exit(1);
}

const codeVerifier = generateCodeVerifier();
const codeChallenge = await generateCodeChallenge(codeVerifier);
const state = crypto.randomUUID();

const authUrl = new URL("https://x.com/i/oauth2/authorize");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("state", state);
authUrl.searchParams.set("code_challenge", codeChallenge);
authUrl.searchParams.set("code_challenge_method", "S256");

console.log("");
console.log("=== X Bot OAuth 2.0 Setup ===");
console.log("");
console.log("1. A browser window will open.");
console.log("2. Log in as the BOT account (not your personal account).");
console.log("3. Click 'Authorize app'.");
console.log("4. The refresh token will be printed here.");
console.log("");

// Open browser
const openCommand =
	process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

Bun.spawn([openCommand, authUrl.toString()]);

// Start callback server
const server = Bun.serve({
	port: CALLBACK_PORT,
	async fetch(req) {
		const url = new URL(req.url);

		if (url.pathname !== "/callback") {
			return new Response("Not found", { status: 404 });
		}

		const code = url.searchParams.get("code");
		const returnedState = url.searchParams.get("state");
		const error = url.searchParams.get("error");

		if (error) {
			console.error(`Authorization error: ${error}`);
			server.stop();
			process.exit(1);
		}

		if (!code || returnedState !== state) {
			console.error("Invalid callback: missing code or state mismatch");
			server.stop();
			process.exit(1);
		}

		// Exchange authorization code for tokens
		try {
			const params = new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: REDIRECT_URI,
				client_id: CLIENT_ID as string,
				code_verifier: codeVerifier,
			});

			const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

			const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Basic ${credentials}`,
				},
				body: params.toString(),
			});

			if (!tokenResponse.ok) {
				const errorText = await tokenResponse.text();
				console.error(`Token exchange failed: ${tokenResponse.status}`);
				console.error(errorText);
				server.stop();
				process.exit(1);
			}

			const data = (await tokenResponse.json()) as {
				access_token: string;
				refresh_token: string;
				expires_in: number;
				scope: string;
			};

			console.log("");
			console.log("=== Authorization Successful ===");
			console.log("");
			console.log("Set this in your Vercel environment variables:");
			console.log("");
			console.log(`  X_REFRESH_TOKEN=${data.refresh_token}`);
			console.log("");
			console.log(`Scopes granted: ${data.scope}`);
			console.log(`Access token expires in: ${Math.round(data.expires_in / 60)} minutes`);
			console.log("Refresh token expires in: ~6 months (with offline.access scope)");
			console.log("");
			console.log("The bot will auto-refresh access tokens using the refresh token.");
			console.log("");

			server.stop();
			process.exit(0);
		} catch (err) {
			console.error("Token exchange error:", err);
			server.stop();
			process.exit(1);
		}

		return new Response(
			"<html><body><h1>Authorization complete!</h1><p>You can close this window and return to the terminal.</p></body></html>",
			{ headers: { "Content-Type": "text/html" } },
		);
	},
});

console.log(`Waiting for authorization callback on port ${CALLBACK_PORT}...`);
console.log(`Auth URL: ${authUrl.toString()}`);
