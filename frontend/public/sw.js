self.addEventListener('push', function(event) {
  let data = { title: 'ЕГЭ-Планер', body: 'Новое уведомление' };
  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { title: parsed.title || data.title, body: parsed.body || data.body };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  const options = {
    body: data.body,
    icon: '/plan.png',  /* <--- ВАША НОВАЯ ИКОНКА */
    badge: '/plan.png', /* <--- ВАША НОВАЯ ИКОНКА */
    vibrate: [100, 50, 100],
    data: { url: '/' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
