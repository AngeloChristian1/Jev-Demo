// Minimal ClickUp API v2 client: only the calls this app needs.
// Docs: https://clickup.com/api

import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";

const BASE = "https://api.clickup.com/api/v2";

export interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  text_content?: string;
  url: string;
  date_created: string;
  tags: { name: string }[];
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!config.clickup.token) throw new Error("CLICKUP_TOKEN is not set");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: config.clickup.token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickUp ${method} ${path} → ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const getTask = (taskId: string) => request<ClickUpTask>("GET", `/task/${taskId}`);

export const listTasks = (listId: string) =>
  request<{ tasks: ClickUpTask[] }>("GET", `/list/${listId}/task?order_by=created&subtasks=false`).then(
    (r) => r.tasks,
  );

export const setPriority = (taskId: string, priority: 1 | 2 | 3 | 4) =>
  request("PUT", `/task/${taskId}`, { priority });

export const addTag = (taskId: string, tag: string) =>
  request("POST", `/task/${taskId}/tag/${encodeURIComponent(tag)}`);

export const addComment = (taskId: string, text: string) =>
  request("POST", `/task/${taskId}/comment`, { comment_text: text, notify_all: false });

export const createTask = (listId: string, name: string, description: string) =>
  request<ClickUpTask>("POST", `/list/${listId}/task`, { name, description });

// Setup helpers

export const getTeams = () => request<{ teams: { id: string; name: string }[] }>("GET", "/team");

export const getList = (listId: string) =>
  request<{ id: string; name: string; space: { id: string } }>("GET", `/list/${listId}`);

export const createSpaceTag = (spaceId: string, name: string, bg: string) =>
  request("POST", `/space/${spaceId}/tag`, { tag: { name, tag_fg: "#ffffff", tag_bg: bg } });

export const createWebhook = (teamId: string, endpoint: string, listId: string) =>
  request<{ id: string; webhook: { id: string; secret: string } }>("POST", `/team/${teamId}/webhook`, {
    endpoint,
    events: ["taskCreated"],
    list_id: Number(listId),
  });

export const getWebhooks = (teamId: string) =>
  request<{ webhooks: { id: string; endpoint: string; list_id?: number | null; secret?: string }[] }>(
    "GET",
    `/team/${teamId}/webhook`,
  ).then((r) => r.webhooks);

export const deleteWebhook = (webhookId: string) => request("DELETE", `/webhook/${webhookId}`);

/** ClickUp signs each webhook body with HMAC-SHA256 of the raw body, in the X-Signature header. */
export function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
