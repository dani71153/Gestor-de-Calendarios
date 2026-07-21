export function escapeHtml(value = '') {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

export function initials(name) {
  return name.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

export function localInputValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function formatDate(iso, options = {}) {
  return new Intl.DateTimeFormat('es-DO', options).format(new Date(iso));
}
