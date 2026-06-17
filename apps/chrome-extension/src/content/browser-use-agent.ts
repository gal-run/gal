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
}

interface ElementMap {
 elements: LabeledElement[];
}

interface WindowWithGal extends Window {
 __galBrowserUseElementMap?: LabeledElement[];
 __galBrowserUseLabelOverlayId?: string;
}

export function getInteractiveElements(): ElementMap {
 const win = window as WindowWithGal;
 const results: LabeledElement[] = [];
 let index = 0;

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

 const seen = new Set<Element>();

 for (const selector of interactiveSelectors) {
 try {
 const nodes = document.querySelectorAll(selector);
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
 }
 } catch {}
 }

 win.__galBrowserUseElementMap = results;
 return { elements: results };
}

export function showLabels(elements?: LabeledElement[]): { labeled: number } {
 const win = window as WindowWithGal;
 const elems = elements || win.__galBrowserUseElementMap || [];
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
