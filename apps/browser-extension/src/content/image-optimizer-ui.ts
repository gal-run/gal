import { getGalShadowRoot } from "./shadow-host";

export function showOptimizeToast(
  result: {
    originalSizeBytes: number
    optimizedSizeBytes: number
    optimizedDimensions: { width: number; height: number }
  },
  onUndo: () => void,
): () => void {
  const root = getGalShadowRoot()
  const toast = document.createElement('div')
  toast.id = 'gal-optimize-toast'

  const originalMB = (result.originalSizeBytes / 1024 / 1024).toFixed(1)
  const optimizedMB = (result.optimizedSizeBytes / 1024 / 1024).toFixed(1)
  const { width, height } = result.optimizedDimensions

  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: #1e293b;
    color: #f1f5f9;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 12px 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    line-height: 1.5;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    max-width: 320px;
    animation: galSlideIn 200ms cubic-bezier(0.34,1.56,0.64,1);
    pointer-events: auto;
  `

  // Inject keyframe animation into shadow DOM (not document.head)
  if (!root.querySelector('#gal-optimize-keyframes')) {
    const style = document.createElement('style')
    style.id = 'gal-optimize-keyframes'
    style.textContent = `
      @keyframes galSlideIn { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }
    `
    root.appendChild(style)
  }

  toast.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <div style="color:#22c55e;font-size:16px;line-height:1">✓</div>
      <div style="flex:1">
        <div style="font-weight:600;color:#f1f5f9">Image optimized</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px">${originalMB}MB → ${optimizedMB}MB · ${width}×${height}px JPG</div>
      </div>
      <button id="gal-undo-optimize" style="color:#60a5fa;font-size:12px;background:none;border:none;cursor:pointer;padding:0;white-space:nowrap">Undo</button>
    </div>
  `

  root.appendChild(toast)

  const undoBtn = toast.querySelector('#gal-undo-optimize') as HTMLButtonElement
  undoBtn.addEventListener('click', () => {
    onUndo()
    toast.remove()
  })

  // Auto-dismiss after 5s
  const timer = setTimeout(() => toast.remove(), 5000)
  return () => {
    clearTimeout(timer)
    toast.remove()
  }
}
