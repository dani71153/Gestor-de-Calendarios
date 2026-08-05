import { ApiClient } from './js/services/api.service.js';
import {
  VIEW_TITLES
} from './js/config/ui.config.js';
import {
  renderConnectionStatus,
  renderImportState,
  renderSyncHealth
} from './js/components/integration-status.component.js';
import { summaryCards, upcomingEvents, calendarDistribution } from './js/components/dashboard.component.js';
import { eventRows } from './js/components/events-table.component.js';
import { monthCalendar } from './js/components/month-calendar.component.js';
import { timeCalendar, PIXELS_PER_HOUR } from './js/components/time-calendar.component.js';
import { reportSummary, workloadRows, complianceRows } from './js/components/reports.component.js';
import {
  adminCalendarItems,
  adminUserItems,
  permissionRows,
  userCalendarAssignments
} from './js/components/administration.component.js';
import { escapeHtml, initials, localInputValue, formatDate } from './js/core/formatters.js';

const apiClient = new ApiClient();

const state = {
  user: null,
  events: [],
  listEvents: [],
  calendars: [],
  eventTypes: [],
  users: [],
  resources: [],
  adminResources: [],
  settings: {
    distributionMaxCalendars: 5, distributionScaleMaxActivities: 10,
    defaultCalendarView: 'month', workdayStartHour: 8,
    workdayEndHour: 18, calendarSlotMinutes: 30, remindersEnabled: true,
    defaultReminderMinutes: 30, notificationsEnabled: true, developerModeEnabled: false,
    browserPushEnabled: false, emailNotificationsEnabled: false,
    emailWebhookUrl: '', whatsappNotificationsEnabled: false,
    whatsappWebhookUrl: '', whatsappRecipient: ''
  },
  settingsCanEdit: false,
  notifications: [],
  unreadNotifications: 0,
  integration: null,
  adminUsers: [],
  adminCalendars: [],
  roles: [],
  departments: [],
  lastFocused: null,
  calendarDate: new Date(),
  calendarMode: 'month',
  eventPreset: '',
  listRequest: 0,
  conflictRequest: 0
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(url, options = {}) {
  return apiClient.request(url.replace(/^\/api/, ''), options);
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
}

function syncOverlayState() {
  const hasOpenOverlay = $$('.modal-backdrop').some((overlay) => !overlay.hidden);
  document.body.classList.toggle('overlay-open', hasOpenOverlay);
  $('#app').inert = hasOpenOverlay;
}

function setOverlayOpen(overlay, isOpen) {
  overlay.hidden = !isOpen;
  syncOverlayState();
}

function trapOverlayFocus(event, overlay) {
  if (event.key !== 'Tab') return;
  const focusable = $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    .filter((element) => overlay.contains(element) && element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function bootstrap() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    showApp();
    await Promise.all([loadSettings(), loadMetadata(), loadNotifications()]);
    await showBrowserPush(state.notifications);
    state.calendarMode = state.settings.defaultCalendarView || 'month';
    await Promise.all([loadEvents(), loadEventList()]);
    await loadDashboard();
    handleIntegrationCallback();
  } catch {
    $('#login-screen').hidden = false;
    $('#app').hidden = true;
  }
}

function showApp() {
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  $('#user-name').textContent = state.user.name;
  $('#user-role').textContent = state.user.role;
  $('#user-avatar').textContent = initials(state.user.name);
  $('#first-name').textContent = state.user.name.split(' ')[0];
  $('#today-label').textContent = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
  const isAdministrator = state.user.role === 'Administrador';
  $('.admin-nav').hidden = !isAdministrator;
  $('.settings-nav').hidden = !isAdministrator;
  $('#app').classList.toggle('is-admin', isAdministrator);
}

async function loadMetadata() {
  const [calendars, eventTypes, users, resources] = await Promise.all([
    api('/api/calendars'), api('/api/event-types'), api('/api/users'), api('/api/resources')
  ]);
  state.calendars = calendars.calendars;
  state.eventTypes = eventTypes.eventTypes;
  state.users = users.users;
  state.resources = resources.resources;

  const calendarOptions = state.calendars.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  $('#calendar-filter').innerHTML = `<option value="">Todos los calendarios</option>${calendarOptions}`;
  $('#list-calendar-filter').innerHTML = `<option value="">Todos los calendarios</option>${calendarOptions}`;
  $('#event-form [name=calendarId]').innerHTML = calendarOptions;
  $('#event-form [name=eventTypeId]').innerHTML = state.eventTypes.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  $('#event-form [name=responsibleUserId]').innerHTML = `<option value="">Sin asignar</option>${state.users.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;
  $('#event-form [name=resourceId]').innerHTML = `<option value="">Sin recurso</option>${state.resources.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</option>`).join('')}`;
  const canCreateEvent = state.calendars.some((calendar) => calendar.canCreate);
  $$('.new-event').forEach((button) => { button.hidden = !canCreateEvent; });
}

async function loadSettings() {
  const data = await api('/api/settings');
  state.settings = data.settings;
  state.settingsCanEdit = data.canEdit;
  const form = $('#settings-form');
  Object.entries(state.settings).forEach(([name, value]) => {
    const control = form.elements[name];
    if (!control) return;
    if (control.type === 'checkbox') control.checked = Boolean(value);
    else control.value = value;
  });
  form.querySelectorAll('input, select, button').forEach((control) => {
    if (control.id !== 'new-resource') control.disabled = !state.settingsCanEdit;
  });
  $('#new-resource').hidden = !state.settingsCanEdit;
  $('.reminder-field').hidden = !state.settings.remindersEnabled;
  renderDeveloperTools();
}

function renderDeveloperTools() {
  const checked = $('#settings-form').elements.developerModeEnabled.checked;
  const active = Boolean(state.settings.developerModeEnabled);
  $('#developer-tools').hidden = !checked;
  $('#developer-tools-note').textContent = active
    ? 'Los mensajes aparecerán en la campana de la barra superior.'
    : 'Guarda la configuración para habilitar estas acciones.';
  ['#test-notification', '#test-reminder'].forEach((selector) => {
    $(selector).disabled = !active || !state.settingsCanEdit;
  });
}

async function loadSettingsView() {
  if (!state.settingsCanEdit) return;
  const data = await api('/api/admin/resources');
  state.adminResources = data.resources;
  renderResources();
}

function initializeReportDates() {
  const form = $('#report-filter');
  if (form.elements.start.value) return;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  form.elements.start.value = localInputValue(start).slice(0, 10);
  form.elements.end.value = localInputValue(end).slice(0, 10);
}

async function loadReports(event) {
  event?.preventDefault();
  initializeReportDates();
  const values = Object.fromEntries(new FormData($('#report-filter')));
  const data = await api(`/api/reports/operations?start=${encodeURIComponent(`${values.start}T00:00:00`)}&end=${encodeURIComponent(`${values.end}T23:59:59`)}`);
  $('#report-summary').innerHTML = reportSummary(data.summary);
  $('#workload-report').innerHTML = workloadRows(data.workload);
  $('#compliance-report').innerHTML = complianceRows(data.calendars);
}

function renderResources() {
  const labels = { room: 'Sala', equipment: 'Equipo', vehicle: 'Vehículo', other: 'Otro' };
  $('#resource-list').innerHTML = state.adminResources.length ? state.adminResources.map((resource) => `
    <button class="resource-row" type="button" data-resource-id="${resource.id}">
      <span><strong>${escapeHtml(resource.name)}</strong><small>${labels[resource.type]}${resource.location ? ` · ${escapeHtml(resource.location)}` : ''}</small></span>
      <span class="status-pill ${resource.status}">${resource.status === 'active' ? 'Activo' : 'Inactivo'}</span>
    </button>
  `).join('') : '<div class="empty-state">Aún no hay recursos configurados.</div>';
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const input = {
    distributionMaxCalendars: Number(values.distributionMaxCalendars),
    distributionScaleMaxActivities: Number(values.distributionScaleMaxActivities),
    defaultCalendarView: values.defaultCalendarView,
    workdayStartHour: Number(values.workdayStartHour),
    workdayEndHour: Number(values.workdayEndHour),
    calendarSlotMinutes: Number(values.calendarSlotMinutes),
    remindersEnabled: form.elements.remindersEnabled.checked,
    defaultReminderMinutes: Number(values.defaultReminderMinutes),
    notificationsEnabled: form.elements.notificationsEnabled.checked,
    browserPushEnabled: form.elements.browserPushEnabled.checked,
    emailNotificationsEnabled: form.elements.emailNotificationsEnabled.checked,
    emailWebhookUrl: values.emailWebhookUrl,
    whatsappNotificationsEnabled: form.elements.whatsappNotificationsEnabled.checked,
    whatsappWebhookUrl: values.whatsappWebhookUrl,
    whatsappRecipient: values.whatsappRecipient,
    notificationRetentionDays: Number(values.notificationRetentionDays),
    locationConflictsEnabled: form.elements.locationConflictsEnabled.checked,
    resourceConflictsEnabled: form.elements.resourceConflictsEnabled.checked,
    developerModeEnabled: form.elements.developerModeEnabled.checked
  };
  try {
    const data = await api('/api/settings', { method: 'PUT', body: JSON.stringify(input) });
    state.settings = data.settings;
    $('.reminder-field').hidden = !state.settings.remindersEnabled;
    renderDeveloperTools();
    renderCalendar();
    await loadDashboard();
    $('#settings-error').hidden = true;
    toast('Configuración guardada');
  } catch (error) {
    $('#settings-error').textContent = error.message;
    $('#settings-error').hidden = false;
  }
}

function openResourceModal(resource = null) {
  state.lastFocused = document.activeElement;
  const form = $('#resource-form');
  form.reset();
  $('#resource-error').hidden = true;
  $('#resource-modal-title').textContent = resource ? 'Editar recurso' : 'Nuevo recurso';
  if (resource) Object.entries(resource).forEach(([name, value]) => {
    if (form.elements[name]) form.elements[name].value = value ?? '';
  });
  setOverlayOpen($('#resource-modal'), true);
  requestAnimationFrame(() => form.elements.name.focus());
}

function closeResourceModal() {
  setOverlayOpen($('#resource-modal'), false);
  state.lastFocused?.focus?.();
}

async function saveResource(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api(values.id ? `/api/admin/resources/${values.id}` : '/api/admin/resources', {
      method: values.id ? 'PUT' : 'POST',
      body: JSON.stringify({ name: values.name, type: values.type, location: values.location, status: values.status })
    });
    closeResourceModal();
    await Promise.all([loadSettingsView(), loadMetadata()]);
    toast(values.id ? 'Recurso actualizado' : 'Recurso creado');
  } catch (error) {
    $('#resource-error').textContent = error.message;
    $('#resource-error').hidden = false;
  }
}

async function loadNotifications() {
  const data = await api('/api/notifications?limit=30');
  state.notifications = data.notifications;
  state.unreadNotifications = data.unread;
  renderNotifications();
  await showBrowserPush(data.notifications);
}

async function enableBrowserPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    toast('Este navegador no admite notificaciones del sistema');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('El permiso de notificaciones no fue concedido');
    return;
  }
  await navigator.serviceWorker.register('/sw.js');
  toast('Push autorizado en este navegador');
}

