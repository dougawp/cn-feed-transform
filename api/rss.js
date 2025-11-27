// api/rss.js

const FEED_URL =
  "https://fetchrss.com/feed/1urStc0qB2Mc1urk4o4wc2J2.rss";

module.exports = async (req, res) => {
  try {
    // Optional: allow ?url=... override, but default to your Don Bosco feed
    const feedUrl = (req.query && req.query.url) || FEED_URL;

    const upstream = await fetch(feedUrl);

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      console.error("Upstream feed error:", upstream.status, body);
      res.status(502).send("Failed to fetch upstream feed");
      return;
    }

    const xml = await upstream.text();

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.status(200).send(xml);
  } catch (err) {
    console.error("RSS handler crashed:", err);
    res.status(500).send("Internal RSS error");
  }
};
