#!/usr/bin/env bun
/**
 * Smoke script: send a message (optionally with file) to Feishu via OpenClaw.
 *
 * Usage:
 *   # Dry-run only (no send), optional target
 *   bun scripts/dev/feishu-send-file-smoke.ts
 *   FEISHU_TARGET=ou_xxx bun scripts/dev/feishu-send-file-smoke.ts --dry-run
 *
 *   # Send text only
 *   FEISHU_TARGET=ou_xxx LIVE=1 bun scripts/dev/feishu-send-file-smoke.ts
 *
 *   # Send text + file (local path or URL)
 *   FEISHU_TARGET=ou_xxx FEISHU_MEDIA=/path/to/file.pdf LIVE=1 bun scripts/dev/feishu-send-file-smoke.ts
 *   FEISHU_TARGET=ou_xxx FEISHU_MEDIA=https://example.com/doc.pdf LIVE=1 bun scripts/dev/feishu-send-file-smoke.ts
 *
 *   # Auto-create a small test file and send it
 *   FEISHU_TARGET=ou_xxx LIVE=1 bun scripts/dev/feishu-send-file-smoke.ts --with-test-file
 *
 * Run with: bun scripts/dev/feishu-send-file-smoke.ts  OR  node --import tsx scripts/dev/feishu-send-file-smoke.ts
 *
 * How to get FEISHU_TARGET (receive_id):
 *   - Your open_id (ou_xxx): 1) DM the bot in Feishu, 2) run `openclaw logs --follow` and look for open_id; or run `openclaw pairing list feishu` to see pending/approved open_ids.
 *   - Group chat_id (oc_xxx): 1) @mention the bot in the group, 2) run `openclaw logs --follow` and look for chat_id; or use Feishu API debugger to list group chats.
 *
 * Env:
 *   FEISHU_TARGET  - Feishu receive_id (e.g. ou_xxx for DM, oc_xxx for group). Required for LIVE=1.
 *   FEISHU_MEDIA   - Optional: path or URL for attachment.
 *   LIVE           - Set to 1 to actually send; otherwise only dry-run.
 *   OPENCLAW_BIN   - Optional: path to openclaw CLI (default: pnpm openclaw from repo root).
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function getEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function runOpenclawMessageSend(args: {
  channel: string;
  target: string;
  message: string;
  media?: string;
  dryRun: boolean;
  openclawBin: string;
}): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const cmd = args.openclawBin === "pnpm" ? "pnpm" : args.openclawBin;
    const rest: string[] =
      args.openclawBin === "pnpm"
        ? ["openclaw", "message", "send", "--channel", args.channel, "--target", args.target]
        : ["message", "send", "--channel", args.channel, "--target", args.target];
    if (args.message) {
      rest.push("--message", args.message);
    }
    if (args.media) {
      rest.push("--media", args.media);
    }
    if (args.dryRun) {
      rest.push("--dry-run");
    }
    rest.push("--json");

    const cwd = args.openclawBin === "pnpm" ? REPO_ROOT : undefined;
    const proc = spawn(cmd, rest, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    proc.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    proc.on("close", (code, signal) => {
      resolve({
        stdout,
        stderr,
        code: code ?? (signal ? 1 : 0),
      });
    });
  });
}

async function main(): Promise<void> {
  const dryRunOnly = !process.env.LIVE || process.env.LIVE === "0";
  const withTestFile = process.argv.includes("--with-test-file");
  const explicitDryRun = process.argv.includes("--dry-run");

  const target = getEnv("FEISHU_TARGET");
  let media = getEnv("FEISHU_MEDIA");

  const openclawBin = getEnv("OPENCLAW_BIN") ?? "pnpm";

  if (!dryRunOnly && !target) {
    console.error("FEISHU_TARGET is required when LIVE=1");
    process.exit(1);
  }

  const message = "OpenClaw 飞书发文件测试 " + new Date().toISOString();

  let testFilePath: string | undefined;
  if (withTestFile && !media) {
    const tmpDir = path.join(REPO_ROOT, "node_modules", ".tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    testFilePath = path.join(tmpDir, "feishu-smoke-test.txt");
    await fs.writeFile(
      testFilePath,
      `OpenClaw Feishu smoke test\nCreated: ${new Date().toISOString()}\n`,
      "utf-8",
    );
    media = testFilePath;
    console.log("Created test file:", testFilePath);
  }

  const run = async (dryRun: boolean) => {
    const result = await runOpenclawMessageSend({
      channel: "feishu",
      target: target ?? "ou_placeholder",
      message,
      media,
      dryRun,
      openclawBin,
    });
    if (result.stderr) {
      console.error("[stderr]", result.stderr);
    }
    return result;
  };

  // 1) Dry-run
  console.log("\n--- Dry-run ---");
  const dryResult = await run(true);
  if (dryResult.code !== 0) {
    console.error("Dry-run failed (exit code", dryResult.code, ")");
    console.error(dryResult.stdout || dryResult.stderr);
    process.exit(1);
  }
  try {
    const payload = JSON.parse(dryResult.stdout);
    console.log("Dry-run payload:", JSON.stringify(payload, null, 2));
  } catch {
    console.log("Dry-run output:", dryResult.stdout);
  }

  if (explicitDryRun || dryRunOnly) {
    console.log(
      "\nDone (dry-run only). To send for real: LIVE=1 FEISHU_TARGET=ou_xxx [FEISHU_MEDIA=...] node --import tsx scripts/dev/feishu-send-file-smoke.ts",
    );
    if (testFilePath) {
      await fs.rm(testFilePath, { force: true });
    }
    return;
  }

  // 2) Live send
  console.log("\n--- Live send ---");
  const liveResult = await run(false);
  if (liveResult.code !== 0) {
    console.error("Send failed (exit code", liveResult.code, ")");
    console.error(liveResult.stdout || liveResult.stderr);
    if (testFilePath) {
      await fs.rm(testFilePath, { force: true });
    }
    process.exit(1);
  }
  try {
    const payload = JSON.parse(liveResult.stdout);
    console.log("Send result:", JSON.stringify(payload, null, 2));
    if (payload?.result?.messageId) {
      console.log("\nOK: message sent, messageId:", payload.result.messageId);
    }
  } catch {
    console.log("Output:", liveResult.stdout);
  }

  if (testFilePath) {
    await fs.rm(testFilePath, { force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
