import { api } from "./api";

export interface GmailConnectionStatus {
  connected: boolean;
  email?: string;
  lastChecked?: string;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  try {
    const response = await api.fetchWithAuth(`${API_BASE}/credentials/gmail/status`);
    if (!response.ok) return { connected: false };
    const data = await response.json();
    return {
      connected: data.connected ?? false,
      email: data.email,
      lastChecked: data.lastChecked,
    };
  } catch {
    return { connected: false };
  }
}

export async function getGmailOAuthUrl(): Promise<string> {
  const response = await api.fetchWithAuth(`${API_BASE}/credentials/gmail/connect`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to get Gmail OAuth URL");
  const data = await response.json();
  return data.authUrl as string;
}
