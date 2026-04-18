/** @jsxImportSource @opentui/solid */
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
  TuiThemeCurrent,
} from "@opencode-ai/plugin/tui"
import type {
  Part,
  ToolPart,
  ToolState,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  Message,
} from "@opencode-ai/sdk/v2"
import { createMemo, createEffect, createSignal, For, Show, onCleanup } from "solid-js"

const PLUGIN_ID = "pepper-dashboard"
const SIDEBAR_ORDER = 350
const TICK_MS = 1_000
const TIMEOUT_WARN_PCT = 75
const TIMEOUT_CRITICAL_PCT = 90
const DEFAULT_TIMEOUT_MS = 120_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedTask {
  partId: string
  callId: string
  description: string
  agent: string
  status: "pending" | "running" | "completed" | "error"
  startedAt: number | null
  endedAt: number | null
  background: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m ${String(sec).padStart(2, "0")}s`
}

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width)
  const empty = width - filled
  return "\u2588".repeat(filled) + "\u2591".repeat(empty)
}

function extractTaskInfo(state: ToolState): {
  description: string
  agent: string
  background: boolean
} {
  const input = state.input || {}
  return {
    description:
      (input.description as string) ||
      (input.prompt as string)?.slice(0, 40) ||
      "task",
    agent: (input.subagent_type as string) || (input.category as string) || "build",
    background: (input.run_in_background as boolean) ?? false,
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case "pending":
      return "\u25CB"
    case "running":
      return "\u25CE"
    case "completed":
      return "\u2713"
    case "error":
      return "\u2717"
    default:
      return "?"
  }
}

// ---------------------------------------------------------------------------
// Extract tasks from session messages
// ---------------------------------------------------------------------------

function extractTasks(
  messages: ReadonlyArray<Message>,
  getParts: (messageId: string) => ReadonlyArray<Part>,
): TrackedTask[] {
  const tasks: TrackedTask[] = []

  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    const parts = getParts(msg.id)

    for (const part of parts) {
      if (part.type !== "tool") continue
      const tp = part as ToolPart
      if (tp.tool !== "task") continue

      const info = extractTaskInfo(tp.state)
      const startedAt =
        tp.state.status === "running"
          ? (tp.state as ToolStateRunning).time.start
          : tp.state.status === "completed"
            ? (tp.state as ToolStateCompleted).time.start
            : tp.state.status === "error"
              ? (tp.state as ToolStateError).time.start
              : null

      const endedAt =
        tp.state.status === "completed"
          ? (tp.state as ToolStateCompleted).time.end
          : tp.state.status === "error"
            ? (tp.state as ToolStateError).time.end
            : null

      tasks.push({
        partId: tp.id,
        callId: tp.callID,
        description: info.description,
        agent: info.agent,
        status: tp.state.status,
        startedAt,
        endedAt,
        background: info.background,
      })
    }
  }

  return tasks
}

// ---------------------------------------------------------------------------
// Sidebar View Component
// ---------------------------------------------------------------------------

function TaskDashboard(props: { api: TuiPluginApi; session_id: string }) {
  const [open, setOpen] = createSignal(true)
  const [now, setNow] = createSignal(Date.now())
  const theme = () => props.api.theme.current

  const timer = setInterval(() => setNow(Date.now()), TICK_MS)
  onCleanup(() => clearInterval(timer))

  const tasks = createMemo(() => {
    const msgs = props.api.state.session.messages(props.session_id)
    return extractTasks(msgs, (id) => props.api.state.part(id))
  })

  const running = createMemo(() => tasks().filter((t) => t.status === "running"))
  const completed = createMemo(() => tasks().filter((t) => t.status === "completed"))
  const errored = createMemo(() => tasks().filter((t) => t.status === "error"))
  const total = createMemo(() => tasks().length)
  const hasAny = createMemo(() => total() > 0)

  const toastFired = new Set<string>()

  createEffect(() => {
    const currentNow = now()
    for (const task of running()) {
      if (!task.startedAt) continue
      const elapsed = currentNow - task.startedAt
      const pct = (elapsed / DEFAULT_TIMEOUT_MS) * 100
      const key = `${task.partId}-${pct >= TIMEOUT_CRITICAL_PCT ? "critical" : "warn"}`

      if (pct >= TIMEOUT_CRITICAL_PCT && !toastFired.has(key)) {
        toastFired.add(key)
        props.api.ui.toast({
          variant: "error",
          title: `${task.agent} near timeout`,
          message: `"${task.description}" at ${Math.round(pct)}% — ${formatElapsed(elapsed)}`,
          duration: 5000,
        })
      } else if (pct >= TIMEOUT_WARN_PCT && !toastFired.has(key)) {
        toastFired.add(key)
        props.api.ui.toast({
          variant: "warning",
          title: `${task.agent} approaching timeout`,
          message: `"${task.description}" at ${Math.round(pct)}%`,
          duration: 4000,
        })
      }
    }
  })

  return (
    <box>
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() => setOpen((x) => !x)}
      >
        <Show when={total() > 2}>
          <text fg={theme().text}>{open() ? "\u25BC" : "\u25B6"}</text>
        </Show>
        <text fg={theme().text}>
          <b>Tasks</b>
        </text>
        <text fg={theme().textMuted}>
          {running().length > 0
            ? `${running().length} running`
            : hasAny()
              ? `${completed().length + errored().length} done`
              : "idle"}
          {errored().length > 0 ? ` \u00B7 ${errored().length} failed` : ""}
        </text>
      </box>

      <Show when={hasAny()} fallback={
        <text fg={theme().textMuted}>  No subagent tasks yet</text>
      }>
        <Show when={total() <= 2 || open()}>
          <For each={tasks()}>
            {(task) => (
              <TaskRow
                task={task}
                now={now()}
                theme={theme()}
              />
            )}
          </For>
        </Show>
      </Show>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Individual Task Row
// ---------------------------------------------------------------------------

function TaskRow(props: {
  task: TrackedTask
  now: number
  theme: TuiThemeCurrent
}) {
  const elapsed = () => {
    if (!props.task.startedAt) return 0
    const end = props.task.endedAt || props.now
    return end - props.task.startedAt
  }

  const pct = () => {
    if (props.task.status !== "running" || !props.task.startedAt) return null
    return Math.min(100, (elapsed() / DEFAULT_TIMEOUT_MS) * 100)
  }

  const fg = () => {
    const p = pct()
    if (props.task.status === "completed") return props.theme.success
    if (props.task.status === "error") return props.theme.error
    if (p !== null && p >= TIMEOUT_CRITICAL_PCT) return props.theme.error
    if (p !== null && p >= TIMEOUT_WARN_PCT) return props.theme.warning
    return props.theme.textMuted
  }

  return (
    <box>
      <box flexDirection="row" gap={1}>
        <text fg={fg()}>{statusIcon(props.task.status)}</text>
        <text fg={props.theme.text} wrapMode="none">
          {props.task.agent}
        </text>
        <text fg={props.theme.textMuted} wrapMode="none">
          {props.task.description.length > 22
            ? props.task.description.slice(0, 22) + "\u2026"
            : props.task.description}
        </text>
      </box>
      <Show when={props.task.status === "running" && pct() !== null}>
        <box flexDirection="row" gap={1}>
          <text fg={fg()}>
            {"  " + progressBar(pct()!, 16)}
          </text>
          <text fg={props.theme.textMuted}>
            {Math.round(pct()!)}%
          </text>
          <text fg={props.theme.textMuted}>
            {formatElapsed(elapsed())}
          </text>
        </box>
      </Show>
      <Show
        when={
          (props.task.status === "completed" || props.task.status === "error") &&
          props.task.startedAt
        }
      >
        <text fg={props.theme.textMuted}>
          {"  " + formatElapsed(elapsed())}
        </text>
      </Show>
    </box>
  )
}

// ---------------------------------------------------------------------------
// Activity Feed (Full-Page Route)
// ---------------------------------------------------------------------------

interface ActivityEntry {
  time: number
  agent: string
  tool: string
  status: string
  message: string
}

function extractActivity(
  messages: ReadonlyArray<Message>,
  getParts: (messageId: string) => ReadonlyArray<Part>,
): ActivityEntry[] {
  const entries: ActivityEntry[] = []

  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    const parts = getParts(msg.id)

    for (const part of parts) {
      if (part.type !== "tool") continue
      const tp = part as ToolPart
      const input = tp.state.input || {}

      let time = 0
      if (tp.state.status === "running")
        time = (tp.state as ToolStateRunning).time.start
      else if (tp.state.status === "completed")
        time = (tp.state as ToolStateCompleted).time.start
      else if (tp.state.status === "error")
        time = (tp.state as ToolStateError).time.start

      const desc =
        (input.description as string) ||
        (input.filePath as string) ||
        (input.command as string)?.slice(0, 40) ||
        (input.pattern as string) ||
        tp.tool

      entries.push({
        time,
        agent: (input.subagent_type as string) || "",
        tool: tp.tool,
        status: tp.state.status,
        message: desc,
      })
    }
  }

  return entries.sort((a, b) => a.time - b.time)
}

function ActivityFeed(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [now, setNow] = createSignal(Date.now())

  const timer = setInterval(() => setNow(Date.now()), TICK_MS)
  onCleanup(() => clearInterval(timer))

  const entries = createMemo(() => {
    const msgs = props.api.state.session.messages(props.session_id)
    return extractActivity(msgs, (id) => props.api.state.part(id))
  })

  const tasks = createMemo(() => {
    const msgs = props.api.state.session.messages(props.session_id)
    return extractTasks(msgs, (id) => props.api.state.part(id))
  })

  const stats = createMemo(() => {
    const t = tasks()
    const completed = t.filter((x) => x.status === "completed").length
    const failed = t.filter((x) => x.status === "error").length
    const running = t.filter((x) => x.status === "running").length
    const totalTime = t.reduce((sum, x) => {
      if (!x.startedAt) return sum
      const end = x.endedAt || now()
      return sum + (end - x.startedAt)
    }, 0)
    const avgTime = t.length > 0 ? totalTime / t.length : 0
    return { total: t.length, completed, failed, running, avgTime }
  })

  const fmtTime = (ts: number) =>
    ts > 0
      ? new Date(ts).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      : ""

  const statusColor = (s: string) => {
    if (s === "completed") return theme().success
    if (s === "error") return theme().error
    if (s === "running") return theme().warning
    return theme().textMuted
  }

  return (
    <box>
      <box flexDirection="row" gap={2}>
        <text fg={theme().text}>
          <b>Activity Feed</b>
        </text>
        <text fg={theme().textMuted}>
          {stats().total} tools
          {stats().completed > 0 ? ` \u00B7 ${stats().completed} done` : ""}
          {stats().failed > 0 ? ` \u00B7 ${stats().failed} failed` : ""}
          {stats().running > 0 ? ` \u00B7 ${stats().running} running` : ""}
        </text>
      </box>

      <Show when={stats().total > 0}>
        <box flexDirection="row" gap={2}>
          <text fg={theme().textMuted}>
            Avg: {formatElapsed(stats().avgTime)}
          </text>
        </box>
      </Show>

      <text fg={theme().border}>{"\u2500".repeat(60)}</text>

      <For each={entries()}>
        {(entry) => (
          <box flexDirection="row" gap={1}>
            <text fg={theme().textMuted}>{fmtTime(entry.time)}</text>
            <text fg={statusColor(entry.status)}>
              {statusIcon(entry.status)}
            </text>
            <Show when={entry.agent}>
              <text fg={theme().accent}>[{entry.agent}]</text>
            </Show>
            <text fg={theme().text} wrapMode="none">
              {entry.tool}
            </text>
            <text fg={theme().textMuted} wrapMode="none">
              {truncateStr(entry.message, 40)}
            </text>
          </box>
        )}
      </For>

      <Show when={entries().length === 0}>
        <text fg={theme().textMuted}>No activity yet</text>
      </Show>
    </box>
  )
}

function truncateStr(s: string, len: number): string {
  if (!s) return ""
  return s.length > len ? s.slice(0, len) + "\u2026" : s
}

// ---------------------------------------------------------------------------
// Plugin Entry
// ---------------------------------------------------------------------------

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: SIDEBAR_ORDER,
    slots: {
      sidebar_content(_ctx, props) {
        return <TaskDashboard api={api} session_id={props.session_id} />
      },
    },
  })

  api.route.register([
    {
      name: "activity",
      render: (input) => (
        <ActivityFeed
          api={api}
          session_id={(input.params?.sessionID as string) || ""}
        />
      ),
    },
  ])

  api.command.register(() => [
    {
      title: "Activity Feed",
      value: "activity-feed",
      description: "View all tool calls and task activity",
      category: "Dashboard",
      keybind: "ctrl+shift+a",
      onSelect: () => {
        const current = api.route.current
        if (current.name === "session") {
          api.route.navigate("activity", {
            sessionID: current.params.sessionID,
          })
        }
      },
    },
  ])
}

export default { id: PLUGIN_ID, tui } satisfies TuiPluginModule
