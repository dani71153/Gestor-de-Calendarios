class CalendarProvider {
  get name() {
    throw new Error('El proveedor debe declarar un nombre');
  }

  isConfigured() {
    return false;
  }

  getAuthorizationUrl() {
    throw new Error('Autorización no implementada');
  }

  async exchangeCode() {
    throw new Error('Intercambio de código no implementado');
  }

  async refreshAccessToken() {
    throw new Error('Renovación de token no implementada');
  }

  async getAccount() {
    throw new Error('Consulta de cuenta no implementada');
  }

  async createEvent() {
    throw new Error('Creación de evento no implementada');
  }

  async updateEvent() {
    throw new Error('Actualización de evento no implementada');
  }

  async deleteEvent() {
    throw new Error('Eliminación de evento no implementada');
  }

  async listEvents() {
    throw new Error('Consulta de eventos no implementada');
  }
}

module.exports = { CalendarProvider };
