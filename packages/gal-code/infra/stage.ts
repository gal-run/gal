export const domain = (() => {
  if ($app.stage === "production") return "gal.run"
  if ($app.stage === "dev") return "dev.gal.run"
  return `${$app.stage}.dev.gal.run`
})()

export const zoneID = process.env.CLOUDFLARE_ZONE_ID ?? "CLOUDFLARE_ZONE_ID"

new cloudflare.RegionalHostname("RegionalHostname", {
  hostname: domain,
  regionKey: "us",
  zoneId: zoneID,
})

export const shortDomain = (() => {
  if ($app.stage === "production") return "opncd.ai"
  if ($app.stage === "dev") return "dev.opncd.ai"
  return `${$app.stage}.dev.opncd.ai`
})()