async function showBrowserPush(notifications) {
  if (!state.settings.browserPushEnabled || window.Notification?.permission !== 'granted'
    || !('serviceWorker' in navigator)) return;
  const seen = new Set(JSON.parse(localStorage.getItem('pushedNotificationIds') || '[]'));
  const pending = notifications.filter((item) => !item.readAt && !seen.has(item.id)).slice(0, 3);
  if (!pending.length) return;
  const registration = await navigator.serviceWorker.ready;
  for (const item of pending) {
    await registration.showNotification(item.title, { body: item.message, icon: '/favicon.svg', tag: `notification-${item.id}` });
    seen.add(item.id);
  }
  localStorage.setItem('pushedNotificationIds', JSON.stringify([...seen].slice(-100)));
}

// Título original, capturado antes de anteponerle ningún contador.
const BASE_DOCUMENT_TITLE = document.title;

// Réplica de public/favicon.svg sin la etiqueta de cierre, para poder añadirle
// el punto de aviso antes de cerrarla. Si cambia el icono, cambia también aquí.
const FAVICON_BODY = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
  + '<rect width="64" height="64" rx="14" fill="#202827"/>'
  + '<path d="M18 20h28v26H18z" fill="none" stroke="#fff" stroke-width="4"/>'
  + '<path d="M18 28h28M25 15v10M39 15v10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="square"/>'
  + '<path d="M26 35h5v5h-5zM35 35h5v5h-5z" fill="#7791e5"/>';

// A 16x16 píxeles un número sería ilegible: el icono solo indica que hay algo
// pendiente y la cifra exacta va en el título de la pestaña.
const FAVICON_DOT = '<circle cx="47" cy="17" r="14" fill="#202827"/>'
  + '<circle cx="47" cy="17" r="10" fill="#e5484d"/>';

function faviconDataUri(hasUnread) {
  const svg = FAVICON_BODY + (hasUnread ? FAVICON_DOT : '') + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Refleja las notificaciones sin leer en la pestaña del navegador, para que se
// vean sin tener la aplicación en primer plano.
function renderTabBadge() {
  const unread = state.unreadNotifications;
  const label = unread > 99 ? '99+' : unread;

  document.title = unread > 0 ? `(${label}) ${BASE_DOCUMENT_TITLE}` : BASE_DOCUMENT_TITLE;

  const icon = $('#favicon');
  if (icon) icon.href = faviconDataUri(unread > 0);
}

function renderNotifications() {
  renderTabBadge();
  const badge = $('#notification-badge');
  badge.textContent = state.unreadNotifications > 99 ? '99+' : state.unreadNotifications;
  badge.hidden = state.unreadNotifications === 0;
  $('#notification-list').innerHTML = state.notifications.length ? state.notifications.map((notification) => `
    <article class="notification-item ${notification.readAt ? '' : 'unread'}">
      <span class="notification-indicator"></span>
      <button class="notification-content" type="button" data-notification-open="${notification.id}"
        data-notification-event-id="${notification.eventId || ''}">
        <strong>${escapeHtml(notification.title)}</strong><p>${escapeHtml(notification.message)}</p><small>${formatDate(notification.createdAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
      </button>
      <button class="notification-delete" type="button" data-delete-notification-id="${notification.id}"
        aria-label="Eliminar ${escapeHtml(notification.title)}"><svg><use href="#icon-close"></use></svg></button>
    </article>
  `).join('') : '<div class="empty-state">No tienes notificaciones.</div>';
  $('#read-all-notifications').disabled = state.unreadNotifications === 0;
  $('#clear-notifications').disabled = state.notifications.length === 0;
}

function resetClearNotifications() {
  const button = $('#clear-notifications');
  clearTimeout(resetClearNotifications.timer);
  button.dataset.confirm = 'false';
  button.textContent = 'Limpiar';
  button.classList.remove('is-confirming');
}

async function clearNotifications() {
  const button = $('#clear-notifications');
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'Confirmar limpieza';
    button.classList.add('is-confirming');
    resetClearNotifications.timer = setTimeout(resetClearNotifications, 4500);
    return;
  }
  await api('/api/notifications', { method: 'DELETE' });
  resetClearNotifications();
  await loadNotifications();
  toast('Notificaciones eliminadas');
}

async function deleteNotification(id) {
  await api(`/api/notifications/${id}`, { method: 'DELETE' });
  await loadNotifications();
  toast('Notificación eliminada');
}

