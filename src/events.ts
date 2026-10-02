// Progress events from the triage pipeline, streamed to the dashboard as they happen.

import { EventEmitter } from "node:events";

export type Step = "received" | "jev" | "decide" | "github" | "clickup" | "done";
export type Status = "start" | "done" | "skipped" | "error";

export interface TriageEvent {
  runId: string;
  step: Step;
  status: Status;
  at: number;
  data?: Record<string, unknown>;
}

const MAX_HISTORY = 400;
const history: TriageEvent[] = [];
const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emit(runId: string, step: Step, status: Status, data?: Record<string, unknown>): void {
  const event: TriageEvent = { runId, step, status, at: Date.now(), data };
  history.push(event);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  emitter.emit("event", event);
}

/** Calls `fn` for every new event; returns a function that stops listening. */
export function subscribe(fn: (event: TriageEvent) => void): () => void {
  emitter.on("event", fn);
  return () => emitter.off("event", fn);
}

export const recentEvents = (): readonly TriageEvent[] => history;
