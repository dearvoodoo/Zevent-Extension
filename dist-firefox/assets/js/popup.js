if (typeof browser === "undefined") var browser = chrome;

const API_BASE = "https://api.the-coven.fr/";
const API_KEY = "fd39fbf6a83a9c3cf789629256a2525d87978226597c177338d98cf03cebe728";
const BETA_CONFIG_FILE = "beta-config.json";

const HISTORY_EDITIONS = [
    { year: 2025, amount: "16 179 096", assos: ["Association Française des Aidants", "Helebor", "Ligue Contre le Cancer", "Nightline", "Le Rire Médecin", "Sourire à la Vie", "L'Envol", "Sparadrap"] },
    { year: 2024, amount: "10 145 881", assos: ["Les Bureaux du Coeur", "Solidarité Paysans", "Secours Populaire", "Chapitre 2", "Cop1"] },
    { year: 2022, amount: "10 182 126", assos: ["The SeaCleaners", "Sea Shepherd", "WWF", "LPO"] },
    { year: 2021, amount: "10 064 480", assos: ["Action contre la Faim"] },
    { year: 2020, amount: "5 724 377", assos: ["Amnesty International"] },
    { year: 2019, amount: "3 509 878", assos: ["Institut Pasteur"] },
    { year: 2018, amount: "1 094 731", assos: ["Médecins Sans Frontières"] },
    { year: 2017, amount: "451 851", assos: ["La Croix Rouge Française"] },
    { year: 2016, amount: "170 770", assos: ["Save The Children"] }
];

let appConfig = {
    event: { edition: "2026", startDate: "2026-09-04T18:00:00+02:00", dateLabel: "Septembre 2026" },
    associations: [],
    features: { clips: false, zplace: true }
};
let isLiveMode = false;
let isPrelaunchMode = false;
let refreshTimer = null;
let countdownInterval = null;
let allStreamers = [];
let currentZplaceUrl = null;
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

function applyBetaOverrides(endpoint, data, betaConfig) {
    if (!betaConfig) return data;

    const cleanEndpoint = endpoint.replace(/^\/+/, "");
    const response = deepMerge(data?.Response || {}, {});

    if (cleanEndpoint.startsWith("zevent/app-config")) {
        return { ...data, Response: deepMerge(response, betaConfig.appConfig || {}) };
    }

    if (!cleanEndpoint.startsWith("zevent")) return data;

    let zeventResponse = deepMerge(response, betaConfig.zevent || {});
    const values = betaConfig.values || {};

    if (values.is_live !== undefined || values.is_prelaunch !== undefined) {
        zeventResponse.local = deepMerge(zeventResponse.local || {}, {
            ...(values.is_live !== undefined ? { is_live: values.is_live } : {}),
            ...(values.is_prelaunch !== undefined ? { is_prelaunch: values.is_prelaunch } : {})
        });
    }
    if (values.cagnotte !== undefined || values.donationAmount !== undefined) {
        zeventResponse.donationAmount = amountObject(values.cagnotte ?? values.donationAmount);
    }
    if (values.viewers !== undefined || values.viewersCount !== undefined) {
        zeventResponse.viewersCount = amountObject(values.viewers ?? values.viewersCount);
    }
    if (Array.isArray(betaConfig.streamers)) {
        zeventResponse.live = betaConfig.streamers.map(normalizeBetaStreamer);
    }

    const twitchId = new URLSearchParams(cleanEndpoint.split("?")[1] || "").get("twitch_id");
    if (twitchId && Array.isArray(zeventResponse.live)) {
        zeventResponse.live = zeventResponse.live.filter(s => String(s.twitch_id) === String(twitchId));
    }

    return { ...data, Response: zeventResponse };
}

async function callApi(endpoint) {
    const betaConfig = await loadBetaConfig();
    try {
        const data = await $.ajax({ url: API_BASE + endpoint.replace(/^\/+/, ""), headers: { "X-API-Key": API_KEY }, dataType: "json" });
        return applyBetaOverrides(endpoint, data, betaConfig);
    } catch (error) {
        if (betaConfig) return applyBetaOverrides(endpoint, { Response: {} }, betaConfig);
        throw error;
    }
}

function esc(v) { return String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]); }

