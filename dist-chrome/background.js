if (typeof browser === "undefined") var browser = chrome;

// ─── Config ────────────────────────────────────────────────────────────────
const API_BASE        = "https://api.the-coven.fr/zevent";
const ZEVENT_API_URL  = API_BASE;
const NOTIF_API_URL   = `${API_BASE}/notifications`;
const API_KEY         = "fd39fbf6a83a9c3cf789629256a2525d87978226597c177338d98cf03cebe728";
const CHECK_INTERVAL  = 30; // minutes (alarm period)
const BETA_CONFIG_FILE = "beta-config.json";
const MILESTONE_EVENT_KEY = "zevent-2026";

// ─── Milestone definitions ──────────────────────────────────────────────────
const DEFAULT_MILESTONES = [
    { amount: 0,        name: "Lancement",    message: "Lancement des notifications des paliers. (tkt ca spam pas)" },
    { amount: 50000,    name: "50K",          message: "Premier palier des 50K€ atteint ! 🎉" },
    { amount: 100000,   name: "100K",         message: "100 000€ de collectés ! Incroyable ! 🎊" },
    { amount: 170770,   name: "170 770",      message: "Zevent 2016 battu ! 🏅" },
    { amount: 250000,   name: "250K",         message: "Quart de million d'euros ! 🤯" },
    { amount: 451851,   name: "451 851",      message: "Zevent 2017 battu ! 🏅" },
    { amount: 500000,   name: "500K",         message: "Demi-million d'euros ! 🎯" },
    { amount: 1000000,  name: "1M",           message: "1 MILLION D'EUROS !!! 🎇" },
    { amount: 1094731,  name: "1 094 731",    message: "Zevent 2018 battu ! 🏅" },
    { amount: 2000000,  name: "2M",           message: "2 MILLIONS !!! 🚀" },
    { amount: 3000000,  name: "3M",           message: "3 MILLIONS D'EUROS !!! 🌟" },
    { amount: 3509878,  name: "3 509 878",    message: "Zevent 2019 battu ! 🏅" },
    { amount: 4000000,  name: "4M",           message: "4 MILLIONS !!! 💫" },
    { amount: 5000000,  name: "5M",           message: "5 MILLIONS !!! 🎆" },
    { amount: 5724377,  name: "5 724 377",    message: "Zevent 2020 battu ! 🏅" },
    { amount: 6000000,  name: "6M",           message: "6 MILLIONS !!! 🔥" },
    { amount: 7000000,  name: "7M",           message: "7 MILLIONS !!! ⚡" },
    { amount: 8000000,  name: "8M",           message: "8 MILLIONS !!! 💎" },
    { amount: 9000000,  name: "9M",           message: "9 MILLIONS !!! 🌠" },
    { amount: 10000000, name: "10M",          message: "10 MILLIONS D'EUROS !!! 🎇" },
    { amount: 10064480, name: "10 064 480",   message: "Zevent 2021 battu ! 🏅" },
    { amount: 10145881, name: "10 145 881",   message: "Zevent 2024 battu ! 🏅" },
    { amount: 10182126, name: "10 182 126",   message: "Zevent 2022 battu ! 🏅" },
    { amount: 11000000, name: "11M",          message: "11 MILLIONS !!! WOW 💎" },
    { amount: 12000000, name: "12M",          message: "12 MILLIONS !!! 💚" },
    { amount: 13000000, name: "13M",          message: "13 MILLIONS !!! 🥳" },
    { amount: 14000000, name: "14M",          message: "14 MILLIONS !!! 🫶" },
    { amount: 15000000, name: "15M",          message: "15 MILLIONS !!! 💗" },
    { amount: 16000000, name: "16M",          message: "16 MILLIONS !!! 🔥" },
    { amount: 16179096, name: "16 179 096",   message: "Zevent 2025 battu ! 🏅" },
];

