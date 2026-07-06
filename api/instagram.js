// api/instagram.js
// Returns the latest posts from the lens.dance Instagram account.
//
// Sources, in order of preference:
//   1. INSTAGRAM_FEED_URL   — e.g. a Behold.so feed URL (most reliable, free)
//   2. INSTAGRAM_ACCESS_TOKEN — long-lived Instagram Graph API token
//   3. Instagram's public web-profile endpoint (no credentials; best-effort —
//      Instagram may rate-limit datacenter IPs, in which case we fall through)
// If every source fails we return 503 and the site shows local fallback images.
// Successful responses are cached on the Vercel CDN for 1 hour (+1 day stale),
// so Instagram is hit at most ~once an hour regardless of traffic.

const IG_USERNAME = "lens.dance";
const GRAPH_URL = "https://graph.instagram.com/me/media";
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
// Public app id Instagram's own web client sends; required by the web endpoint.
const IG_WEB_APP_ID = "936619743392459";

// Last good result, kept in the function instance as an extra safety net.
let lastGood = null;

const normalize = (arr) =>
  arr
    .map((p) => ({
      id: p.id || p.permalink,
      media_url:
        p.media_type === "VIDEO"
          ? p.thumbnail_url || p.media_url
          : p.media_url || p.mediaUrl || p.thumbnailUrl ||
            p?.sizes?.medium?.mediaUrl || p?.sizes?.full?.mediaUrl,
      permalink: p.permalink || p.link || `https://instagram.com/${IG_USERNAME}`,
      caption: p.caption || p.text || "",
    }))
    .filter((p) => p.media_url)
    .slice(0, 8);

async function fromFeedUrl(feedUrl) {
  const r = await fetch(feedUrl);
  if (!r.ok) throw new Error("feed " + r.status);
  const json = await r.json();
  return normalize(Array.isArray(json) ? json : json.posts || json.data || []);
}

async function fromGraphApi(token) {
  const url = `${GRAPH_URL}?fields=${FIELDS}&limit=12&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("graph " + r.status);
  const json = await r.json();
  return normalize(json.data || []);
}

async function fromPublicProfile() {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${IG_USERNAME}`;
  const r = await fetch(url, {
    headers: {
      "x-ig-app-id": IG_WEB_APP_ID,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!r.ok) throw new Error("web_profile " + r.status);
  const json = await r.json();
  const edges = json?.data?.user?.edge_owner_to_timeline_media?.edges || [];
  return normalize(
    edges.map(({ node }) => ({
      id: node.id,
      media_url: node.thumbnail_src || node.display_url,
      permalink: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : undefined,
      caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
    }))
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

  const attempts = [];
  if (process.env.INSTAGRAM_FEED_URL)
    attempts.push(() => fromFeedUrl(process.env.INSTAGRAM_FEED_URL));
  if (process.env.INSTAGRAM_ACCESS_TOKEN)
    attempts.push(() => fromGraphApi(process.env.INSTAGRAM_ACCESS_TOKEN));
  attempts.push(fromPublicProfile);

  for (const attempt of attempts) {
    try {
      const posts = await attempt();
      if (posts.length) {
        lastGood = posts;
        return res.status(200).json({ data: posts });
      }
    } catch (e) {
      console.warn("Instagram source failed:", e.message);
    }
  }

  if (lastGood) return res.status(200).json({ data: lastGood, stale: true });
  return res.status(503).json({ error: "Instagram feed unavailable" });
}
