import { NextRequest, NextResponse } from "next/server";

const BREVO_API_URL = "https://api.brevo.com/v3/contacts";
const BREVO_LIST_ID = parseInt(
  process.env.BREVO_EARLY_ACCESS_LIST_ID || "2",
  10
);

export async function POST(req: NextRequest) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 }
    );
  }

  let email: string;
  try {
    const body = await req.json();
    email = (body.email || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email,
      listIds: [BREVO_LIST_ID],
      updateEnabled: true,
      attributes: {
        SOURCE: "gal.run early access",
      },
    }),
  });

  if (res.status === 201 || res.status === 204) {
    return NextResponse.json({ success: true });
  }

  // Contact already exists with this email in the list — still success from user perspective
  if (res.status === 400) {
    const data = await res.json();
    if (data.code === "duplicate_parameter") {
      return NextResponse.json({ success: true });
    }
  }

  return NextResponse.json(
    { error: "Failed to subscribe" },
    { status: 500 }
  );
}
