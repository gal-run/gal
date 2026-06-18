import { For } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { GOVERNANCE_TIPS, parseTip } from "../governance/copy"

export function Tips() {
  const theme = useTheme().theme
  const parts = parseTip(GOVERNANCE_TIPS[Math.floor(Math.random() * GOVERNANCE_TIPS.length)])

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.accent }}>
        signal{" "}
      </text>
      <text flexShrink={1}>
        <For each={parts}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}