function formatEuro(value) {
    return (Number(value) || 0).toLocaleString("fr-FR") + " €";
}

function goalProgressPercent(currentAmount, goalAmount) {
    if (!goalAmount) return 0;
    return Math.max(0, Math.min((currentAmount / goalAmount) * 100, 100));
}

// Modes d'affichage
function setPrelaunchMode() {
    isLiveMode = false;
    isPrelaunchMode = true;
    $("#prelaunchContainer").show();
    $(".banner-card").hide();
    $("#offlineContainer").hide();
    $("#streamersSection").show();
    $(".tri-state-toggle-button.online").closest(".tri-state-toggle").hide();
    startPrelaunchCountdown();
}

function setLiveMode() {
    isLiveMode = true;
    isPrelaunchMode = false;
    $("#prelaunchContainer").hide();
    $(".banner-card").show();
    $("#offlineContainer").hide();
    $("#streamersSection").show();
    $(".tri-state-toggle-button.online").closest(".tri-state-toggle").show();
    if (countdownInterval) clearInterval(countdownInterval);
}

function setOfflineMode() {
    isLiveMode = false;
    isPrelaunchMode = false;
    $("#prelaunchContainer").hide();
    $(".banner-card").hide();
    $("#offlineContainer").show();
    $("#streamersSection").hide();
    if (countdownInterval) clearInterval(countdownInterval);
}

function startPrelaunchCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    const update = () => {
        const start = moment(appConfig.event?.startDate || "2026-09-04T18:00:00+02:00");
        const diff = moment.duration(start.diff(moment()));
        if (diff.asSeconds() <= 0) {
            $("#prelaunchCountdown").html('<span class="highlight">COMMENCÉ !</span>');
            if (countdownInterval) clearInterval(countdownInterval);
            return;
        }
        $("#prelaunchCountdown").html(`${Math.floor(diff.asDays())}j ${String(diff.hours()).padStart(2, '0')}:${String(diff.minutes()).padStart(2, '0')}:${String(diff.seconds()).padStart(2, '0')}`);
    };
    update();
    countdownInterval = setInterval(update, 1000);
}

// Carte streamer pré-lancement
function createPrelaunchCard(s) {
    const twitchName = esc(s.twitch);
    return `<div class="user-card prelaunch-streamer" data-twitch="${twitchName}">
        <div class="user-info-compact">
            <button class="fav-btn-prelaunch" data-streamer="${twitchName}"><i class="fal fa-star"></i></button>
            <img src="${esc(s.profileUrl || s.profile_image_url)}" loading="lazy" class="streamer-clickable" data-twitch="${twitchName}">
            <span class="nickname-compact streamer-clickable" data-twitch="${twitchName}">${esc(s.display || s.display_name)}</span>
        </div>
    </div>`;
}

// Carte streamer live
function createLiveCard(s) {
    const onlineClass = s.online ? "online" : "offline";
    const onlineText = s.online ? "En Ligne" : "Hors Ligne";
    return `<div class="user-card visible" data-twitch="${esc(s.twitch)}" data-id="${esc(s.twitch_id)}" data-location="${esc(s.location)}" data-online="${s.online}" data-name="${esc(s.display)}">
        <div class="user-info">
            <img src="${esc(s.profileUrl)}" loading="lazy">
            <span class="nickname">${esc(s.display)}</span>
            <span class="position"><div class="status-container ${onlineClass}"><div class="status-dot"></div> ${onlineText}</div></span>
        </div>
        <div class="user-hover">
            <button class="fav-btn" data-streamer="${esc(s.twitch)}"><i class="fal fa-star"></i></button>
            <div class="stats-row">
                <div class="stat-item"><i class="fa-light fa-money-bill-1"></i> ${s.donationAmount?.number || 0}€</div>
                <div class="stat-item"><i class="fa-light fa-user"></i> ${s.viewersAmount?.number || 0}</div>
            </div>
            <div class="action-buttons">
                <a class="action-btn" target="_blank" href="https://twitch.tv/${esc(s.twitch)}"><i class="fa-light fa-eye"></i></a>
                <a class="action-btn" target="_blank" href="${esc(s.donationUrl)}"><i class="fa-light fa-money-bill-1"></i></a>
                <a class="action-btn info-btn" href="#" data-fullscreen="${esc(s.twitch_id)}" data-bs-toggle="modal" data-bs-target="#streamerModal"><i class="fa-light fa-circle-info"></i></a>
            </div>
        </div>
    </div>`;
}

