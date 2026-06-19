import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { initSentry } from "../lib/sentry";
import { App } from "./App";

export function bootstrapPopup(rootElement: HTMLElement): void {
  initSentry();

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
