self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: 'https://cdn-icons-png.flaticon.com/512/3233/3233178.png',
      badge: 'https://cdn-icons-png.flaticon.com/512/3233/3233178.png',
      vibrate: [100, 50, 100],
      data: { dateOfArrival: Date.now(), primaryKey: 1 }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});