// Gestion des clics sur les streamers en pré-lancement
$(document).on("click", ".streamer-clickable", function (e) {
    e.stopPropagation();
    const twitch = $(this).data("twitch");
    if (twitch) window.open(`https://twitch.tv/${twitch}`, "_blank");
});

// Filtres live
async function filterLiveStreamers() {
    if (!isLiveMode || !allStreamers.length) return;

    const locBtn = $(".tri-state-toggle-button.loc.active").attr("id") || "toggle-loc-all";
    const onlBtn = $(".tri-state-toggle-button.online.active").attr("id") || "toggle-online-all";
    const searchTerm = $("#searchBar").val().trim().toLowerCase();
    const favOnly = $("#toggle-favorites").hasClass("active");

    let location = "all";
    if (locBtn === "toggle-loc-lan") location = "lan";
    if (locBtn === "toggle-loc-online") location = "online";

    let online = "all";
    if (onlBtn === "toggle-online-true") online = "true";
    if (onlBtn === "toggle-online-false") online = "false";

    const { favorites = [] } = await browser.storage.local.get("favorites");

    let filtered = [...allStreamers];

    if (location !== "all") {
        filtered = filtered.filter(s => s.location === (location === "lan" ? "LAN" : "Online"));
    }
    if (online !== "all") {
        const isOnline = online === "true";
        filtered = filtered.filter(s => s.online === isOnline);
    }
    if (searchTerm) {
        filtered = filtered.filter(s => s.display.toLowerCase().includes(searchTerm));
    }
    if (favOnly) {
        filtered = filtered.filter(s => favorites.includes(s.twitch));
    }

    $("#streamers").empty();
    filtered.forEach(s => $("#streamers").append(createLiveCard(s)));
    $("#streamer-count").text(filtered.length);

    if (filtered.length === 0) {
        $("#streamers").html(`
            <div class="no-streamers">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 512 512">
                    <path d="M0 0h512v512H0z" fill="none" />
                    <path fill="currentColor" d="M464.453 395V63.547a16 16 0 0 0-16-16H117l32 32h26.847v26.847l32 32V79.547h96.3v96.3H245.3l32 32h26.847V234.7l32 32v-58.851h96.3v96.3h-58.841l32 32h26.847V363Zm-128.3-219.149v-96.3h96.3v96.3ZM16 16.667v22.627l31.547 31.547v377.612a16 16 0 0 0 16 16h377.612l32.214 32.214H496V474.04L38.626 16.667Zm320.151 342.778l73.008 73.008h-73.008Zm-128.3-128.3l73.008 73.008h-73.01Zm0 105.008h96.3v96.3h-96.3Zm-128.3-233.31l73.008 73.008H79.547Zm0 105.008h96.3v96.3h-96.3Zm0 128.3h96.3v96.3h-96.3Z" />
                </svg>
                <h1>PAS DE STREAMER</h1>
                <h5>Aucun streamer ne correspond aux filtres ou la liste est vide.</h5>
            </div>
        `);
    } else {
        $("#streamersSection").show();
    }

    loadFavorites();
}

