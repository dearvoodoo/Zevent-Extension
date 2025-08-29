if (typeof browser === "undefined") {
    var browser = chrome;
}

moment.locale('fr');

// Launching date
var end_date = "2025-09-07T23:59:59"


function callCovenAPI(endpoint, callback, options = {}) {
    const apiUrl = 'https://api.the-coven.fr/' + endpoint;
    const defaultOptions = {
        headers: {
            'X-API-Key': 'df0a0ca75db1f605d250bfed7ac2544c',
            'Content-Type': 'application/json'
        }
    };

    $.ajax({
        url: apiUrl,
        type: options.method || 'GET',
        dataType: 'json',
        headers: defaultOptions.headers,
        data: options.data || {},
        success: callback,
        error: function(xhr, status, error) {
            console.error(`API Error (${endpoint}):`, error);
            if (options.fallback) options.fallback();
        }
    });
}

// Setup page
setTimeout(function() {
    callCovenAPI('zevent', function(data) {
        const isLive = data?.Response?.local?.is_live;

        if (isLive) {
            setStreamers();
            loadFavorites();
            loadFilters();
        } else {
            setOffline();
        }
    }, {
        fallback: setOffline
    });
}, 100);

function setOffline(){
    $(".historique").removeClass("d-none")
    $(".banner-card").addClass("d-none")
    $(".les-streamers").addClass("d-none")
}

function setStreamers(){
    callCovenAPI('zevent', function(data) {
        $("#donationAmount").numScroll({
            number: data.Response.donationAmount.number,
            fromZero: false
        }).removeClass("placeholder");
        $("#viewersGlobal").numScroll({
            number: data.Response.viewersCount.number,
            fromZero: false
        }).removeClass("placeholder");
        $.each(data.Response.live, function(l, live){
            createStreamer(live)
        })
        $('#streamers').each(function() {
            $("#streamer-count").text($('.user-card.visible', $(this)).length).removeClass("placeholder")
        });
    })
};

$(document).ready(function(){
    $("#toggle-loc-all").addClass("active");
    $(".tri-state-toggle-button.loc").click(function(){
        $(".tri-state-toggle-button.loc").removeClass("active");
        var id = $(this).attr('id');
        $("#" + id).addClass("active");
        updateStreamers()
    });

    $("#toggle-online-all").addClass("active");
    $(".tri-state-toggle-button.online").click(function(){
        $(".tri-state-toggle-button.online").removeClass("active");
        var id = $(this).attr('id');
        $("#" + id).addClass("active");
        updateStreamers()
    });

    function delay(callback, ms) {
        var timer = 0;
        return function() {
            var context = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () {
                callback.apply(context, args);
            }, ms || 0);
        };
    }

    $('#searchBar').keyup(delay(function() {
        updateStreamers();
    }, 1500))

    const $searchBar = $('#searchBar');
    
    setTimeout(() => {
        $searchBar[0].focus();
        $searchBar.addClass('no-caret');
    }, 10);

    $(document).on('keydown', function(event) {
        // Si l'utilisateur tape déjà dans la search bar, on retire no-caret
        if (event.target === $searchBar[0]) {
            $searchBar.removeClass('no-caret');
            return;
        }
        
        if (event.metaKey || event.ctrlKey) return;
        if (event.key.length > 1 && ![' ', 'Backspace', 'Delete'].includes(event.key)) return;

        $searchBar.removeClass('no-caret');
        $searchBar[0].focus();

        const rect = $searchBar[0].getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            $searchBar[0].scrollIntoView({ behavior: 'instant', block: 'center' });
        }
    });

    // Ajouter aussi un événement focus pour être sûr
    $searchBar.on('focus', function() {
        $searchBar.removeClass('no-caret');
    });
});

