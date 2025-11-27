// api/rss.js

// Default Don Bosco / FetchRSS feed
const FEED_URL =
  "https://fetchrss.com/feed/1urStc0qB2Mc1urk4o4wc2J2.rss";

/**
 * Extract an image URL from a single <item>...</item> block.
 * 1) Prefer <media:content url="...">
 * 2) Then <enclosure url="..."> (if ever present)
 * 3) Then first <img src="..."> in the HTML
 */
function extractImageUrl(itemXml) {
  let match;

  // 1) <media:content url="...">
  match = itemXml.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/i);
  if (match) return match[1];

  // 2) <enclosure url="...">
  match = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
  if (match) return match[1];

  // 3) <img src="..."> (inside description/content)
  match = itemXml.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (match) return match[1];

  return null;
}

/**
 * For each <item>, add an <enclosure> tag with the image URL
 * (if we can find one).
 */
function addImageEnclosures(xml) {
  return xml.replace(/<item\b[\s\S]*?<\/item>/gi, (item) => {
    const imageUrl = extractImageUrl(item);
    if (!imageUrl) return item; // no image found, leave as-is

    // If there's already an enclosure with this URL, don't duplicate
    if (item.includes('<enclosure ') && item.includes(imageUrl)) {
      return item;
    }

    const enclosureTag = `\n      <enclosure url="${imageUrl}" type="image/jpeg" />`;

    // Insert just before </item>
    return item.replace(/<\/item>/i, `${enclosureTag}\n    </item>`);
  });
}

module.exports = async (req, res) => {
  try {
    const feedUrl = (req.query && req.query.url) || FEED_URL;

    const upstream = await fetch(feedUrl);

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.error("Upstream feed error:", upstream.status, body);
      res.status(502).send("Failed to fetch upstream feed");
      return;
    }

    let xml = await upstream.text();

    // Inject <enclosure> tags based on media:content / <img> URLs
    xml = addImageEnclosures(xml);

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.status(200).send(xml);
  } catch (err) {
    console.error("RSS handler crashed:", err);
    res.status(500).send("Internal RSS error");
  }
};
