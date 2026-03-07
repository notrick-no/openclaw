#!/usr/bin/env node
/**
 * Cursor 官方文档里的 Minimal Node.js ACP client，原样可运行，用于验证 agent 是否响应 session/prompt。
 *
 * 文档: https://cursor.com/docs/cli/acp （章节 "Minimal Node.js client"）
 *
 * 用法（在要作为 workspace 的目录下跑，或传目录为参数）:
 *   cd /home/notrickno/桌面/openfoam
 *   node /path/to/openclaw/extensions/cursor-acp/scripts/acp-minimal-client.mjs
 *
 * 或指定 cwd:
 *   node extensions/cursor-acp/scripts/acp-minimal-client.mjs /home/notrickno/桌面/openfoam
 *
 * 依赖: agent login（或 CURSOR_AUTH_TOKEN），Cursor CLI 在 PATH。无 --trust，若需要 Trust 请先在 Cursor IDE 里打开该目录并 Trust。
 */
import { spawn } from "node:child_process";
import readline from "node:readline";

const cwd = process.argv[2] ? process.argv[2] : process.cwd();
const agent = spawn("agent", ["acp"], {
  stdio: ["pipe", "pipe", "inherit"],
  cwd,
  env: process.env,
});

let nextId = 1;
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function respond(id, result) {
  agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

const rl = readline.createInterface({ input: agent.stdout });
rl.on("line", (line) => {
  const msg = JSON.parse(line);

  if (msg.id && (msg.result || msg.error)) {
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
    return;
  }

  if (msg.method === "session/update") {
    const update = msg.params?.update;
    if (update?.sessionUpdate === "agent_message_chunk" && update.content?.text) {
      process.stdout.write(update.content.text);
    }
    return;
  }

  if (msg.method === "session/request_permission") {
    respond(msg.id, { outcome: { outcome: "selected", optionId: "allow-once" } });
  }
});

const init = async () => {
  await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: "acp-minimal-client", version: "0.1.0" },
  });

  await send("authenticate", { methodId: "cursor_login" });
  const { sessionId } = await send("session/new", { cwd, mcpServers: [] });
  const result = await send("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: "Say hello in one sentence." }],
  });

  console.log(`\n\n[stopReason=${result.stopReason}]`);
};

init()
  .finally(() => {
    agent.stdin.end();
    agent.kill();
  })
  .catch((err) => {
    console.error(err);
    agent.kill();
    process.exit(1);
  });
