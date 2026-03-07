/**
 * Cursor ACP runtime：与 run-acp-task.ts 同一套逻辑（readline + pending Map + send 返回 Promise）。
 * 顺序：initialize → authenticate → session/new；runTurn 发 session/prompt，从 updateQueue 收 session/update 并 yield。
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import type {
  AcpRuntime,
  AcpRuntimeCapabilities,
  AcpRuntimeDoctorReport,
  AcpRuntimeEnsureInput,
  AcpRuntimeEvent,
  AcpRuntimeHandle,
  AcpRuntimeStatus,
  AcpRuntimeTurnInput,
  PluginLogger,
} from "openclaw/plugin-sdk/acpx";
import { AcpRuntimeError } from "openclaw/plugin-sdk/acpx";
import type { ResolvedCursorAcpConfig } from "./config.js";
import { parseCursorAcpLine } from "./events.js";

export const CURSOR_ACP_BACKEND_ID = "cursor-acp";

const ACP_CAPABILITIES: AcpRuntimeCapabilities = {
  controls: ["session/status"],
};

/** 异步队列：readline 把 session/update 的 raw line push 进来，runTurn shift 消费 */
function createAsyncQueue<T>(): { push(v: T): void; shift(): Promise<T> } {
  const queue: T[] = [];
  const waiters: Array<(v: T) => void> = [];
  return {
    push(v: T) {
      if (waiters.length > 0) waiters.shift()!(v);
      else queue.push(v);
    },
    shift() {
      if (queue.length > 0) return Promise.resolve(queue.shift()!);
      return new Promise<T>((resolve) => waiters.push(resolve));
    },
  };
}

type SessionState = {
  process: ChildProcess;
  sessionId: string;
  cwd: string;
  mode: "persistent" | "oneshot";
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>;
  updateQueue: ReturnType<typeof createAsyncQueue<string>>;
};

const sessionMap = new Map<string, SessionState>();

function sendJson(proc: ChildProcess, obj: Record<string, unknown>): void {
  if (proc.stdin?.writable) proc.stdin.write(JSON.stringify(obj) + "\n");
}

function sendResponse(proc: ChildProcess, id: number | string, result: unknown): void {
  sendJson(proc, { jsonrpc: "2.0", id, result });
}

function parseJsonRpcLine(line: string): Record<string, unknown> | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t) as unknown;
    return typeof o === "object" && o !== null && !Array.isArray(o)
      ? (o as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function pickSessionId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const sid = r.sessionId ?? r.session_id;
  if (typeof sid === "string" && sid.length > 0) return sid;
  const sessionObj = r.session as Record<string, unknown> | undefined;
  if (sessionObj && typeof sessionObj.id === "string" && sessionObj.id.length > 0)
    return sessionObj.id as string;
  return null;
}

/** 与 run-acp-task 一致：send 写 stdin 并返回 Promise，由 readline 里 resolve */
function send(
  state: SessionState,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const id = state.nextId++;
  sendJson(state.process, { jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => state.pending.set(id, { resolve, reject }));
}

function attachReadline(state: SessionState, proc: ChildProcess, optionId: string): void {
  const rl = createInterface({ input: proc.stdout! });
  rl.on("line", (line: string) => {
    const msg = parseJsonRpcLine(line);
    if (!msg) return;

    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
      const id = Number(msg.id);
      const waiter = state.pending.get(id);
      if (waiter) {
        state.pending.delete(id);
        msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
      }
      return;
    }

    if (msg.method === "session/request_permission") {
      sendResponse(proc, msg.id as number | string, { outcome: { outcome: "selected", optionId } });
      return;
    }

    if (msg.method === "session/update") {
      state.updateQueue.push(line);
    }
  });
}

export class CursorAcpRuntime implements AcpRuntime {
  private healthy = false;

  constructor(
    private readonly config: ResolvedCursorAcpConfig,
    private readonly logger?: PluginLogger,
  ) {}

  isHealthy(): boolean {
    return this.healthy;
  }

  async probeAvailability(): Promise<void> {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    try {
      await promisify(execFile)(this.config.command, ["--help"], {
        cwd: this.config.cwd,
        env: process.env,
        timeout: 5000,
      });
      this.healthy = true;
    } catch {
      this.healthy = false;
    }
  }

