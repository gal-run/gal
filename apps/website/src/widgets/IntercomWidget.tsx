/**
 * @fileoverview Intercom Widget - Third-party chat integration
 * @module widgets/IntercomWidget
 *
 * Widgets Layer (Third-party Integrations)
 * -----------------------------------------
 * This module handles the Intercom chat widget integration. It loads
 * the Intercom script and configures it with GAL branding.
 *
 * Architecture Notes:
 * - Widgets are isolated from core application logic
 * - Configuration comes from config/ module
 * - Effect runs once on mount to initialize
 *
 * Third-party Script Loading:
 * - Uses IIFE pattern from Intercom documentation
 * - Handles both SSR and client-side rendering
 * - Attaches to window.Intercom for global access
 *
 * @see https://developers.intercom.com/installing-intercom/docs/basic-javascript
 */

import { useEffect } from "react";
import { INTERCOM_APP_ID, INTERCOM_API_BASE } from "../config";

// ============================================================================
// Type Declarations
// ============================================================================

/**
 * Extend Window interface for Intercom globals.
 */
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

// ============================================================================
// Component
// ============================================================================

/**
 * IntercomWidget initializes the Intercom chat widget.
 *
 * This component renders nothing (returns null) but runs a side effect
 * on mount to:
 * 1. Configure Intercom settings with GAL branding
 * 2. Load the Intercom script asynchronously
 * 3. Initialize the widget
 *
 * Branding:
 * - Black launcher button (matches GAL brand)
 * - Black accent color for links/buttons
 *
 * @returns null - This component has no visual output
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <div>
 *       <IntercomWidget />
 *       <Header />
 *       <main>...</main>
 *     </div>
 *   );
 * }
 * ```
 */
export function IntercomWidget(): null {
  useEffect(() => {
    // -------------------------------------------------------------------------
    // Validate Configuration
    // -------------------------------------------------------------------------

    if (!INTERCOM_APP_ID) {
      console.warn("[Intercom] APP_ID not configured - widget disabled");
      return;
    }

    // -------------------------------------------------------------------------
    // Configure Intercom Settings
    // -------------------------------------------------------------------------

    window.intercomSettings = {
      api_base: INTERCOM_API_BASE,
      app_id: INTERCOM_APP_ID,
      action_color: "#000000", // Black accent for buttons/links (GAL branding)
      background_color: "#000000", // Black launcher (GAL branding)
    };

    // -------------------------------------------------------------------------
    // Load Intercom Script (IIFE from Intercom docs)
    // -------------------------------------------------------------------------

    (function initIntercom() {
      const w = window as Window & { Intercom?: unknown };
      const ic = w.Intercom;

      if (typeof ic === "function") {
        // Intercom already loaded - reattach and update
        (ic as (...args: unknown[]) => void)("reattach_activator");
        (ic as (...args: unknown[]) => void)("update", w.intercomSettings);
      } else {
        // Create Intercom stub
        const d = document;
        const i = function intercomStub(...args: unknown[]) {
          (i as unknown as { c: (...args: unknown[]) => void }).c(args);
        };
        (i as unknown as { q: unknown[]; c: (...args: unknown[]) => void }).q =
          [];
        (i as unknown as { q: unknown[]; c: (...args: unknown[]) => void }).c =
          function (args: unknown) {
            (i as unknown as { q: unknown[] }).q.push(args);
          };
        w.Intercom = i;

        // Load script function
        const loadScript = () => {
          const s = d.createElement("script");
          s.type = "text/javascript";
          s.async = true;
          s.src = `https://widget.intercom.io/widget/${INTERCOM_APP_ID}`;
          const x = d.getElementsByTagName("script")[0];
          x.parentNode?.insertBefore(s, x);
        };

        // Load when document is ready
        if (document.readyState === "complete") {
          loadScript();
        } else if ("attachEvent" in window) {
          // Legacy IE support
          (
            window as unknown as {
              attachEvent: (event: string, cb: () => void) => void;
            }
          ).attachEvent("onload", loadScript);
        } else {
          window.addEventListener("load", loadScript, false);
        }
      }
    })();
  }, []);

  // Widget renders nothing - it's a side-effect only component
  return null;
}
