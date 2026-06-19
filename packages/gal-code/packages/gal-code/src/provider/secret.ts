import { GoogleAuth } from "google-auth-library"
import { Env } from "../env"

const SCOPE = "https://www.googleapis.com/auth/cloud-platform"
const API = "https://secretmanager.googleapis.com/v1"

type Auth = Pick<GoogleAuth, "getAccessToken">

function project() {
  return Env.get("GAL_CODE_SECRET_PROJECT") ?? Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT")
}

function root() {
  return Env.get("GAL_CODE_SECRET_MANAGER_URL") ?? API
}

export async function load(
  name: string,
  opts: {
    auth?: Auth
    fetch?: typeof fetch
  } = {},
) {
  const proj = project()
  if (!proj) return

  const auth = opts.auth ?? new GoogleAuth({ scopes: [SCOPE] })
  const token = await auth.getAccessToken().catch(() => undefined)
  if (!token) return

  const res = await (opts.fetch ?? fetch)(
    `${root()}/projects/${proj}/secrets/${encodeURIComponent(name)}/versions/latest:access`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  ).catch(() => undefined)

  if (!res || res.status === 403 || res.status === 404 || !res.ok) return

  const body = (await res.json().catch(() => undefined)) as
    | {
        payload?: {
          data?: string
        }
      }
    | undefined

  const data = body?.payload?.data
  if (typeof data !== "string" || data === "") return

  return Buffer.from(data, "base64").toString("utf8").trim()
}