// Update streamer with filter
function updateStreamers() {
    const locationButton = $(".tri-state-toggle-button.loc.active").attr("id");
    let location = "all";
    if (locationButton === "toggle-loc-lan") location = "lan";
    else if (locationButton === "toggle-loc-online") location = "online";

    const onlineButton = $(".tri-state-toggle-button.online.active").attr("id");
    let online = "all";
    if (onlineButton === "toggle-online-true") online = "true";
    else if (onlineButton === "toggle-online-false") online = "false";

    const name = $("#searchBar").val().trim();
    const favoritesOnly = $("#toggle-favorites").hasClass("active") ? "true" : "false";

    // Récupérer la liste des streamers favoris depuis browser.storage.local
    browser.storage.local.get("favorites").then((result) => {
        let favoritesList = result.favorites || [];

        // Construire l'URL de l'API
        let apiUrl = "https://the-coven.fr/api/zevent/streamers.php";

        // Envoyer la requête avec les paramètres et la liste des favoris
        $.post(apiUrl, {
            location: location,
            online: online,
            name: name,
            favorites: favoritesOnly,
            favorite_list: JSON.stringify(favoritesList) // Envoi des favoris au PHP
        }, function(filtered_data) {
            $("#streamers").html("");
            $.each(filtered_data, function(l, live) {
                createStreamer(live);
            });

            $('#streamers').each(function() {
                const count = $('.user-card.visible', $(this)).length;
                $("#streamer-count").text(count).removeClass("placeholder");
                if (count <= 0) {
                    $("#streamers").html(`<div class="no-streamers"><h1>PAS DE STREAMER</h1><h5>Aucun streamer pour les filtres sélectionnés</h5></div>`);
                }
            });

            setTimeout(loadFavorites, 0);
        }, "json");
    });
}

// create a streamer
function createStreamer(data){
    var online = ""
    if (data.online == true) {
        on_off = `
            <div class="status-container online">
                <div class="status-dot"></div> En Ligne
            </div>`
    } else {
        on_off = `
            <div class="status-container offline">
                <div class="status-dot"></div> Hors Ligne
            </div>`
    }
    $("#streamers").append(`
        <div class="user-card visible" data-location="${data.location}" data-name="${data.display}" data-online="${data.online}" data-id="${data.twitch_id}">
            <div class="user-info">
                <img src="${data.profileUrl}" alt="${data.display}">
                <span class="nickname">${data.display}</span>
                <span class="position">${on_off}</span>
            </div>
            <div class="user-hover">
                <button class="fav-btn" data-streamer="${data.twitch}"><i class="fal fa-star"></i></button>
                <div class="cagnotte">
                    <i class="fa-light fa-money-bill-1"></i>  ${data.donationAmount.number}&euro;
                </div>
                <div class="viewers">
                    <i class="fa-light fa-user"></i> ${data.viewersAmount.number}
                </div>
                <div class="card-menu">
                    <a type="button" style="margin-right: .5rem;" class="btn btn-success-inverse" target="_blank" href="https://twitch.tv/${data.twitch}"><i class="fa-light fa-eye"></i></a>
                    <a type="button" style="margin-right: .5rem;" class="btn btn-success-inverse" target="_blank" href="${data.donationUrl}"><i class="fa-light fa-money-bill-1"></i></a>
                    <a type="button" class="btn btn-success-inverse info-btn" data-fullscreen="${data.twitch_id}" href="#" data-bs-toggle="modal" data-bs-target="#streamerModal"><i class="fa-light fa-circle-info"></i></a>
                </div>
            </div>
        </div>
    `)
}

// Show the info window
$(document).on('click', ".info-btn", function(event){
    var fullscreen_id = $(this).attr("data-fullscreen")
    callCovenAPI('zevent', function(data) {
        $.each(data.Response.live, function(l, live){
            if (live.twitch_id == fullscreen_id){
                var on_off = "",
                location = "";
                if (live.online == true) {
                    on_off = '🟢 En Ligne'
                    $(".stream-preview").attr("src", `https://static-cdn.jtvnw.net/previews-ttv/live_user_${live.twitch}.jpg`)
                } else {
                    on_off = '🔴 Hors Ligne'
                    $(".stream-preview").attr("src", "assets/images/offline.jpg").addClass("green-border")
                }

                if (live.location == "Online") {
                    location = '🛜 À distance'
                } else {
                    location = '📍 Sur place'
                }
                $("#streamer-name").text(live.display).removeClass("placeholder")
                $("#view-money").text(`${live.viewersAmount.number} 👨🏻‍💻 | ${live.donationAmount.number}€`)
                $("#status").text(`${location} | ${on_off}`)
                $(".btn-streamer#tip").attr("href", live.donationUrl).show()
                $(".btn-streamer#clips").attr("data-id", live.twitch_id).show()
                $(".btn-streamer#goals").attr("data-id", live.twitch_id).show()
                if (live.donation_goals) {
                    const donationAmount = live.donationAmount.number;
                    let currentGoal = null;

                    for (const goal of live.donation_goals) {
                        if (donationAmount < goal.amount) {
                            currentGoal = goal;
                            break;
                        }
                    }

                    if (!currentGoal) {
                        currentGoal = live.donation_goals[live.donation_goals.length - 1];
                    }

                    const $goalName = currentGoal.name;
                    const $goalAmount = currentGoal.amount.toLocaleString('fr-FR') + ' €';
                    const currentAmountFormatted = donationAmount.toLocaleString('fr-FR') + ' €';

                    const progressPercentage = Math.min((donationAmount / currentGoal.amount) * 100, 100);

                    $("#actual-goal").html(`
                        <ul class="goal-list">
                            <li class="goal-item progress-goal">
                                <div class="goal-name">
                                    <p>${$goalName}</p>
                                </div>
                                <div class="goal-details">
                                    <span class="current-amount">${currentAmountFormatted}</span>
                                    <span class="goal-target"> / ${$goalAmount}</span>
                                </div>
                                <div class="goal-progress">
                                    <div class="progress-bar" style="width: ${progressPercentage}%"></div>
                                </div>
                            </li>
                        </ul>
                    `);
                }
            }
        })
    })
})

