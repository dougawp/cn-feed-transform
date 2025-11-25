// /api/rss.js
// Vercel Serverless Function: converts an upstream RSS/Atom feed into RSS 2.0
// with proper <enclosure> image URLs that Common Ninja will render.
// Usage:
//   /api/rss?url=<encoded_feed_url>&count=10&v=cachebuster
//
// Optional: set FEED_URL in Vercel env, then you can omit ?url=...

const DEFAULT_FEED =
  process.env.FEED_URL ||
  "https://fetchrss.com/feed/aK_GoGujlyOCaLDImjNCpSKk.rss?cb=12345
";

const esc = (s = "") =>
  s.replace(/&/g, "&amp;")
   .replace(/</g, "&lt;")
   .replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;");

const stripCdata = (s = "") => s.replace(/<!\[CDATA\[(.*?)\]\]>/gis, "$1");

const decode = (s = "") =>
  stripCdata(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

const firstImg = (html = "") => {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? decode(m[1]) : null; // decode to avoid &amp;amp;
};

const mimeFromUrl = (u = "") => {
  if (/\.(png)(\?|$)/i.test(u)) return "image/png";
  if (/\.(webp)(\?|$)/i.test(u)) return "image/webp";
  return "image/jpeg";
};

function pickTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decode(m[2].trim()) : "";
}

function pickAtomLink(block) {
  // Prefer rel="alternate", else first link with href
  const relAlt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (relAlt) return decode(relAlt[1]);
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return any ? decode(any[1]) : "";
}

function pickMedia(block) {
  const m1 = block.match(/<media:content[^>]*\surl=["']([^"']+)["']/i);
  if (m1) return decode(m1[1]); // decode BEFORE using
  const m2 = block.match(/<media:content[^>]*\surl=([^"'\s>]+)/i);
  return m2 ? decode(m2[1]) : null;
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const title = pickTag(b, "title");
    const link = pickTag(b, "link");
    const pubDate = pickTag(b, "pubDate") || pickTag(b, "dc:date");
    const description = pickTag(b, "description") || pickTag(b, "content:encoded");
    const media = pickMedia(b);
    const imageUrl = media || firstImg(description) || null;
    if (imageUrl) items.push({ title, link, pubDate, description, imageUrl });
  }
  return items;
}

function parseAtom(xml) {
  const items = [];
  const blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = pickTag(b, "title");
    const link = pickAtomLink(b);
    const pubDate = pickTag(b, "updated") || pickTag(b, "published");
    const content = pickTag(b, "content") || pickTag(b, "summary");
    const media = pickMedia(b);
    const imageUrl = media || firstImg(content) || null;
    if (imageUrl) items.push({ title, link, pubDate, description: content, imageUrl });
  }
  return items;
}

export default async function handler(req, res) {
  // Make HEAD preflight happy (Common Ninja sometimes uses it)
  if (req.method === "HEAD") {
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.status(200).end();
    return;
  }

  try {
    const src = (req.query.url || DEFAULT_FEED).toString();
    const limit = Math.max(1, Math.min(30, parseInt(req.query.count || "10", 10)));

    const r = await fetch(src, {
      headers: { "User-Agent": "CN-Feed-Transformer/1.0 (+vercel)" },
      cache: "no-store" // use no-store while testing; you can switch to s-maxage later
    });
    if (!r.ok) return res.status(502).send("Upstream feed fetch failed");
    const xml = await r.text();

    const isAtom = /<feed\b/i.test(xml) && /<entry\b/i.test(xml);
    const items = (isAtom ? parseAtom(xml) : parseRss(xml)).slice(0, limit);

    const now = new Date().toUTCString();
    const header =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n` +
      `<channel>\n` +
      `<title>${esc("DBTSS (Transformed for Common Ninja)")}</title>\n` +
      `<link>${esc("https://www.facebook.com/DonBoscoKokopo")}</link>\n` +
      `<description>${esc("Adds <enclosure> so CN shows thumbnails")}</description>\n` +
      `<lastBuildDate>${now}</lastBuildDate>\n`;

    const body = items.map((it) => {
      // Ensure single-escaped ampersands in final XML
      const raw = it.imageUrl || "";
      const cleaned = decode(raw).replace(/&amp;amp;/g, "&amp;");
      const mime = mimeFromUrl(cleaned);
      const guid = it.link || cleaned || it.title || now;

      return (
        `<item>\n` +
        `<title>${esc(it.title || "Post")}</title>\n` +
        (it.link ? `<link>${esc(it.link)}</link>\n` : "") +
        (it.pubDate ? `<pubDate>${esc(it.pubDate)}</pubDate>\n` : "") +
        (it.description ? `<description><![CDATA[${it.description}]]></description>\n` : "") +
        `<media:content url="${esc(cleaned)}" medium="image" />\n` +
        `<media:thumbnail url="${esc(cleaned)}" />\n` +
        `<enclosure url="${esc(cleaned)}" type="${mime}" />\n` +
        `<guid isPermaLink="false">${esc(guid)}</guid>\n` +
        `</item>\n`
      );
    }).join("");

    const footer = `</channel>\n</rss>\n`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    // For production, you can switch to caching:
    // res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(header + body + footer);
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
}
