import { Context } from "effect"
import type { InstanceContext } from "@/project/instance"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~gal-code/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<string | undefined>("~gal-code/WorkspaceRef", {
  defaultValue: () => undefined,
})