$(document).on('click', ".btn-streamer#goals", function(event){
    var goals_id = $(this).attr("data-id")
    console.log('open goal page')
    callCovenAPI(`zevent?twitch_id=${goals_id}`, function(data) {
        const $live = data.Response.live[0]
        const $cagnotte = $live.donationAmount.number
        const $goals = $live.donation_goals

        $("#donation_perso").numScroll({
            number: $cagnotte,
            fromZero: false
        }).removeClass("placeholder");

        if ($goals) {
            const $goals_content = $('.goals-content');
            $goals_content.html("")

            const $container = $('<div>').addClass('container');
            const $goalList = $('<ul>').addClass('goal-list');

            // Sort goals by amount
            const sortedGoals = [...$goals].sort((a, b) => a.amount - b.amount);

            $.each(sortedGoals, function(index, goal) {
                const $goalItem = $('<li>')
                    .addClass('goal-item')
                    .toggleClass('clickable', goal.links && goal.links.length > 0);

                if (goal.links && goal.links.length > 0) {
                    $goalItem.on('click', function() {
                        window.open(goal.links[0], '_blank');
                    });
                }

                const $goalName = $('<div>')
                    .addClass('goal-name')
                    .text(goal.name);

                const $goalDetails = $('<div>').addClass('goal-details');

                const $goalAmount = $('<span>')
                    .addClass('goal-amount')
                    .text(goal.amount + '€');

                $goalDetails.append($goalAmount);

                $goalItem.append($goalName, $goalDetails);


                if ($cagnotte >= goal.amount) {
                    if (goal.done == true) {
                        const $doneBadge = $('<div>')
                            .addClass('goal-done')
                            .text('🏆 ACCOMPLI');
                        $goalItem.append($doneBadge);
                        $goalItem.toggleClass('done')
                    } else {
                        const $doneBadge = $('<div>')
                            .addClass('goal-check')
                            .text('✓ ATTEINT');
                        $goalItem.append($doneBadge);
                        $goalItem.toggleClass('check')
                    }
                }

                $goalList.append($goalItem);
            });

            $container.append($goalList);
            $goals_content.append($container);
        } else {
            const $goals_content = $('.goals-content');
            $goals_content.html(`
                <div class="container">
                    <ul class="goal-list">
                        <li class="goal-item no-goals">
                            <div class="goal-name">
                                <p>Ce streamer n'a pas de goals configurés dans l'extension.</p>
                                <p>Vous pouvez en proposer en contactant le développeur :</p>
                                <ul class="contact-list">
                                    <li><a href="https://x.com/DearVooDoo" target="_blank"><i class="fab fa-x-twitter"></i> @DearVooDoo</a></li>
                                    <li><a href="https://bsky.app/profile/the-coven.fr" target="_blank"><i class="fab fa-bluesky"></i> @the-coven.fr</a></li>
                                    <li><i class="fab fa-discord"></i> @dear_voodoo</li>
                                    <li><a href="mailto:voodoo@the-coven.fr"><i class="fal fa-enveloppe"></i> voodoo@the-coven.fr</a></li>
                                </ul>
                            </div>
                            <div class="goal-details"></div>
                            <div class="goal-none">❌ NO GOAL</div>
                        </li>
                    </ul>
                </div>
            `)
        }
    })
})

$(document).on('click', ".zplace-btn", function(event){
    $.ajax({
        method: "POST",
        url: "https://place-api.zevent.fr/graphql",
        contentType: "application/json",
        data: JSON.stringify({query:`query LastBoardUrl {lastBoardUrl}`}),
        success: function (data) {
            $(".zplace-img").attr("src", data.data.lastBoardUrl)
        }
    })
})