// Filtres pré-lancement
async function filterPrelaunchStreamers() {
    if (!isPrelaunchMode) return;

    const searchTerm = $("#searchBar").val().trim().toLowerCase();
    const favOnly = $("#toggle-favorites").hasClass("active");
    const { favorites = [] } = await browser.storage.local.get("favorites");

    let filtered = [...allStreamers];

    if (searchTerm) {
        filtered = filtered.filter(s => (s.display || s.display_name).toLowerCase().includes(searchTerm));
    }
    if (favOnly) {
        filtered = filtered.filter(s => favorites.includes(s.twitch));
    }

    $("#streamers").empty();
    filtered.forEach(s => $("#streamers").append(createPrelaunchCard(s)));
    $("#streamer-count").text(filtered.length);

    if (filtered.length === 0) {
        $("#streamers").html(`
            <div class="no-streamers">
                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 512 512">
                    <path d="M0 0h512v512H0z" fill="none" />
                    <path fill="currentColor" d="M464.453 395V63.547a16 16 0 0 0-16-16H117l32 32h26.847v26.847l32 32V79.547h96.3v96.3H245.3l32 32h26.847V234.7l32 32v-58.851h96.3v96.3h-58.841l32 32h26.847V363Zm-128.3-219.149v-96.3h96.3v96.3ZM16 16.667v22.627l31.547 31.547v377.612a16 16 0 0 0 16 16h377.612l32.214 32.214H496V474.04L38.626 16.667Zm320.151 342.778l73.008 73.008h-73.008Zm-128.3-128.3l73.008 73.008h-73.01Zm0 105.008h96.3v96.3h-96.3Zm-128.3-233.31l73.008 73.008H79.547Zm0 105.008h96.3v96.3h-96.3Zm0 128.3h96.3v96.3h-96.3Z" />
                </svg>
                <h1>PAS DE STREAMER</h1>
                <h5>Aucun streamer ne correspond aux filtres ou la liste est vide.</h5>
            </div>
        `);
    } else {
        $("#streamersSection").show();
    }

    loadPrelaunchFavorites();
}

// Rendu historique
function renderHistoryModal() {
    const html = HISTORY_EDITIONS.map(e => `
        <div class="history-simple-card">
            <div class="history-simple-header">
                <h3>ZEvent ${e.year}</h3>
                <span class="history-simple-amount">${e.amount} €</span>
            </div>
            <div class="history-simple-assos">
                ${e.assos.map(a => `<span class="asso-simple-tag">${esc(a)}</span>`).join("")}
            </div>
        </div>
    `).join("");
    $("#historyModalBody").html(html);
}

