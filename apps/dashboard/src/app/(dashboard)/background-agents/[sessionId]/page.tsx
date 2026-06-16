import { redirect } from 'next/navigation'

export default async function BackgroundAgentSessionRedirectPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  redirect(`/sessions/${sessionId}`)
}
