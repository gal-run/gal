import { test, expect } from "../fixtures"
import { cleanupSession, openSidebar, withSession } from "../actions"
import { promptSelector } from "../selectors"

test("sidebar session links navigate to the selected session", async ({ page, project }) => {
  await project.open()
  const stamp = Date.now()

  const one = await project.sdk.session.create({ title: `e2e sidebar nav 1 ${stamp}` }).then((r) => r.data)
  const two = await project.sdk.session.create({ title: `e2e sidebar nav 2 ${stamp}` }).then((r) => r.data)

  if (!one?.id) throw new Error("Session create did not return an id")
  if (!two?.id) throw new Error("Session create did not return an id")

  try {
    await project.gotoSession(one.id)

    await openSidebar(page)

    const target = page.locator(`[data-session-id="${two.id}"] a`).first()
    await expect(target).toBeVisible()
    await target.click()

    await expect(page).toHaveURL(new RegExp(`/${project.slug}/session/${two.id}(?:\\?|#|$)`))
    await expect(page.locator(promptSelector)).toBeVisible()
    await expect(page.locator(`[data-session-id="${two.id}"] a`).first()).toHaveClass(/\bactive\b/)
  } finally {
    await cleanupSession({ sdk: project.sdk, sessionID: one.id })
    await cleanupSession({ sdk: project.sdk, sessionID: two.id })
  }
})
