import { describe, expect, it } from "vitest";
import {
 getActiveDesignProjectProgress,
 parseActiveDesignProject,
} from "../src/popup/active-design-project";

describe("active design project helpers", () => {
 it("parses the stored active project summary and ignores invalid JSON", () => {
 expect(parseActiveDesignProject(JSON.stringify({
 id: "proj-1",
 name: "Spring Campaign",
 type: "story",
 totalScenes: 4,
 completedScenes: 1,
 }),),).toEqual({
 id: "proj-1",
 name: "Spring Campaign",
 type: "story",
 totalScenes: 4,
 completedScenes: 1,
 });

 expect(parseActiveDesignProject("not-json")).toBeNull();
 expect(parseActiveDesignProject(null)).toBeNull();
 });

 it("reports stable progress percentages for creative-mode project status surfaces", () => {
 expect(getActiveDesignProjectProgress({
 id: "proj-1",
 name: "Launch Assets",
 type: "image-video",
 totalScenes: 5,
 completedScenes: 2,
 }),).toBe(40);

 expect(getActiveDesignProjectProgress({
 id: "proj-2",
 name: "Empty Project",
 type: "image-only",
 totalScenes: 0,
 completedScenes: 0,
 }),).toBe(0);
 });
});
