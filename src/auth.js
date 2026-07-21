const crypto = require('node:crypto');
const { db } = require('./database');

const sessions = new Map();
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function readCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    })
  );
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_DURATION_MS });
  return token;
}

function authMiddleware(req, res, next) {
  const token = readCookies(req.headers.cookie).session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ success: false, error: 'Sesión no válida o expirada' });
  }

  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.department_id AS departmentId,
           r.name AS role, d.name AS department
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE u.id = ? AND u.status = 'active'
  `).get(session.userId);

  if (!user) return res.status(401).json({ success: false, error: 'Usuario inactivo' });
  req.user = user;
  req.sessionToken = token;
  next();
}

function registerAuthRoutes(app) {
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?) AND status = ?')
      .get(email || '', 'active');
    if (!user || !password || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, error: 'Correo o contraseña incorrectos' });
    }

    const token = createSession(user.id);
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);
    res.json({ success: true });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  app.post('/api/auth/logout', authMiddleware, (req, res) => {
    sessions.delete(req.sessionToken);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ success: true });
  });
}

module.exports = { authMiddleware, registerAuthRoutes };