// Changelogs
async function loadChangelogs() {
    try {
        const data = await callApi("zevent/changelogs");
        const entries = data?.Response?.changelogs || data?.data?.changelogs || [];
        if (entries.length) {
            const html = entries.map(e => `
                <div class="changelog-simple-card">
                    <div class="changelog-simple-header">
                        <span class="changelog-simple-version">${esc(e.version || "v1.0")}</span>
                        <span class="changelog-simple-date">${esc(e.date || "")}</span>
                    </div>
                    <h4>${esc(e.title || "Mise à jour")}</h4>
                    ${e.summary ? `<p>${esc(e.summary)}</p>` : ""}
                    ${e.changes?.length ? `<ul>${e.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
                </div>
            `).join("");
            $("#changelogModalBody").html(html);
        } else {
            $("#changelogModalBody").html('<div class="text-center py-4 text-muted">Aucune note de version disponible.</div>');
        }
    } catch (e) {
        $("#changelogModalBody").html('<div class="text-center py-4 text-muted">Impossible de charger le changelog.</div>');
    }
}

// Chargement principal
async function loadAll() {
    try {
        const cfgData = await callApi("zevent/app-config");
        appConfig = $.extend(true, appConfig, cfgData?.Response || cfgData || {});

        if (appConfig.features) {
            if (appConfig.features.clips === false) $(".clips-btn").addClass("d-none");
            else $(".clips-btn").removeClass("d-none");
            if (appConfig.features.zplace === false) $(".zplace-btn").addClass("d-none");
            else $(".zplace-btn").removeClass("d-none");
        }

        $("#prelaunchEventDate").text(appConfig.event?.edition || "2026");
        $("#event-date-label").text(appConfig.event?.dateLabel || "Septembre 2026");

        const assos = appConfig.associations || [];
        $("#prelaunchAssociation, #event-associations, #offlineAssociations").empty();
        assos.forEach(a => {
            if (a?.label && a?.url)
                $(`<a href="${a.url}" target="_blank" class="asso-badge-modern">${esc(a.label)} <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6m10 0l-9 9m3-9h6v6" /></svg></a>`).appendTo("#prelaunchAssociation, #event-associations, #offlineAssociations");
        });

        const zeventData = await callApi("zevent");
        const isLive = zeventData?.Response?.local?.is_live === true;
        const isPrelaunch = zeventData?.Response?.local?.is_prelaunch === true;

        if (isLive) {
            setLiveMode();
            const amount = zeventData.Response.donationAmount?.number || 0;
            const viewers = zeventData.Response.viewersCount?.number || 0;
            $("#donationAmount").text(amount.toLocaleString("fr-FR"));
            $("#viewersGlobal").text(viewers.toLocaleString("fr-FR"));

            allStreamers = zeventData.Response.live || [];
            await filterLiveStreamers();

            if (refreshTimer) clearInterval(refreshTimer);
            refreshTimer = setInterval(async () => {
                const fresh = await callApi("zevent");
                if (fresh?.Response?.donationAmount?.number) {
                    $("#donationAmount").text(fresh.Response.donationAmount.number.toLocaleString("fr-FR"));
                    $("#viewersGlobal").text(fresh.Response.viewersCount.number.toLocaleString("fr-FR"));
                    if (fresh?.Response?.live) {
                        allStreamers = fresh.Response.live;
                        await filterLiveStreamers();
                    }
                }
            }, 10000);
        } else if (isPrelaunch) {
            setPrelaunchMode();
            allStreamers = zeventData?.Response?.live || [];
            await filterPrelaunchStreamers();
        } else {
            setOfflineMode();
            allStreamers = [];
        }

        $("#streamers-skeleton").hide();
        $("#streamers").show();

        try {
            const zplaceData = await $.ajax({
                url: "https://place-api.zevent.fr/graphql",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({ query: "query LastBoardUrl { lastBoardUrl }" })
            });
            if (zplaceData?.data?.lastBoardUrl) {
                currentZplaceUrl = zplaceData.data.lastBoardUrl;
                $("#zplaceCurrent").attr("src", currentZplaceUrl);
            }
        } catch (e) { console.log("ZPlace non disponible"); }

    } catch (e) {
        console.error("loadAll:", e);
        setOfflineMode();
        $("#streamers-skeleton").hide();
        $("#streamers").show();
    }
}

// Favoris
function loadFavorites() {
    if (!isLiveMode) return;
    browser.storage.local.get("favorites", ({ favorites = [] }) => {
        $(".fav-btn").each(function () {
            const s = $(this).data("streamer");
            $(this).find("i").toggleClass("fal", !favorites.includes(s)).toggleClass("fas", favorites.includes(s));
        });
    });
}

function loadPrelaunchFavorites() {
    if (!isPrelaunchMode) return;
    browser.storage.local.get("favorites", ({ favorites = [] }) => {
        $(".fav-btn-prelaunch").each(function () {
            const s = $(this).data("streamer");
            $(this).find("i").toggleClass("fal", !favorites.includes(s)).toggleClass("fas", favorites.includes(s));
        });
    });
}

$(document).on("click", ".fav-btn, .fav-btn-prelaunch", function (e) {
    e.stopPropagation();
    const streamer = $(this).data("streamer");
    browser.storage.local.get("favorites", ({ favorites = [] }) => {
        if (favorites.includes(streamer)) favorites = favorites.filter(f => f !== streamer);
        else favorites.push(streamer);
        browser.storage.local.set({ favorites });
        $(this).find("i").toggleClass("fal fas");
        if (isPrelaunchMode) filterPrelaunchStreamers();
        else if (isLiveMode) filterLiveStreamers();
    });
});

// Événements UI
$("#showHistoryBtn, #showHistoryBtnOffline").on("click", () => {
    renderHistoryModal();
    $("#historyModal").modal("show");
});

$("#showChangelogBtn").on("click", () => {
    loadChangelogs();
    $("#changelogModal").modal("show");
});

// Filtres
$(".tri-state-toggle-button.loc").click(async function () {
    $(".tri-state-toggle-button.loc").removeClass("active");
    $(this).addClass("active");
    if (isLiveMode) filterLiveStreamers();
    else if (isPrelaunchMode) filterPrelaunchStreamers();
});

$(".tri-state-toggle-button.online").click(async function () {
    $(".tri-state-toggle-button.online").removeClass("active");
    $(this).addClass("active");
    if (isLiveMode) filterLiveStreamers();
});

$("#toggle-favorites").click(async function () {
    $(this).toggleClass("active");
    const on = $(this).hasClass("active");
    $(this).find("i").toggleClass("fal", !on).toggleClass("fas", on);
    if (isLiveMode) filterLiveStreamers();
    else if (isPrelaunchMode) filterPrelaunchStreamers();
});

let searchTimer;
$("#searchBar").on("keyup input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        if (isLiveMode) filterLiveStreamers();
        else if (isPrelaunchMode) filterPrelaunchStreamers();
    }, 300);
});

