// Minimal GitHub REST client: create issues and make sure our labels exist.

import { config } from "./config.ts";

async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  if (!config.github.token) throw new Error("GITHUB_TOKEN is not set");
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.github.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as T;
  return { status: res.status, data };
}

export async function createIssue(
  repo: string,
  issue: { title: string; body: string; labels: string[] },
): Promise<{ number: number; html_url: string }> {
  if (!repo) throw new Error("No GitHub repo configured (set GITHUB_DEFAULT_REPO)");
  const { status, data } = await request<{ number: number; html_url: string }>("POST", `/repos/${repo}/issues`, issue);
  if (status !== 201) throw new Error(`GitHub create issue in ${repo} → ${status}: ${JSON.stringify(data)}`);
  return data;
}

/** Creates the label if it's missing. 422 means it already exists, which is fine. */
export async function ensureLabel(repo: string, name: string, color: string): Promise<"created" | "exists"> {
  const { status, data } = await request("POST", `/repos/${repo}/labels`, { name, color });
  if (status === 201) return "created";
  if (status === 422) return "exists";
  throw new Error(`GitHub create label ${name} in ${repo} → ${status}: ${JSON.stringify(data)}`);
}
