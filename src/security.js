const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Exigir JSON en las mutaciones es una defensa CSRF: un formulario HTML no puede
// emitir application/json. Subir archivos obliga a multipart, así que se admite
// únicamente en esa ruta. Lo que sigue protegiéndola es la comprobación de Origin,
// Sec-Fetch-Site y el token CSRF, que un formulario cross-site tampoco supera.
const MULTIPART_PATHS = [/^\/events\/\d+\/attachments\/?$/];

// req.is() devuelve null cuando la petición no lleva cuerpo, de modo que un
// DELETE sin cuerpo fallaba la comprobación de tipo aunque fuese legítimo.
function hasBody(req) {
  if (req.get('transfer-encoding') !== undefined) return true;
  return Number(req.get('content-length') || 0) > 0;
}

function acceptsBody(req) {
  // Sin cuerpo no hay nada que tipar, y el vector que cubre esta regla —un
  // formulario HTML cross-site— siempre envía uno. Origin, Sec-Fetch-Site y el
  // token CSRF siguen aplicándose igual.
  if (!hasBody(req)) return true;
  if (req.is('application/json')) return true;
  return MULTIPART_PATHS.some((pattern) => pattern.test(req.path))
    && Boolean(req.is('multipart/form-data'));
}

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
  if (!acceptsBody(req)) {
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

module.exports = { securityHeaders, requireSameOrigin, acceptsBody };
