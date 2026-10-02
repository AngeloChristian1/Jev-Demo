// The pipeline: ClickUp task → Jev → decision → ClickUp (+ GitHub for bugs).
// Each step is logged to the terminal and emitted as an event for the dashboard.

import * as clickup from "./clickup.ts";
import { config, repoForArea } from "./config.ts";
import { decide, TAGS, type Decision } from "./decide.ts";
import { emit } from "./events.ts";
import * as github from "./github.ts";
import { classify, type Classification } from "./jev.ts";
import { formatClassification, formatDecision } from "./print.ts";

const OUR_TAGS = new Set<string>(Object.values(TAGS));
const PRIORITY_NAMES = { 1: "Urgent", 2: "High", 3: "Normal", 4: "Low" } as const;

interface Ticket {
  id: string;
  title: string;
  description: string;
  url?: string;
  /** False for practice tickets that only exist on the dashboard: nothing is written anywhere. */
  real: boolean;
}

// ClickUp can deliver the same webhook more than once; don't triage a task twice.
const seen = new Set<string>();

export async function triageTask(taskId: string): Promise<void> {
  if (seen.has(taskId)) return;
  seen.add(taskId);
  try {
    const task = await clickup.getTask(taskId);
    // Already triaged (e.g. before a restart): our tags are the marker.
    if (task.tags.some((t) => OUR_TAGS.has(t.name))) return;
    const ticket = { id: task.id, title: task.name, description: task.text_content || task.description || "", url: task.url, real: true };
    await run(ticket);
  } catch (err) {
    seen.delete(taskId); // allow a retry
    console.error(`Failed to triage task ${taskId}:`, err);
  }
}

let practiceCount = 0;

/** Runs the pipeline on text from the dashboard without creating or changing anything. */
export function triagePractice(title: string, description: string): string {
  const id = `practice-${Date.now()}-${++practiceCount}`;
  void run({ id, title, description, real: false }).catch((err) => console.error("Practice run failed:", err));
  return id;
}

async function run(ticket: Ticket): Promise<void> {
  const started = Date.now();
  const id = ticket.id;
  emit(id, "received", "done", { title: ticket.title, description: ticket.description, url: ticket.url, real: ticket.real });
  console.log(`\n━━━ ${ticket.title} ━━━\n  ${ticket.description.replace(/\n/g, "\n  ")}\n`);

  let step: "jev" | "github" | "clickup" = "jev";
  try {
    emit(id, "jev", "start", { mock: config.jevMock });
    const classification = await classify({ title: ticket.title, description: ticket.description });
    const { result, latencyMs, costUsd, mock } = classification;
    emit(id, "jev", "done", { answers: result.answers, model: result.model, latencyMs, costUsd, inputTokens: result.usage.input_tokens, mock });
    console.log(formatClassification(classification));

    const decision = decide(result);
    emit(id, "decide", "done", { ...decision, priorityName: decision.priority ? PRIORITY_NAMES[decision.priority] : undefined });
    console.log(formatDecision(decision));

    step = "github";
    let issueUrl: string | undefined;
    if (!decision.createIssue) {
      emit(id, "github", "skipped", { reason: "not-a-bug" });
    } else if (!ticket.real || config.dryRun) {
      emit(id, "github", "skipped", { reason: ticket.real ? "dry-run" : "practice", repo: repoForArea(decision.area ?? "") });
      if (ticket.real) console.log(`  [dry run] would create a GitHub issue in ${repoForArea(decision.area ?? "")}`);
    } else {
      emit(id, "github", "start", { repo: repoForArea(decision.area ?? "") });
      const issue = await createGitHubIssue(ticket, classification, decision);
      issueUrl = issue.html_url;
      emit(id, "github", "done", { url: issue.html_url, number: issue.number, repo: repoForArea(decision.area ?? "") });
    }

    step = "clickup";
    if (!ticket.real || config.dryRun) {
      emit(id, "clickup", "skipped", { reason: ticket.real ? "dry-run" : "practice", tags: decision.tags, priority: decision.priority });
      if (ticket.real) console.log(`  [dry run] would tag the ClickUp task ${decision.tags.join(", ")}${decision.priority ? ` and set priority ${decision.priority}` : ""}`);
    } else {
      emit(id, "clickup", "start", {});
      await writeBackToClickUp(ticket, classification, decision, issueUrl);
      emit(id, "clickup", "done", { url: ticket.url, tags: decision.tags, priority: decision.priority });
    }

    emit(id, "done", "done", { totalMs: Date.now() - started, kind: decision.kind });
  } catch (err) {
    emit(id, step, "error", { message: (err as Error).message });
    throw err;
  }
}

async function createGitHubIssue(ticket: Ticket, { result }: Classification, decision: Decision) {
  const repo = repoForArea(decision.area ?? "");
  const labels = ["bug", `priority:${decision.urgency}`, `area:${decision.area}`, "from-clickup"];
  const probabilities = (p: Record<string, number>) =>
    Object.entries(p)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
      .join(" · ");

  const body = [
    `Raised by a client in ClickUp: ${ticket.url}`,
    "",
    "### Client's report",
    "",
    ticket.description ? ticket.description.replace(/^/gm, "> ") : "> _(no description)_",
    "",
    "### Jev triage",
    "",
    `| | |`,
    `|---|---|`,
    `| Type | ${probabilities(result.answers.type.probabilities)} |`,
    `| Urgency | ${probabilities(result.answers.urgency.probabilities)} |`,
    `| Area | ${probabilities(result.answers.area.probabilities)} |`,
    `| Needs a human | ${Math.round(result.answers.needs_human.noul * 100)}% |`,
  ].join("\n");

  const issue = await github.createIssue(repo, { title: ticket.title, body, labels });
  console.log(`  ✓ GitHub issue #${issue.number}: ${issue.html_url}`);
  return issue;
}

async function writeBackToClickUp(
  ticket: Ticket,
  { latencyMs, costUsd }: Classification,
  decision: Decision,
  issueUrl: string | undefined,
) {
  const comment = [
    `🤖 Jev triage: ${decision.kind.replace("_", " ")}`,
    `Why: ${decision.reasons.join("; ")}`,
    issueUrl ? `GitHub issue: ${issueUrl}` : undefined,
    decision.kind === "needs_review" ? "A person should look at this before anything else happens." : undefined,
    `(${latencyMs}ms, $${costUsd.toFixed(6)})`,
  ]
    .filter(Boolean)
    .join("\n");

  if (decision.priority) await clickup.setPriority(ticket.id, decision.priority);
  for (const tag of decision.tags) await clickup.addTag(ticket.id, tag);
  await clickup.addComment(ticket.id, comment);
  console.log(`  ✓ ClickUp task updated: ${ticket.url}`);
}
