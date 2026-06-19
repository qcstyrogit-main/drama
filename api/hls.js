module.exports = async function handler(req, res) {
  const target = req.query.url;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!target || !/^https?:\/\//i.test(target)) {
    res.status(400).json({ error: 'Missing or invalid url' });
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
    });

    const contentType = upstream.headers.get('content-type') || '';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=300');

    const acceptRanges = upstream.headers.get('accept-ranges');
    const contentRange = upstream.headers.get('content-range');
    const contentLength = upstream.headers.get('content-length');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (contentType.includes('mpegurl') || target.includes('/hls?') || target.endsWith('.m3u8')) {
      const base = new URL(target);
      const playlist = await upstream.text();
      const rewritten = playlist.replace(/^(https?:\/\/[^\s#]+)$/gm, url => {
        return `/api/hls?url=${encodeURIComponent(url)}`;
      }).replace(/^((?!#)[^\s][^\r\n]*)$/gm, path => {
        const absolute = new URL(path, base).toString();
        return `/api/hls?url=${encodeURIComponent(absolute)}`;
      });
      res.send(rewritten);
      return;
    }

    if (contentLength) res.setHeader('Content-Length', contentLength);
    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (error) {
    res.status(502).json({ error: 'Proxy fetch failed', message: error.message });
  }
};
