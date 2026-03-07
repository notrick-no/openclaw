#!/usr/bin/env bun
/**
 * List Feishu user open_ids (for use as FEISHU_TARGET).
 *
 * 1) Tries Feishu API (contact.user.list) if app is configured — prints org users (open_id, name).
 * 2) Falls back to local pairing/allowFrom files under ~/.openclaw/credentials/.
 *
 * Run from repo root: node --import tsx scripts/dev/feishu-list-open-ids.ts
 * Or: bun scripts/dev/feishu-list-open-ids.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readLocalFeishuIds(): Promise<string[]> {
  const home =
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    process.env.OPENCLAW_HOME?.trim() ||
    process.env.HOME ||
    "";
  if (!home) {
    return [];
  }
  const credDir = path.join(home, ".openclaw", "credentials");
  const ids = new Set<string>();

  const files = ["feishu-allowFrom.json", "feishu-default-allowFrom.json", "feishu-pairing.json"];
  for (const name of files) {
    const p = path.join(credDir, name);
    try {
      const raw = await fs.readFile(p, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.allowFrom)) {
        for (const id of data.allowFrom) {
          const s = String(id).trim();
          if (s && s !== "*") {
            ids.add(s);
          }
        }
      }
      if (Array.isArray(data.requests)) {
        for (const r of data.requests) {
          if (r?.id) {
            ids.add(String(r.id).trim());
          }
        }
      }
    } catch {
      // ignore missing or invalid
    }
  }
  return [...ids];
}

async function main(): Promise<void> {
  console.log("Feishu open_id lookup\n");

  let fromApi = false;
  try {
    const { loadConfig } = await import("../../src/config/config.js");
    const cfg = loadConfig();
    const feishuCfg = (cfg?.channels as Record<string, unknown>)?.feishu as
      | { accounts?: Record<string, { appId?: string; appSecret?: string }> }
      | undefined;
    if (feishuCfg?.accounts && Object.keys(feishuCfg.accounts).length > 0) {
      const { listFeishuDirectoryPeersLive } =
        await import("../../extensions/feishu/src/directory.js");
      const users = await listFeishuDirectoryPeersLive({ cfg, limit: 200 });
      if (users.length > 0) {
        fromApi = true;
        console.log("From Feishu API (contact.user.list):");
        console.log("  open_id              name");
        console.log("  -------------------- -----");
        for (const u of users) {
          console.log(`  ${u.id.padEnd(20)} ${(u.name ?? "").slice(0, 40)}`);
        }
        console.log("");
      }
    }
  } catch (err) {
    console.error("API lookup failed:", err instanceof Error ? err.message : err);
    console.log("");
  }

  const localIds = await readLocalFeishuIds();
  if (localIds.length > 0) {
    console.log("From local credentials (pairing/allowFrom):");
    for (const id of localIds) {
      console.log("  ", id);
    }
    console.log("");
  }

  if (!fromApi && localIds.length === 0) {
    console.log("No open_ids found.");
    console.log("");
    console.log("Ways to get your open_id:");
    console.log("  1) Ensure gateway is running, DM the bot in Feishu, then run:");
    console.log("       openclaw logs --follow");
    console.log("     Look for 'pairing request sender=ou_xxx' or any ou_* id.");
    console.log("  2) Check pairing pending list (after sending a DM):");
    console.log("       openclaw pairing list feishu --json");
    console.log("     The 'id' field in each request is the open_id.");
    console.log("  3) Feishu Open Platform API debugger:");
    console.log("     https://open.feishu.cn/app — open your app → API debug → contact/v3/users");
    console.log("     or use 'Get user info' with your user_id/email to get open_id.");
  }

  console.log("");
  console.log(
    "Use as: FEISHU_TARGET=ou_xxx node --import tsx scripts/dev/feishu-send-file-smoke.ts ...",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
