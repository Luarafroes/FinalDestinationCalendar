// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyAXJ-H6wh_8vI5f1_gTcIpMgoiqGzc3cMc",
    authDomain: "final-destination-calendar.firebaseapp.com",
    projectId: "final-destination-calendar",
    storageBucket: "final-destination-calendar.firebasestorage.app",
    messagingSenderId: "684548386292",
    appId: "1:684548386292:web:4b3933d57f4e352a2a1da1"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('Received background message: ', payload);
    
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/2544/2544639.png',
        data: {
            url: payload.data?.url || '/'
        }
    };
    
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(
        clients.openWindow(urlToOpen)
    );
});