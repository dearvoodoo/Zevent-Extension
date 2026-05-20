if (typeof browser === "undefined") var browser = chrome;

document.addEventListener("DOMContentLoaded", () => {

    // ─── Load saved options ───────────────────────────────────────────────────
    browser.storage.local.get(
        ["notificationsEnabled", "customNotificationsEnabled", "milestonesEnabled"],
        (result) => {
            document.getElementById("notificationsEnabled").checked =
                result.notificationsEnabled       !== undefined ? result.notificationsEnabled       : true;
            document.getElementById("customNotificationsEnabled").checked =
                result.customNotificationsEnabled !== undefined ? result.customNotificationsEnabled : true;
            document.getElementById("milestonesEnabled").checked =
                result.milestonesEnabled          !== undefined ? result.milestonesEnabled          : true;
        }
    );

    // ─── Save options ─────────────────────────────────────────────────────────
    document.getElementById("saveOptions").addEventListener("click", () => {
        browser.storage.local.set({
            notificationsEnabled:       document.getElementById("notificationsEnabled").checked,
            customNotificationsEnabled: document.getElementById("customNotificationsEnabled").checked,
            milestonesEnabled:          document.getElementById("milestonesEnabled").checked
        }, () => {
            const fb = document.getElementById("save-feedback");
            fb.classList.remove("d-none");
            setTimeout(() => fb.classList.add("d-none"), 2500);
        });
    });

    // ─── Load favorites ───────────────────────────────────────────────────────
    function loadFavorites() {
        browser.storage.local.get(["favorites", "notifications"], ({ favorites = [], notifications = {} }) => {
            const container = document.getElementById("favorites-list");

            if (!favorites.length) {
                container.innerHTML = '<p class="text-muted" style="font-size:.85rem">Vous n\'avez aucun favori.</p>';
                return;
            }

            container.innerHTML = "";
            favorites.forEach(streamer => {
                const notif = notifications[streamer] || {};
                const div   = document.createElement("div");
                div.className = "option-fav-card";
                div.innerHTML = `
                    <h3>${streamer}</h3>
                    <label>
                        <input type="checkbox" class="notif-live" data-streamer="${streamer}" ${notif.live !== false ? "checked" : ""}>
                        <span>Notification Live</span>
                    </label>
                    <br>
                    <label>
                        <input type="checkbox" class="notif-goal" data-streamer="${streamer}" ${notif.goal !== false ? "checked" : ""}>
                        <span>Notification Goal</span>
                    </label>
                `;
                container.appendChild(div);
            });
        });
    }

    // ─── Delegate notification toggle changes ─────────────────────────────────
    document.getElementById("favorites-list").addEventListener("change", (event) => {
        const target = event.target;
        if (!target.classList.contains("notif-live") && !target.classList.contains("notif-goal")) return;

        const streamer = target.dataset.streamer;
        const type     = target.classList.contains("notif-live") ? "live" : "goal";

        browser.storage.local.get("notifications", ({ notifications = {} }) => {
            if (!notifications[streamer]) notifications[streamer] = {};
            notifications[streamer][type] = target.checked;
            browser.storage.local.set({ notifications });
        });
    });

    loadFavorites();
});
