if (typeof browser === "undefined") {
    var browser = chrome;
}

// Configuration
const ZEVENT_API_URL = "https://api.the-coven.fr/zevent";
const NOTIFICATIONS_API_URL = "https://api.the-coven.fr/zevent/notifications";
const CHECK_INTERVAL = 30000; // 30 secondes
const API_KEY = "df0a0ca75db1f605d250bfed7ac2544c";

// Configuration par défaut des paliers
const DONATION_MILESTONES_CONFIG = {
    milestones: [
        { amount: 0, name: "Lancement", message: "Lancement des notifications des paliers. (tkt ca spam pas)" },
        { amount: 50000, name: "50K", message: "Premier palier des 50K€ atteint ! 🎉" },
        { amount: 100000, name: "100K", message: "100 000€ de collectés ! Incroyable ! 🎊" },
        { amount: 170770, name: "170 770", message: "Zevent 2016 battu ! 🏅" },
        { amount: 250000, name: "250K", message: "Quart de million d'euros ! 🤯" },
        { amount: 451851, name: "451 851", message: "Zevent 2017 battu ! 🏅" },
        { amount: 500000, name: "500K", message: "Demi-million d'euros ! 🎯" },
        { amount: 1000000, name: "1M", message: "1 MILLION D'EUROS !!! 🎇" },
        { amount: 1094731, name: "1 094 731", message: "Zevent 2018 battu ! 🏅" },
        { amount: 2000000, name: "2M", message: "2 MILLIONS !!! 🚀" },
        { amount: 3000000, name: "3M", message: "3 MILLIONS D'EUROS !!! 🌟" },
        { amount: 3509878, name: "3 509 878", message: "Zevent 2019 battu ! 🏅" },
        { amount: 4000000, name: "4M", message: "4 MILLIONS !!! 💫" },
        { amount: 5000000, name: "5M", message: "5 MILLIONS !!! 🎆" },
        { amount: 5724377, name: "5 724 377", message: "Zevent 2020 battu ! 🏅" },
        { amount: 6000000, name: "6M", message: "6 MILLIONS !!! 🔥" },
        { amount: 7000000, name: "7M", message: "7 MILLIONS !!! ⚡" },
        { amount: 8000000, name: "8M", message: "8 MILLIONS !!! 💎" },
        { amount: 9000000, name: "9M", message: "9 MILLIONS !!! 🌠" },
        { amount: 10000000, name: "10M", message: "10 MILLIONS D'EUROS !!! 🎇" },
        { amount: 10064480, name: "10 064 480", message: "Zevent 2021 battu ! 🏅" },
        { amount: 10145881, name: "10 145 881", message: "Zevent 2024 battu ! 🏅" },
        { amount: 10182126, name: "10 182 126", message: "Zevent 2022 battu ! 🏅" },
        { amount: 11000000, name: "11M", message: "11 MILLIONS !!! WOW 💎" },
        { amount: 12000000, name: "12M", message: "12 MILLIONS !!! 💚" },
        { amount: 13000000, name: "13M", message: "13 MILLIONS !!! 🥳" },
        { amount: 14000000, name: "14M", message: "14 MILLIONS !!! 🫶" },
        { amount: 15000000, name: "15M", message: "15 MILLIONS !!! 💗" }
    ],

    defaultMessages: {
        small: "L'événement a franchi le palier des {amount}€ ! 🎉",
        medium: "L'événement a franchi le palier des {amountK}K€ ! 🎊", 
        large: "L'événement a franchi le palier des {amountM}M€ ! 🎇"
    }
};

browser.runtime.onInstalled.addListener(() => {
    console.log('Extension ZEvent lancée. Version:', browser.runtime.getManifest().version);
    console.log('Made with ❤️ by VooDoo');
    
    // Initialiser la configuration
    initMilestonesConfig();
});

