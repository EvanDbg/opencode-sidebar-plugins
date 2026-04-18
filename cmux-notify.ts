/**
 * CMUX Notification Plugin for OpenCode
 *
 * Maps OpenCode plugin events to the cmux-relay HookEvent protocol and sends
 * them to the relay daemon via Unix socket at /tmp/cmux-relay.sock.
 *
 * This is the OpenCode-native bridge.  Claude Code uses its own separate path
 * (settings.json hooks → cmux-relay-hook.sh → same socket).  Both paths feed
 * into the same relay state engine — no changes needed on the relay side.
 *
 * Event mapping (OpenCode → HookEvent):
 *   tool.execute.before   → PreToolUse   (heartbeat + progress bar)
 *   tool.execute.after    → Notification  (working status pill + sidebar log)
 *   permission.ask        → Notification  (permission_prompt — orange pill)
 *   session.idle           → Stop          (done pill + flash + notification)
 *   session.error          → SessionEnd    (error notification)
 *   session.deleted        → SessionEnd    (cleanup)
 *   session.compacted      → Notification  (info toast)
 *
 * v2: Rewritten to use async fetch instead of blocking execFileSync+curl.
 *     Socket existence is cached and rechecked periodically.
 */

import { existsSync } from "fs";
import type { Plugin } from "@opencode-ai/plugin";

const SOCKET_PATH = "/tmp/cmux-relay.sock";

// ---------------------------------------------------------------------------
// Socket availability cache — avoid existsSync on every event
// ---------------------------------------------------------------------------

let socketAvailable = false;
let lastSocketCheck = 0;
const SOCKET_CHECK_INTERVAL_MS = 5_000; // recheck every 5s

function isSocketAvailable(): boolean {
  const now = Date.now();
  if (now - lastSocketCheck > SOCKET_CHECK_INTERVAL_MS) {
    socketAvailable = existsSync(SOCKET_PATH);
    lastSocketCheck = now;
  }
  return socketAvailable;
}

// ---------------------------------------------------------------------------
// Build query string once per process (pid/ppid don't change)
// ---------------------------------------------------------------------------

const staticQs = new URLSearchParams({
  pid: String(process.pid),
  ppid: String(process.ppid),
  ...(process.env.CMUX_SURFACE_ID && {
    cmux_surface_id: process.env.CMUX_SURFACE_ID,
  }),
  ...(process.env.CMUX_WORKSPACE_ID && {
    cmux_workspace_id: process.env.CMUX_WORKSPACE_ID,
  }),
});

// ---------------------------------------------------------------------------
// Transport — async POST to cmux-relay's /hook endpoint via Unix socket
// ---------------------------------------------------------------------------

async function sendHookEvent(
  hookEventName: string,
  data: Record<string, any>,
): Promise<void> {
  if (!isSocketAvailable()) return;

  try {
    await fetch(`http://relay/hook?${staticQs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hook_event_name: hookEventName, ...data }),
      // @ts-expect-error — Bun supports `unix` option for Unix socket transport
      unix: SOCKET_PATH,
      signal: AbortSignal.timeout(1_500),
    });
  } catch {
    // Fire-and-forget — relay may be down and that's fine.
    // On failure, force a socket recheck next time.
    socketAvailable = false;
    lastSocketCheck = 0;
  }
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const CmuxNotify: Plugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: "cmux-notify",
      level: "info",
      message: "CMUX notification plugin loaded (v2 async)",
    },
  });

  return {
    // ----- Session lifecycle events ----------------------------------------
    event: async ({ event }) => {
      if (!event?.type) return;
      const props = event.properties || {};

      switch (event.type) {
        case "session.idle":
          await sendHookEvent("Stop", {
            session_id: props.sessionID || "",
          });
          break;

        case "session.error":
          await sendHookEvent("SessionEnd", {
            session_id: props.sessionID || "",
            reason: "error",
            message:
              props.error?.message || props.error?.type || "unknown error",
          });
          break;

        case "session.deleted":
          await sendHookEvent("SessionEnd", {
            session_id: props.info?.id || "",
            reason: "deleted",
          });
          break;

        case "session.compacted":
          await sendHookEvent("Notification", {
            session_id: props.sessionID || "",
            message: "session compacted",
          });
          break;
      }
    },

    // ----- Tool lifecycle --------------------------------------------------

    "tool.execute.before": async (input, output) => {
      await sendHookEvent("PreToolUse", {
        session_id: input.sessionID,
        tool_name: input.tool,
        tool_input: output?.args || {},
      });
    },

    "tool.execute.after": async (input, output) => {
      await sendHookEvent("Notification", {
        session_id: input.sessionID,
        tool_name: input.tool,
        tool_input: input.args || {},
        message: output?.title || `completed ${input.tool}`,
      });
    },

    // ----- Permission prompt -----------------------------------------------

    "permission.ask": async (input, output) => {
      // Only notify when the user actually needs to respond.
      // Auto-allowed / auto-denied permissions don't need a push notification.
      if (output?.status !== "ask") return;

      await sendHookEvent("Notification", {
        session_id: input.sessionID || "",
        notification_type: "permission_prompt",
        message: input.title || "Permission required",
        title: input.title || "Permission required",
      });
    },
  };
};
