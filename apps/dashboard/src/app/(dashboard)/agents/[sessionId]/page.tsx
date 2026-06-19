import { redirect } from 'next/navigation'

export default async function AgentSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  await params
  redirect('/sessions')
}