// zplace off so direct img link
//$(".zplace-img").attr("src", "https://zevent.fr/assets/zplace-pJSvFGpY.png")


// Clips 2.0 [BETA CODE - Using old api info]

const CLIPS_API_BASE = "https://clips.zevent.fr/api/clips";
const DEFAULT_PAGE = 1;

function formatClipDate(dateString) {
    return moment(dateString).format("DD/MM/YYYY");
}

// Create clip HTML
function generateClipHTML(clip) {
    const {
        url: clip_link,
        thumbnail_url: thumbnail,
        broadcaster,
        title,
        game,
        view_count: views,
        created_at: date
    } = clip;

    return `
        <div class="col list-clip">
            <a class="card mb-3" href="${clip_link}" target="_blank">
                <div class="p-2">
                    <img src="${thumbnail}" class="rounded" width="100%" alt="Clip: ${title}">
                </div>
                <div class="card-body">
                    <div class="d-flex pb-3" style="gap: 1rem !important;">
                        <img src="${broadcaster.profile_image_url}" class="rounded" style="width: 2.5rem; height: 2.5rem;" alt="${broadcaster.display_name}">
                        <div class="text-start">
                            <p class="text-start line-clamp-2 fs-6 mb-1">${title}</p>
                            <div class="d-inline-flex gap-2 align-items-center">
                                <p class="fs-7 fw-semibold">${broadcaster.display_name}</p>
                                <span class="fs-8 fw-light">${game?.name || 'Jeu inconnu'}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-footer d-flex justify-content-between">
                    <div class="fs-7">
                        <i class="fa-light fa-eye mr-1"></i> ${views} vues
                    </div>
                    <div class="fs-7">
                        <i class="fa-light fa-calendar mr-1"></i> ${formatClipDate(date)}
                    </div>
                </div>
            </a>
        </div>
    `;
}

// Show clip status message
function showStatusMessage(container, message, type = 'info') {
    const icon = type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    container.html(`
        <div class="col-12 text-center py-5">
            <div class="status-message status-${type}">
                <i class="fa-light ${icon} fa-3x mb-3"></i>
                <p class="fs-6 text-muted">${message}</p>
            </div>
        </div>
    `);
}

// Load clips
function loadClips(container, url, params = {}) {
    container.html('<div class="col-12 text-center py-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Chargement...</span></div></div>');

    const queryParams = new URLSearchParams({
        page: DEFAULT_PAGE,
        ...params
    }).toString();

    $.ajax({
        url: `${CLIPS_API_BASE}?${queryParams}`,
        type: 'GET',
        dataType: 'json',
        timeout: 10000, // 10 secondes timeout
        success: function(data) {
            if (data.items && data.items.length > 0) {
                container.html('');
                $.each(data.items, function(c, clip) {
                    container.append(generateClipHTML(clip));
                });
            } else {
                showStatusMessage(container, 'Aucun clip disponible pour le moment.', 'info');
            }
        },
        error: function(xhr, status, error) {
            let errorMessage = 'Erreur lors du chargement des clips.';

            if (status === 'timeout') {
                errorMessage = 'Le serveur met trop de temps à répondre.';
            } else if (xhr.status === 0) {
                errorMessage = 'Problème de connexion internet.';
            } else if (xhr.status === 404) {
                errorMessage = 'API non disponible.';
            }

            showStatusMessage(container, errorMessage, 'error');
            console.error('Erreur API clips:', error);
        }
    });
}

// Clip events
$(window).on('load', function() {
    loadClips($(".clip-list-here"), CLIPS_API_BASE, { sort_by: 'view_count' });
});

$(document).on('click', "#btnradio1", function(event) {
    loadClips($(".clip-list-here"), CLIPS_API_BASE, { sort_by: 'view_count' });
});

$(document).on('click', "#btnradio2", function(event) {
    loadClips($(".clip-list-here"), CLIPS_API_BASE, { sort_by: 'created_at' });
});

// Streamer personnal clip
$(document).on('click', ".btn-streamer#clips", function(event) {
    const streamerId = $(this).attr("data-id");
    const container = $(".streamer-clip-list-here");
    if (!streamerId) {
        showStatusMessage(container, 'Aucun streamer sélectionné.', 'error');
        return;
    }

    loadClips(container, CLIPS_API_BASE, { broadcaster: streamerId });
});

