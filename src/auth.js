const crypto = require('node:crypto');
const { db } = require('./database');
const config = require('./config');
const { AttemptLimiter } = require('./rate-limit');

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const loginLimiter = new AttemptLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
const DUMMY_PASSWORD_HASH = 'fixed-login-salt:'
  + crypto.scryptSync('invalid-password', 'fixed-login-salt', 64).toString('hex');

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function readCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      if (index < 1) return [part, ''];
      try {
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      } catch {
        return [part.slice(0, index), ''];
      }
    })
  );
}

function tokenHash(token) {
  return crypto.createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash(token), userId, csrfToken, expiresAt);
  return { token, csrfToken };
}

function findSession(token) {
  if (!token) return null;
  return db.prepare(
    'SELECT token_hash AS tokenHash, user_id AS userId, csrf_token AS csrfToken, '
    + 'expires_at AS expiresAt FROM sessions WHERE token_hash = ?'
  ).get(tokenHash(token)) || null;
}

function deleteSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionCookie(token, maxAge) {
  const secure = config.isProduction ? '; Secure' : '';
  return 'session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge + secure;
}

function requestSession(req) {
  const token = readCookies(req.headers.cookie).session;
  const session = findSession(token);
  if (session && new Date(session.expiresAt).getTime() <= Date.now()) {
    deleteSession(token);
    return { token, session: null };
  }
  return { token, session };
}

function authMiddleware(req, res, next) {
  const { token, session } = requestSession(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Sesión no válida o expirada' });
  }

  const user = db.prepare(
    'SELECT u.id, u.name, u.email, u.department_id AS departmentId, '
    + 'r.name AS role, d.name AS department FROM users u '
    + 'JOIN roles r ON r.id = u.role_id '
    + 'LEFT JOIN departments d ON d.id = u.department_id '
    + "WHERE u.id = ? AND u.status = 'active'"
  ).get(session.userId);

  if (!user) {
    deleteSession(token);
    return res.status(401).json({ success: false, error: 'Usuario inactivo' });
  }
  req.user = user;
  req.sessionToken = token;
  req.csrfToken = session.csrfToken;
  next();
}

function csrfMiddleware(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/auth/login') return next();
  const { session } = requestSession(req);
  if (!session) return next();
  if (!constantTimeEqual(req.get('x-csrf-token'), session.csrfToken)) {
    return res.status(403).json({ success: false, error: 'Token CSRF no válido' });
  }
  next();
}

function loginKeys(req, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase().slice(0, 320);
  return [
    'ip:' + (req.ip || req.socket.remoteAddress || 'unknown'),
    'email:' + (normalizedEmail || 'empty')
  ];
}

function registerAuthRoutes(app) {
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const keys = loginKeys(req, email);
    const rate = loginLimiter.inspect(keys);
    if (rate.limited) {
      const retryAfter = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: 'Demasiados intentos. Intenta nuevamente más tarde'
      });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE lower(email) = lower(?) AND status = ?'
    ).get(String(email || '').slice(0, 320), 'active');
    const validPassword = typeof password === 'string' && password.length <= 1024;
    const passwordMatches = validPassword
      && verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      loginLimiter.recordFailure(keys);
      return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos' });
    }

    loginLimiter.reset(keys);
    const { token, csrfToken } = createSession(user.id);
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_DURATION_MS / 1000));
    res.json({ success: true, csrfToken });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user, csrfToken: req.csrfToken });
  });

  app.post('/api/auth/logout', authMiddleware, (req, res) => {
    deleteSession(req.sessionToken);
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    res.json({ success: true });
  });
}

module.exports = {
  authMiddleware,
  csrfMiddleware,
  registerAuthRoutes,
  readCookies,
  createSession,
  findSession,
  deleteSession,
  sessionCookie
};
