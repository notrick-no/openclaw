#!/usr/bin/env -S node --import tsx
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
/**
 * 在 Cursor 官方 Minimal Node.js client 基础上扩展：同一套 readline + Promise 流程，支持从文件/stdin 读任务、--trust、结果汇总。
 * 官方示例: https://cursor.com/docs/cli/acp （Minimal Node.js client）
 * 原样副本: extensions/cursor-acp/scripts/acp-minimal-client.mjs
 *
 * 用法（须在 openclaw 仓库根目录执行）:
 *   pnpm exec tsx extensions/cursor-acp/scripts/run-acp-task.ts <workspace_cwd> [task_file]
 *   --smoke      只发 "Say hello in one sentence."
 *   --multi-turn 模拟多轮 agent 对话（3 轮：A 介绍 → B 追问 → A 回答），用于测试同一 session 多次 session/prompt
 *   --trust      使用 agent --trust --workspace <cwd> acp（与插件一致）；默认不加即与官方 minimal 一致，spawn 仅 agent acp
 *
 * 例: pnpm exec tsx extensions/cursor-acp/scripts/run-acp-task.ts /home/notrickno/桌面/openfoam skills/openfoam-pimplefoam/任务提示词.md
 * 例: pnpm exec tsx extensions/cursor-acp/scripts/run-acp-task.ts --multi-turn /tmp/test-ws
 */
import readline from "node:readline";

const argv = process.argv.filter((a) => a !== "--smoke" && a !== "--trust" && a !== "--multi-turn");
const smoke = process.argv.includes("--smoke");
const multiTurn = process.argv.includes("--multi-turn");
const useTrust = process.argv.includes("--trust");
const cwdArg = argv[2];
const taskFileArg = argv[3];
const cwd = path.resolve(cwdArg || process.cwd());

const DEFAULT_TASK = `用 Cursor Agent（ACP）在目录 ${cwd} 下完成一个 pimpleFoam 偏心圆柱层流不可压算例。请在该目录下创建算例所需文件并给出运行与后处理步骤的简要说明。完成后把结果总结给我。`;

async function readTaskFromStdin(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin });
  const lines: string[] = [];
  for await (const line of rl) lines.push(line);
  return lines.join("\n").trim() || DEFAULT_TASK;
}

function loadTask(): string {
  if (!taskFileArg) return DEFAULT_TASK;
  const p = path.resolve(taskFileArg);
  if (!existsSync(p)) {
    throw new Error(
      `任务文件不存在: ${p}\n可用: pnpm exec tsx extensions/cursor-acp/scripts/run-acp-task.ts ${cwd} skills/openfoam-pimplefoam/任务提示词.md`,
    );
  }
  return readFileSync(p, "utf-8").trim() || DEFAULT_TASK;
}

/** 多轮对话测试：同一 session 内连续多次 session/prompt，模拟 Agent A / B 交替。 */
const MULTI_TURN_PROMPTS = [
  "你扮演 Agent A。请用一句话介绍你自己（角色与能力）。",
  "你扮演 Agent B。根据上一条 Agent A 的回复，用一句话追问一个与技术相关的问题。",
  "你再次扮演 Agent A。用一句话回答 Agent B 的追问。",
];

async function main() {
  const task = multiTurn
    ? ""
    : smoke
      ? "Say hello in one sentence."
      : taskFileArg
        ? loadTask()
        : !process.stdin.isTTY
          ? await readTaskFromStdin()
          : DEFAULT_TASK;

  console.error("[run-acp-task] cwd:", cwd, useTrust ? "(--trust)" : "");
  if (multiTurn) {
    console.error("[run-acp-task] mode: multi-turn, rounds:", MULTI_TURN_PROMPTS.length);
  } else {
    console.error("[run-acp-task] task length:", task.length, "chars");
  }
  process.chdir(cwd);

  const agentArgs = useTrust ? ["--trust", "--workspace", cwd, "acp"] : ["acp"];
  const agent = spawn("agent", agentArgs, {
    stdio: useTrust ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "inherit"],
    cwd,
    env: process.env,
  });

  if (useTrust) {
    agent.stderr?.setEncoding("utf8");
    agent.stderr?.on("data", (chunk: string) => process.stderr.write(chunk));
  }

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();
  const outputChunks: string[] = [];

  function send(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = nextId++;
    agent.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function respond(id: number | string, result: unknown) {
    agent.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  }

  const rl = readline.createInterface({ input: agent.stdout! });
  rl.on("line", (line: string) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
      const waiter = pending.get(Number(msg.id));
      if (!waiter) return;
      pending.delete(Number(msg.id));
      msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
      return;
    }

    if (msg.method === "session/update") {
      const update = (msg.params as Record<string, unknown>)?.update as
        | Record<string, unknown>
        | undefined;
      if (update?.sessionUpdate === "agent_message_chunk" && update?.content) {
        const text = (update.content as Record<string, unknown>).text as string | undefined;
        if (text) {
          outputChunks.push(text);
          process.stdout.write(text);
        }
      }
      return;
    }

    if (msg.method === "session/request_permission") {
      respond(msg.id, { outcome: { outcome: "selected", optionId: "allow-once" } });
    }
  });

  try {
    await send("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "run-acp-task", version: "0.0.1" },
    });
    await send("authenticate", { methodId: "cursor_login" });
    const sessionNew = (await send("session/new", { cwd, mcpServers: [] })) as Record<
      string,
      unknown
    >;
    const sessionId = sessionNew?.sessionId ?? sessionNew?.session_id;
    if (typeof sessionId !== "string") {
      console.error("session/new 未返回 sessionId:", sessionNew);
      agent.kill("SIGTERM");
      process.exit(1);
    }

    if (multiTurn) {
      for (let i = 0; i < MULTI_TURN_PROMPTS.length; i++) {
        outputChunks.length = 0;
        const round = i + 1;
        process.stdout.write(`\n--- 第 ${round} 轮 ---\n`);
        const result = (await send("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: MULTI_TURN_PROMPTS[i] }],
        })) as Record<string, unknown> | undefined;
        const stopReason = result?.stopReason ?? result?.stop_reason;
        const full = outputChunks.join("").trim();
        if (!full) {
          process.stdout.write("(本轮无文本输出)");
          if (typeof stopReason === "string") process.stdout.write(` stopReason=${stopReason}`);
          process.stdout.write("\n");
        }
      }
      console.log("\n\n--- 多轮对话结束 ---");
    } else {
      const result = (await send("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: task }],
      })) as Record<string, unknown> | undefined;
      const stopReason = result?.stopReason ?? result?.stop_reason;

      console.log("\n\n--- 结果总结 ---");
      const full = outputChunks.join("").trim();
      if (full) console.log(full);
      else
        console.log(
          "(无文本输出)",
          typeof stopReason === "string" ? `stopReason=${stopReason}` : "",
        );
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    agent.stdin?.end();
    agent.kill("SIGTERM");
  }
}

main();
