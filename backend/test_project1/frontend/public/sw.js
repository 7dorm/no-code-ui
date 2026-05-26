// Service Worker for Push Notifications
const CACHE_NAME = 'sigma-notifications-v1';
const STATIC_CACHE_NAME = 'sigma-static-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/static/js/bundle.js',
        '/manifest.json',
        '/icon-192x192.png',
        '/icon-512x512.png',
        '/badge-72x72.png',
      ]);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('Push data:', data);
      
      const options = {
        body: data.body || 'You have a new notification',
        icon: data.icon || '/icon-192x192.png',
        badge: data.badge || '/badge-72x72.png',
        tag: 'sigma-notification',
        data: data.data || {},
        actions: [
          {
            action: 'open',
            title: 'Open',
            icon: '/icon-192x192.png',
          },
          {
            action: 'dismiss',
            title: 'Dismiss',
          },
        ],
        requireInteraction: true,
        silent: false,
        vibrate: [200, 100, 200],
      };

      event.waitUntil(
        self.registration.showNotification(data.title || 'Sigma Notification', options)
      );
    } catch (error) {
      console.error('Error parsing push data:', error);
      
      // Fallback notification
      const options = {
        body: 'You have a new notification',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: 'sigma-notification',
      };

      event.waitUntil(
        self.registration.showNotification('Sigma Notification', options)
      );
    }
  }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Default action or 'open' action
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          
          // Navigate to notification target if specified
          if (event.notification.data && event.notification.data.url) {
            client.navigate(event.notification.data.url);
          }
          return;
        }
      }
      
      // If no window/tab is open, open a new one
      if (clients.openWindow) {
        const url = event.notification.data?.url || '/';
        clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline notifications
self.addEventListener('sync', (event) => {
  console.log('Background sync event:', event);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Handle offline/online events
self.addEventListener('online', () => {
  console.log('Service Worker: Online');
  // Sync any pending notifications
  self.registration.sync.register('background-sync');
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Offline');
});

// Background sync function
async function doBackgroundSync() {
  try {
    // Get any pending notifications from IndexedDB
    const pendingNotifications = await getPendingNotifications();
    
    for (const notification of pendingNotifications) {
      try {
        // Send notification to server
        await sendNotificationToServer(notification);
        
        // Remove from pending queue
        await removePendingNotification(notification.id);
      } catch (error) {
        console.error('Error syncing notification:', error);
      }
    }
  } catch (error) {
    console.error('Background sync error:', error);
  }
}

// Helper function to get pending notifications
async function getPendingNotifications() {
  // This would typically use IndexedDB to store pending notifications
  // For now, return empty array
  return [];
}

// Helper function to send notification to server
async function sendNotificationToServer(notification) {
  // This would send the notification to your backend
  // Implementation depends on your API structure
  console.log('Sending notification to server:', notification);
}

// Helper function to remove pending notification
async function removePendingNotification(id) {
  // This would remove the notification from IndexedDB
  console.log('Removing pending notification:', id);
}

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('Message received in Service Worker:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Error event
self.addEventListener('error', (event) => {
  console.error('Service Worker error:', event.error);
});

// Unhandled rejection event
self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker unhandled rejection:', event.reason);
});
