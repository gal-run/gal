// Injected into pages by the service worker via chrome.scripting.executeScript.
// Each injected function is self-contained — no imports needed.

interface LabeledElement {
 index: number;
 tag: string;
 type?: string;
 text: string;
 placeholder?: string;
 value?: string;
 href?: string;
 name?: string;
 id?: string;
 rect: { x: number; y: number; w: number; h: number };
 visible: boolean;
 disabled: boolean;
 // Enhanced metadata (browser-use algorithms)
 has_js_listener: boolean;
 is_in_viewport: boolean;
 computed_role?: string;
 computed_name?: string;
 in_shadow_dom: boolean;
 in_iframe: boolean;
}

interface ElementMap {
 elements: LabeledElement[];
}

interface WindowWithGal extends Window {
 __galBrowserUseElementMap?: LabeledElement[];
 __galBrowserUseLabelOverlayId?: string;
}

export function getInteractiveElements(): ElementMap {
 // NOTE: This function is serialized via Function.prototype.toString and
 // re-parsed in the page context by chrome.scripting.executeScript, so it
 // must be fully SELF-CONTAINED. All helpers it depends on
 // (hasJsListener, isInViewport, getComputedAx, collectInteractiveElements)
 // are inlined below as nested function declarations so the serialized
 // source references nothing from module scope.
 const win = window as WindowWithGal;
 const results: LabeledElement[] = [];
 const seen = new Set<Element>();

 /** Check if an element has inline or likely JS event listeners. */
 function hasJsListener(el: Element): boolean {
 const htmlEl = el as HTMLElement;
 if (
 htmlEl.onclick != null ||
 htmlEl.onmousedown != null ||
 htmlEl.onmouseup != null ||
 htmlEl.onkeydown != null ||
 htmlEl.onkeyup != null ||
 htmlEl.onfocus != null ||
 htmlEl.onblur != null ||
 htmlEl.onchange != null ||
 htmlEl.onsubmit != null
 ) {
 return true;
 }
 if (
 el.hasAttribute("onclick") ||
 el.hasAttribute("onmousedown") ||
 el.hasAttribute("onmouseup") ||
 el.hasAttribute("onkeydown") ||
 el.hasAttribute("onkeyup") ||
 el.hasAttribute("onfocus") ||
 el.hasAttribute("onblur") ||
 el.hasAttribute("onchange") ||
 el.hasAttribute("onsubmit")
 ) {
 return true;
 }
 // Heuristic: elements with cursor:pointer and no explicit interactive role
 // are often made interactive via JS event delegation on a parent.
 // We only flag the element itself if it has pointer cursor.
 try {
 const style = getComputedStyle(el);
 if (style.cursor === "pointer") {
 return true;
 }
 } catch {
 // ignore
 }
 return false;
 }

 /** Determine whether an element's bounding rect is within the viewport + threshold. */
 function isInViewport(rect: DOMRect, threshold = 1000): boolean {
 const vw = window.innerWidth;
 const vh = window.innerHeight;
 const scrollX = window.scrollX;
 const scrollY = window.scrollY;
 return (
 rect.bottom >= -threshold + scrollY &&
 rect.top <= vh + threshold + scrollY &&
 rect.right >= -threshold + scrollX &&
 rect.left <= vw + threshold + scrollX
 );
 }

 /** Try to get computed role / name from Chrome's experimental AX APIs. */
 function getComputedAx(el: Element): { role?: string; name?: string } {
 try {
 const anyEl = el as unknown as Record<string, unknown>;
 const role =
 typeof anyEl.computedRole === "string"
 ? (anyEl.computedRole as string)
 : undefined;
 const name =
 typeof anyEl.computedName === "string"
 ? (anyEl.computedName as string)
 : undefined;
 return { role, name };
 } catch {
 return {};
 }
 }

 /** Recursively collect interactive elements from a root document/shadow root. */
 function collectInteractiveElements(
 root: Document | ShadowRoot,
 results: LabeledElement[],
 seen: Set<Element>,
 inShadow: boolean,
 inIframe: boolean,
 ): number {
 let index = results.length;

 const interactiveSelectors = [
 "a[href]",
 "button",
 'input:not([type="hidden"])',
 "textarea",
 "select",
 "summary",
 '[role="button"]',
 '[role="link"]',
 '[role="checkbox"]',
 '[role="radio"]',
 '[role="combobox"]',
 '[role="listbox"]',
 '[role="menuitem"]',
 '[role="option"]',
 '[role="switch"]',
 '[role="tab"]',
 '[role="textbox"]',
 '[role="searchbox"]',
 '[tabindex]:not([tabindex="-1"])',
 "[onclick]",
 '[contenteditable="true"]',
 ];

 for (const selector of interactiveSelectors) {
 try {
 const nodes = root.querySelectorAll(selector);
 for (const el of nodes) {
 if (seen.has(el)) continue;
 seen.add(el);

 const rect = el.getBoundingClientRect();
 const style = getComputedStyle(el);
 const visible =
 rect.width > 0 &&
 rect.height > 0 &&
 style.display !== "none" &&
 style.visibility !== "hidden" &&
 style.opacity !== "0";

 const tag = el.tagName.toLowerCase();
 const htmlEl = el as HTMLElement;
 const inputEl = el as HTMLInputElement;
 const anchorEl = el as HTMLAnchorElement;

 const jsListener = hasJsListener(el);
 const ax = getComputedAx(el);
 const roleAttr = el.getAttribute("role") || "";

 index++;
 const labeled: LabeledElement = {
 index,
 tag,
 text: (htmlEl.innerText || htmlEl.textContent || "")
.trim()
.slice(0, 200),
 rect: {
 x: Math.round(rect.x),
 y: Math.round(rect.y),
 w: Math.round(rect.width),
 h: Math.round(rect.height),
 },
 visible,
 disabled:
 (htmlEl as HTMLButtonElement).disabled === true ||
 htmlEl.getAttribute("aria-disabled") === "true",
 has_js_listener: jsListener,
 is_in_viewport: isInViewport(rect),
 computed_role: ax.role || roleAttr || undefined,
 computed_name: ax.name || undefined,
 in_shadow_dom: inShadow,
 in_iframe: inIframe,
 };

 if (tag === "input" || tag === "textarea") {
 labeled.type = inputEl.type || tag;
 labeled.placeholder = inputEl.placeholder || "";
 labeled.value = inputEl.value?.slice(0, 100) || "";
 labeled.name = inputEl.name || "";
 }

 if (anchorEl.href && tag === "a") {
 labeled.href = anchorEl.href;
 }

 if (htmlEl.id) labeled.id = htmlEl.id;

 results.push(labeled);

 // Recurse into open shadow roots
 if ((el as HTMLElement).shadowRoot) {
 const shadow = (el as HTMLElement).shadowRoot!;
 index = collectInteractiveElements(
 shadow,
 results,
 seen,
 true,
 inIframe,
 );
 }
 }
 } catch {
 // ignore malformed selectors or cross-origin issues
 }
 }

 // Also scan elements that have JS listeners but were NOT matched by selectors
 try {
 const allNodes = root.querySelectorAll("*");
 for (const el of allNodes) {
 if (seen.has(el)) continue;
 if (!hasJsListener(el)) continue;
 seen.add(el);

 const rect = el.getBoundingClientRect();
 const style = getComputedStyle(el);
 const visible =
 rect.width > 0 &&
 rect.height > 0 &&
 style.display !== "none" &&
 style.visibility !== "hidden" &&
 style.opacity !== "0";

 const tag = el.tagName.toLowerCase();
 const htmlEl = el as HTMLElement;
 const ax = getComputedAx(el);

 index++;
 const labeled: LabeledElement = {
 index,
 tag,
 text: (htmlEl.innerText || htmlEl.textContent || "").trim().slice(0, 200),
 rect: {
 x: Math.round(rect.x),
 y: Math.round(rect.y),
 w: Math.round(rect.width),
 h: Math.round(rect.height),
 },
 visible,
 disabled: htmlEl.getAttribute("aria-disabled") === "true",
 has_js_listener: true,
 is_in_viewport: isInViewport(rect),
 computed_role: ax.role || undefined,
 computed_name: ax.name || undefined,
 in_shadow_dom: inShadow,
 in_iframe: inIframe,
 };

 if (htmlEl.id) labeled.id = htmlEl.id;
 results.push(labeled);

 if ((el as HTMLElement).shadowRoot) {
 const shadow = (el as HTMLElement).shadowRoot!;
 index = collectInteractiveElements(
 shadow,
 results,
 seen,
 true,
 inIframe,
 );
 }
 }
 } catch {
 // ignore
 }

 return index;
 }

 // Start from the top-level document
 collectInteractiveElements(document, results, seen, false, false);

 // Traverse same-origin iframes
 try {
 const iframes = document.querySelectorAll("iframe");
 for (const iframe of iframes) {
 try {
 const doc = iframe.contentDocument;
 if (!doc) continue;
 collectInteractiveElements(doc, results, seen, false, true);
 } catch {
 // cross-origin iframe — skip silently
 }
 }
 } catch {
 // ignore
 }

 win.__galBrowserUseElementMap = results;
 return { elements: results };
}

