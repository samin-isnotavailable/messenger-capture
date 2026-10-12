// Vercel serverless function. Vite/the browser can't read another
// origin's document.title without a network round-trip that respects
// CORS (which most sites, including ggezgadgets.com, don't grant for
// arbitrary JS reads) — so title resolution for pasted links has to
// happen server-side. This endpoint takes ?url=..., fetches it here,
// and returns { title } (or { title: null } if it couldn't resolve
// one), letting the client fall back to a parsed-URL label instead.

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
];

function isBlockedHost(hostname) {
  return PRIVATE_HOSTNAME_PATTERNS.some((re) => re.test(hostname));
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

export default async function handler(req, res) {
  const rawUrl = req.query.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.status(400).json({ error: 'Only http/https URLs are allowed' });
    return;
  }

  if (isBlockedHost(target.hostname)) {
    res.status(400).json({ error: 'That host is not allowed' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some sites (WooCommerce/WordPress included) vary markup by UA;
        // a normal browser UA gets the real rendered <title> rather than
        // a bot-served fallback page.
        'User-Agent':
          'Mozilla/5.0 (compatible; TaskaptureTitleBot/1.0; +https://ggezgadgets.com)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      res.status(200).json({ title: null });
      return;
    }

    // Only read enough of the body to find <title> — no need to buffer
    // a whole product page (WooCommerce pages can be large).
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let done = false;
    while (!done && html.length < 65536 && !/<\/title>/i.test(html)) {
      const chunk = await reader.read();
      done = chunk.done;
      if (chunk.value) html += decoder.decode(chunk.value, { stream: true });
    }
    reader.cancel().catch(() => {});

    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match ? decodeHtmlEntities(match[1].trim()).replace(/\s+/g, ' ') : null;

    res.status(200).json({ title: title || null });
  } catch (err) {
    res.status(200).json({ title: null, error: err.name === 'AbortError' ? 'timeout' : 'fetch_failed' });
  } finally {
    clearTimeout(timeout);
  }
}
