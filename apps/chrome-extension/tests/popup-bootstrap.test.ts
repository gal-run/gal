import { beforeEach, describe, expect, it, vi } from "vitest";

const initSentry = vi.fn();
const render = vi.fn();
const createRoot = vi.fn(() => ({ render }));

vi.mock("../src/lib/sentry", () => ({
 initSentry,
}));

vi.mock("react-dom/client", () => ({
 createRoot,
}));

vi.mock("../src/popup/App", () => ({
 App: () => null,
}));

vi.mock("../src/components/ErrorBoundary", () => ({
 ErrorBoundary: ({ children }: { children: unknown }) => children,
}));

describe("bootstrapPopup", () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 it("initializes Sentry before rendering the popup app", async () => {
 const { bootstrapPopup } = await import("../src/popup/bootstrap");

 bootstrapPopup({} as HTMLElement);

 expect(initSentry).toHaveBeenCalledTimes(1);
 expect(createRoot).toHaveBeenCalledTimes(1);
 expect(render).toHaveBeenCalledTimes(1);
 expect(initSentry.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0],);
 });
});
