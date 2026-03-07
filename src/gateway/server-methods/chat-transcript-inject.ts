import { SessionManager } from "@mariozechner/pi-coding-agent";

type AppendMessageArg = Parameters<SessionManager["appendMessage"]>[0];

export type GatewayInjectedAbortMeta = {
  aborted: true;
  origin: "rpc" | "stop-command";
  runId: string;
};

export type GatewayInjectedTranscriptAppendResult = {
  ok: boolean;
  messageId?: string;
  message?: Record<string, unknown>;
  error?: string;
};

export function appendInjectedAssistantMessageToTranscript(params: {
  transcriptPath: string;
  message: string;
  label?: string;
  idempotencyKey?: string;
  abortMeta?: GatewayInjectedAbortMeta;
  now?: number;
}): GatewayInjectedTranscriptAppendResult {
  const now = params.now ?? Date.now();
  const labelPrefix = params.label ? `[${params.label}]\n\n` : "";
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
  const messageBody: AppendMessageArg & Record<string, unknown> = {
    role: "assistant",
    content: [{ type: "text", text: `${labelPrefix}${params.message}` }],
    timestamp: now,
    // Pi stopReason is a strict enum; this is not model output, but we still store it as a
    // normal assistant message so it participates in the session parentId chain.
    stopReason: "stop",
    usage,
    // Make these explicit so downstream tooling never treats this as model output.
    api: "openai-responses",
    provider: "openclaw",
    model: "gateway-injected",
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    ...(params.abortMeta
      ? {
          openclawAbort: {
            aborted: true,
            origin: params.abortMeta.origin,
            runId: params.abortMeta.runId,
          },
        }
      : {}),
  };

  try {
    // IMPORTANT: Use SessionManager so the entry is attached to the current leaf via parentId.
    // Raw jsonl appends break the parent chain and can hide compaction summaries from context.
    const sessionManager = SessionManager.open(params.transcriptPath);
    const messageId = sessionManager.appendMessage(messageBody);
    return { ok: true, messageId, message: messageBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Append a user message to a session transcript (e.g. prompt sent to ACP so the
 * ACP session chat.history shows the dialogue).
 */
export function appendUserMessageToTranscript(params: {
  transcriptPath: string;
  message: string;
  idempotencyKey?: string;
  now?: number;
}): GatewayInjectedTranscriptAppendResult {
  const now = params.now ?? Date.now();
  const messageBody: AppendMessageArg & Record<string, unknown> = {
    role: "user",
    content: [{ type: "text", text: params.message }],
    timestamp: now,
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
  };

  try {
    const sessionManager = SessionManager.open(params.transcriptPath);
    const messageId = sessionManager.appendMessage(messageBody);
    return { ok: true, messageId, message: messageBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Append an assistant message attributed to a subagent (e.g. Cursor ACP) so the UI
 * can show it with the subagent's avatar. Stores __openclaw.sourceSessionKey on the message.
 */
export function appendSubagentResultToTranscript(params: {
  transcriptPath: string;
  message: string;
  sourceSessionKey: string;
  idempotencyKey?: string;
  now?: number;
}): GatewayInjectedTranscriptAppendResult {
  const now = params.now ?? Date.now();
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
  const messageBody: AppendMessageArg & Record<string, unknown> = {
    role: "assistant",
    content: [{ type: "text", text: params.message }],
    timestamp: now,
    stopReason: "stop",
    usage,
    api: "openai-responses",
    provider: "openclaw",
    model: "gateway-subagent-result",
    __openclaw: { sourceSessionKey: params.sourceSessionKey.trim() },
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
  };

  try {
    const sessionManager = SessionManager.open(params.transcriptPath);
    const messageId = sessionManager.appendMessage(messageBody);
    return { ok: true, messageId, message: messageBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
