if (typeof browser === "undefined") {
    var browser = chrome;
}

// Configuration
const ZEVENT_API_URL = "https://api.the-coven.fr/zevent";
const NOTIFICATIONS_API_URL = "https://api.the-coven.fr/zevent/notifications";
const CHECK_INTERVAL = 30000; // 30 secondes
const API_KEY = "df0a0ca75db1f605d250bfed7ac2544c";

browser.runtime.onInstalled.addListener(() => {
    console.log('Extension ZEvent lancée. Version:', browser.runtime.getManifest().version);
    console.log('Made with ❤️ by VooDoo');
});

// Fonction principale pour vérifier les notifications
async function checkAllNotifications() {
    try {
        // Récupère les données globales et les notifications en parallèle
        const [zeventData, notificationsData] = await Promise.all([
            fetchApi(ZEVENT_API_URL),
            fetchApi(NOTIFICATIONS_API_URL)
        ]);

        // Traite les notifications standards
        if (notificationsData?.data?.notifications) {
            await processNotifications(notificationsData.data.notifications, 'standard');
        }

        // Traite les notifications personnalisées
        if (notificationsData?.data?.customNotifications) {
            await processNotifications(notificationsData.data.customNotifications, 'custom');
        }

        // Vérifie les streams favoris
        if (zeventData?.Response?.live) {
            await checkFavoriteStreams(zeventData.Response.live);
        }

    } catch (error) {
        console.error('Erreur dans checkAllNotifications:', error);
        showErrorNotification("Erreur de connexion à l'API");
    }
}

// Fonction générique pour fetch avec clé API
async function fetchApi(url) {
    const response = await fetch(`${url}?_=${Date.now()}`, {
        headers: {
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
}

// Traitement des notifications
async function processNotifications(notifications, type) {
    const storage = await browser.storage.local.get([
        'notificationsEnabled', 
        'customNotificationsEnabled', 
        'lastNotificationId'
    ]);

    const isEnabled = type === 'standard' 
        ? storage.notificationsEnabled !== false 
        : storage.customNotificationsEnabled !== false;

    if (!isEnabled || !Array.isArray(notifications)) return;

    let lastId = storage.lastNotificationId || 0;
    let newLastId = lastId;

    notifications.forEach(notification => {
        if (notification.id > lastId) {
            showNotification(notification);
            newLastId = Math.max(newLastId, notification.id);
        }
    });

    if (newLastId > lastId) {
        await browser.storage.local.set({ lastNotificationId: newLastId });
    }
}

// Vérification des streams favoris
async function checkFavoriteStreams(streams) {
    const storage = await browser.storage.local.get(['favorites', 'lastNotifications']);
    const favorites = storage.favorites || [];
    let lastNotifications = storage.lastNotifications || {};

    streams.forEach(stream => {
        const name = stream.twitch;
        if (!favorites.includes(name)) return;

        // Notification si le streamer est en live
        if (stream.online && !lastNotifications[name]?.live) {
            showNotification({
                title: `${stream.display} est en live !`,
                message: `Joue à ${stream.game}`,
                url: `https://twitch.tv/${stream.twitch}`
            });
            lastNotifications[name] = { ...lastNotifications[name], live: true };
        } else if (!stream.online) {
            lastNotifications[name] = { ...lastNotifications[name], live: false };
        }
    });

    await browser.storage.local.set({ lastNotifications });
}

// Affichage des notifications
function showNotification({ title, message, url }) {
    const notificationId = `notif_${Date.now()}`;
    
    browser.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "assets/images/zevent.png",
        title,
        message,
        isClickable: !!url
    });

    if (url) {
        browser.storage.local.set({ [notificationId]: url });
    }
}

// Gestion des erreurs
function showErrorNotification(message) {
    browser.notifications.create({
        type: "basic",
        iconUrl: "assets/images/error.png",
        title: "Erreur Extension ZEvent",
        message
    });
}

// Gestion des clics sur les notifications
browser.notifications.onClicked.addListener(notificationId => {
    browser.storage.local.get(notificationId, result => {
        if (result[notificationId]) {
            browser.tabs.create({ url: result[notificationId] });
            browser.storage.local.remove(notificationId);
        }
    });
});

// Configuration des intervalles de vérification
browser.alarms.create("checkNotifications", { periodInMinutes: CHECK_INTERVAL / 60000 });
browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "checkNotifications") checkAllNotifications();
});

// Première vérification au lancement
checkAllNotifications();