function toggleNotificationPanel(force) {
  const panel = $('#notification-panel');
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  $('#notification-button').setAttribute('aria-expanded', String(open));
}

async function sendTestNotification(variant) {
  const button = variant === 'reminder' ? $('#test-reminder') : $('#test-notification');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Generando…';
  try {
    await api('/api/developer/notifications/test', {
      method: 'POST', body: JSON.stringify({ variant })
    });
    await loadNotifications();
    toggleNotificationPanel(true);
    toast(variant === 'reminder' ? 'Recordatorio de prueba generado' : 'Notificación de prueba generada');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function loadAdministration() {
  if (state.user.role !== 'Administrador') return;
  const [users, calendars, roles, departments] = await Promise.all([
    api('/api/admin/users'),
    api('/api/admin/calendars'),
    api('/api/roles'),
    api('/api/departments')
  ]);
  state.adminUsers = users.users;
  state.adminCalendars = calendars.calendars;
  state.roles = roles.roles;
  state.departments = departments.departments.filter((department) => department.status === 'active');
  renderAdministration();
}

function renderAdministration() {
  $('#admin-calendar-list').innerHTML = adminCalendarItems(state.adminCalendars);
  $('#admin-user-list').innerHTML = adminUserItems(state.adminUsers);
  $('#admin-calendar-count').textContent = `${state.adminCalendars.length} registros`;
  $('#admin-user-count').textContent = `${state.adminUsers.length} registros`;
}

function departmentOptions(emptyLabel) {
  return `<option value="">${emptyLabel}</option>${state.departments
    .map((department) => `<option value="${department.id}">${escapeHtml(department.name)}</option>`)
    .join('')}`;
}

async function openCalendarAdministration(calendar = null) {
  if (!state.roles.length) await loadAdministration();
  state.lastFocused = document.activeElement;
  const form = $('#calendar-admin-form');
  form.reset();
  form.elements.departmentId.innerHTML = departmentOptions('Toda la empresa');
  $('#calendar-admin-error').hidden = true;
  $('#calendar-admin-title').textContent = calendar ? 'Editar calendario' : 'Nuevo calendario';
  $('#archive-admin-calendar').hidden = !calendar || calendar.status === 'archived';
  $('#archive-admin-calendar').dataset.confirm = 'false';
  $('#archive-admin-calendar').textContent = 'Archivar calendario';

  let permissions;
  if (calendar) {
    Object.entries({
      id: calendar.id,
      name: calendar.name,
      description: calendar.description || '',
      color: calendar.color,
      departmentId: calendar.departmentId || '',
      visibility: calendar.visibility,
      status: calendar.status
    }).forEach(([name, value]) => { form.elements[name].value = value; });
    permissions = (await api(`/api/calendars/${calendar.id}/permissions`)).permissions;
  } else {
    permissions = state.adminUsers
      .filter((user) => user.status === 'active' && user.role !== 'Administrador')
      .map((user) => ({
        userId: user.id,
        name: user.name,
        role: user.role,
        canView: 0,
        canCreate: 0,
        canEdit: 0,
        canDelete: 0
      }));
  }
  $('#calendar-permission-list').innerHTML = permissionRows(permissions);
  setOverlayOpen($('#calendar-admin-modal'), true);
  requestAnimationFrame(() => form.elements.name.focus({ preventScroll: true }));
}

function closeCalendarAdministration() {
  setOverlayOpen($('#calendar-admin-modal'), false);
  state.lastFocused?.focus?.();
}

function readCalendarPermissions() {
  return $$('#calendar-permission-list [data-permission-user-id]').map((row) => ({
    userId: Number(row.dataset.permissionUserId),
    canView: row.querySelector('[data-permission=canView]').checked,
    canCreate: row.querySelector('[data-permission=canCreate]').checked,
    canEdit: row.querySelector('[data-permission=canEdit]').checked,
    canDelete: row.querySelector('[data-permission=canDelete]').checked
  }));
}

async function refreshAfterAdministration() {
  await Promise.all([loadAdministration(), loadMetadata()]);
  await Promise.all([loadEvents(), loadEventList()]);
  await loadDashboard();
}

async function saveCalendarAdministration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.textContent = 'Guardando…';
  $('#calendar-admin-error').hidden = true;
  try {
    const input = {
      name: values.name,
      description: values.description,
      color: values.color,
      departmentId: values.departmentId ? Number(values.departmentId) : null,
      visibility: values.visibility,
      status: values.status
    };
    const result = await api(values.id ? `/api/calendars/${values.id}` : '/api/calendars', {
      method: values.id ? 'PUT' : 'POST',
      body: JSON.stringify(input)
    });
    const calendarId = Number(values.id || result.calendarId);
    await api(`/api/calendars/${calendarId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions: readCalendarPermissions() })
    });
    closeCalendarAdministration();
    await refreshAfterAdministration();
    toast(values.id ? 'Calendario actualizado' : 'Calendario creado');
  } catch (error) {
    $('#calendar-admin-error').textContent = error.message;
    $('#calendar-admin-error').hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Guardar calendario';
  }
}

async function archiveCalendarAdministration() {
  const button = $('#archive-admin-calendar');
  const id = $('#calendar-admin-form').elements.id.value;
  if (!id) return;
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'Confirmar archivado';
    return;
  }
  try {
    button.disabled = true;
    await api(`/api/calendars/${id}`, { method: 'DELETE' });
    closeCalendarAdministration();
    await refreshAfterAdministration();
    toast('Calendario archivado');
  } catch (error) {
    $('#calendar-admin-error').textContent = error.message;
    $('#calendar-admin-error').hidden = false;
  } finally {
    button.disabled = false;
    button.dataset.confirm = 'false';
    button.textContent = 'Archivar calendario';
  }
}

async function openUserAdministration(user = null) {
  if (!state.roles.length) await loadAdministration();
  state.lastFocused = document.activeElement;
  const form = $('#user-admin-form');
  form.reset();
  form.elements.roleId.innerHTML = state.roles
    .map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`)
    .join('');
  form.elements.departmentId.innerHTML = departmentOptions('Sin departamento');
  if (!user) {
    const employeeRole = state.roles.find((role) => role.name === 'Empleado');
    if (employeeRole) form.elements.roleId.value = employeeRole.id;
  }
  form.elements.password.required = !user;
  $('#user-password-hint').textContent = user
    ? 'Déjala vacía para conservar la contraseña actual.'
    : 'Mínimo 8 caracteres.';
  $('#user-admin-error').hidden = true;
  $('#user-admin-title').textContent = user ? 'Editar usuario' : 'Nuevo usuario';
  if (user) {
    Object.entries({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      roleId: user.roleId,
      departmentId: user.departmentId || '',
      status: user.status
    }).forEach(([name, value]) => { form.elements[name].value = value; });
  }
  renderUserCalendarAccess(user?.calendarPermissions || []);
  setOverlayOpen($('#user-admin-modal'), true);
  requestAnimationFrame(() => form.elements.name.focus({ preventScroll: true }));
}

function selectedUserRole() {
  const roleId = Number($('#user-admin-form').elements.roleId.value);
  return state.roles.find((role) => role.id === roleId)?.name || 'Empleado';
}

function readUserCalendarPermissions() {
  return $$('#user-calendar-assignment-list [data-user-calendar-id]').flatMap((row) => {
    const level = row.querySelector('[data-calendar-access]').value;
    if (level === 'none') return [];
    return [{
      calendarId: Number(row.dataset.userCalendarId),
      canView: true,
      canCreate: ['create', 'manage'].includes(level),
      canEdit: level === 'manage',
      canDelete: level === 'manage'
    }];
  });
}

function updateUserCalendarCount() {
  const count = readUserCalendarPermissions().length;
  $('#user-calendar-count').textContent = `${count} ${count === 1 ? 'asignado' : 'asignados'}`;
}

function renderUserCalendarAccess(permissions = readUserCalendarPermissions()) {
  const role = selectedUserRole();
  $('#user-calendar-assignment-list').innerHTML = userCalendarAssignments(
    state.adminCalendars,
    permissions,
    role
  );
  $('#user-calendar-help').textContent = role === 'Administrador'
    ? 'Los administradores acceden a todos los calendarios sin asignaciones adicionales.'
    : role === 'Consulta'
      ? 'El rol Consulta solo admite acceso de lectura.'
      : 'La visibilidad general o departamental puede conceder lectura; estos permisos agregan capacidades explícitas.';
  updateUserCalendarCount();
}

function closeUserAdministration() {
  setOverlayOpen($('#user-admin-modal'), false);
  state.lastFocused?.focus?.();
}

async function saveUserAdministration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.textContent = 'Guardando…';
  $('#user-admin-error').hidden = true;
  try {
    await api(values.id ? `/api/admin/users/${values.id}` : '/api/admin/users', {
      method: values.id ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: values.name,
        email: values.email,
        password: values.password,
        roleId: Number(values.roleId),
        departmentId: values.departmentId ? Number(values.departmentId) : null,
        status: values.status,
        calendarPermissions: readUserCalendarPermissions()
      })
    });
    closeUserAdministration();
    await refreshAfterAdministration();
    toast(values.id ? 'Usuario actualizado' : 'Usuario creado');
  } catch (error) {
    $('#user-admin-error').textContent = error.message;
    $('#user-admin-error').hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Guardar usuario';
  }
}

