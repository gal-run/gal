import { redirect } from 'next/navigation'

export default async function BackgroundAgentsRedirectPage() {
  redirect('/sessions')
}