// Initialisation de la configuration
async function initMilestonesConfig() {
    const storage = await browser.storage.local.get(['donationMilestones', 'reachedMilestones']);
    
    if (!storage.donationMilestones) {
        await browser.storage.local.set({ 
            donationMilestones: DONATION_MILESTONES_CONFIG.milestones,
            reachedMilestones: []
        });
        console.log('Configuration des paliers initialisée');
    }
}

// Fonction pour obtenir les paliers configurés
async function getMilestonesConfig() {
    const storage = await browser.storage.local.get(['donationMilestones']);
    return storage.donationMilestones || DONATION_MILESTONES_CONFIG.milestones;
}

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

        // Vérifie les paliers de dons
        if (zeventData?.Response?.donationAmount?.number) {
            await checkDonationMilestones(zeventData.Response.donationAmount.number);
        }

    } catch (error) {
        console.error('Erreur dans checkAllNotifications:', error);
        showErrorNotification("Erreur de connexion à l'API");
    }
}

// Fonction pour vérifier les paliers de dons
async function checkDonationMilestones(currentAmount) {
    const storage = await browser.storage.local.get([
        'reachedMilestones', 
        'milestonesEnabled'
    ]);
    
    // Vérifier si les notifications de paliers sont activées
    if (storage.milestonesEnabled === false) return;
    
    const reachedMilestones = storage.reachedMilestones || [];
    const milestonesConfig = await getMilestonesConfig();
    const newMilestones = [];
    
    // Trier les paliers par montant croissant
    const sortedMilestones = [...milestonesConfig].sort((a, b) => a.amount - b.amount);
    
    // Vérifier chaque palier
    for (const milestone of sortedMilestones) {
        // Si le palier n'a pas encore été atteint ET que le montant actuel le dépasse
        if (!reachedMilestones.includes(milestone.amount) && currentAmount >= milestone.amount) {
            newMilestones.push(milestone.amount);
            showMilestoneNotification(milestone, currentAmount);
        }
    }
    
    // Mettre à jour les paliers atteints
    if (newMilestones.length > 0) {
        const updatedMilestones = [...reachedMilestones, ...newMilestones].sort((a, b) => a - b);
        await browser.storage.local.set({ reachedMilestones: updatedMilestones });
    }
}

// Fonction pour afficher une notification de palier
function showMilestoneNotification(milestoneConfig, currentAmount) {
    let message = milestoneConfig.message;
    
    // Si pas de message personnalisé, utiliser les messages par défaut
    if (!message) {
        if (milestoneConfig.amount < 1000) {
            message = DONATION_MILESTONES_CONFIG.defaultMessages.small
                .replace('{amount}', milestoneConfig.amount);
        } else if (milestoneConfig.amount < 1000000) {
            const amountK = (milestoneConfig.amount / 1000).toFixed(0);
            message = DONATION_MILESTONES_CONFIG.defaultMessages.medium
                .replace('{amountK}', amountK);
        } else {
            const amountM = (milestoneConfig.amount / 1000000).toFixed(1);
            message = DONATION_MILESTONES_CONFIG.defaultMessages.large
                .replace('{amountM}', amountM);
        }
    }
    
    const formattedCurrent = formatDonationAmount(currentAmount);
    const fullMessage = `${message}\nTotal actuel: ${formattedCurrent}`;
    
    const notificationId = `milestone_${milestoneConfig.amount}_${Date.now()}`;
    
    browser.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "assets/images/zevent.png",
        title: `🎊 ${milestoneConfig.name || 'Palier atteint'}`,
        message: fullMessage,
        isClickable: true
    });

    // Stocker l'URL vers la page des dons
    browser.storage.local.set({ [notificationId]: "https://zevent.fr/" });
    
    console.log(`Notification palier: ${milestoneConfig.amount}€ - ${milestoneConfig.name}`);
}

// Fonction pour formater le montant des dons
function formatDonationAmount(amount) {
    if (amount >= 1000000) {
        return (amount / 1000000).toFixed(3) + 'M€';
    } else if (amount >= 1000) {
        return (amount / 1000).toFixed(1) + 'K€';
    } else {
        return amount + '€';
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