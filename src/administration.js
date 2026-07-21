const { db, hashPassword } = require('./database');
const {
  calendarCapabilities,
  requireAdministrator
} = require('./authorization');

const validVisibilities = ['private', 'department', 'company'];
const validCalendarStatuses = ['active', 'archived'];
const validUserStatuses = ['active', 'inactive'];

function audit(userId, action, entityType, entityId, oldValues, newValues) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    action,
    entityType,
    entityId,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null
  );
}

function validateCalendar(input) {
  if (!input.name?.trim()) return 'El nombre del calendario es obligatorio';
  if (input.name.trim().length > 100) return 'El nombre del calendario es demasiado largo';
  if (!/^#[0-9a-f]{6}$/i.test(input.color || '')) return 'El color debe usar el formato #RRGGBB';
  if (!validVisibilities.includes(input.visibility)) return 'Visibilidad no válida';
  if (input.status && !validCalendarStatuses.includes(input.status)) return 'Estado de calendario no válido';
  if (input.departmentId && !db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(input.departmentId))) {
    return 'Departamento no válido';
  }
  return null;
}

function validateUser(input, { creating = false } = {}) {
  if (!input.name?.trim()) return 'El nombre es obligatorio';
  if (!/^\S+@\S+\.\S+$/.test(input.email || '')) return 'El correo no es válido';
  if (creating && (!input.password || input.password.length < 8)) return 'La contraseña debe tener al menos 8 caracteres';
  if (input.password && input.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!db.prepare('SELECT id FROM roles WHERE id = ?').get(Number(input.roleId))) return 'Rol no válido';
  if (input.departmentId && !db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(input.departmentId))) {
    return 'Departamento no válido';
  }
  if (input.status && !validUserStatuses.includes(input.status)) return 'Estado de usuario no válido';
  if (input.calendarPermissions !== undefined && !Array.isArray(input.calendarPermissions)) {
    return 'Los permisos de calendario no son válidos';
  }
  if (Array.isArray(input.calendarPermissions)) {
    const calendarIds = input.calendarPermissions.map((permission) => Number(permission.calendarId));
    if (new Set(calendarIds).size !== calendarIds.length) return 'Hay calendarios duplicados en la asignación';
    const validIds = new Set(db.prepare("SELECT id FROM calendars WHERE status = 'active'").all()
      .map((calendar) => calendar.id));
    if (calendarIds.some((calendarId) => !validIds.has(calendarId))) {
      return 'La asignación contiene un calendario no válido';
    }
  }
  return null;
}

function normalizeCalendarPermissions(permissions, roleName) {
  if (roleName === 'Administrador') return [];
  return (Array.isArray(permissions) ? permissions : []).map((permission) => {
    const readOnly = roleName === 'Consulta';
    const canCreate = !readOnly && Boolean(permission.canCreate);
    const canEdit = !readOnly && Boolean(permission.canEdit);
    const canDelete = !readOnly && Boolean(permission.canDelete);
    return {
      calendarId: Number(permission.calendarId),
      canView: Boolean(permission.canView) || canCreate || canEdit || canDelete,
      canCreate,
      canEdit,
      canDelete
    };
  }).filter((permission) => permission.canView);
}