export function showLabels(elements?: LabeledElement[]): { labeled: number } {
 // NOTE: This function is serialized via Function.prototype.toString and
 // re-parsed in the page context by chrome.scripting.executeScript, so it
 // must be fully SELF-CONTAINED. The module-scope helper it depends on
 // (removeLabels) is inlined below as a nested function declaration so the
 // serialized source references nothing from module scope.
 const win = window as WindowWithGal;
 const elems = elements || win.__galBrowserUseElementMap || [];

 /** Remove any existing label overlay container. */
 function removeLabels(): void {
 const win = window as WindowWithGal;
 const existing = win.__galBrowserUseLabelOverlayId
 ? document.getElementById(win.__galBrowserUseLabelOverlayId)
 : document.getElementById("gal-browser-use-label-container");
 if (existing) existing.remove();
 win.__galBrowserUseLabelOverlayId = undefined;
 }

 removeLabels();

 const container = document.createElement("gal-browser-use-labels");
 container.id = "gal-browser-use-label-container";
 Object.assign(container.style, {
 position: "fixed",
 top: "0",
 left: "0",
 width: "0",
 height: "0",
 zIndex: "2147483646",
 pointerEvents: "none",
 } as CSSStyleDeclaration);

 for (const el of elems) {
 if (!el.visible || el.disabled) continue;
 const badge = document.createElement("div");
 badge.textContent = String(el.index);
 Object.assign(badge.style, {
 position: "fixed",
 left: `${el.rect.x + el.rect.w - 8}px`,
 top: `${el.rect.y - 10}px`,
 background: "#ff6600",
 color: "#fff",
 fontSize: "10px",
 fontWeight: "700",
 padding: "1px 5px",
 borderRadius: "10px",
 lineHeight: "16px",
 minWidth: "16px",
 textAlign: "center",
 zIndex: "2147483646",
 fontFamily: "system-ui, sans-serif",
 });
 container.appendChild(badge);
 }

 document.body.appendChild(container);
 win.__galBrowserUseLabelOverlayId = container.id;

 return { labeled: elems.length };
}

