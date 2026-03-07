# OpenClaw sessions_spawn + Cursor ACP flow

## OpenClaw spawn path (runtime=acp)

1. **sessions_spawn tool** (`src/agents/tools/sessions-spawn-tool.ts`)
   - User/agent calls `sessions_spawn` with `runtime: "acp"`, `agentId: "cursor"`, `cwd`, `task`, etc.
   - Tool calls `spawnAcpDirect(params, context)`.

2. **acp-spawn** (`src/agents/acp-spawn.ts`)
   - Resolves target agent (e.g. `agentId: "cursor"`), spawn mode, policy.
   - Builds `sessionKey` = `agent:cursor:acp:<uuid>`.
   - When `targetAgentId === "cursor"`, uses backend **cursor-acp** (so no need to set `acp.backend` globally).
   - Calls gateway `sessions.patch` to create session slot, then `acpManager.initializeSession({ cfg, sessionKey, agent: "cursor", mode, cwd, backendId: "cursor-acp" })`.

3. **ACP session manager** (`src/acp/control-plane/manager.core.ts`)
   - `initializeSession()` → `requireRuntimeBackend("cursor-acp")` → gets cursor-acp plugin’s runtime.
   - Calls `runtime.ensureSession({ sessionKey, agent: "cursor", mode, cwd })` (no `env` passed from manager).

4. **Cursor ACP runtime** (`extensions/cursor-acp/src/runtime.ts`)
   - `ensureSession()`:
     - Resolves `cwd` (from input or plugin config).
     - If no existing session for `sessionKey`, spawns: `agent acp` (when `trustWorkspace` false) or `agent --trust --workspace <cwd> acp` (when true), stdio pipe.
     - Sends JSON-RPC in order: **initialize** → **authenticate** (cursor_login) → **session/new** (params: `{ cwd, mcpServers: [] }`). Same as run-acp-task / official minimal; handles **session/request_permission** while waiting for each response.
     - Expects `session/new` result to contain `sessionId` (or equivalent); if missing, throws and includes Cursor stderr in the error.
   - On success, stores handle and returns it; manager persists ACP meta and continues (e.g. dispatch first task via `agent` method).

## Cursor agent (CLI) side

- **Binary**: Cursor CLI (`agent`), subcommand `acp`.
- **Flags we pass**: `--trust` (trust workspace without prompting, headless), `--workspace <cwd>` (workspace directory).
- **Protocol**: Newline-delimited JSON-RPC over stdio; client sends requests, Cursor responds. Order we use: initialize → authenticate → session/new.
- **session/new**: We send `{ cwd, mcpServers: [] }`. Cursor may send `session/request_permission` (e.g. workspace trust) before replying; we must respond with an outcome or it never returns. When it does respond, we expect `result.sessionId` (or equivalent). If Cursor returns `result: {}`, the plugin throws and surfaces Cursor stderr for debugging.

## Common failure: session/new returns `{}`

- **Cause**: Cursor CLI did not create a session (e.g. workspace not trusted despite `--trust`, or Cursor bug/version difference).
- **What we do**: We capture stderr from the `agent acp` process and append the last lines to the error message so the user can see what Cursor printed.
- **User checks**: (1) Run `agent login` in the same env (or set `CURSOR_AUTH_TOKEN` / config `env.HOME`). (2) Open the workspace in Cursor IDE and trust it once. (3) Run the **probe script** (see below) to see Cursor’s raw JSON-RPC and stderr. (4) Ensure Cursor CLI is up to date.

### Probe script (see exactly what Cursor returns)

From the repo root, run the same init/auth/session-new sequence and print every stdout/stderr line:

```bash
pnpm exec tsx extensions/cursor-acp/scripts/probe-acp.ts /home/notrickno/桌面/openfoam
```

To try **session/new first** (then authenticate, initialize):  
`pnpm exec tsx extensions/cursor-acp/scripts/probe-acp.ts --session-first /path/to/cwd`.

