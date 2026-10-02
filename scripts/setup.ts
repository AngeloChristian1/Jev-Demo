// One-time setup:
//   1. creates our tags in the ClickUp space
//   2. creates our labels in the GitHub repo(s)
//   3. registers the ClickUp webhook (pass --skip-webhook to skip) and prints its secret
//
// Run: npm run setup

import * as clickup from "../src/clickup.ts";
import { AREAS, config, repoForArea } from "../src/config.ts";
import { TAGS } from "../src/decide.ts";
import * as github from "../src/github.ts";

const skipWebhook = process.argv.includes("--skip-webhook");
const { listId } = config.clickup;
if (!config.clickup.token || !listId) {
  console.error("Set CLICKUP_TOKEN and CLICKUP_LIST_ID in .env first.");
  process.exit(1);
}

// 1. ClickUp tags
const list = await clickup.getList(listId);
console.log(`ClickUp list: ${list.name} (space ${list.space.id})`);
const tagColours: Record<string, string> = {
  [TAGS.bug]: "#e5484d",
  [TAGS.feature_request]: "#3e63dd",
  [TAGS.question]: "#12a594",
  [TAGS.needs_review]: "#f76b15",
};
for (const [name, colour] of Object.entries(tagColours)) {
  try {
    await clickup.createSpaceTag(list.space.id, name, colour);
    console.log(`  ✓ tag ${name}`);
  } catch (err) {
    console.log(`  · tag ${name}: ${(err as Error).message.includes("exists") ? "already exists" : (err as Error).message}`);
  }
}

// 2. GitHub labels
if (config.github.token) {
  const repos = new Set(Object.keys(AREAS).map(repoForArea).concat(config.github.defaultRepo).filter(Boolean));
  const labels: Record<string, string> = {
    bug: "d73a4a",
    "from-clickup": "7057ff",
    "priority:urgent": "b60205",
    "priority:high": "d93f0b",
    "priority:normal": "fbca04",
    "priority:low": "c2e0c6",
    "area:unknown": "cccccc",
    ...Object.fromEntries(Object.keys(AREAS).map((a) => [`area:${a}`, "1d76db"])),
  };
  for (const repo of repos) {
    console.log(`GitHub repo: ${repo}`);
    try {
      for (const [name, colour] of Object.entries(labels)) {
        console.log(`  ${(await github.ensureLabel(repo, name, colour)) === "created" ? "✓" : "·"} label ${name}`);
      }
    } catch (err) {
      // Don't let a GitHub token problem block the webhook step; labels can be retried later.
      console.error(`  ✗ ${(err as Error).message}`);
      if ((err as Error).message.includes("→ 403"))
        console.error(`    The token needs "Issues: Read and write" on ${repo}. Fix it, then run: npm run setup -- --skip-webhook`);
    }
  }
} else {
  console.log("GITHUB_TOKEN not set; skipping GitHub labels.");
}

// 3. Webhook
if (!skipWebhook) {
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");
  if (!publicUrl) {
    console.error("\nSet PUBLIC_URL (e.g. your ngrok https URL) to register the webhook, or pass --skip-webhook.");
    process.exit(1);
  }
  const teamId = config.clickup.teamId || (await clickup.getTeams()).teams[0]?.id;
  if (!teamId) throw new Error("No ClickUp workspace found for this token");
  const endpoint = `${publicUrl}/webhooks/clickup`;

  // Reuse ours if it's already registered; remove ones left behind by an old ngrok URL.
  let existing: { id: string; secret?: string } | undefined;
  for (const hook of await clickup.getWebhooks(teamId)) {
    if (!hook.endpoint.endsWith("/webhooks/clickup") || String(hook.list_id) !== listId) continue;
    if (hook.endpoint === endpoint && hook.secret) {
      existing = hook;
    } else {
      await clickup.deleteWebhook(hook.id);
      console.log(`  · removed old webhook ${hook.id} → ${hook.endpoint}`);
    }
  }

  const webhook = existing ?? (await clickup.createWebhook(teamId, endpoint, listId)).webhook;
  console.log(`\n✓ Webhook ${webhook.id} → ${endpoint}${existing ? " (already registered)" : ""}`);
  console.log(`Add this to .env and restart the server:\n\n  CLICKUP_WEBHOOK_SECRET=${webhook.secret}\n`);
}
