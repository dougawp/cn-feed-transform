// Vercel Serverless Function: outputs RSS 2.0 with <enclosure> images
// Usage: /api/rss?url=<encoded_fetchrss_url>&count=8

const DEFAULT_FEED =
  process.env.FEED_URL ||
  "https://fetchrss.com/feed/aJ1o1ogE91UDaJ1o5k-SXnxS.rss";

const esc = (s = "") =>
  s.replace(/&/g, "&amp;")
   .replace(/</g, "&lt;")
   .replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;");

const decode = (s = "") =>
  s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
   .replace(/&nbsp;/g, " ")
   .replace(/&amp;/g, "&")
   .replace(/&lt;/g, "<")
   .replace(/&gt;/g, ">")
   .replace(/&#39;/g, "'")
   .replace(/&quot;/g, '"');

const firstImg = (html = "") => {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
};

const mimeFromUrl = (u = "") => {
  if (/\.(png)(\?|$)/i.test(u)) return "image/png";
  if (/\.(webp)(\?|$)/i.test(u)) return "image/webp";
  return "image/jpeg";
};

export default async function handler(req, res) {
  try {
    const src = (req.query.url || DEFAULT_FEED).toString();
    const limit = Math.max(1, Math.min(30, parseInt(req.query.count || "10", 10)));

    const r = await fetch(src, {
      headers: { "User-Agent": "CN-Feed-Transformer/1.0 (+vercel)" },
      cache: "no-store"
    });
    if (!r.ok) return res.status(502).send("Upstream RSS fetch failed");
    const xml = await r.text();

    // Find <item> blocks and extract fields
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const items = [];
    for (const block of itemBlocks) {
      const pick = (tag) => {
        const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
        return m ? decode(m[1].trim()) : "";
      };
      const title = pick("title");
      const link = pick("link");
      const pubDate = pick("pubDate");
      const description = pick("description");

      // Prefer <media:content url="...">, else first <img> in description
      const media =
        (block.match(/<media:content[^>]*\surl=["']([^"']+)["']/i) || [])[1] ||
        (block.match(/<media:content[^>]*\surl=([^"'\s>]+)/i) || [])[1] ||
        null;

      const imageUrl = media || firstImg(description) || null;
      if (imageUrl) items.push({ title, link, pubDate, description, imageUrl });
    }

    const list = items.slice(0, limit);
    const now = new Date().toUTCString();

    const out =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">\n` +
      `<channel>\n` +
      `<title>${esc("DBTSS (Transformed for Common Ninja)")}</title>\n` +
      `<link>${esc("https://www.facebook.com/DonBoscoKokopo")}</link>\n` +
      `<description>${esc("Adds <enclosure> so CN shows thumbnails")}</description>\n` +
      `<lastBuildDate>${now}</lastBuildDate>\n` +
      list.map((it) => {
        const guid = it.link || it.imageUrl || it.title;
        const mime = mimeFromUrl(it.imageUrl);
        return (
          `<item>\n` +
          `<title>${esc(it.title || "Post")}</title>\n` +
          (it.link ? `<link>${esc(it.link)}</link>\n` : "") +
          (it.pubDate ? `<pubDate>${esc(it.pubDate)}</pubDate>\n` : "") +
          (it.description ? `<description><![CDATA[${it.description}]]></description>\n` : "") +
          `<media:content url="${esc(it.imageUrl)}" medium="image" />\n` +
          `<enclosure url="${esc(it.imageUrl)}" type="${mime}" />\n` +
          `<guid isPermaLink="false">${esc(guid)}</guid>\n` +
          `</item>\n`
        );
      }).join("") +
      `</channel>\n</rss>\n`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).send(out);
  } catch (e) {
    res.status(500).send(String(e?.message || e));
  }
}