// ─── Install ────────────────────────────────────────────────────────────────
browser.runtime.onInstalled.addListener(() => {
    console.log("Extension ZEvent v" + browser.runtime.getManifest().version + " lancée.");
    console.log("Made with ❤️ by VooDoo");
});

// Local beta config. Disabled unless beta-config.json contains { "is_test": true }.
let betaConfigPromise = null;
async function loadBetaConfig() {
    if (!betaConfigPromise) {
        betaConfigPromise = fetch(browser.runtime.getURL(BETA_CONFIG_FILE), { cache: "no-store" })
            .then(res => res.ok ? res.json() : null)
            .catch(() => null);
    }
    const config = await betaConfigPromise;
    return config?.is_test === true ? config : null;
}

function deepMerge(base, override) {
    const output = Array.isArray(base) ? [...base] : { ...(base || {}) };
    Object.entries(override || {}).forEach(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            output[key] = deepMerge(output[key], value);
        } else {
            output[key] = value;
        }
    });
    return output;
}

function amountValue(value) {
    if (value && typeof value === "object" && "number" in value) return Number(value.number) || 0;
    return Number(value) || 0;
}

function amountObject(value) {
    const number = amountValue(value);
    return { number, formatted: number.toLocaleString("fr-FR") + " EUR" };
}

function normalizeBetaStreamer(streamer, index) {
    const twitch = streamer.twitch || streamer.login || streamer.name || `beta_streamer_${index + 1}`;
    const display = streamer.display || streamer.display_name || streamer.name || twitch;
    return {
        twitch,
        twitch_id: String(streamer.twitch_id || streamer.id || twitch),
        display,
        display_name: display,
        profileUrl: streamer.profileUrl || streamer.profile_image_url || "assets/images/offline.jpg",
        profile_image_url: streamer.profile_image_url || streamer.profileUrl || "assets/images/offline.jpg",
        location: streamer.location || "Online",
        online: streamer.online !== false,
        game: streamer.game || streamer.category || "ZEvent",
        donationUrl: streamer.donationUrl || streamer.donation_url || "https://zevent.fr/",
        donationAmount: amountObject(streamer.donationAmount ?? streamer.cagnotte ?? streamer.amount ?? 0),
        viewersAmount: amountObject(streamer.viewersAmount ?? streamer.viewers ?? 0),
        donation_goals: streamer.donation_goals || streamer.goals || []
    };
}

function applyBetaOverrides(url, data, betaConfig) {
    if (!betaConfig || !url.startsWith(ZEVENT_API_URL)) return data;

    if (url.startsWith(NOTIF_API_URL)) {
        return {
            ...data,
            data: deepMerge(data?.data || {}, betaConfig.notifications || {})
        };
    }

    let response = deepMerge(data?.Response || {}, betaConfig.zevent || {});
    const values = betaConfig.values || {};

    if (values.is_live !== undefined || values.is_prelaunch !== undefined) {
        response.local = deepMerge(response.local || {}, {
            ...(values.is_live !== undefined ? { is_live: values.is_live } : {}),
            ...(values.is_prelaunch !== undefined ? { is_prelaunch: values.is_prelaunch } : {})
        });
    }
    if (values.cagnotte !== undefined || values.donationAmount !== undefined) {
        response.donationAmount = amountObject(values.cagnotte ?? values.donationAmount);
    }
    if (values.viewers !== undefined || values.viewersCount !== undefined) {
        response.viewersCount = amountObject(values.viewers ?? values.viewersCount);
    }
    if (Array.isArray(betaConfig.streamers)) {
        response.live = betaConfig.streamers.map(normalizeBetaStreamer);
    }

    return { ...data, Response: response };
}

// ─── Fetch helper ───────────────────────────────────────────────────────────
async function fetchApi(url) {
    const betaConfig = await loadBetaConfig();
    try {
        const res = await fetch(`${url}?_=${Date.now()}`, {
            headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" }
        });
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return applyBetaOverrides(url, await res.json(), betaConfig);
    } catch (error) {
        if (betaConfig) return applyBetaOverrides(url, { Response: {}, data: {} }, betaConfig);
        throw error;
    }
}

