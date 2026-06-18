import z from "zod"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Tool } from "./tool"
import TurndownService from "turndown"
import DESCRIPTION from "./webfetch.txt"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const TRUNCATED_PREVIEW_SIZE = 100 * 1024 // 100KB preview when truncated
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

const parameters = z.object({
  url: z.string().describe("The URL to fetch content from"),
  format: z
    .enum(["text", "markdown", "html"])
    .default("markdown")
    .describe("The format to return the content in (text, markdown, or html). Defaults to markdown."),
  timeout: z.number().describe("Optional timeout in seconds (max 120)").optional(),
  fullOutput: z.boolean().describe("Return full output without truncation (may use significant context)").optional(),
})

export const WebFetchTool = Tool.define(
  "webfetch",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(http)

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
            throw new Error("URL must start with http:// or https://")
          }

          yield* ctx.ask({
            permission: "webfetch",
            patterns: [params.url],
            always: ["*"],
            metadata: {
              url: params.url,
              format: params.format,
              timeout: params.timeout,
            },
          })

          const timeout = Math.min((params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT)

          // Build Accept header based on requested format with q parameters for fallbacks
          let acceptHeader = "*/*"
          switch (params.format) {
            case "markdown":
              acceptHeader = "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
              break
            case "text":
              acceptHeader = "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
              break
            case "html":
              acceptHeader =
                "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
              break
            default:
              acceptHeader =
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
          }
          const headers = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: acceptHeader,
            "Accept-Language": "en-US,en;q=0.9",
          }

          const request = HttpClientRequest.get(params.url).pipe(HttpClientRequest.setHeaders(headers))

          // Retry with honest UA if blocked by Cloudflare bot detection (TLS fingerprint mismatch)
          const response = yield* httpOk.execute(request).pipe(
            Effect.catchIf(
              (err) =>
                err.reason._tag === "StatusCodeError" &&
                err.reason.response.status === 403 &&
                err.reason.response.headers["cf-mitigated"] === "challenge",
              () =>
                httpOk.execute(
                  HttpClientRequest.get(params.url).pipe(
                    HttpClientRequest.setHeaders({ ...headers, "User-Agent": "gal-code" }),
                  ),
                ),
            ),
            Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.die(new Error("Request timed out")) }),
          )

          // Check content length
          const contentLength = response.headers["content-length"]
          const expectedSize = contentLength ? parseInt(contentLength) : null

          const arrayBuffer = yield* response.arrayBuffer
          const totalSize = arrayBuffer.byteLength
          const isOversized = totalSize > MAX_RESPONSE_SIZE
          const contentType = response.headers["content-type"] || ""
          const title = `${params.url} (${contentType})`
          const metadata = params.fullOutput === true ? { truncated: false } : {}

          if (isOversized && params.fullOutput !== true) {
            const previewBuffer = arrayBuffer.slice(0, TRUNCATED_PREVIEW_SIZE)
            const previewContent = new TextDecoder().decode(previewBuffer)
            const truncatedBytes = totalSize - TRUNCATED_PREVIEW_SIZE

            return {
              title,
              output: `${previewContent}\n\n... [Response truncated: ${truncatedBytes} bytes omitted. Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB. Use fullOutput: true to fetch without truncation.]`,
              metadata: {
                truncated: true,
                totalSize,
                truncatedBytes,
                previewSize: TRUNCATED_PREVIEW_SIZE,
              },
            }
          }

          const mime = contentType.split(";")[0]?.trim().toLowerCase() || ""

          // Check if response is an image
          const isImage = mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet"

          if (isImage) {
            const base64Content = Buffer.from(arrayBuffer).toString("base64")
            return {
              title,
              output: "Image fetched successfully",
              metadata,
              attachments: [
                {
                  type: "file" as const,
                  mime,
                  url: `data:${mime};base64,${base64Content}`,
                },
              ],
            }
          }

          const content = new TextDecoder().decode(arrayBuffer)

          // Handle content based on requested format and actual content type
          switch (params.format) {
            case "markdown":
              if (contentType.includes("text/html")) {
                const markdown = convertHTMLToMarkdown(content)
                return {
                  output: markdown,
                  title,
                  metadata,
                }
              }
              return { output: content, title, metadata }

            case "text":
              if (contentType.includes("text/html")) {
                const text = yield* Effect.promise(() => extractTextFromHTML(content))
                return { output: text, title, metadata }
              }
              return { output: content, title, metadata }

            case "html":
              return { output: content, title, metadata }

            default:
              return { output: content, title, metadata }
          }
        }).pipe(Effect.orDie),
    }
  }),
)

async function extractTextFromHTML(html: string) {
  let text = ""
  let skipContent = false

  const rewriter = new HTMLRewriter()
    .on("script, style, noscript, iframe, object, embed", {
      element() {
        skipContent = true
      },
      text() {
        // Skip text content inside these elements
      },
    })
    .on("*", {
      element(element) {
        // Reset skip flag when entering other elements
        if (!["script", "style", "noscript", "iframe", "object", "embed"].includes(element.tagName)) {
          skipContent = false
        }
      },
      text(input) {
        if (!skipContent) {
          text += input.text
        }
      },
    })
    .transform(new Response(html))

  await rewriter.text()
  return text.trim()
}

function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndownService.remove(["script", "style", "meta", "link"])
  return turndownService.turndown(html)
}
