import fs from "fs"
import path from "path"

const ENTERPRISE_WORKSPACE_SENTINEL = "AGENTS.md"
const ENTERPRISE_WORKSPACE_MARKER = "Scheduler Systems LTD Workspace"

function enterprise(dir: string) {
  const file = path.join(dir, ENTERPRISE_WORKSPACE_SENTINEL)
  if (!fs.existsSync(file)) return false
  return fs.readFileSync(file, "utf8").includes(ENTERPRISE_WORKSPACE_MARKER)
}

function normalizeStart(start?: string) {
  if (!start) return
  const resolved = path.resolve(start)
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved)
  } catch {
    return path.dirname(resolved)
  }
}

export function findEnterpriseWorkspaceRoot(start?: string) {
  let current = normalizeStart(start)
  if (!current) return

  while (true) {
    if (enterprise(current)) return current
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}
