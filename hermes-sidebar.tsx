/** @jsxImportSource @opentui/solid */
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, For, Show, onCleanup } from "solid-js"
import { Database } from "bun:sqlite"
import { homedir } from "os"
import { join } from "path"

const PLUGIN_ID = "hermes-sidebar"
const DB_PATH = join(homedir(), ".hermes", "state.db")
const HERMES_BIN = join(homedir(), ".local", "bin", "hermes")
const POLL_INTERVAL_MS = 10_000
const MAX_CONVERSATIONS = 5
const MAX_MESSAGES = 30
const PREVIEW_LEN = 35

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string
  source: string
  user_id: string | null
  title: string | null
  started_at: number
  message_count: number
  last_message_at: number
  last_preview: string | null
}

interface MessageRow {
  id: number
  role: string
  content: string | null
  timestamp: number
  tool_name: string | null
}

function openDb(): Database | null {
  try {
    return new Database(DB_PATH, { readonly: true })
  } catch {
    return null
  }
}

function queryConversations(limit: number): ConversationRow[] {
  const db = openDb()
  if (!db) return []
  try {
    const rows = db.query<ConversationRow, [number]>(`
      SELECT
        s.id,
        s.source,
        s.user_id,
        s.title,
        s.started_at,
        s.message_count,
        COALESCE(
          (SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id),
          s.started_at
        ) AS last_message_at,
        (SELECT m.content FROM messages m
         WHERE m.session_id = s.id AND m.role = 'user'
         ORDER BY m.timestamp DESC LIMIT 1
        ) AS last_preview
      FROM sessions s
      WHERE s.source NOT IN ('cron')
        AND s.message_count > 0
      ORDER BY last_message_at DESC
      LIMIT ?
    `).all(limit)
    return rows
  } catch {
    return []
  } finally {
    db.close()
  }
}

