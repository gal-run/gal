/**
 * Shadow DOM Host for GAL Chrome Extension
 *
 * Creates an isolated Shadow DOM container so that all GAL UI (palette,
 * toasts, backdrop) renders inside it. This prevents GAL's CSS (Tailwind
 * reset, :root variables, body styles, scrollbar overrides) from leaking
 * into host web pages.
 *
 * Other modules (generation-guardian, image-optimizer-ui, asset-clipboard)
 * should call `getGalShadowRoot()` to obtain the shadow root and inject
 * their styles / DOM elements there instead of `document.head` /
 * `document.body`.
 */

// Create the host element — a neutral <div> appended to document.body
const galShadowHost = document.createElement("div");
galShadowHost.id = "gal-shadow-host";
// The host itself must be invisible / non-interfering with page layout
galShadowHost.style.cssText =
  "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;";
document.body.appendChild(galShadowHost);

// Attach a Shadow DOM (open so DevTools inspection still works)
const galShadowRoot = galShadowHost.attachShadow({ mode: "open" });

/**
 * Return the GAL shadow root. All GAL UI elements and <style> tags
 * should be appended here instead of document.head / document.body.
 */
export function getGalShadowRoot(): ShadowRoot {
  return galShadowRoot;
}

/**
 * Return the GAL shadow host element.
 */
export function getGalShadowHost(): HTMLElement {
  return galShadowHost;
}