// ─── Main check loop ────────────────────────────────────────────────────────
async function checkAllNotifications() {
    try {
        const [zeventData, notifData] = await Promise.all([
            fetchApi(ZEVENT_API_URL),
            fetchApi(NOTIF_API_URL)
        ]);

        if (notifData?.data?.notifications)
            await processNotifications(notifData.data.notifications, "standard");

        if (notifData?.data?.customNotifications)
            await processNotifications(notifData.data.customNotifications, "custom");

        if (zeventData?.Response?.live)
            await checkFavoriteStreams(zeventData.Response.live);

        if (zeventData?.Response?.donationAmount?.number)
            await checkDonationMilestones(zeventData.Response.donationAmount.number);

    } catch (err) {
        console.error("checkAllNotifications:", err);
    }
}

// ─── Milestones ─────────────────────────────────────────────────────────────
async function checkDonationMilestones(currentAmount) {
    const {
        reachedMilestonesByEvent = {},
        milestonesEnabled = true,
        donationMilestones
    } = await browser.storage.local.get(["reachedMilestonesByEvent", "milestonesEnabled", "donationMilestones"]);

    if (!milestonesEnabled) return;

    const reachedMilestones = reachedMilestonesByEvent[MILESTONE_EVENT_KEY] || [];
    const milestones = (donationMilestones || DEFAULT_MILESTONES)
        .slice()
        .sort((a, b) => a.amount - b.amount);

    const newReached = [];
    for (const m of milestones) {
        if (!reachedMilestones.includes(m.amount) && currentAmount >= m.amount) {
            newReached.push(m.amount);
            showMilestoneNotification(m, currentAmount);
        }
    }

    if (newReached.length) {
        const updated = [...reachedMilestones, ...newReached].sort((a, b) => a - b);
        await browser.storage.local.set({
            reachedMilestonesByEvent: {
                ...reachedMilestonesByEvent,
                [MILESTONE_EVENT_KEY]: updated
            }
        });
    }
}

function showMilestoneNotification(milestone, currentAmount) {
    let message = milestone.message;
    if (!message) {
        const a = milestone.amount;
        if (a >= 1_000_000)     message = `L'événement a franchi ${(a / 1_000_000).toFixed(1)}M€ ! 🎇`;
        else if (a >= 1_000)    message = `L'événement a franchi ${(a / 1_000).toFixed(0)}K€ ! 🎊`;
        else                    message = `L'événement a franchi ${a}€ ! 🎉`;
    }

    const id = `milestone_${milestone.amount}_${Date.now()}`;
    browser.notifications.create(id, {
        type: "basic",
        iconUrl: "assets/images/zevent.png",
        title: `🎊 ${milestone.name || "Palier atteint"}`,
        message: `${message}\nTotal : ${fmtAmount(currentAmount)}`,
        isClickable: true
    });
    browser.storage.local.set({ [id]: "https://zevent.fr/" });
}

function fmtAmount(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(3) + "M€";
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K€";
    return n + "€";
}

// ─── Standard / Custom notifications ────────────────────────────────────────
async function processNotifications(notifications, type) {
    const lastIdKey = type === "standard" ? "lastStandardNotificationId" : "lastCustomNotificationId";
    const storage = await browser.storage.local.get([
        "notificationsEnabled",
        "customNotificationsEnabled",
        lastIdKey,
        "lastNotificationId"
    ]);

    const enabled = type === "standard"
        ? storage.notificationsEnabled !== false
        : storage.customNotificationsEnabled !== false;

    if (!enabled || !Array.isArray(notifications)) return;

    let lastId = storage[lastIdKey] ?? storage.lastNotificationId ?? 0;
    let newLastId = lastId;

    for (const n of notifications) {
        if (n.id > lastId) {
            showNotification(n);
            newLastId = Math.max(newLastId, n.id);
        }
    }

    if (newLastId > lastId)
        await browser.storage.local.set({ [lastIdKey]: newLastId });
}

