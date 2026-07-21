self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    if (windows[0]) return windows[0].focus();
    return clients.openWindow('/');
  }));
});