// Update the countdown until the end of Zevent
var countdownInterval = setInterval(function() {
    var now = moment();
    var endDate = moment(end_date);
    var duration = moment.duration(endDate.diff(now));

    // Si le compte à rebours est terminé
    if (duration.asSeconds() <= 0) {
        clearInterval(countdownInterval);
        $('.countdown').text("ÉVÉNEMENT TERMINÉ");
        return;
    }

    // Afficher le compte à rebours
    var days = Math.floor(duration.asDays());
    var hours = duration.hours();
    var minutes = duration.minutes();
    var seconds = duration.seconds();

    $('#time-remaining').html(
        days + " jours " + 
        String(hours).padStart(2, '0') + ":" + 
        String(minutes).padStart(2, '0') + ":" + 
        String(seconds).padStart(2, '0')
    ).removeClass("placeholder");
}, 1000);
// Update the global donation every 5 seconds and the viewers
var intervalId = window.setInterval(function(){
    $.getJSON("https://zevent.fr/api/", function(data){
        $("#donationAmount").numScroll({
            number: data.donationAmount.number,
            fromZero: false
        });
        $("#viewersGlobal").numScroll({
            number: data.viewersCount.number,
            fromZero: false
        });
    })
}, 5000);

// Define version in footer
$("#app_version").text(browser.runtime.getManifest().version)

// Open options page
document.getElementById("openOptions").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
});


// Favorite
function loadFavorites() {
    browser.storage.local.get("favorites", function (data) {
        let favorites = data.favorites || [];
        $(".fav-btn").each(function () {
            let streamer = $(this).data("streamer");
            $(this).find("i").toggleClass("fal", !favorites.includes(streamer));
            $(this).find("i").toggleClass("fas", favorites.includes(streamer));
        });
    });
}

$(document).on("click", ".fav-btn", function () {
    let streamer = $(this).data("streamer");
    browser.storage.local.get(["favorites", "notifications"], function (data) {
        let favorites = data.favorites || [];
        let notifications = data.notifications || {};

        if (favorites.includes(streamer)) {
            favorites = favorites.filter(fav => fav !== streamer);
            delete notifications[streamer];
        } else {
            favorites.push(streamer);
            notifications[streamer] = { live: true, goal: true }; // Par défaut activé
        }

        browser.storage.local.set({ "favorites": favorites, "notifications": notifications }, function () {
            setTimeout(loadFavorites, 100)
        });
    });
});

// Toggle du bouton favoris
$("#toggle-favorites").click(function() {
    $(this).toggleClass("active");
    if ($(this).hasClass('active')){
        $(this).find("i").removeClass("fal").addClass("fas");
    } else {
        $(this).find("i").removeClass("fas").addClass("fal");
    }
    updateStreamers();
});

// Filters Memory
function saveFiltersAndUpdate() {
    const filters = {
        location: $(".tri-state-toggle-button.loc.active").attr("id") || "toggle-loc-all",
        online: $(".tri-state-toggle-button.online.active").attr("id") || "toggle-online-all",
        favorites: $("#toggle-favorites").hasClass("active")
    };

    console.log(filters)

    // Enregistrer les filtres et attendre que le stockage soit mis à jour avant d'exécuter updateStreamers()
    browser.storage.local.set({ userFilters: filters }).then(() => {
        updateStreamers();
    });
}

function loadFilters() {
    browser.storage.local.get("userFilters").then((data) => {
        if (data.userFilters) {
            const filters = data.userFilters;

            // Appliquer le filtre location
            $("#" + filters.location).addClass("active").siblings().removeClass("active");

            // Appliquer le filtre online
            $("#" + filters.online).addClass("active").siblings().removeClass("active");

            // Appliquer le filtre favoris
            $("#toggle-favorites").toggleClass("active", filters.favorites);
            $("#toggle-favorites").find("i").toggleClass("fal", !filters.favorites);
            $("#toggle-favorites").find("i").toggleClass("fas", filters.favorites);
        }

        // Une fois les filtres chargés, on met à jour la liste des streamers
        updateStreamers();
    });
}

// Triggers
$(".tri-state-toggle-button.loc, .tri-state-toggle-button.online").on("click", function () {
    setTimeout(saveFiltersAndUpdate, 0);
});

$("#toggle-favorites").on("click", saveFiltersAndUpdate);
$("#searchBar").on("keyup input", saveFiltersAndUpdate);

// Gestion du aria-hidden sur modal
$(document).on('show.bs.modal', '.modal', function() {
    $(this).removeAttr('aria-hidden');
});

$(document).on('hide.bs.modal', '.modal', function() {
    $(this).find(':focus').blur();
});

$(document).on('hidden.bs.modal', '.modal', function() {
    $(this).attr('aria-hidden', 'true');
});