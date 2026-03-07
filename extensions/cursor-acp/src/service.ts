import type {
  AcpRuntime,
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginLogger,
} from "openclaw/plugin-sdk/acpx";
import { registerAcpRuntimeBackend, unregisterAcpRuntimeBackend } from "openclaw/plugin-sdk/acpx";
import { resolveCursorAcpConfig, type ResolvedCursorAcpConfig } from "./config.js";
import { CURSOR_ACP_BACKEND_ID, CursorAcpRuntime } from "./runtime.js";

type CursorAcpRuntimeLike = AcpRuntime & {
  isHealthy(): boolean;
  probeAvailability(): Promise<void>;
};

export function createCursorAcpRuntimeService(params: {
  pluginConfig?: unknown;
  runtimeFactory?: (config: ResolvedCursorAcpConfig, logger?: PluginLogger) => CursorAcpRuntimeLike;
}): OpenClawPluginService {
  let runtime: CursorAcpRuntimeLike | null = null;

  return {
    id: "cursor-acp-runtime",
    async start(ctx: OpenClawPluginServiceContext): Promise<void> {
      const config = resolveCursorAcpConfig({
        rawConfig: params.pluginConfig,
        workspaceDir: ctx.workspaceDir,
      });
      const factory = params.runtimeFactory ?? ((c, l) => new CursorAcpRuntime(c, l));
      runtime = factory(config, ctx.logger);

      registerAcpRuntimeBackend({
        id: CURSOR_ACP_BACKEND_ID,
        runtime,
        healthy: () => runtime?.isHealthy() ?? false,
      });

      ctx.logger.info(
        `cursor-acp runtime backend registered (command: ${config.command}, cwd: ${config.cwd})`,
      );

      void runtime.probeAvailability().then(() => {
        if (runtime?.isHealthy()) {
          ctx.logger.info("cursor-acp runtime backend ready");
        } else {
          ctx.logger.warn("cursor-acp probe failed; ensure Cursor CLI is installed (agent acp)");
        }
      });
    },
    async stop(_ctx: OpenClawPluginServiceContext): Promise<void> {
      unregisterAcpRuntimeBackend(CURSOR_ACP_BACKEND_ID);
      runtime = null;
    },
  };
}
