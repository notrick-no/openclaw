import type { OpenClawPluginApi } from "openclaw/plugin-sdk/acpx";
import { createCursorAcpRuntimeService } from "./src/service.js";

const plugin = {
  id: "cursor-acp",
  name: "Cursor ACP",
  description:
    'ACP runtime backend for Cursor CLI (agent acp). Use backend "cursor-acp" and agent "cursor".',
  register(api: OpenClawPluginApi) {
    api.registerService(
      createCursorAcpRuntimeService({
        pluginConfig: api.pluginConfig,
      }),
    );
  },
};

export default plugin;