Or with node: `node --import tsx extensions/cursor-acp/scripts/probe-acp.ts [--session-first] <cwd>`.  
Requires `agent login` (or `CURSOR_AUTH_TOKEN`) and Cursor CLI on PATH. Check the `--- session/new result ---` and `--- stderr lines ---` output.

### 官方 Minimal Node.js client（验证 session/prompt 是否被响应）

Cursor 文档里的最小示例：<https://cursor.com/docs/cli/acp> → 章节 “Minimal Node.js client”。  
仓库内可运行副本（与文档一致，仅增加可传 cwd 参数）：

```bash
# 在要作为 workspace 的目录下跑（用当前目录作 cwd）
cd /home/notrickno/桌面/openfoam
node extensions/cursor-acp/scripts/acp-minimal-client.mjs

# 或从任意目录指定 cwd
node extensions/cursor-acp/scripts/acp-minimal-client.mjs /home/notrickno/桌面/openfoam
```

脚本会：initialize → authenticate → session/new → session/prompt（"Say hello in one sentence."），然后打印 `[stopReason=...]`。  
若能看到流式输出和 stopReason，说明 Cursor 在你本机对 session/prompt 有响应；若卡住或无输出，说明与 run-acp-task 同属环境/headless 问题。  
**注意**：`pnpm exec` 必须在 **openclaw 仓库根目录** 执行（当前目录要在 repo 里），workspace 路径作为参数传入即可，无需先 `cd` 到 workspace。

---

## 名词：headless

**headless** 这里指：**没有打开 Cursor 桌面 IDE 的界面、只通过命令行起 `agent acp` 进程** 的用法。  
实测有人在外置终端（没在 Cursor 里打开）跑 `agent` 也能收到回复，说明 **headless 本身可以工作**。若 run-acp-task 收不到回复，更可能是**脚本的 spawn 参数或调用顺序**与官方 minimal client 不一致，见下节「与官方 Minimal client 的差异」。

---

## OpenClaw 通过 ACP 调用 Cursor：问题总结

### 已解决（run-acp-task 基于官方 minimal）

**run-acp-task** 已改为在官方 Minimal Node.js client 的代码与流程上扩展（同一套 readline + Promise、顺序 initialize → authenticate → session/new → session/prompt，默认 `agent acp` + `process.chdir(cwd)`）。  
实测 **smoke**（`--smoke`）与 **完整任务**（如 `skills/openfoam-pimplefoam/任务提示词.md`）均运行成功。  
若需与插件一致的 spawn，可加 `--trust`（`agent --trust --workspace <cwd> acp`）；部分环境下该模式可能无 session/prompt 回复，以默认无 `--trust` 为准。

### 结论（先答你的两个问题）

- **理论上是否可行？** **可行。** Cursor 官方文档与 ACP 协议都支持：客户端对 `agent acp` 发 `session/prompt`，agent 通过 stdout 回传 `session/update`（流式）和最终的 result（含 `stopReason`）。OpenClaw 的调用顺序（session/new → authenticate → initialize → session/prompt）与 Cursor 文档中的 Minimal Node.js client 一致，协议与集成方式在理论上是正确的。
- **是你这边解决不了的技术问题，还是设计上就不行？** **是当前环境/运行方式下的技术问题，不是“设计上就不行”。** 现象是：在你本机用脚本跑 `agent --trust --workspace <cwd> acp` 时，**session/prompt 之后 Cursor agent 没有向 stdout 写任何数据**（0 行、0 字节），因此拿不到回复。问题出在「Cursor agent 在此种 headless 运行方式下不响应 session/prompt」，而不是 OpenClaw 或 ACP 协议本身不可行。

### 已确认的现象

