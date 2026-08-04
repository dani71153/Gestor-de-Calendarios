const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'"
  ].join('; '));
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.app.get('env') === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.is('application/json')) {
    return res.status(415).json({ success: false, error: 'Content-Type debe ser application/json' });
  }
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if ((origin && origin !== expectedOrigin) || fetchSite === 'cross-site') {
    return res.status(403).json({ success: false, error: 'Origen de solicitud no permitido' });
  }
  next();
}

module.exports = { securityHeaders, requireSameOrigin };
