import { addons, types } from "storybook/manager-api"
import { ThemeTool } from "./theme-tool"

addons.register("gal-code/theme-toggle", () => {
  addons.add("gal-code/theme-toggle/tool", {
    type: types.TOOL,
    title: "Theme",
    match: ({ viewMode }) => viewMode === "story" || viewMode === "docs",
    render: ThemeTool,
  })
})