async function loadDashboard() {
  const cards = $('#summary-cards');
  cards.classList.add('is-loading');
  cards.setAttribute('aria-busy', 'true');
  try {
    const data = await api('/api/dashboard/summary');
    cards.innerHTML = summaryCards(data.summary);
    $('#upcoming-list').innerHTML = upcomingEvents(data.upcoming);
    $('#calendar-distribution').innerHTML = calendarDistribution(
      state.calendars,
      state.events,
      state.settings.distributionMaxCalendars,
      state.settings.distributionScaleMaxActivities
    );
  } finally {
    cards.classList.remove('is-loading');
    cards.setAttribute('aria-busy', 'false');
  }
}

async function loadEvents() {
  const { events } = await api('/api/events');
  state.events = events;
  renderCalendar();
}

async function loadEventList() {
  const requestId = ++state.listRequest;
  const params = new URLSearchParams();
  const search = $('#event-search').value.trim();
  if (search) params.set('q', search);
  if ($('#list-calendar-filter').value) params.set('calendarId', $('#list-calendar-filter').value);
  if ($('#status-filter').value) params.set('status', $('#status-filter').value);
  if ($('#responsibility-filter').value === 'mine') params.set('responsibleUserId', state.user.id);
  if ($('#responsibility-filter').value === 'unassigned') params.set('unassigned', 'true');
  if (state.eventPreset) params.set('preset', state.eventPreset);
  const { events } = await api(`/api/events?${params}`);
  if (requestId !== state.listRequest) return;
  state.listEvents = events;
  renderEventsTable();
}

function renderEventsTable() {
  $('#events-table').innerHTML = eventRows(state.listEvents);
  $('#empty-events').hidden = state.listEvents.length > 0;
  $('#event-results').textContent = `${state.listEvents.length} ${state.listEvents.length === 1 ? 'resultado' : 'resultados'}`;
  renderFilterContext();
}

function renderFilterContext() {
  const criteria = [];
  const search = $('#event-search').value.trim();
  const calendarId = Number($('#list-calendar-filter').value || 0);
  const calendar = state.calendars.find((item) => item.id === calendarId);
  const status = $('#status-filter').selectedOptions[0]?.textContent;
  const responsibility = $('#responsibility-filter').selectedOptions[0]?.textContent;
  const presetLabels = {
    today: 'Eventos de hoy',
    upcoming: 'Próximos 7 días',
    conflicts: 'Eventos con solapamientos'
  };

  if (state.eventPreset) criteria.push(presetLabels[state.eventPreset]);
  if (search) criteria.push(`Búsqueda: “${search}”`);
  if (calendar) criteria.push(calendar.name);
  if ($('#status-filter').value) criteria.push(status);
  if ($('#responsibility-filter').value) criteria.push(responsibility);

  const context = $('#active-filter-context');
  context.textContent = criteria.length ? `Mostrando: ${criteria.join(' · ')}` : '';
  context.hidden = criteria.length === 0;
  $('#reset-event-filters').hidden = criteria.length === 0;
}

function resetEventFilters({ reload = true } = {}) {
  $('#event-search').value = '';
  $('#list-calendar-filter').value = '';
  $('#status-filter').value = '';
  $('#responsibility-filter').value = '';
  state.eventPreset = '';
  renderFilterContext();
  if (reload) loadEventList().catch((error) => toast(error.message));
}

function applySummaryFilter(key) {
  resetEventFilters({ reload: false });
  if (key === 'overdue') $('#status-filter').value = 'overdue';
  else if (key === 'unassigned') $('#responsibility-filter').value = 'unassigned';
  else state.eventPreset = key;
  showView('events');
  loadEventList().catch((error) => toast(error.message));
}

function renderCalendar() {
  const options = {
    currentDate: state.calendarDate, events: state.events,
    calendarId: Number($('#calendar-filter').value || 0)
  };
  const isMonth = state.calendarMode === 'month';
  const calendar = isMonth
    ? monthCalendar(options)
    : timeCalendar({ ...options, mode: state.calendarMode, settings: state.settings });
  $('#month-label').textContent = calendar.label;
  $('#month-weekdays').hidden = !isMonth;
  const grid = $('#calendar-grid');
  grid.className = isMonth ? 'calendar-grid' : 'time-calendar-host';
  grid.innerHTML = isMonth ? calendar.days : calendar.html;
  $('.calendar-wrap').classList.toggle('is-time-view', !isMonth);
  $$('[data-calendar-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.calendarMode === state.calendarMode);
  });
}

function changeCalendarPeriod(direction) {
  if (state.calendarMode === 'month') state.calendarDate.setMonth(state.calendarDate.getMonth() + direction);
  else state.calendarDate.setDate(state.calendarDate.getDate() + direction * (state.calendarMode === 'week' ? 7 : 1));
  renderCalendar();
}

function eventUpdatePayload(event, startDatetime = event.startDatetime, endDatetime = event.endDatetime) {
  return {
    title: event.title,
    calendarId: event.calendarId,
    eventTypeId: event.eventTypeId,
    startDatetime: new Date(startDatetime).toISOString(),
    endDatetime: new Date(endDatetime).toISOString(),
    responsibleUserId: event.responsibleUserId || null,
    resourceId: event.resourceId || null,
    reminderMinutes: event.reminderMinutes || null,
    status: event.status,
    priority: event.priority,
    location: event.location || '',
    description: event.description || '',
    syncWithGoogle: event.syncStatus !== 'not_synced'
  };
}

async function updateEventTiming(event, start, end) {
  const data = await api(`/api/events/${event.id}`, {
    method: 'PUT', body: JSON.stringify(eventUpdatePayload(event, start, end))
  });
  let syncWarning = '';
  if (event.syncStatus !== 'not_synced') {
    try { await api(`/api/events/${event.id}/sync`, { method: 'POST' }); }
    catch (error) { syncWarning = `; sincronización pendiente: ${error.message}`; }
  }
  await refreshWorkspace();
  toast(`${data.hasConflict ? `Cambio aplicado con ${data.conflicts.length} conflicto(s)` : 'Horario actualizado'}${syncWarning}`);
}

function dateFromTimeColumn(column, clientY) {
  const rect = column.getBoundingClientRect();
  const slot = Number(state.settings.calendarSlotMinutes) || 30;
  const rawMinutes = ((clientY - rect.top) / PIXELS_PER_HOUR) * 60;
  const snapped = Math.max(0, Math.round(rawMinutes / slot) * slot);
  const date = new Date(`${column.dataset.timeDay}T00:00:00`);
  date.setMinutes(Number(column.dataset.startHour) * 60 + snapped);
  return date;
}

