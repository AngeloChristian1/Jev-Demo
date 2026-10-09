// Starts ngrok on the fixed address in PUBLIC_URL, so the ClickUp webhook never goes stale.
// Run: npm run tunnel

import { spawn } from "node:child_process";
import { config } from "../src/config.ts";

const publicUrl = process.env.PUBLIC_URL?.trim();
if (!publicUrl) {
  console.error("Set PUBLIC_URL in .env to your ngrok dev domain (ngrok dashboard → Domains), e.g. https://your-name.ngrok-free.dev");
  process.exit(1);
}

const ngrok = spawn("ngrok", ["http", String(config.port), `--url=${publicUrl}`], { stdio: "inherit" });
ngrok.on("error", () => {
  console.error("Couldn't start ngrok. Install it with: brew install ngrok");
  process.exit(1);
});
ngrok.on("exit", (code) => process.exit(code ?? 0));
