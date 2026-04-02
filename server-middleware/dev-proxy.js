// Dev-only proxy middleware to avoid CORS issues when running in the browser.
// Proxies requests from /dev-proxy/<target-url> to the actual target server.
const http = require('http')
const https = require('https')
const { URL } = require('url')

module.exports = function (req, res) {
  // Nuxt strips the /dev-proxy prefix, so req.url is /<target-url>
  const targetUrl = req.url.slice(1)

  if (!targetUrl.startsWith('http')) {
    res.statusCode = 400
    res.end('Invalid proxy target URL')
    return
  }

  let parsedUrl
  try {
    parsedUrl = new URL(targetUrl)
  } catch (e) {
    res.statusCode = 400
    res.end('Invalid URL: ' + e.message)
    return
  }

  const isHttps = parsedUrl.protocol === 'https:'
  const lib = isHttps ? https : http

  // Copy request headers but remove browser-specific headers that cause issues
  const headers = { ...req.headers }
  delete headers.host
  delete headers.referer
  delete headers.origin

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers
  }

  const proxyReq = lib.request(options, (proxyRes) => {
    // Add the final URL as a custom header so the client can use it
    // for redirect validation (replaces the fetch Response.url which would be the proxy URL)
    proxyRes.headers['x-final-url'] = targetUrl

    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    console.error('[dev-proxy] Error:', err.message)
    res.statusCode = 502
    res.end(JSON.stringify({ error: err.message, code: err.code }))
  })

  req.pipe(proxyReq)
}
