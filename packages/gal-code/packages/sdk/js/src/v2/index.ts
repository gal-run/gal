export * from "./client.js"
export * from "./server.js"

import { createGalCodeClient } from "./client.js"
import { createGalCodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createGalCode(options?: ServerOptions) {
  const server = await createGalCodeServer({
    ...options,
  })

  const client = createGalCodeClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