// Modal streamer
$(document).on("click", ".info-btn", async function (e) {
    e.preventDefault();
    const id = $(this).data("fullscreen");
    try {
        const data = await callApi(`zevent?twitch_id=${id}`);
        const live = data.Response?.live?.[0];
        if (live) {
            $("#streamer-name").text(live.display);
            $("#view-money").html(`<i class="fa-light fa-user me-1"></i> ${live.viewersAmount?.number || 0} 👨‍💻 | <i class="fa-light fa-money-bill-1 me-1"></i> ${live.donationAmount?.number || 0}€`);
            $("#status").html(`<i class="fa-light fa-location-dot me-1"></i> ${live.location === "Online" ? "À distance" : "Sur place"} | ${live.online ? '<span class="text-success">🟢 En ligne</span>' : '<span class="text-muted">🔴 Hors ligne</span>'}`);
            $(".stream-preview").attr("src", live.online ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${live.twitch}.jpg` : "assets/images/offline.jpg");
            $(".stream-preview-link").attr("href", `https://twitch.tv/${live.display}`);
            $("#tip").attr("href", live.donationUrl);
            $("#clips, #goals").attr("data-id", live.twitch_id);

            const goals = live.donation_goals;
            const amount = live.donationAmount?.number || 0;
            if (goals?.length) {
                const sorted = [...goals].sort((a, b) => a.amount - b.amount);
                const goal = sorted.find(g => amount < g.amount) || sorted[sorted.length - 1];
                const pct = goalProgressPercent(amount, goal.amount);
                const reachedCount = sorted.filter(g => amount >= g.amount).length;
                const stateLabel = amount >= goal.amount ? "Dernier goal valide" : "Goal en cours";
                $("#actual-goal").html(`
                    <div class="goal-progress-card">
                        <div class="goal-progress-kicker">${stateLabel} - ${reachedCount}/${sorted.length}</div>
                        <div class="goal-name">${esc(goal.name)}</div>
                        <div class="goal-amounts">
                            <span>${formatEuro(amount)}</span>
                            <span>${formatEuro(goal.amount)}</span>
                        </div>
                        <div class="goal-progress-bar"><div style="width: ${pct}%;"></div></div>
                    </div>
                `);
            } else {
                $("#actual-goal").html("");
            }
        }
    } catch (err) { console.error(err); }
});

// Goals modal
$(document).on("click", ".btn-modern#goals", async function () {
    const id = $(this).attr("data-id");
    try {
        const data = await callApi(`zevent?twitch_id=${id}`);
        const live = data.Response?.live?.[0];
        const cagnotte = live?.donationAmount?.number || 0;
        const goals = live?.donation_goals || [];

        $("#donation_perso").text(formatEuro(cagnotte));

        if (!goals.length) {
            $(".goals-content").html(`<div class="text-center py-4 text-muted">Ce streamer n'a pas encore de goals configurés.</div>`);
            return;
        }

        const sorted = [...goals].sort((a, b) => a.amount - b.amount);
        const reachedCount = sorted.filter(goal => cagnotte >= goal.amount).length;
        const currentGoal = sorted.find(goal => cagnotte < goal.amount);
        const remainingCount = Math.max(sorted.length - reachedCount - (currentGoal ? 1 : 0), 0);
        const globalTarget = sorted[sorted.length - 1]?.amount || 0;
        const globalPct = goalProgressPercent(cagnotte, globalTarget);
        const $summary = $(`
            <div class="goals-summary">
                <div class="goals-summary-main">
                    <span>Progression globale</span>
                    <strong>${reachedCount}/${sorted.length} valides</strong>
                </div>
                <div class="goals-summary-bar"><div style="width:${globalPct}%;"></div></div>
                <div class="goals-summary-grid">
                    <div><strong>${reachedCount}</strong><span>valides</span></div>
                    <div><strong>${currentGoal ? "1" : "0"}</strong><span>en cours</span></div>
                    <div><strong>${remainingCount}</strong><span>restants</span></div>
                </div>
            </div>
        `);
        const $list = $("<ul>").addClass("goal-list");
        sorted.forEach(goal => {
            const reached = cagnotte >= goal.amount;
            const isCurrent = currentGoal === goal;
            const statusText = reached ? "Valide" : (isCurrent ? "En cours" : "A venir");
            const pct = goalProgressPercent(cagnotte, goal.amount);
            const $item = $("<li>")
                .addClass("goal-item")
                .toggleClass("check", reached)
                .toggleClass("current", isCurrent)
                .toggleClass("upcoming", !reached && !isCurrent);
            if (goal.links?.length) $item.on("click", () => window.open(goal.links[0], "_blank"));
            $item.append($("<div>").addClass("goal-status-pill").text(statusText));
            $item.append($("<div>").addClass("goal-name").text(goal.name));
            $item.append($("<div>").addClass("goal-mini-progress").append($("<div>").css("width", `${pct}%`)));
            $item.append($("<div>").addClass("goal-details").append($("<span>").addClass("goal-amount").text(formatEuro(goal.amount))));
            if (reached) $item.append($("<div>").addClass("goal-check").text("✔ ATTEINT"));
            $list.append($item);
        });
        $(".goals-content").empty().append($summary, $list);
    } catch (err) { console.error(err); }
});

// Clips
const CLIPS_API = "https://clips.zevent.fr/api/clips";
function loadClips($c, params) {
    $c.html('<div class="col-12 text-center py-4"><div class="spinner-border text-success"></div></div>');
    $.ajax({
        url: `${CLIPS_API}?${new URLSearchParams({ page: 1, ...params })}`,
        success: (d) => {
            if (d.items?.length) {
                const html = d.items.map(c => `
                    <div class="col list-clip">
                        <a class="clip-card" href="${c.url}" target="_blank">
                            <img src="${c.thumbnail_url}" alt="clip thumbnail">
                            <div class="clip-info">
                                <p class="clip-title">${esc(c.title)}</p>
                                <div class="clip-meta">
                                    <span>${esc(c.broadcaster?.display_name)}</span>
                                    <span><i class="fa-light fa-eye"></i> ${c.view_count}</span>
                                </div>
                            </div>
                        </a>
                    </div>
                `).join("");
                $c.html(html);
            } else {
                $c.html('<div class="col-12 text-center py-4 text-muted">Aucun clip disponible</div>');
            }
        },
        error: () => $c.html('<div class="col-12 text-center py-4 text-muted">Erreur de chargement</div>')
    });
}

$(document).on("click", "#btnradio1", () => loadClips($(".clip-list-here"), { sort_by: "view_count" }));
$(document).on("click", "#btnradio2", () => loadClips($(".clip-list-here"), { sort_by: "created_at" }));

// ZPlace
$(document).on("click", ".zplace-btn", async () => {
    try {
        const data = await $.ajax({
            url: "https://place-api.zevent.fr/graphql",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ query: "query LastBoardUrl { lastBoardUrl }" })
        });
        if (data?.data?.lastBoardUrl) {
            currentZplaceUrl = data.data.lastBoardUrl;
            $("#zplaceCurrent").attr("src", currentZplaceUrl);
        }
    } catch (e) { console.log("ZPlace non disponible"); }
});

$(document).on("click", "#downloadCurrentBtn", (e) => {
    e.stopPropagation();
    if (currentZplaceUrl) {
        const link = document.createElement("a");
        link.href = currentZplaceUrl;
        link.download = "zplace-actuel.png";
        link.click();
    }
});

$(document).on("click", "#download2025Btn", () => {
    const link = document.createElement("a");
    link.href = "/assets/images/zplace-2025.png";
    link.download = "zplace-2025.png";
    link.click();
});

$(document).on("click", "#download2024Btn", () => {
    const link = document.createElement("a");
    link.href = "/assets/images/zplace-2024.png";
    link.download = "zplace-2024.png";
    link.click();
});

// Footer
$("#app_version").text(browser.runtime.getManifest().version);
$("#openOptions").on("click", () => browser.runtime.openOptionsPage());

// Empêcher le scroll du background quand modal ouvert
$(document).on("show.bs.modal", ".modal", function () {
    $("body").css("overflow", "hidden");
});
$(document).on("hidden.bs.modal", ".modal", function () {
    $("body").css("overflow", "auto");
});

// Démarrage
$(document).ready(() => loadAll());