// ─── Favorites live check ────────────────────────────────────────────────────
async function checkFavoriteStreams(streams) {
    const {
        favorites = [],
        lastNotifications = {},
        notifications = {},
        reachedStreamerGoalsByEvent = {}
    } = await browser.storage.local.get([
        "favorites",
        "lastNotifications",
        "notifications",
        "reachedStreamerGoalsByEvent"
    ]);

    let liveChanged = false;
    let goalsChanged = false;
    const reachedStreamerGoals = reachedStreamerGoalsByEvent[MILESTONE_EVENT_KEY] || {};
    for (const stream of streams) {
        const name = stream.twitch;
        if (!favorites.includes(name)) continue;

        const streamerSettings = notifications[name] || {};
        const liveEnabled = streamerSettings.live !== false;
        const goalsEnabled = streamerSettings.goal !== false;

        if (liveEnabled && stream.online && !lastNotifications[name]?.live) {
            showNotification({
                title: `${stream.display} est en live !`,
                message: `Joue a ${stream.game}`,
                url: `https://twitch.tv/${stream.twitch}`
            });
            lastNotifications[name] = { ...lastNotifications[name], live: true };
            liveChanged = true;
        } else if (!stream.online && lastNotifications[name]?.live) {
            lastNotifications[name] = { ...lastNotifications[name], live: false };
            liveChanged = true;
        }

        if (!goalsEnabled || !Array.isArray(stream.donation_goals)) continue;

        const currentAmount = stream.donationAmount?.number || 0;
        const alreadyReached = reachedStreamerGoals[name] || [];
        const newReached = [];

        stream.donation_goals
            .slice()
            .sort((a, b) => a.amount - b.amount)
            .forEach(goal => {
                const goalKey = `${goal.amount}:${goal.name || "goal"}`;
                if (currentAmount >= goal.amount && !alreadyReached.includes(goalKey)) {
                    newReached.push(goalKey);
                    showNotification({
                        title: `${stream.display} a valide un goal`,
                        message: `${goal.name || "Goal atteint"} - ${fmtAmount(goal.amount)}`,
                        url: goal.links?.[0] || stream.donationUrl || "https://zevent.fr/"
                    });
                }
            });

        if (newReached.length) {
            reachedStreamerGoals[name] = [...alreadyReached, ...newReached];
            goalsChanged = true;
        }
    }

    const updates = {};
    if (liveChanged) updates.lastNotifications = lastNotifications;
    if (goalsChanged) {
        updates.reachedStreamerGoalsByEvent = {
            ...reachedStreamerGoalsByEvent,
            [MILESTONE_EVENT_KEY]: reachedStreamerGoals
        };
    }
    if (liveChanged || goalsChanged) await browser.storage.local.set(updates);
}

// ─── Notification helper ─────────────────────────────────────────────────────
function showNotification({ title, message, url }) {
    const id = `notif_${Date.now()}`;
    browser.notifications.create(id, {
        type: "basic",
        iconUrl: "assets/images/zevent.png",
        title,
        message,
        isClickable: !!url
    });
    if (url) browser.storage.local.set({ [id]: url });
}

// ─── Notification click ──────────────────────────────────────────────────────
browser.notifications.onClicked.addListener(id => {
    browser.storage.local.get(id, result => {
        if (result[id]) {
            browser.tabs.create({ url: result[id] });
            browser.storage.local.remove(id);
        }
    });
});

// ─── Alarm ───────────────────────────────────────────────────────────────────
browser.alarms.create("checkNotifications", { periodInMinutes: CHECK_INTERVAL });
browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "checkNotifications") checkAllNotifications();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
checkAllNotifications();
