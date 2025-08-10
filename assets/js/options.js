if (typeof browser === "undefined") {
    var browser = chrome;
}

document.addEventListener('DOMContentLoaded', () => {
    // Charger les options existantes
    browser.storage.local.get(['notificationsEnabled', 'customNotificationsEnabled'], (result) => {
        document.getElementById('notificationsEnabled').checked = result.notificationsEnabled !== undefined ? result.notificationsEnabled : true;
        document.getElementById('customNotificationsEnabled').checked = result.customNotificationsEnabled !== undefined ? result.customNotificationsEnabled : true;
    });

    // Sauvegarder les options lorsque l'utilisateur clique sur le bouton
    document.getElementById('saveOptions').addEventListener('click', () => {
        const notificationsEnabled = document.getElementById('notificationsEnabled').checked;
        const customNotificationsEnabled = document.getElementById('customNotificationsEnabled').checked;

        browser.storage.local.set({
            notificationsEnabled: notificationsEnabled,
            customNotificationsEnabled: customNotificationsEnabled
        }, () => {
            alert('Options sauvegardées !');
        });
    });
});