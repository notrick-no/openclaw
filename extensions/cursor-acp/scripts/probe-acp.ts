#!/usr/bin/env -S node --import tsx
import { spawn } from "node:child_process";
import path from "node:path";
/**
 * Probe Cursor ACP: run the same init/auth/session-new sequence as the plugin
 * and print every stdout/stderr line. Use to see what Cursor returns for session/new.
 *
 * Usage: pnpm exec tsx extensions/cursor-acp/scripts/probe-acp.ts [cwd]
 *    or: node --import tsx extensions/cursor-acp/scripts/probe-acp.ts /home/notrickno/桌面/openfoam
 *
 * Requires: agent login (or CURSOR_AUTH_TOKEN), Cursor CLI on PATH.
 */
import { createInterface } from "node:readline";

const orderFirst = process.argv[2] === "--session-first";
const cwdArg = orderFirst ? process.argv[3] : process.argv[2];
const cwd = path.resolve(cwdArg || process.cwd());
const command = "agent";
const args = ["--trust", "--workspace", cwd, "acp"];

console.error("[probe] cwd:", cwd);
console.error(
  "[probe] order:",
  orderFirst
    ? "session/new first, then authenticate, then initialize"
    : "initialize → authenticate → session/new",
);
console.error("[probe] spawn:", command, args.join(" "));

const child = spawn(command, args, {
  stdio: ["pipe", "pipe", "pipe"],
  cwd,
  env: process.env,
});

const stderrLines: string[] = [];
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk: string) => {
  const lineList = chunk.split(/\n/).filter(Boolean);
  for (const line of lineList) {
    stderrLines.push(line);
    console.error("[stderr]", line);
  }
});

function createLineIterator(stream: NodeJS.ReadableStream): AsyncIterable<string> {
  const rl = createInterface({ input: stream });
  return {
    async *[Symbol.asyncIterator]() {
      for await (const line of rl) {
        const t = line.trim();
        if (t) yield t;
      }
    },
  };
}

function send(proc: typeof child, id: number, method: string, params: Record<string, unknown>) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  proc.stdin?.write(msg);
  console.error("[stdin]", method, id);
}

function respond(proc: typeof child, id: number | string, result: unknown) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
  proc.stdin?.write(msg);
  console.error("[stdin] response to", id);
}

function parse(line: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(line);
    return typeof o === "object" && o !== null && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

function matchId(msgId: unknown, id: number): boolean {
  if (msgId === id) return true;
  if (typeof msgId === "string" && Number.parseInt(msgId, 10) === id) return true;
  return false;
}

async function waitFor(
  requestId: number,
  lineIter: AsyncIterable<string>,
): Promise<{ result?: Record<string, unknown>; error?: { message?: string } }> {
  for await (const line of lineIter) {
    console.error("[stdout]", line.slice(0, 200) + (line.length > 200 ? "..." : ""));
    const msg = parse(line);
    if (!msg) continue;
    if (!matchId(msg.id, requestId)) {
      if (msg.method === "session/request_permission") {
        respond(child, msg.id, { outcome: { outcome: "selected", optionId: "allow-once" } });
      }
      continue;
    }
    if ("result" in msg && msg.result != null)
      return { result: msg.result as Record<string, unknown> };
    if ("error" in msg && msg.error) return { error: msg.error as { message?: string } };
    break;
  }
  return {};
}

function pickSessionId(result: Record<string, unknown>): string | undefined {
  const sid = result.sessionId ?? result.session_id;
  if (typeof sid === "string") return sid;
  const session = result.session as Record<string, unknown> | undefined;
  if (session && typeof session.id === "string") return session.id;
  return undefined;
}

async function main() {
  const stream = createLineIterator(child.stdout!);
  let nextId = 1;
  let r3: { result?: Record<string, unknown>; error?: { message?: string } } = {};

  if (orderFirst) {
    send(child, nextId, "session/new", { cwd, mcpServers: [] });
    r3 = await waitFor(nextId++, stream);
    const sid = r3.result && typeof r3.result === "object" ? pickSessionId(r3.result) : undefined;
    if (sid) {
      console.error("session/new first → sessionId:", sid);
      send(child, nextId, "authenticate", { methodId: "cursor_login" });
      const r2 = await waitFor(nextId++, stream);
      if (r2.error) {
        console.error("authenticate failed:", r2.error);
        child.kill("SIGTERM");
        process.exit(1);
      }
      send(child, nextId, "initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "probe-acp", version: "0.0.1" },
      });
      const r1 = await waitFor(nextId++, stream);
      if (r1.error) {
        console.error("initialize failed:", r1.error);
        child.kill("SIGTERM");
        process.exit(1);
      }
    }
  } else {
    send(child, nextId, "initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "probe-acp", version: "0.0.1" },
    });
    const r1 = await waitFor(nextId++, stream);
    if (r1.error) {
      console.error("initialize failed:", r1.error);
      child.kill("SIGTERM");
      process.exit(1);
    }
    console.error("initialize ok");

    send(child, nextId, "authenticate", { methodId: "cursor_login" });
    const r2 = await waitFor(nextId++, stream);
    if (r2.error) {
      console.error("authenticate failed:", r2.error);
      child.kill("SIGTERM");
      process.exit(1);
    }
    console.error("authenticate ok");

    send(child, nextId, "session/new", { cwd, mcpServers: [] });
    r3 = await waitFor(nextId++, stream);
  }

  child.kill("SIGTERM");

  console.error("\n--- session/new result ---");
  console.error(JSON.stringify(r3, null, 2));
  if (r3.result && typeof r3.result === "object") {
    const sid = pickSessionId(r3.result);
    if (typeof sid === "string") {
      console.error("sessionId:", sid);
    } else {
      console.error("sessionId: (missing or not string). Keys:", Object.keys(r3.result));
    }
  }
  if (stderrLines.length) {
    console.error("\n--- stderr lines ---");
    stderrLines.forEach((l) => console.error(l));
  }
}

main().catch((e) => {
  console.error(e);
  child.kill("SIGTERM");
  process.exit(1);
});
