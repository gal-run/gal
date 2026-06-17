export interface OptimizeOptions {
 maxDimension: number // default 2048
 quality: number // default 0.85
 thresholdBytes: number // default 5 * 1024 * 1024 (5MB)
}

export interface OptimizeResult {
 file: File
 originalSizeBytes: number
 optimizedSizeBytes: number
 originalDimensions: { width: number; height: number }
 optimizedDimensions: { width: number; height: number }
}

export const DEFAULT_OPTIMIZE_OPTIONS: OptimizeOptions = {
 maxDimension: 2048,
 quality: 0.85,
 thresholdBytes: 5 * 1024 * 1024,
}

function calculateDimensions(width: number,
 height: number,
 maxDimension: number,): { width: number; height: number } {
 if (width <= maxDimension && height <= maxDimension) {
 return { width, height }
 }
 if (width >= height) {
 return { width: maxDimension, height: Math.round((height * maxDimension) / width) }
 }
 return { width: Math.round((width * maxDimension) / height), height: maxDimension }
}

export async function optimizeImage(file: File,
 options: OptimizeOptions = DEFAULT_OPTIMIZE_OPTIONS,): Promise<OptimizeResult | null> {
 // Only PNG/JPG/WEBP images above threshold
 if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return null
 if (file.size < options.thresholdBytes) return null

 return new Promise((resolve) => {
 const img = new Image()
 const url = URL.createObjectURL(file)
 img.onload = () => {
 URL.revokeObjectURL(url)
 const originalDimensions = { width: img.width, height: img.height }
 const optimizedDimensions = calculateDimensions(img.width, img.height, options.maxDimension)

 const canvas = document.createElement('canvas')
 canvas.width = optimizedDimensions.width
 canvas.height = optimizedDimensions.height
 const ctx = canvas.getContext('2d')!
 ctx.drawImage(img, 0, 0, optimizedDimensions.width, optimizedDimensions.height)

 canvas.toBlob((blob) => {
 if (!blob) {
 resolve(null)
 return
 }
 const outputName = file.name.replace(/\.(png|webp)$/i, '.jpg')
 const optimizedFile = new File([blob], outputName, { type: 'image/jpeg' })
 resolve({
 file: optimizedFile,
 originalSizeBytes: file.size,
 optimizedSizeBytes: optimizedFile.size,
 originalDimensions,
 optimizedDimensions,
 })
 },
 'image/jpeg',
 options.quality,)
 }
 img.onerror = () => {
 URL.revokeObjectURL(url)
 resolve(null)
 }
 img.src = url
 })
}
