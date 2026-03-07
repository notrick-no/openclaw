import type { AcpRuntimeEvent, AcpSessionUpdateTag } from "openclaw/plugin-sdk/acpx";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | undefined {
  const s = asTrimmedString(value);
  return s || undefined;
}

/**
 * Parse a single JSON-RPC line from Cursor's stdout into AcpRuntimeEvent.
 * Cursor sends session/update notifications with params.update.sessionUpdate and params.update.content.
 */
export function parseCursorAcpLine(line: string): AcpRuntimeEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.method !== "session/update") return null;
  const params = parsed.params;
  if (!isRecord(params) || !isRecord(params.update)) return null;
  const update = params.update as Record<string, unknown>;
  const tag = asOptionalString(update.sessionUpdate) as AcpSessionUpdateTag | undefined;
  if (!tag) return null;

  if (tag === "agent_message_chunk" || tag === "agent_thought_chunk") {
    const content = update.content;
    const text = isRecord(content) ? asString(content.text) : asString(update.text);
    if (text && text.length > 0) {
      return {
        type: "text_delta",
        text,
        stream: tag === "agent_thought_chunk" ? "thought" : "output",
        tag,
      };
    }
    return null;
  }

  if (tag === "tool_call" || tag === "tool_call_update") {
    const title = asTrimmedString(update.title) || "tool call";
    const status = asTrimmedString(update.status);
    const toolCallId = asOptionalString(update.toolCallId);
    return {
      type: "tool_call",
      text: status ? `${title} (${status})` : title,
      tag,
      ...(toolCallId ? { toolCallId } : {}),
      ...(status ? { status } : {}),
      title,
    };
  }

  if (tag === "usage_update") {
    const used = typeof update.used === "number" ? update.used : undefined;
    const size = typeof update.size === "number" ? update.size : undefined;
    const text = used != null && size != null ? `usage: ${used}/${size}` : "usage updated";
    return {
      type: "status",
      text,
      tag,
      ...(used != null ? { used } : {}),
      ...(size != null ? { size } : {}),
    };
  }

  const statusText =
    tag === "current_mode_update"
      ? asTrimmedString(update.currentModeId) || asTrimmedString(update.modeId) || "mode updated"
      : tag === "session_info_update"
        ? asTrimmedString(update.summary) || "session updated"
        : tag;
  return { type: "status", text: statusText, tag };
}
