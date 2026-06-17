/**
 * @fileoverview Intercom chat widget utilities
 * @module lib/intercom
 */

// Intercom type declaration
declare global {
  interface Window {
    intercomSettings?: {
      api_base: string;
      app_id: string;
      custom_launcher_selector?: string;
      hide_default_launcher?: boolean;
      action_color?: string;
      background_color?: string;
    };
    Intercom?: unknown;
  }
}

/** Opens the Intercom chat widget if available */
export function openIntercom(): void {
  if (window.Intercom && typeof window.Intercom === "function") {
    (window.Intercom as (command: string) => void)("show");
  }
}