function replaceUserCalendarPermissions(userId, permissions) {
  const insert = db.prepare(`
    INSERT INTO calendar_permissions
      (calendar_id, user_id, can_view, can_create, can_edit, can_delete)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.prepare('DELETE FROM calendar_permissions WHERE user_id = ?').run(userId);
  permissions.forEach((permission) => {
    insert.run(
      permission.calendarId,
      userId,
      permission.canView ? 1 : 0,
      permission.canCreate ? 1 : 0,
      permission.canEdit ? 1 : 0,
      permission.canDelete ? 1 : 0
    );
  });
}

function calendarPermissionsByUser() {
  const rows = db.prepare(`
    SELECT user_id AS userId, calendar_id AS calendarId,
           can_view AS canView, can_create AS canCreate,
           can_edit AS canEdit, can_delete AS canDelete
    FROM calendar_permissions
    ORDER BY calendar_id
  `).all();
  return rows.reduce((map, permission) => {
    if (!map.has(permission.userId)) map.set(permission.userId, []);
    map.get(permission.userId).push(permission);
    return map;
  }, new Map());
}

function registerAdministrationRoutes(app, authMiddleware) {
  app.get('/api/roles', authMiddleware, requireAdministrator, (req, res) => {
    const roles = db.prepare('SELECT id, name, description FROM roles ORDER BY id').all();
    res.json({ success: true, roles });
  });

  app.get('/api/departments', authMiddleware, requireAdministrator, (req, res) => {
    const departments = db.prepare(`
      SELECT id, name, description, status FROM departments ORDER BY name
    `).all();
    res.json({ success: true, departments });
  });

  app.get('/api/admin/users', authMiddleware, requireAdministrator, (req, res) => {
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.role_id AS roleId, r.name AS role,
             u.department_id AS departmentId, d.name AS department,
             u.status, u.created_at AS createdAt, u.updated_at AS updatedAt
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN departments d ON d.id = u.department_id
      ORDER BY u.name
    `).all();
    const permissionMap = calendarPermissionsByUser();
    users.forEach((user) => {
      user.calendarPermissions = permissionMap.get(user.id) || [];
      user.calendarCount = user.calendarPermissions.filter((permission) => permission.canView).length;
    });
    res.json({ success: true, users });
  });

  app.post('/api/admin/users', authMiddleware, requireAdministrator, (req, res) => {
    const input = req.body || {};
    const error = validateUser(input, { creating: true });
    if (error) return res.status(400).json({ success: false, error });
    if (db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(input.email.trim())) {
      return res.status(409).json({ success: false, error: 'Ya existe un usuario con ese correo' });
    }
    const role = db.prepare('SELECT name FROM roles WHERE id = ?').get(Number(input.roleId));
    const permissions = normalizeCalendarPermissions(input.calendarPermissions, role.name);
    let id;
    db.exec('BEGIN');
    try {
      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, role_id, department_id, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        input.name.trim(), input.email.trim().toLowerCase(), hashPassword(input.password),
        Number(input.roleId), input.departmentId ? Number(input.departmentId) : null,
        input.status || 'active'
      );
      id = Number(result.lastInsertRowid);
      replaceUserCalendarPermissions(id, permissions);
      const created = { ...input, password: undefined, calendarPermissions: permissions, id };
      audit(req.user.id, 'create', 'user', id, null, created);
      db.exec('COMMIT');
    } catch (transactionError) {
      db.exec('ROLLBACK');
      throw transactionError;
    }
    res.status(201).json({ success: true, userId: id });
  });

  app.put('/api/admin/users/:id', authMiddleware, requireAdministrator, (req, res) => {
    const id = Number(req.params.id);
    const previous = db.prepare(`
      SELECT id, name, email, role_id AS roleId, department_id AS departmentId, status
      FROM users WHERE id = ?
    `).get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    const input = req.body || {};
    const error = validateUser(input);
    if (error) return res.status(400).json({ success: false, error });
    const role = db.prepare('SELECT name FROM roles WHERE id = ?').get(Number(input.roleId));
    if (id === req.user.id && (input.status === 'inactive' || role.name !== 'Administrador')) {
      return res.status(400).json({ success: false, error: 'No puedes retirar tu propio acceso administrativo' });
    }
    const duplicate = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?')
      .get(input.email.trim(), id);
    if (duplicate) return res.status(409).json({ success: false, error: 'Ya existe un usuario con ese correo' });

    const shouldReplacePermissions = role.name === 'Administrador' || Array.isArray(input.calendarPermissions);
    const permissions = normalizeCalendarPermissions(input.calendarPermissions, role.name);
    const previousPermissions = db.prepare(`
      SELECT calendar_id AS calendarId, can_view AS canView, can_create AS canCreate,
             can_edit AS canEdit, can_delete AS canDelete
      FROM calendar_permissions WHERE user_id = ?
    `).all(id);
    db.exec('BEGIN');
    try {
      if (input.password) {
        db.prepare(`
          UPDATE users SET name = ?, email = ?, password_hash = ?, role_id = ?,
            department_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(
          input.name.trim(), input.email.trim().toLowerCase(), hashPassword(input.password),
          Number(input.roleId), input.departmentId ? Number(input.departmentId) : null,
          input.status || 'active', id
        );
      } else {
        db.prepare(`
          UPDATE users SET name = ?, email = ?, role_id = ?, department_id = ?,
            status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(
          input.name.trim(), input.email.trim().toLowerCase(), Number(input.roleId),
          input.departmentId ? Number(input.departmentId) : null, input.status || 'active', id
        );
      }
      if (shouldReplacePermissions) replaceUserCalendarPermissions(id, permissions);
      audit(
        req.user.id,
        'update',
        'user',
        id,
        { ...previous, calendarPermissions: previousPermissions },
        { ...input, password: undefined, calendarPermissions: shouldReplacePermissions ? permissions : previousPermissions }
      );
      db.exec('COMMIT');
    } catch (transactionError) {
      db.exec('ROLLBACK');
      throw transactionError;
    }
    res.json({ success: true });
  });

  app.get('/api/admin/calendars', authMiddleware, requireAdministrator, (req, res) => {
    const calendars = db.prepare(`
      SELECT c.id, c.name, c.description, c.color,
             c.department_id AS departmentId, d.name AS department,
             c.owner_user_id AS ownerUserId, u.name AS ownerName,
             c.visibility, c.sync_enabled AS syncEnabled, c.status,
             COUNT(cp.id) AS permissionCount
      FROM calendars c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN users u ON u.id = c.owner_user_id
      LEFT JOIN calendar_permissions cp ON cp.calendar_id = c.id
      GROUP BY c.id
      ORDER BY c.status, c.name
    `).all();
    res.json({ success: true, calendars });
  });

  app.get('/api/calendars/:id', authMiddleware, (req, res) => {
    const id = Number(req.params.id);
    const calendar = db.prepare(`
      SELECT id, name, description, color, department_id AS departmentId,
             owner_user_id AS ownerUserId, visibility, sync_enabled AS syncEnabled, status
      FROM calendars WHERE id = ?
    `).get(id);
    if (!calendar) return res.status(404).json({ success: false, error: 'Calendario no encontrado' });
    const capabilities = calendarCapabilities(req.user, id);
    if (!capabilities.canView) return res.status(403).json({ success: false, error: 'No tienes acceso a este calendario' });
    res.json({ success: true, calendar: { ...calendar, ...capabilities } });
  });

  app.post('/api/calendars', authMiddleware, requireAdministrator, (req, res) => {
    const input = req.body || {};
    const error = validateCalendar(input);
    if (error) return res.status(400).json({ success: false, error });
    const result = db.prepare(`
      INSERT INTO calendars (name, description, color, department_id, owner_user_id, visibility, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.name.trim(), input.description?.trim() || null, input.color,
      input.departmentId ? Number(input.departmentId) : null, req.user.id,
      input.visibility, input.status || 'active'
    );
    const id = Number(result.lastInsertRowid);
    audit(req.user.id, 'create', 'calendar', id, null, input);
    res.status(201).json({ success: true, calendarId: id });
  });

  app.put('/api/calendars/:id', authMiddleware, requireAdministrator, (req, res) => {
    const id = Number(req.params.id);
    const previous = db.prepare('SELECT * FROM calendars WHERE id = ?').get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Calendario no encontrado' });
    const input = req.body || {};
    const error = validateCalendar(input);
    if (error) return res.status(400).json({ success: false, error });
    db.prepare(`
      UPDATE calendars SET name = ?, description = ?, color = ?, department_id = ?,
        visibility = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(
      input.name.trim(), input.description?.trim() || null, input.color,
      input.departmentId ? Number(input.departmentId) : null, input.visibility,
      input.status || 'active', id
    );
    audit(req.user.id, 'update', 'calendar', id, previous, input);
    res.json({ success: true });
  });

  app.delete('/api/calendars/:id', authMiddleware, requireAdministrator, (req, res) => {
    const id = Number(req.params.id);
    const previous = db.prepare('SELECT * FROM calendars WHERE id = ?').get(id);
    if (!previous) return res.status(404).json({ success: false, error: 'Calendario no encontrado' });
    db.prepare("UPDATE calendars SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    audit(req.user.id, 'archive', 'calendar', id, previous, { status: 'archived' });
    res.json({ success: true });
  });

  app.get('/api/calendars/:id/permissions', authMiddleware, requireAdministrator, (req, res) => {
    const calendarId = Number(req.params.id);
    if (!db.prepare('SELECT id FROM calendars WHERE id = ?').get(calendarId)) {
      return res.status(404).json({ success: false, error: 'Calendario no encontrado' });
    }
    const permissions = db.prepare(`
      SELECT u.id AS userId, u.name, u.email, r.name AS role,
             COALESCE(cp.can_view, 0) AS canView,
             COALESCE(cp.can_create, 0) AS canCreate,
             COALESCE(cp.can_edit, 0) AS canEdit,
             COALESCE(cp.can_delete, 0) AS canDelete
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN calendar_permissions cp ON cp.user_id = u.id AND cp.calendar_id = ?
      WHERE u.status = 'active' AND r.name != 'Administrador'
      ORDER BY u.name
    `).all(calendarId);
    res.json({ success: true, permissions });
  });

  app.put('/api/calendars/:id/permissions', authMiddleware, requireAdministrator, (req, res) => {
    const calendarId = Number(req.params.id);
    if (!db.prepare('SELECT id FROM calendars WHERE id = ?').get(calendarId)) {
      return res.status(404).json({ success: false, error: 'Calendario no encontrado' });
    }
    const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const validUserIds = new Set(db.prepare('SELECT id FROM users').all().map((user) => user.id));
    if (permissions.some((permission) => !validUserIds.has(Number(permission.userId)))) {
      return res.status(400).json({ success: false, error: 'La lista contiene un usuario no válido' });
    }
    const previous = db.prepare(`
      SELECT user_id AS userId, can_view AS canView, can_create AS canCreate,
             can_edit AS canEdit, can_delete AS canDelete
      FROM calendar_permissions WHERE calendar_id = ?
    `).all(calendarId);
    const insert = db.prepare(`
      INSERT INTO calendar_permissions (calendar_id, user_id, can_view, can_create, can_edit, can_delete)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM calendar_permissions WHERE calendar_id = ?').run(calendarId);
      permissions.forEach((permission) => {
        const canCreate = permission.canCreate ? 1 : 0;
        const canEdit = permission.canEdit ? 1 : 0;
        const canDelete = permission.canDelete ? 1 : 0;
        const canView = permission.canView || canCreate || canEdit || canDelete ? 1 : 0;
        if (canView) insert.run(calendarId, Number(permission.userId), canView, canCreate, canEdit, canDelete);
      });
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    audit(req.user.id, 'permissions', 'calendar', calendarId, previous, permissions);
    res.json({ success: true });
  });
}

module.exports = {
  registerAdministrationRoutes,
  validateCalendar,
  validateUser,
  normalizeCalendarPermissions
};