function scheduleConflictCheck() {
  prepareConflictPreview($('#event-form'));
  clearTimeout(scheduleConflictCheck.timer);
  scheduleConflictCheck.timer = setTimeout(checkEventConflicts, 350);
}

function prepareConflictPreview(form) {
  const preview = $('#conflict-preview');
  const hasSchedule = form.elements.startDatetime.value && form.elements.endDatetime.value;
  const hasConstraint = form.elements.responsibleUserId.value
    || form.elements.resourceId.value || form.elements.location.value.trim();
  const canCheck = hasSchedule && hasConstraint;
  preview.classList.remove('has-conflict');
  preview.innerHTML = '';
  preview.hidden = !canCheck;
  if (canCheck) preview.textContent = 'Revisando personas, ubicación y recursos…';
}

async function checkEventConflicts() {
  const form = $('#event-form');
  if (form.dataset.readonly === 'true') return;
  const start = form.elements.startDatetime.value;
  const end = form.elements.endDatetime.value;
  const responsibleUserId = form.elements.responsibleUserId.value;
  const resourceId = form.elements.resourceId.value;
  const location = form.elements.location.value.trim();
  const preview = $('#conflict-preview');
  const startDate = new Date(start);
  const endDate = new Date(end);

  if ((!responsibleUserId && !resourceId && !location) || !start || !end || endDate <= startDate) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }

  const requestId = ++state.conflictRequest;
  preview.classList.remove('has-conflict');
  preview.textContent = 'Revisando personas, ubicación y recursos…';
  preview.hidden = false;

  try {
    const data = await api('/api/events/check-conflicts', {
      method: 'POST',
      body: JSON.stringify({
        id: Number(form.elements.id.value || 0),
        calendarId: Number(form.elements.calendarId.value || 0),
        responsibleUserId: responsibleUserId ? Number(responsibleUserId) : null,
        resourceId: resourceId ? Number(resourceId) : null,
        location,
        startDatetime: startDate.toISOString(),
        endDatetime: endDate.toISOString()
      })
    });
    if (requestId !== state.conflictRequest) return;
    if (!data.hasConflict) {
      preview.innerHTML = '<strong>Horario disponible.</strong> No encontramos cruces de persona, ubicación o recurso.';
      return;
    }
    preview.classList.add('has-conflict');
    preview.innerHTML = `
      <strong>${data.conflicts.length} ${data.conflicts.length === 1 ? 'conflicto encontrado' : 'conflictos encontrados'}.</strong>
      <span>Puedes guardar de todos modos o ajustar el horario.</span>
      <ul>${data.conflicts.map((conflict) => `
        <li><strong>${escapeHtml(conflict.title)}</strong> · ${formatDate(conflict.startDatetime, {
          day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
        })}<small>${escapeHtml((conflict.reasons || []).join(' · '))}</small></li>
      `).join('')}</ul>
    `;
  } catch (error) {
    if (requestId !== state.conflictRequest) return;
    preview.classList.add('has-conflict');
    preview.textContent = `No fue posible comprobar conflictos: ${error.message}`;
  }
}

function openEventModal(event = null, date = null) {
  const availableCalendars = event
    ? [...state.calendars]
    : state.calendars.filter((calendar) => calendar.canCreate);
  if (event && !availableCalendars.some((calendar) => calendar.id === event.calendarId)) {
    availableCalendars.push({ id: event.calendarId, name: event.calendarName });
  }
  if (!event && !availableCalendars.length) {
    toast('No tienes permiso para crear eventos en ningún calendario');
    return;
  }
  state.lastFocused = document.activeElement;
  const form = $('#event-form');
  const readOnly = Boolean(event && !event.canEdit);
  form.dataset.readonly = String(readOnly);
  form.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = false; });
  form.reset();
  form.elements.calendarId.innerHTML = availableCalendars
    .map((calendar) => `<option value="${calendar.id}">${escapeHtml(calendar.name)}</option>`)
    .join('');
  if (event?.resourceId && !state.resources.some((resource) => resource.id === event.resourceId)) {
    form.elements.resourceId.insertAdjacentHTML('beforeend', `<option value="${event.resourceId}">${escapeHtml(event.resourceName || 'Recurso no disponible')}</option>`);
  }
  $('#event-error').hidden = true;
  $('#delete-event').hidden = !event || !event.canDelete;
  $('#sync-event').hidden = !event || readOnly;
  form.querySelector('[type=submit]').hidden = readOnly;
  $('#modal-title').textContent = readOnly ? 'Detalle del evento' : event ? 'Editar evento' : 'Nuevo evento';
  $('#recurrence-fields').hidden = Boolean(event);
  $('#series-scope-field').hidden = !event?.seriesId;
  if (event) {
    Object.entries({
      id: event.id, title: event.title, calendarId: event.calendarId, eventTypeId: event.eventTypeId,
      startDatetime: localInputValue(event.startDatetime), endDatetime: localInputValue(event.endDatetime),
      responsibleUserId: event.responsibleUserId || '', status: event.status, priority: event.priority,
      resourceId: event.resourceId || '', reminderMinutes: event.reminderMinutes || '',
      location: event.location || '', description: event.description || ''
    }).forEach(([name, value]) => { form.elements[name].value = value; });
    form.elements.syncWithGoogle.checked = event.syncStatus !== 'not_synced';
  } else {
    const start = date
      ? new Date(date.includes('T') ? date : `${date}T09:00:00`)
      : new Date(Date.now() + 60 * 60 * 1000);
    const slot = Number(state.settings.calendarSlotMinutes) || 30;
    start.setMinutes(Math.ceil(start.getMinutes() / slot) * slot, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    form.elements.startDatetime.value = localInputValue(start);
    form.elements.endDatetime.value = localInputValue(end);
    form.elements.reminderMinutes.value = state.settings.remindersEnabled
      ? String(state.settings.defaultReminderMinutes || '') : '';
  }
  if (readOnly) {
    form.querySelectorAll('input, select, textarea').forEach((control) => { control.disabled = true; });
    $('#conflict-preview').hidden = true;
  } else {
    prepareConflictPreview(form);
  }
  const formScroller = form.querySelector('.event-form-content');
  formScroller.scrollTop = 0;
  setOverlayOpen($('#event-modal'), true);
  if (!readOnly) scheduleConflictCheck();
  requestAnimationFrame(() => {
    formScroller.scrollTop = 0;
    (readOnly ? $('#close-modal') : form.elements.title).focus({ preventScroll: true });
  });
}

function closeEventModal() {
  state.conflictRequest += 1;
  clearTimeout(scheduleConflictCheck.timer);
  setOverlayOpen($('#event-modal'), false);
  state.lastFocused?.focus?.();
}

async function refreshWorkspace() {
  await Promise.all([loadEvents(), loadEventList()]);
  await loadDashboard();
}

