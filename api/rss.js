// app/api/rss/route.ts
import { NextResponse } from "next/server";

const FEED_URL =
  "https://fetchrss.com/feed/1urStc0qB2Mc1urk4o4wc2J2.rss";

export async function GET(request: Request) {
  try {
    // Optional: allow ?url=... override, else use your Don Bosco feed
    const { searchParams } = new URL(request.url);
    const urlParam = searchParams.get("url");
    const feedUrl = urlParam || FEED_URL;

    const upstream = await fetch(feedUrl);

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.error("Upstream feed error:", upstream.status, body);
      return new NextResponse("Failed to fetch upstream feed", {
        status: 502,
      });
    }

    const xml = await upstream.text();

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    });
  } catch (err) {
    console.error("RSS handler crashed:", err);
    return new NextResponse("Internal RSS error", { status: 500 });
  }
}
