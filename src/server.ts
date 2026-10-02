// Receives ClickUp webhooks, triages each new task, and serves the live dashboard.
//   POST /webhooks/clickup   ClickUp "taskCreated" events (the only route reachable through ngrok)
//   GET  /                   dashboard                                  ┐
//   GET  /events             live pipeline events (server-sent events)   │ this machine only
//   GET  /api/config         what mode we're in                          │
//   POST /api/tickets        raise a ticket from the dashboard           │
//   POST /triage/:taskId     trigger triage by hand                      ┘
//   GET  /health

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import * as clickup from "./clickup.ts";
import { config } from "./config.ts";
import { recentEvents, subscribe } from "./events.ts";
import { triagePractice, triageTask } from "./triage.ts";

const DASHBOARD = new URL("./web/dashboard.html", import.meta.url);

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// ngrok forwards public traffic from localhost too, but it adds X-Forwarded-For.
const isLocal = (req: IncomingMessage) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") && !req.headers["x-forwarded-for"];

const canWriteToClickUp = () => Boolean(config.clickup.token && config.clickup.listId) && !config.dryRun;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && url.pathname === "/health") {
    return send(200, { ok: true, jevMock: config.jevMock, dryRun: config.dryRun });
  }

  if (req.method === "POST" && url.pathname === "/webhooks/clickup") {
    const raw = await readBody(req);
    const secret = config.clickup.webhookSecret;
    if (secret && !clickup.verifySignature(raw, req.headers["x-signature"] as string | undefined, secret)) {
      return send(401, { error: "bad signature" });
    }
    let event: { event?: string; task_id?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      return send(400, { error: "invalid JSON" });
    }
    // Reply straight away so ClickUp doesn't time out and retry; triage in the background.
    send(200, { received: true });
    if (event.event === "taskCreated" && event.task_id) void triageTask(event.task_id);
    return;
  }

  // Everything below is for the person at this laptop only.
  if (!isLocal(req)) return send(404, { error: "not found" });

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(await readFile(DASHBOARD));
  }

  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`event: history\ndata: ${JSON.stringify(recentEvents())}\n\n`);
    const unsubscribe = subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    return send(200, {
      jevMock: config.jevMock,
      dryRun: config.dryRun,
      clickupWrites: canWriteToClickUp(),
      githubRepo: config.github.defaultRepo || null,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/tickets") {
    let body: { title?: unknown; description?: unknown };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(400, { error: "Send JSON with a title and description." });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!title) return send(400, { error: "Give the ticket a title." });

    if (!canWriteToClickUp()) {
      return send(200, { mode: "practice", runId: triagePractice(title, description) });
    }
    try {
      const task = await clickup.createTask(config.clickup.listId, title, description);
      // Don't wait for the webhook: start now. If the webhook arrives too, it's ignored as a duplicate.
      void triageTask(task.id);
      return send(200, { mode: "clickup", runId: task.id, url: task.url });
    } catch (err) {
      return send(502, { error: `ClickUp didn't accept the ticket: ${(err as Error).message}` });
    }
  }

  const manual = url.pathname.match(/^\/triage\/([\w-]+)$/);
  if (req.method === "POST" && manual) {
    await triageTask(manual[1]!);
    return send(200, { triaged: manual[1] });
  }

  send(404, { error: "not found" });
});

server.listen(config.port, () => {
  console.log(`Jev triage listening on http://localhost:${config.port}`);
  console.log(`  Dashboard: http://localhost:${config.port}/`);
  console.log(`  Jev: ${config.jevMock ? "MOCK (no TYPESAFE_API_KEY)" : "live"}`);
  console.log(`  Writes: ${config.dryRun ? "DRY RUN (nothing is written)" : "live"}`);
  if (config.clickup.pollSeconds > 0) startPolling();
});

// Fallback when ClickUp can't reach the webhook: check the list for tasks created since startup.
function startPolling() {
  const { listId, pollSeconds } = config.clickup;
  if (!listId) return console.warn("  CLICKUP_POLL_SECONDS is set but CLICKUP_LIST_ID is not; polling is off");
  const startedAt = Date.now();
  console.log(`  Polling list ${listId} every ${pollSeconds}s`);
  setInterval(async () => {
    try {
      const tasks = await clickup.listTasks(listId);
      for (const t of tasks) if (Number(t.date_created) >= startedAt) await triageTask(t.id);
    } catch (err) {
      console.error("Polling failed:", err);
    }
  }, pollSeconds * 1000);
}