async function saveEvent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const input = {
    title: values.title, calendarId: Number(values.calendarId), eventTypeId: Number(values.eventTypeId),
    startDatetime: new Date(values.startDatetime).toISOString(), endDatetime: new Date(values.endDatetime).toISOString(),
    responsibleUserId: values.responsibleUserId ? Number(values.responsibleUserId) : null,
    resourceId: values.resourceId ? Number(values.resourceId) : null,
    reminderMinutes: values.reminderMinutes ? Number(values.reminderMinutes) : null,
    status: values.status, priority: values.priority, location: values.location,
    description: values.description, syncWithGoogle: form.elements.syncWithGoogle.checked,
    seriesScope: values.seriesScope || 'single',
    recurrence: values.recurrenceFrequency ? {
      frequency: values.recurrenceFrequency,
      interval: Number(values.recurrenceInterval),
      count: Number(values.recurrenceCount)
    } : null
  };
  try {
    const id = values.id;
    const data = await api(id ? `/api/events/${id}` : '/api/events', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(input)
    });
    let syncError = null;
    if (input.syncWithGoogle) {
      try {
        await api(`/api/events/${data.event.id}/sync`, { method: 'POST' });
      } catch (error) {
        syncError = error.message;
      }
    }
    closeEventModal();
    await refreshWorkspace();
    if (syncError) {
      toast(`Evento guardado; sincronización pendiente: ${syncError}`);
    } else {
      const seriesNote = data.occurrencesCreated > 1
        ? `Serie creada con ${data.occurrencesCreated} ocurrencias`
        : data.occurrencesUpdated > 1 ? `${data.occurrencesUpdated} ocurrencias actualizadas` : 'Evento guardado correctamente';
      toast(data.hasConflict ? `${seriesNote}; ${data.conflicts.length} conflicto(s)` : seriesNote);
    }
  } catch (error) {
    $('#event-error').textContent = error.message;
    $('#event-error').hidden = false;
  }
}

async function cancelEvent() {
  const form = $('#event-form');
  const id = form.elements.id.value;
  if (!id || !confirm('¿Deseas cancelar este evento?')) return;
  const seriesScope = form.elements.seriesScope?.value || 'single';
  const data = await api(`/api/events/${id}`, { method: 'DELETE', body: JSON.stringify({ seriesScope }) });
  if ($('#event-form').elements.syncWithGoogle.checked) {
    try {
      await api(`/api/events/${id}/sync`, { method: 'POST' });
    } catch (error) {
      toast(`Cancelado localmente; falta sincronizar: ${error.message}`);
    }
  }
  closeEventModal();
  await refreshWorkspace();
  toast(data.occurrencesCanceled > 1 ? `${data.occurrencesCanceled} ocurrencias canceladas` : 'Evento cancelado');
}

async function syncCurrentEvent() {
  const id = $('#event-form').elements.id.value;
  if (!id) return;
  const button = $('#sync-event');
  button.disabled = true;
  button.textContent = 'Sincronizando…';
  try {
    await api(`/api/events/${id}/sync`, { method: 'POST' });
    await Promise.all([loadEvents(), loadEventList()]);
    toast('Evento sincronizado con Google Calendar');
    closeEventModal();
  } catch (error) {
    $('#event-error').textContent = error.message;
    $('#event-error').hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Sincronizar ahora';
  }
}

async function loadIntegrationStatus() {
  const status = await api('/api/integrations/google/status');
  state.integration = status;
  $('#google-integration-status').innerHTML = renderConnectionStatus(status);
  const canConfigure = state.user.role === 'Administrador';
  $('#configure-google').hidden = !canConfigure;
  $('#configure-google').textContent = status.configured ? 'Configurar' : 'Configurar integración';
  $('#configure-google').className = status.configured ? 'button tertiary' : 'button primary';
  $('#connect-google').hidden = !status.configured || status.connected;
  $('#disconnect-google').hidden = !status.connected;
  const issueCount = status.counts.pending + status.counts.errors;
  const retryButton = $('#retry-sync');
  retryButton.hidden = !status.connected || !issueCount;
  retryButton.disabled = !status.connected || !issueCount;
  retryButton.textContent = `Reintentar ${issueCount} ${issueCount === 1 ? 'evento' : 'eventos'}`;
  const importCalendars = state.calendars.filter((calendar) => calendar.canCreate);
  const importSelect = $('#google-import-calendar');
  const selected = Number(importSelect.value || 0);
  importSelect.innerHTML = importCalendars.length
    ? importCalendars.map((calendar) => `<option value="${calendar.id}">${escapeHtml(calendar.name)}</option>`).join('')
    : '<option value="">No tienes calendarios disponibles</option>';
  if (importCalendars.some((calendar) => calendar.id === selected)) importSelect.value = selected;
  $('#google-import-section').hidden = !status.connected;
  $('#google-source-account').textContent = status.accountEmail || '';
  $('#google-import-result').innerHTML = renderImportState(status);
  $('#google-sync-section').hidden = !status.connected;
  $('#google-sync-health').innerHTML = renderSyncHealth(status);
  importSelect.disabled = !importCalendars.length;
  $('#import-google-changes').disabled = !status.connected || !importCalendars.length;
}

async function importGoogleChanges() {
  const calendarId = Number($('#google-import-calendar').value || 0);
  if (!calendarId) return;
  const button = $('#import-google-changes');
  const section = $('#google-import-section');
  button.disabled = true;
  button.textContent = 'Importando eventos…';
  section.setAttribute('aria-busy', 'true');
  try {
    const { result } = await api('/api/sync/import', {
      method: 'POST', body: JSON.stringify({ calendarId })
    });
    await Promise.all([refreshWorkspace(), loadIntegrationStatus()]);
    const changed = result.created + result.updated + result.canceled;
    toast(changed
      ? `${result.created} nuevos, ${result.updated} actualizados y ${result.canceled} cancelados`
      : `Sin cambios nuevos${result.skipped ? `; ${result.skipped} omitidos por cambios locales` : ''}`);
  } catch (error) {
    toast(`No se pudieron importar los cambios: ${error.message}`);
    await loadIntegrationStatus().catch(() => {});
  } finally {
    section.removeAttribute('aria-busy');
    button.disabled = false;
    button.textContent = 'Importar eventos ahora';
  }
}

async function openGoogleConfiguration() {
  state.lastFocused = document.activeElement;
  $('#integration-config-error').hidden = true;
  try {
    const { settings } = await api('/api/integrations/google/config');
    const form = $('#integration-config-form');
    form.elements.clientId.value = settings.clientId || '';
    form.elements.clientSecret.value = '';
    form.elements.redirectUri.value = settings.redirectUri || 'http://localhost:3000/api/integrations/google/callback';
    $('#integration-config-source').innerHTML = settings.configured
      ? `<strong>Configuración activa.</strong> Origen: ${settings.source === 'database' ? 'almacenamiento cifrado' : 'variables del servidor'}.`
      : '<strong>Configuración pendiente.</strong> Completa las credenciales creadas en Google Cloud.';
    $('#client-secret-hint').textContent = settings.clientSecretConfigured
      ? 'Ya existe un secreto. Déjalo vacío para conservarlo.'
      : 'Obligatorio en la configuración inicial; se guardará cifrado.';
    $('#reset-integration-config').hidden = settings.source !== 'database';
    $('#integration-config-modal .configuration-modal').scrollTop = 0;
    setOverlayOpen($('#integration-config-modal'), true);
    requestAnimationFrame(() => form.elements.clientId.focus());
  } catch (error) {
    toast(error.message);
  }
}

async function resetGoogleConfiguration() {
  const button = $('#reset-integration-config');
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'Confirmar restablecimiento';
    $('#integration-config-source').innerHTML = '<strong>Confirma la acción.</strong> Se eliminarán las credenciales cifradas y se volverá a la configuración del servidor.';
    setTimeout(() => {
      button.dataset.confirm = 'false';
      button.textContent = 'Restablecer configuración';
    }, 5000);
    return;
  }
  try {
    button.disabled = true;
    await api('/api/integrations/google/config', { method: 'DELETE' });
    closeGoogleConfiguration();
    await loadIntegrationStatus();
    toast('Configuración guardada eliminada');
  } catch (error) {
    $('#integration-config-error').textContent = error.message;
    $('#integration-config-error').hidden = false;
  } finally {
    button.disabled = false;
    button.dataset.confirm = 'false';
    button.textContent = 'Restablecer configuración';
  }
}

function closeGoogleConfiguration() {
  setOverlayOpen($('#integration-config-modal'), false);
  state.lastFocused?.focus?.();
}

