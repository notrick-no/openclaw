---
name: cursor-cli
description: 'When the user wants Cursor IDE Agent to run a task, invoke Cursor CLI via exec: agent -p "task". Non-interactive; requires Cursor CLI (agent) on PATH.'
metadata:
  {
    "openclaw":
      {
        "emoji": "⌨️",
        "requires": { "anyBins": ["agent"] },
        "note": "Cursor CLI must be installed (https://cursor.com/docs/cli/overview). Use exec from workspace root.",
      },
  }
---

# Cursor Agent CLI (OpenClaw → Cursor)

Use this skill when the user asks OpenClaw to **run a task in Cursor** or **have Cursor Agent do something** (e.g. refactor code, fix bugs, add tests in the IDE). OpenClaw does not implement Cursor; it **calls the Cursor CLI** so that Cursor Agent runs the task and returns the result.

## When to use

- User says: "用 Cursor 做…" / "让 Cursor agent 帮我…" / "在 Cursor 里改…" / "run this in Cursor" / "have Cursor refactor…"
- User wants the **Cursor IDE Agent** to perform a coding task and get the output back in the chat.

## How to invoke Cursor CLI from OpenClaw

1. **Use the `exec` tool** (no dedicated Cursor tool in core). Run the Cursor CLI in **non-interactive** mode so it prints the response and exits.
2. **Command shape**: `agent -p "clear task description"` (or `agent --print "..."`).
   - `-p` / `--print`: non-interactive; Cursor prints the final response to stdout and exits. Required when called from OpenClaw.
3. **Working directory**: Run `exec` with `cwd` set to the **project/workspace root** the user cares about (e.g. repo root). Cursor uses the current directory as context.
4. **Optional flags** (add only when needed):
   - `--workspace <path>` — override working directory.
   - `--output-format json` — structured output for parsing (if the agent needs to parse).
   - `--mode ask` — ask-only (no edits) when the user only wants answers.
   - `--mode plan` — plan-only when the user wants a plan first.

## Important

- **No interactive mode**: Do not run `agent "..."` without `-p` when calling from OpenClaw; the process would wait for input. Always use `-p` (or `--print`).
- **Task text**: Pass a **single, clear** task description (one prompt). For complex multi-step work, either one combined prompt or multiple `exec` calls.
- **PATH**: The skill is gated on the `agent` binary. If the skill is not loaded, Cursor CLI is not on PATH — tell the user to install it: https://cursor.com/docs/cli/overview (e.g. `curl https://cursor.com/install -fsS | bash`).

## Example (exec call)

- **Task**: "Refactor the auth module to use JWT and add a test file."
- **exec** (from workspace root):
  - `command`: `agent -p "Refactor the auth module in this repo to use JWT tokens. Add a new test file for the auth helpers."`
  - `cwd`: workspace root (e.g. agent's workspace dir).

Result: Cursor Agent runs in non-interactive mode, edits files as needed, and prints the response; OpenClaw gets that output and can summarize or relay it to the user.

## ACP (persistent Cursor sessions)

OpenClaw can run Cursor as an **ACP harness** via the **cursor-acp** plugin. That gives persistent or one-shot ACP sessions (like Codex/Claude Code with acpx).

1. Install and enable the plugin: `openclaw plugins install ./extensions/cursor-acp`, then `plugins.entries.cursor-acp.enabled: true`.
2. Add `cursor` to `acp.allowedAgents` and use `backend: "cursor-acp"`, `agentId: "cursor"` when spawning or in bindings.
3. Use `sessions_spawn` with `runtime: "acp"`, `agentId: "cursor"`, `backend: "cursor-acp"` (and optional `cwd`).

See [ACP Agents](/tools/acp-agents) for Cursor ACP backend setup. For one-shot tasks without the plugin, use the **exec + agent -p** approach above.

## Enabling this skill

- **Workspace**: If your OpenClaw workspace is this repo, `skills/cursor-cli` is under `<workspace>/skills` and loads automatically when `agent` is on PATH.
- **Managed**: Copy or symlink `skills/cursor-cli` to `~/.openclaw/skills` to make it available for all agents.
- **Check**: `openclaw skills list` — `cursor-cli` should appear when Cursor CLI is installed.

## Why this is a Skill (not a Tool or ACP Agent)

- **Skill**: Teaches the model _when_ and _how_ to call Cursor (via existing `exec`). No new code; just instructions and gating on `agent` binary.
- **Tool**: A dedicated `cursor_agent` tool could wrap `agent -p "..."` with a schema (prompt, workspace, timeout). Optional; add via plugin if you want a first-class tool.
- **Agent (ACP)**: Cursor supports `agent acp` (ACP over stdio). Full integration would require an ACP backend (e.g. acpx) to support "cursor" as a harness for persistent sessions; today use exec for one-shot tasks.
