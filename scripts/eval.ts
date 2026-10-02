// Run every ticket in data/tickets.json through Jev and compare with the expected answer.
// Gives you real accuracy, latency and cost numbers for a slide. Meaningless in mock mode.
// Run: npm run eval

import { readFile } from "node:fs/promises";
import { decide, type Kind } from "../src/decide.ts";
import { classify } from "../src/jev.ts";

interface Case {
  title: string;
  description: string;
  expected: { type: string; urgency?: string };
}

const cases = JSON.parse(await readFile(new URL("../data/tickets.json", import.meta.url), "utf8")) as Case[];

let typeCorrect = 0;
let urgencyCorrect = 0;
let urgencyTotal = 0;
let totalCost = 0;
const latencies: number[] = [];
const kinds: Record<Kind, number> = { bug: 0, feature_request: 0, question: 0, needs_review: 0 };

// Sequential so the latency numbers aren't distorted by running everything at once.
for (const c of cases) {
  const r = await classify(c);
  const { type, urgency } = r.result.answers;
  const decision = decide(r.result);
  latencies.push(r.latencyMs);
  totalCost += r.costUsd;
  kinds[decision.kind]++;

  const typeOk = type.choice === c.expected.type;
  if (typeOk) typeCorrect++;
  let urgencyNote = "";
  if (c.expected.urgency) {
    urgencyTotal++;
    const ok = urgency.choice === c.expected.urgency;
    if (ok) urgencyCorrect++;
    urgencyNote = ` · urgency ${urgency.choice}${ok ? "" : ` (expected ${c.expected.urgency})`}`;
  }
  console.log(
    `${typeOk ? "✓" : "✗"} ${c.title.slice(0, 55).padEnd(55)} ${type.choice}${typeOk ? "" : ` (expected ${c.expected.type})`}${urgencyNote} → ${decision.kind} · ${r.latencyMs}ms`,
  );
}

latencies.sort((a, b) => a - b);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "n/a");
console.log(`
Tickets:          ${cases.length}
Type accuracy:    ${typeCorrect}/${cases.length} (${pct(typeCorrect, cases.length)})
Urgency accuracy: ${urgencyCorrect}/${urgencyTotal} (${pct(urgencyCorrect, urgencyTotal)})
Routed:           ${kinds.bug} bugs, ${kinds.feature_request} features, ${kinds.question} questions, ${kinds.needs_review} to a human
Latency:          median ${latencies[Math.floor(latencies.length / 2)]}ms, slowest ${latencies.at(-1)}ms
Total cost:       $${totalCost.toFixed(6)}
`);