function queryMessages(sessionId: string, limit: number): MessageRow[] {
  const db = openDb()
  if (!db) return []
  try {
    return db.query<MessageRow, [string, number]>(`
      SELECT id, role, content, timestamp, tool_name
      FROM messages
      WHERE session_id = ?
        AND role IN ('user', 'assistant')
        AND content IS NOT NULL
        AND content != ''
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(sessionId, limit)
  } catch {
    return []
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts: number): string {
  const diff = (Date.now() / 1000) - ts
  if (diff < 60) return "now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function truncate(s: string | null, len: number): string {
  if (!s) return ""
  const clean = s.replace(/\n/g, " ").trim()
  return clean.length > len ? clean.slice(0, len) + "\u2026" : clean
}

function sourceIcon(source: string): string {
  switch (source) {
    case "telegram": return "\u2708"
    case "discord": return "\u2605"
    case "whatsapp": return "\u260E"
    case "slack": return "#"
    case "cli": return ">"
    default: return "\u2022"
  }
}

async function sendReply(target: string, message: string): Promise<boolean> {
  try {
    const proc = Bun.spawn([HERMES_BIN, "mcp", "serve"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    })

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "messages_send",
        arguments: { target, message },
      },
    })

    proc.stdin.write(request + "\n")
    proc.stdin.end()
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Sidebar Footer — Conversation Quick View
// ---------------------------------------------------------------------------

function HermesFooter(props: { api: TuiPluginApi }) {
  const [conversations, setConversations] = createSignal<ConversationRow[]>([])
  const [tick, setTick] = createSignal(0)
  const theme = () => props.api.theme.current

  const refresh = () => {
    setConversations(queryConversations(MAX_CONVERSATIONS))
    setTick((t) => t + 1)
  }

  refresh()
  const timer = setInterval(refresh, POLL_INTERVAL_MS)
  onCleanup(() => clearInterval(timer))

  const recentCount = createMemo(() => {
    const cutoff = Date.now() / 1000 - 3600
    return conversations().filter((c) => c.last_message_at > cutoff).length
  })

  return (
    <box>
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() =>
          props.api.route.navigate("hermes")
        }
      >
        <text fg={theme().accent}>
          <b>Hermes</b>
        </text>
        <text fg={theme().textMuted}>
          {conversations().length > 0
            ? recentCount() > 0
              ? `${recentCount()} active`
              : `${conversations().length} convos`
            : "no conversations"}
        </text>
      </box>

      <Show when={conversations().length > 0}>
        <For each={conversations().slice(0, 3)}>
          {(convo) => (
            <box flexDirection="row" gap={1} justifyContent="space-between">
              <text fg={theme().textMuted} wrapMode="none">
                {sourceIcon(convo.source)}{" "}
                {truncate(convo.title || convo.last_preview || convo.source, 28)}
              </text>
              <text fg={theme().textMuted} flexShrink={0}>
                {timeAgo(convo.last_message_at)}
              </text>
            </box>
          )}
        </For>
      </Show>

      <text fg={theme().textMuted}>
        {"\u25B8 Ctrl+H full view"}
      </text>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Full-Page Conversation View
// ---------------------------------------------------------------------------

function HermesFullView(props: { api: TuiPluginApi }) {
  const [conversations, setConversations] = createSignal<ConversationRow[]>([])
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<MessageRow[]>([])
  const theme = () => props.api.theme.current

  const refresh = () => setConversations(queryConversations(20))
  refresh()
  const timer = setInterval(refresh, POLL_INTERVAL_MS)
  onCleanup(() => clearInterval(timer))

  const loadMessages = (id: string) => {
    setSelectedId(id)
    setMessages(queryMessages(id, MAX_MESSAGES).reverse())
  }

  const openReplyDialog = () => {
    const convo = conversations().find((c) => c.id === selectedId())
    if (!convo) return

    props.api.ui.dialog.replace(() => (
      <props.api.ui.DialogPrompt
        title={`Reply to ${convo.title || convo.source}`}
        placeholder="Type your message..."
        onConfirm={async (value) => {
          if (!value.trim()) return
          const target = `${convo.source}:${convo.user_id || convo.id}`
          props.api.ui.dialog.clear()
          props.api.ui.toast({
            variant: "info",
            message: `Sending to ${convo.source}...`,
            duration: 2000,
          })
          const ok = await sendReply(target, value)
          props.api.ui.toast({
            variant: ok ? "success" : "error",
            message: ok ? "Sent!" : "Failed to send",
            duration: 3000,
          })
          if (ok) loadMessages(convo.id)
        }}
        onCancel={() => props.api.ui.dialog.clear()}
      />
    ))
  }

  return (
    <box flexDirection="row" gap={2}>
      <box width={30}>
        <text fg={theme().text}>
          <b>Conversations</b>
        </text>
        <For each={conversations()}>
          {(convo) => (
            <box
              onMouseDown={() => loadMessages(convo.id)}
            >
              <box flexDirection="row" gap={1}>
                <text
                  fg={
                    selectedId() === convo.id
                      ? theme().accent
                      : theme().textMuted
                  }
                >
                  {sourceIcon(convo.source)}
                </text>
                <text
                  fg={
                    selectedId() === convo.id
                      ? theme().text
                      : theme().textMuted
                  }
                  wrapMode="none"
                >
                  {truncate(convo.title || convo.source, 22)}
                </text>
              </box>
              <text fg={theme().textMuted}>
                {"  " + timeAgo(convo.last_message_at) + " \u00B7 " + convo.message_count + " msgs"}
              </text>
            </box>
          )}
        </For>
      </box>

      <box flexGrow={1}>
        <Show
          when={selectedId()}
          fallback={
            <text fg={theme().textMuted}>Select a conversation</text>
          }
        >
          <box flexDirection="row" gap={1} justifyContent="space-between">
            <text fg={theme().text}>
              <b>
                {conversations().find((c) => c.id === selectedId())?.title ||
                  selectedId()}
              </b>
            </text>
            <text
              fg={theme().accent}
              onMouseDown={openReplyDialog}
            >
              {"[Reply]"}
            </text>
          </box>

          <For each={messages()}>
            {(msg) => (
              <box>
                <box flexDirection="row" gap={1}>
                  <text
                    fg={
                      msg.role === "user"
                        ? theme().accent
                        : theme().success
                    }
                  >
                    {msg.role === "user" ? "\u25B6" : "\u25C0"}
                  </text>
                  <text fg={theme().textMuted}>
                    {new Date(msg.timestamp * 1000)
                      .toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                  </text>
                </box>
                <text fg={theme().text}>
                  {"  " + truncate(msg.content, 70)}
                </text>
              </box>
            )}
          </For>
        </Show>
      </box>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Plugin Entry
// ---------------------------------------------------------------------------

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 400,
    slots: {
      sidebar_content(_ctx, _props) {
        return <HermesFooter api={api} />
      },
    },
  })

  api.route.register([
    {
      name: "hermes",
      render: () => <HermesFullView api={api} />,
    },
  ])

  api.command.register(() => [
    {
      title: "Hermes Conversations",
      value: "hermes-open",
      description: "View Hermes conversations",
      category: "Hermes",
      keybind: "ctrl+h",
      onSelect: () => api.route.navigate("hermes"),
    },
    {
      title: "Delegate to Hermes",
      value: "hermes-delegate",
      description: "Send a task to Hermes for execution",
      category: "Hermes",
      onSelect: () => {
        api.ui.dialog.replace(() => (
          <api.ui.DialogPrompt
            title="Delegate Task to Hermes"
            placeholder="Describe the task for Hermes..."
            onConfirm={async (value) => {
              if (!value.trim()) return
              api.ui.dialog.clear()
              api.ui.toast({
                variant: "info",
                message: "Delegating to Hermes...",
                duration: 2000,
              })
              try {
                const proc = Bun.spawn(
                  [HERMES_BIN, "chat", "--yolo", "-m", value],
                  { stdout: "pipe", stderr: "pipe" },
                )
                await proc.exited
                api.ui.toast({
                  variant: "success",
                  message: "Task sent to Hermes",
                  duration: 3000,
                })
              } catch {
                api.ui.toast({
                  variant: "error",
                  message: "Failed to delegate task",
                  duration: 3000,
                })
              }
            }}
            onCancel={() => api.ui.dialog.clear()}
          />
        ))
      },
    },
    {
      title: "Back to Chat",
      value: "hermes-back",
      description: "Return to session",
      category: "Hermes",
      hidden: true,
      keybind: "escape",
      onSelect: () => {
        if (api.route.current.name === "hermes") {
          api.route.navigate("home")
        }
      },
    },
  ])
}

export default { id: PLUGIN_ID, tui } satisfies TuiPluginModule