async function saveGoogleConfiguration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  submit.textContent = 'Guardando…';
  $('#integration-config-error').hidden = true;
  try {
    await api('/api/integrations/google/config', {
      method: 'PUT',
      body: JSON.stringify({
        clientId: values.clientId,
        clientSecret: values.clientSecret,
        redirectUri: values.redirectUri
      })
    });
    closeGoogleConfiguration();
    await loadIntegrationStatus();
    toast('Configuración de Google Calendar guardada');
  } catch (error) {
    $('#integration-config-error').textContent = error.message;
    $('#integration-config-error').hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Guardar configuración';
  }
}

async function copyEnvironmentTemplate() {
  const template = $('#google-env-template').textContent.trim();
  await navigator.clipboard.writeText(template);
  toast('Plantilla .env copiada');
}

async function connectGoogle() {
  try {
    const data = await api('/api/integrations/google/connect', { method: 'POST' });
    location.href = data.authorizationUrl;
  } catch (error) {
    toast(error.message);
  }
}

async function disconnectGoogle() {
  if (!confirm('¿Deseas desconectar esta cuenta? Los eventos internos no se eliminarán.')) return;
  await api('/api/integrations/google', { method: 'DELETE' });
  await loadIntegrationStatus();
  toast('Cuenta de Google desconectada');
}

async function retrySync() {
  const button = $('#retry-sync');
  button.disabled = true;
  button.textContent = 'Procesando…';
  try {
    const result = await api('/api/sync/retry', { method: 'POST' });
    await Promise.all([loadIntegrationStatus(), loadEvents(), loadEventList()]);
    toast(`${result.succeeded} sincronizados; ${result.failed} con error`);
  } finally {
    if (button.textContent === 'Procesando…') button.textContent = 'Reintentar';
  }
}

function handleIntegrationCallback() {
  const params = new URLSearchParams(location.search);
  if (!params.has('integration')) return;
  showView('integrations');
  if (params.get('integration') === 'connected') {
    toast('Google Calendar conectado correctamente');
  } else {
    toast(params.get('message') || 'No fue posible conectar Google Calendar');
  }
  history.replaceState({}, '', location.pathname);
}

function showView(name) {
  if (['admin', 'settings'].includes(name) && state.user.role !== 'Administrador') return;
  $$('.view').forEach((view) => { view.hidden = view.id !== `${name}-view`; });
  $$('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
  $('#page-title').textContent = VIEW_TITLES[name];
  if (name === 'integrations') {
    loadIntegrationStatus().catch((error) => toast(error.message));
  }
  if (name === 'admin') {
    loadAdministration().catch((error) => toast(error.message));
  }
  if (name === 'settings') {
    Promise.all([loadSettings(), loadSettingsView()]).catch((error) => toast(error.message));
  }
  if (name === 'reports') {
    loadReports().catch((error) => toast(error.message));
  }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify(values) });
    $('#login-error').hidden = true;
    await bootstrap();
  } catch (error) {
    $('#login-error').textContent = error.message;
    $('#login-error').hidden = false;
  }
});

$('#logout-button').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.reload();
});

$$('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
$$('[data-go-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.goView)));
$$('.go-integrations').forEach((item) => item.addEventListener('click', () => showView('integrations')));
$$('.new-event').forEach((item) => item.addEventListener('click', () => openEventModal()));
$('#close-modal').addEventListener('click', closeEventModal);
$('#cancel-modal').addEventListener('click', closeEventModal);
$('#event-form').addEventListener('submit', saveEvent);
$('#delete-event').addEventListener('click', cancelEvent);
$('#sync-event').addEventListener('click', syncCurrentEvent);
$('#connect-google').addEventListener('click', connectGoogle);
$('#configure-google').addEventListener('click', openGoogleConfiguration);
$('#copy-env-template').addEventListener('click', copyEnvironmentTemplate);
$('#disconnect-google').addEventListener('click', disconnectGoogle);
$('#retry-sync').addEventListener('click', retrySync);
$('#import-google-changes').addEventListener('click', importGoogleChanges);
$('#settings-form').addEventListener('submit', saveSettings);
$('#report-filter').addEventListener('submit', loadReports);
$('#settings-form').elements.developerModeEnabled.addEventListener('change', renderDeveloperTools);
$('#enable-browser-push').addEventListener('click', () => enableBrowserPush().catch((error) => toast(error.message)));
$('#test-notification').addEventListener('click', () => sendTestNotification('test'));
$('#test-reminder').addEventListener('click', () => sendTestNotification('reminder'));
$('#new-resource').addEventListener('click', () => openResourceModal());
$('#resource-form').addEventListener('submit', saveResource);
$('#close-resource-modal').addEventListener('click', closeResourceModal);
$('#cancel-resource-modal').addEventListener('click', closeResourceModal);
$('#notification-button').addEventListener('click', (event) => {
  event.stopPropagation();
  toggleNotificationPanel();
  if (!$('#notification-panel').hidden) loadNotifications().catch((error) => toast(error.message));
});
$('#read-all-notifications').addEventListener('click', async () => {
  await api('/api/notifications/read-all', { method: 'POST' });
  await loadNotifications();
});
$('#clear-notifications').addEventListener('click', () => {
  clearNotifications().catch((error) => toast(error.message));
});
$('#new-admin-calendar').addEventListener('click', () => openCalendarAdministration().catch((error) => toast(error.message)));
$('#new-admin-user').addEventListener('click', () => openUserAdministration().catch((error) => toast(error.message)));
$('#calendar-admin-form').addEventListener('submit', saveCalendarAdministration);
$('#user-admin-form').addEventListener('submit', saveUserAdministration);
$('#user-admin-form').elements.roleId.addEventListener('change', () => renderUserCalendarAccess());
$('#user-calendar-assignment-list').addEventListener('change', updateUserCalendarCount);
$('#archive-admin-calendar').addEventListener('click', archiveCalendarAdministration);
$('#close-calendar-admin').addEventListener('click', closeCalendarAdministration);
$('#cancel-calendar-admin').addEventListener('click', closeCalendarAdministration);
$('#close-user-admin').addEventListener('click', closeUserAdministration);
$('#cancel-user-admin').addEventListener('click', closeUserAdministration);
$('#calendar-permission-list').addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-permission]');
  if (!checkbox) return;
  const row = checkbox.closest('[data-permission-user-id]');
  const view = row.querySelector('[data-permission=canView]');
  const elevated = ['canCreate', 'canEdit', 'canDelete']
    .map((permission) => row.querySelector(`[data-permission=${permission}]`));
  if (checkbox !== view && checkbox.checked) view.checked = true;
  if (checkbox === view && !view.checked) elevated.forEach((item) => { item.checked = false; });
});
$('#list-calendar-filter').addEventListener('change', loadEventList);
$('#status-filter').addEventListener('change', loadEventList);
$('#responsibility-filter').addEventListener('change', loadEventList);
$('#reset-event-filters').addEventListener('click', () => resetEventFilters());
$('#event-search').addEventListener('input', () => {
  clearTimeout(loadEventList.searchTimer);
  loadEventList.searchTimer = setTimeout(() => loadEventList().catch((error) => toast(error.message)), 300);
});
['startDatetime', 'endDatetime', 'responsibleUserId', 'resourceId', 'location'].forEach((name) => {
  $('#event-form').elements[name].addEventListener('change', scheduleConflictCheck);
  if (!['responsibleUserId', 'resourceId'].includes(name)) {
    $('#event-form').elements[name].addEventListener('input', scheduleConflictCheck);
  }
});
$('#calendar-filter').addEventListener('change', renderCalendar);
$('#prev-month').addEventListener('click', () => changeCalendarPeriod(-1));
$('#next-month').addEventListener('click', () => changeCalendarPeriod(1));
$('#today-button').addEventListener('click', () => { state.calendarDate = new Date(); renderCalendar(); });
$$('[data-calendar-mode]').forEach((button) => button.addEventListener('click', () => {
  state.calendarMode = button.dataset.calendarMode;
  renderCalendar();
}));

