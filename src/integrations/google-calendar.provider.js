const { CalendarProvider } = require('./calendar-provider');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events'
];

class ProviderRequestError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ProviderRequestError';
    this.status = status;
    this.details = details;
  }
}

class GoogleCalendarProvider extends CalendarProvider {
  constructor(configSource) {
    super();
    this.configSource = configSource;
  }

  get name() {
    return 'google';
  }

  getConfig() {
    return typeof this.configSource === 'function'
      ? this.configSource()
      : this.configSource;
  }

  isConfigured() {
    const config = this.getConfig();
    return Boolean(config.clientId && config.clientSecret && config.redirectUri);
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      const error = new Error('Google Calendar no está configurado en las variables de entorno');
      error.code = 'PROVIDER_NOT_CONFIGURED';
      throw error;
    }
  }

  getAuthorizationUrl(state) {
    this.assertConfigured();
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state
    });
    return `${AUTH_ENDPOINT}?${params}`;
  }

  async exchangeCode(code) {
    this.assertConfigured();
    const config = this.getConfig();
    return this.tokenRequest({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code'
    });
  }

  async refreshAccessToken(refreshToken) {
    this.assertConfigured();
    const config = this.getConfig();
    return this.tokenRequest({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token'
    });
  }

  async tokenRequest(parameters) {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parameters)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new ProviderRequestError(payload.error_description || payload.error || 'Google rechazó la solicitud de token', response.status, payload);
    }
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null,
      scope: payload.scope
    };
  }

  async getAccount(accessToken) {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new ProviderRequestError('No fue posible consultar la cuenta de Google', response.status, payload);
    }
    return { email: payload.email, name: payload.name };
  }

  async createEvent(accessToken, calendarId, event) {
    return this.calendarRequest(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: 'POST', body: event }
    );
  }

  async updateEvent(accessToken, calendarId, externalEventId, event) {
    return this.calendarRequest(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`,
      { method: 'PATCH', body: event }
    );
  }

  async deleteEvent(accessToken, calendarId, externalEventId) {
    return this.calendarRequest(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalEventId)}`,
      { method: 'DELETE' }
    );
  }

  async listEvents(accessToken, calendarId, { pageToken = null, syncToken = null } = {}) {
    const params = new URLSearchParams({
      showDeleted: 'true',
      singleEvents: 'true',
      maxResults: '2500'
    });
    if (pageToken) params.set('pageToken', pageToken);
    if (syncToken) params.set('syncToken', syncToken);
    return this.calendarRequest(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { method: 'GET' }
    );
  }

  async calendarRequest(accessToken, path, { method = 'GET', body } = {}) {
    const response = await fetch(`${CALENDAR_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (response.status === 204) return null;
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error?.message || 'Google Calendar rechazó la operación';
      throw new ProviderRequestError(message, response.status, payload);
    }
    return payload;
  }
}

module.exports = { GoogleCalendarProvider, ProviderRequestError, SCOPES };