| 步骤                                       | 结果                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| 启动 `agent --trust --workspace <cwd> acp` | 成功                                                 |
| session/new                                | 成功，拿到 sessionId                                 |
| authenticate (cursor_login)                | 成功                                                 |
| initialize                                 | 成功                                                 |
| **session/prompt**（含短句 "Say hello."）  | **无任何 stdout 输出**（0 行、0 字节），随后循环结束 |

即：建会话、鉴权、初始化都正常，**只有 session/prompt 之后 agent 不往 stdout 写任何内容**。

### 与官方 Minimal client 的差异（若 minimal 能收到回复而 run-acp-task 不能）

| 项目       | 官方 minimal (acp-minimal-client.mjs)                        | run-acp-task / 插件                                          |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| spawn 参数 | `agent acp`，**无** `--trust` `--workspace`                  | `agent --trust --workspace <cwd> acp`                        |
| stderr     | `inherit`（直接打终端）                                      | `pipe`（脚本自己读）                                         |
| 调用顺序   | **initialize → authenticate → session/new → session/prompt** | **session/new → authenticate → initialize → session/prompt** |

若你在外置终端跑官方 minimal（或直接跑 `agent`）能收到回复，而 run-acp-task 不能，可先试：用与 minimal 相同的顺序和 spawn（去掉 `--trust --workspace`，stderr 用 `inherit`），或给 run-acp-task 加 `--no-trust` 用 minimal 同款 spawn，看是否恢复 session/prompt 响应。

### 可能原因（技术/环境侧）

1. **`--trust --workspace` 导致分支不同**  
   带这两个参数时 Cursor 可能走“已信任 workspace”路径，若该路径有 bug 或未正确写 stdout，会表现为 session/prompt 无回复。
2. **调用顺序**  
   官方示例是 initialize → authenticate → session/new → session/prompt；插件为兼容 session/new 先返回 sessionId 用了 session/new 优先。个别版本可能对顺序敏感。
3. **认证/网络/配额**  
   session/new 能返回 sessionId 说明登录可用，但执行任务（模型调用）可能走另一路径，若限流、配额或网络异常，也可能表现为不写 stdout。
4. **Cursor CLI 版本/实现差异**  
   文档与实测行为可能因版本或实现细节不一致。

### 建议你做的排查（判断能否在你这边解决）

1. **在 Cursor IDE 里打开该 workspace 并 Trust**  
   用 Cursor 打开 `--workspace` 指向的目录，若出现 Trust 提示则点 Trust。然后再用同一 cwd 跑 `run-acp-task.ts --smoke`，看是否出现 `[stdout]` 行。
2. **看 stderr**  
   脚本在「0 行 stdout」时会打印 agent 的 stderr 汇总。若有报错、登录失败、或“需要 IDE”之类提示，可据此判断是否为环境/配置问题。
3. **用官方最小示例验证**  
   在 [Cursor ACP 文档](https://cursor.com/docs/cli/acp) 的 Minimal Node.js client 里，把 `session/prompt` 的 text 改成 "Say hello."，在同一台机、同一环境下运行。若官方示例能收到回复而 OpenClaw 脚本不能，则缩小到我们脚本与官方示例的差异（例如顺序、参数）；若官方示例也收不到，则基本可认定是 Cursor 在本机/本环境下的行为问题。
4. **升级 / 重装 Cursor CLI**  
   确认 `agent --version` 与文档一致，必要时升级或重装，排除版本 bug。

### 总结表

| 问题                                           | 答案                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenClaw 通过 ACP 调用 Cursor 理论上是否可行？ | **可行**，协议与流程设计没问题。                                                                                                                                      |
| 当前“无回复”是理论不可行还是技术问题？         | **技术/环境问题**：Cursor agent 在 session/prompt 后未向 stdout 写数据。                                                                                              |
| 能否在你这边解决？                             | **有可能**。先按上面 4 步排查；若 IDE Trust + 同机官方示例仍无响应，则更可能是 Cursor 对 headless 或该环境的限制，需从 Cursor 侧（配置、版本、反馈给 Cursor）继续查。 |