document.addEventListener('click', async (event) => {
  if (!event.target.closest('.notification-anchor')) toggleNotificationPanel(false);
  const deleteButton = event.target.closest('[data-delete-notification-id]');
  if (deleteButton) {
    await deleteNotification(Number(deleteButton.dataset.deleteNotificationId));
    return;
  }
  const notification = event.target.closest('[data-notification-open]');
  if (notification) {
    await api(`/api/notifications/${notification.dataset.notificationOpen}/read`, { method: 'PATCH' });
    const eventId = Number(notification.dataset.notificationEventId || 0);
    await loadNotifications();
    toggleNotificationPanel(false);
    if (eventId) {
      const selected = [...state.events, ...state.listEvents].find((item) => item.id === eventId);
      if (selected) openEventModal(selected);
    }
    return;
  }
  const resourceButton = event.target.closest('[data-resource-id]');
  if (resourceButton) {
    const resource = state.adminResources.find((item) => item.id === Number(resourceButton.dataset.resourceId));
    if (resource) openResourceModal(resource);
    return;
  }
  const calendarAdminButton = event.target.closest('[data-admin-calendar-id]');
  if (calendarAdminButton) {
    const calendar = state.adminCalendars.find((item) => item.id === Number(calendarAdminButton.dataset.adminCalendarId));
    if (calendar) openCalendarAdministration(calendar).catch((error) => toast(error.message));
    return;
  }
  const userAdminButton = event.target.closest('[data-admin-user-id]');
  if (userAdminButton) {
    const user = state.adminUsers.find((item) => item.id === Number(userAdminButton.dataset.adminUserId));
    if (user) openUserAdministration(user).catch((error) => toast(error.message));
    return;
  }
  const summaryButton = event.target.closest('[data-summary-filter]');
  if (summaryButton) {
    applySummaryFilter(summaryButton.dataset.summaryFilter);
    return;
  }
  const eventButton = event.target.closest('[data-event-id]');
  if (event.target.closest('[data-resize-event-id]')) return;
  if (eventButton) {
    const selected = [...state.listEvents, ...state.events]
      .find((item) => item.id === Number(eventButton.dataset.eventId));
    if (selected) openEventModal(selected);
    return;
  }
  const day = event.target.closest('.calendar-day');
  if (day) openEventModal(null, day.dataset.date);
  const timeColumn = event.target.closest('.time-day-column');
  if (timeColumn && !event.target.closest('.time-event')) {
    openEventModal(null, localInputValue(dateFromTimeColumn(timeColumn, event.clientY)));
  }
});

$('#calendar-grid').addEventListener('dragstart', (event) => {
  const item = event.target.closest('.time-event[data-can-edit="true"]');
  if (!item) return;
  event.dataTransfer.setData('text/event-id', item.dataset.eventId);
  event.dataTransfer.effectAllowed = 'move';
  item.classList.add('is-dragging');
});

$('#calendar-grid').addEventListener('dragover', (event) => {
  const column = event.target.closest('.time-day-column');
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  $$('.time-day-column.drop-target').forEach((item) => item.classList.remove('drop-target'));
  column.classList.add('drop-target');
});

$('#calendar-grid').addEventListener('dragend', () => {
  $$('.time-day-column.drop-target').forEach((item) => item.classList.remove('drop-target'));
  $$('.time-event.is-dragging').forEach((item) => item.classList.remove('is-dragging'));
});

$('#calendar-grid').addEventListener('drop', (event) => {
  const column = event.target.closest('.time-day-column');
  const eventId = Number(event.dataTransfer.getData('text/event-id'));
  const item = state.events.find((candidate) => candidate.id === eventId);
  if (!column || !item?.canEdit) return;
  event.preventDefault();
  const duration = new Date(item.endDatetime) - new Date(item.startDatetime);
  let start = dateFromTimeColumn(column, event.clientY);
  const dayEnd = new Date(`${column.dataset.timeDay}T00:00:00`);
  dayEnd.setHours(Number(state.settings.workdayEndHour) || 18);
  if (start.getTime() + duration > dayEnd.getTime()) start = new Date(dayEnd.getTime() - duration);
  const end = new Date(start.getTime() + duration);
  updateEventTiming(item, start, end).catch((error) => toast(error.message));
});

$('#calendar-grid').addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('[data-resize-event-id]');
  if (!handle) return;
  event.preventDefault();
  event.stopPropagation();
  const item = state.events.find((candidate) => candidate.id === Number(handle.dataset.resizeEventId));
  const element = handle.closest('.time-event');
  if (!item?.canEdit || !element) return;
  const startY = event.clientY;
  const originalHeight = element.getBoundingClientRect().height;
  const duration = new Date(item.endDatetime) - new Date(item.startDatetime);
  const slot = Number(state.settings.calendarSlotMinutes) || 30;
  let nextDuration = duration;
  const move = (moveEvent) => {
    const deltaMinutes = ((moveEvent.clientY - startY) / PIXELS_PER_HOUR) * 60;
    const durationMinutes = Math.max(slot, Math.round((duration / 60000 + deltaMinutes) / slot) * slot);
    nextDuration = durationMinutes * 60000;
    element.style.height = `${Math.max(28, originalHeight + (nextDuration - duration) / 3600000 * PIXELS_PER_HOUR)}px`;
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    if (nextDuration !== duration) {
      updateEventTiming(item, new Date(item.startDatetime), new Date(new Date(item.startDatetime).getTime() + nextDuration))
        .catch((error) => { renderCalendar(); toast(error.message); });
    }
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up, { once: true });
});

$('#event-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeEventModal();
});

$('#integration-config-form').addEventListener('submit', saveGoogleConfiguration);
$('#close-integration-config').addEventListener('click', closeGoogleConfiguration);
$('#cancel-integration-config').addEventListener('click', closeGoogleConfiguration);
$('#reset-integration-config').addEventListener('click', resetGoogleConfiguration);
$('#integration-config-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeGoogleConfiguration();
});

$('#calendar-admin-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeCalendarAdministration();
});

$('#user-admin-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeUserAdministration();
});

$('#resource-modal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeResourceModal();
});

document.addEventListener('keydown', (event) => {
  const activeOverlay = $$('.modal-backdrop').find((overlay) => !overlay.hidden);
  if (activeOverlay) trapOverlayFocus(event, activeOverlay);
  if (event.key === 'Escape' && !$('#event-modal').hidden) closeEventModal();
  if (event.key === 'Escape' && !$('#integration-config-modal').hidden) closeGoogleConfiguration();
  if (event.key === 'Escape' && !$('#calendar-admin-modal').hidden) closeCalendarAdministration();
  if (event.key === 'Escape' && !$('#user-admin-modal').hidden) closeUserAdministration();
  if (event.key === 'Escape' && !$('#resource-modal').hidden) closeResourceModal();
});

bootstrap();

// El contador de la pestaña sirve precisamente cuando la aplicación no está en
// primer plano, así que en segundo plano se sigue consultando, solo que con
// menos frecuencia para no cargar al servidor sin motivo.
const NOTIFICATION_POLL_VISIBLE_MS = 60000;
const NOTIFICATION_POLL_HIDDEN_MS = 180000;
let lastNotificationPoll = Date.now();

function pollNotifications(force = false) {
  if (!state.user) return;
  const wait = document.hidden ? NOTIFICATION_POLL_HIDDEN_MS : NOTIFICATION_POLL_VISIBLE_MS;
  if (!force && Date.now() - lastNotificationPoll < wait) return;
  lastNotificationPoll = Date.now();
  loadNotifications().catch(() => {});
}

setInterval(() => pollNotifications(), 30000);

// Al volver a la pestaña, el contador debe estar al día de inmediato.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) pollNotifications(true);
});