  async ensureSession(input: AcpRuntimeEnsureInput): Promise<AcpRuntimeHandle> {
    const sessionKey = input.sessionKey?.trim();
    if (!sessionKey)
      throw new AcpRuntimeError("ACP_SESSION_INIT_FAILED", "ACP session key is required.");
    if ((input.agent?.trim() ?? "") !== "cursor") {
      throw new AcpRuntimeError(
        "ACP_SESSION_INIT_FAILED",
        'Cursor ACP backend only supports agent id "cursor".',
      );
    }
    const cwdRaw = (input.cwd?.trim() || this.config.cwd).replace(/^~/, process.env.HOME ?? "");
    const cwd = path.resolve(cwdRaw);
    const mode = input.mode ?? "persistent";

    if (sessionMap.has(sessionKey)) {
      const existing = sessionMap.get(sessionKey)!;
      return this.buildHandle(sessionKey, existing.sessionId, cwd, mode);
    }

    const env = { ...process.env, ...input.env, ...this.config.env };
    const args = this.config.trustWorkspace ? ["--trust", "--workspace", cwd, "acp"] : ["acp"];
    const child = spawn(this.config.command, args, { stdio: ["pipe", "pipe", "pipe"], cwd, env });

    const stderrChunks: string[] = [];
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      const lines = String(chunk).trim().split(/\n/).filter(Boolean);
      for (const line of lines) {
        stderrChunks.push(line);
        if (stderrChunks.length > 30) stderrChunks.shift();
      }
      this.logger?.debug?.(`cursor-acp stderr: ${chunk}`);
    });

    const state: SessionState = {
      process: child,
      sessionId: "",
      cwd,
      mode,
      nextId: 1,
      pending: new Map(),
      updateQueue: createAsyncQueue(),
    };
    attachReadline(state, child, this.config.permissionOutcome);

    try {
      await send(state, "initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "openclaw-cursor-acp", version: "1.0.0" },
      });
      await send(state, "authenticate", { methodId: "cursor_login" });
      const sessionNew = (await send(state, "session/new", { cwd, mcpServers: [] })) as Record<
        string,
        unknown
      >;
      const sessionId = pickSessionId(sessionNew);
      if (!sessionId) {
        child.kill("SIGTERM");
        const err = sessionNew?.error ?? sessionNew;
        const stderrSuffix =
          stderrChunks.length > 0
            ? ` Stderr: ${stderrChunks.slice(-15).join(" | ").slice(-600)}`
            : "";
        const trustHint = this.config.trustWorkspace
          ? " Try without trustWorkspace or open workspace in Cursor IDE and trust once."
          : "";
        throw new AcpRuntimeError(
          "ACP_SESSION_INIT_FAILED",
          `Cursor session/new did not return sessionId. Run \`agent login\`.${trustHint} ${JSON.stringify(err)}.${stderrSuffix}`,
        );
      }
      state.sessionId = sessionId;
    } catch (err) {
      child.kill("SIGTERM");
      if (err instanceof AcpRuntimeError) throw err;
      throw new AcpRuntimeError(
        "ACP_SESSION_INIT_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }

    sessionMap.set(sessionKey, state);
    return this.buildHandle(sessionKey, state.sessionId, cwd, mode);
  }

  private buildHandle(
    sessionKey: string,
    sessionId: string,
    cwd: string,
    mode: "persistent" | "oneshot",
  ): AcpRuntimeHandle {
    return { sessionKey, backend: CURSOR_ACP_BACKEND_ID, runtimeSessionName: sessionId, cwd };
  }

  async *runTurn(input: AcpRuntimeTurnInput): AsyncIterable<AcpRuntimeEvent> {
    const state = sessionMap.get(input.handle.sessionKey);
    if (!state) {
      throw new AcpRuntimeError(
        "ACP_TURN_FAILED",
        `No Cursor ACP session for key ${input.handle.sessionKey}. Call ensureSession first.`,
      );
    }
    if (!state.process.stdin?.writable) {
      throw new AcpRuntimeError("ACP_TURN_FAILED", "Cursor process stdin is not writable.");
    }

    const promptPromise = send(state, "session/prompt", {
      sessionId: state.sessionId,
      prompt: [{ type: "text", text: input.text }],
    });

    const raceWithAbort = async (): Promise<
      { done: true; result?: unknown } | { done: false; line: string }
    > => {
      const nextUpdate = state.updateQueue.shift();
      const result = await Promise.race([
        promptPromise.then((r) => ({ done: true as const, result: r })),
        nextUpdate.then((line) => ({ done: false as const, line })),
      ]);
      if (input.signal?.aborted) return { done: true };
      return result;
    };

    let sawDone = false;
    while (true) {
      const r = await raceWithAbort();
      if (input.signal?.aborted) {
        await this.cancel({ handle: input.handle, reason: "abort-signal" }).catch(() => {});
        return;
      }
      if (r.done) {
        const result = r.result as Record<string, unknown> | undefined;
        const stopReason = typeof result?.stopReason === "string" ? result.stopReason : undefined;
        yield { type: "done", stopReason };
        sawDone = true;
        break;
      }
      const event = parseCursorAcpLine(r.line);
      if (event) yield event;
    }

    if (!sawDone) yield { type: "done" };
  }

  getCapabilities(): AcpRuntimeCapabilities {
    return ACP_CAPABILITIES;
  }

  async getStatus(input: { handle: AcpRuntimeHandle }): Promise<AcpRuntimeStatus> {
    const state = sessionMap.get(input.handle.sessionKey);
    if (!state) return { summary: "no session" };
    return {
      summary: "cursor acp session active",
      agentSessionId: state.sessionId,
      details: { cwd: state.cwd, mode: state.mode },
    };
  }

  async cancel(input: { handle: AcpRuntimeHandle; reason?: string }): Promise<void> {
    const state = sessionMap.get(input.handle.sessionKey);
    if (!state) return;
    // Cursor ACP may not support session/cancel; ignore response to avoid unhandled rejection.
    void send(state, "session/cancel", {}).catch(() => {});
  }

  async close(input: { handle: AcpRuntimeHandle; reason: string }): Promise<void> {
    const state = sessionMap.get(input.handle.sessionKey);
    if (!state) return;
    sessionMap.delete(input.handle.sessionKey);
    state.process.stdin?.end();
    state.process.kill("SIGTERM");
  }

  async doctor(): Promise<AcpRuntimeDoctorReport> {
    const { execSync } = await import("node:child_process");
    try {
      execSync(`${this.config.command} acp --help`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      });
      return { ok: true, message: "Cursor CLI (agent acp) is available." };
    } catch (err) {
      return {
        ok: false,
        code: "CURSOR_CLI_MISSING",
        message: "Cursor CLI not found or `agent acp` not available.",
        installCommand: "curl https://cursor.com/install -fsS | bash",
        details: [err instanceof Error ? err.message : String(err)],
      };
    }
  }
}