export function clickElement(index: number): {
 success: boolean;
 index: number;
} {
 const elems = (window as WindowWithGal).__galBrowserUseElementMap || [];
 const target = elems.find((e) => e.index === index);
 if (!target || !target.visible || target.disabled) {
 return { success: false, index };
 }

 // Find the element by position since DOM may have changed
 const el = document.elementFromPoint(target.rect.x + target.rect.w / 2,
 target.rect.y + target.rect.h / 2,);
 if (el && (el as HTMLElement).click) {
 (el as HTMLElement).click();
 return { success: true, index };
 }

 return { success: false, index };
}

export function typeIntoElement(index: number,
 text: string,
 clear = false,): { success: boolean; index: number } {
 const elems = (window as WindowWithGal).__galBrowserUseElementMap || [];
 const target = elems.find((e) => e.index === index);
 if (!target || !target.visible || target.disabled) {
 return { success: false, index };
 }

 const el = document.elementFromPoint(target.rect.x + target.rect.w / 2,
 target.rect.y + target.rect.h / 2,) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;

 if (!el) return { success: false, index };

 if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
 el.focus();
 if (clear) el.value = "";
 el.value += text;
 el.dispatchEvent(new Event("input", { bubbles: true }));
 el.dispatchEvent(new Event("change", { bubbles: true }));
 return { success: true, index };
 }

 if (el.isContentEditable) {
 el.focus();
 if (clear) el.textContent = "";
 el.textContent += text;
 el.dispatchEvent(new Event("input", { bubbles: true }));
 return { success: true, index };
 }

 return { success: false, index };
}

export function scrollPage(amount: number): { scrolled: number } {
 const before = window.scrollY;
 window.scrollBy(0, amount);
 return { scrolled: window.scrollY - before };
}

export function removeLabels(): void {
 const win = window as WindowWithGal;
 const existing = win.__galBrowserUseLabelOverlayId
 ? document.getElementById(win.__galBrowserUseLabelOverlayId)
 : document.getElementById("gal-browser-use-label-container");
 if (existing) existing.remove();
 win.__galBrowserUseLabelOverlayId = undefined;
}
