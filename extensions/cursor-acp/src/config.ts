import path from "node:path";

const DEFAULT_COMMAND = "agent";
const DEFAULT_PERMISSION = "allow-once";

export type CursorAcpPluginConfig = {
  command?: string;
  cwd?: string;
  permissionOutcome?: "allow-once" | "allow-always" | "reject-once";
  /** Pass Cursor CLI `--trust` so the workspace is trusted without prompting (headless). Default true so session/new returns sessionId. Set false to rely on Cursor-side trust only. */
  trustWorkspace?: boolean;
  /** Optional env vars for the spawned `agent acp` process. Use to set HOME so Cursor finds login (e.g. when gateway runs with a different env). */
  env?: Record<string, string>;
};

export type ResolvedCursorAcpConfig = {
  command: string;
  cwd: string;
  permissionOutcome: "allow-once" | "allow-always" | "reject-once";
  trustWorkspace: boolean;
  env: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveCursorAcpConfig(params: {
  rawConfig: unknown;
  workspaceDir?: string;
}): ResolvedCursorAcpConfig {
  const raw = params.rawConfig;
  const fallbackCwd = params.workspaceDir?.trim() || process.cwd();
  let command = DEFAULT_COMMAND;
  let cwd = fallbackCwd;
  let permissionOutcome = DEFAULT_PERMISSION as ResolvedCursorAcpConfig["permissionOutcome"];
  let trustWorkspace = true;
  let env: Record<string, string> = {};

  if (isRecord(raw)) {
    if (typeof raw.command === "string" && raw.command.trim()) {
      command = raw.command.trim();
    }
    if (typeof raw.cwd === "string" && raw.cwd.trim()) {
      cwd = path.resolve(raw.cwd.trim());
    }
    if (
      raw.permissionOutcome === "allow-once" ||
      raw.permissionOutcome === "allow-always" ||
      raw.permissionOutcome === "reject-once"
    ) {
      permissionOutcome = raw.permissionOutcome;
    }
    if (typeof raw.trustWorkspace === "boolean") {
      trustWorkspace = raw.trustWorkspace;
    }
    if (isRecord(raw.env)) {
      for (const [k, v] of Object.entries(raw.env)) {
        if (typeof v === "string") env[k] = v;
      }
    }
  }

  return {
    command,
    cwd: path.resolve(cwd),
    permissionOutcome,
    trustWorkspace,
    env,
  };
}
