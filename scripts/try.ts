// Classify a single message without touching ClickUp or GitHub.
// Run: npm run try -- "The export button does nothing since this morning"

import { decide } from "../src/decide.ts";
import { classify } from "../src/jev.ts";
import { formatClassification, formatDecision } from "../src/print.ts";

const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  console.error('Usage: npm run try -- "a client message"');
  process.exit(1);
}

const [title, ...rest] = text.split(/(?<=[.!?])\s+/);
const classification = await classify({ title: title!, description: rest.join(" ") || title! });
console.log(formatClassification(classification));
console.log(formatDecision(decide(classification.result)));
