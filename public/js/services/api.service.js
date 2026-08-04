export class ApiClient {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
    this.csrfToken = null;
  }

  async request(path, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const csrfHeader = !['GET', 'HEAD', 'OPTIONS'].includes(method) && this.csrfToken
      ? { 'X-CSRF-Token': this.csrfToken }
      : {};
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...csrfHeader, ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'No fue posible completar la operación');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    if (data.csrfToken) this.csrfToken = data.csrfToken;
    return data;
  }

  get(path) {
    return this.request(path);
  }

  post(path, body) {
    return this.request(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  put(path, body) {
    return this.request(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  delete(path) {
    return this.request(path, { method: 'DELETE' });
  }
}
