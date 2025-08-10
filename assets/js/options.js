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

    function loadFavorites() {
        browser.storage.local.get(["favorites", "notifications"], function (data) {
            let favorites = data.favorites || [];
            let notifications = data.notifications || {};
            let container = document.getElementById("favorites-list");
            container.innerHTML = "";

            favorites.forEach(streamer => {
                let div = document.createElement("div");
                div.classList.add('option-fav-card')
                div.innerHTML = `
                    <h3>${streamer}</h3>
                    <label>
                        <input type="checkbox" class="notif-live" data-streamer="${streamer}" ${notifications[streamer]?.live !== false ? "checked" : ""}>
                        Notification Live
                    </label>
                    <br>
                    <label>
                        <input type="checkbox" class="notif-goal" data-streamer="${streamer}" ${notifications[streamer]?.goal !== false ? "checked" : ""}>
                        Notification Goal
                    </label>
                `;
                container.appendChild(div);
            });
        });
    }

    document.getElementById("favorites-list").addEventListener("change", function (event) {
        let target = event.target;
        if (target.classList.contains("notif-live") || target.classList.contains("notif-goal")) {
            let streamer = target.dataset.streamer;
            let type = target.classList.contains("notif-live") ? "live" : "goal";
            let checked = target.checked;

            browser.storage.local.get("notifications", function (data) {
                let notifications = data.notifications || {};
                if (!notifications[streamer]) notifications[streamer] = {};
                notifications[streamer][type] = checked;
                browser.storage.local.set({ "notifications": notifications });
            });
        }
    });

    loadFavorites();
});