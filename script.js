
// COUNTRY RUSH

const GAME_TIME = 60;
const START_LIVES = 3;
const POINTS = 100;

const GEOJSON_URL =
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

const $ = id => document.getElementById(id);

let map;
let countriesLayer;
let selectedLayer;
let selectedCorrect;

let game;
let target;
let questionNumber = 0;
let locked = true;
let nextTimer;
let loading = false;
let sessionId = 0;

const countryLayers = new Map();
const usedCountries = new Set();


// 1. GEOGRAPHICAL REGIONS

const regions = {
    europe: [[34, -15], [72, 45]],
    africa: [[-36, -25], [38, 55]],
    northAmerica: [[7, -170], [75, -50]],
    southAmerica: [[-56, -85], [15, -34]],
    eastAsia: [[0, 95], [60, 150]],
    westAsia: [[10, 25], [50, 75]],
    centralAsia: [[25, 45], [58, 95]],
    southAsia: [[5, 60], [38, 100]],
    oceania: [[-50, 105], [5, 180]]
};


// 2. COUNTRY QUESTION POOL

const questions = {

    easy: [
        ["TUR", "Türkiye", "westAsia"],
        ["BRA", "Brezilya", "southAmerica"],
        ["USA", "ABD", "northAmerica"],
        ["CAN", "Kanada", "northAmerica"],
        ["CHN", "Çin", "eastAsia"],
        ["IND", "Hindistan", "southAsia"],
        ["AUS", "Avustralya", "oceania"],
        ["DEU", "Almanya", "europe"],
        ["FRA", "Fransa", "europe"],
        ["ITA", "İtalya", "europe"],
        ["JPN", "Japonya", "eastAsia"],
        ["EGY", "Mısır", "africa"]
    ],

    medium: [
        ["PRT", "Portekiz", "europe"],
        ["POL", "Polonya", "europe"],
        ["UKR", "Ukrayna", "europe"],
        ["MAR", "Fas", "africa"],
        ["KEN", "Kenya", "africa"],
        ["CHL", "Şili", "southAmerica"],
        ["PER", "Peru", "southAmerica"],
        ["COL", "Kolombiya", "southAmerica"],
        ["THA", "Tayland", "eastAsia"],
        ["VNM", "Vietnam", "eastAsia"],
        ["PAK", "Pakistan", "southAsia"],
        ["NZL", "Yeni Zelanda", "oceania"]
    ],

    hard: [
        ["KGZ", "Kırgızistan", "centralAsia"],
        ["TJK", "Tacikistan", "centralAsia"],
        ["UZB", "Özbekistan", "centralAsia"],
        ["MNG", "Moğolistan", "eastAsia"],
        ["BTN", "Butan", "southAsia"],
        ["LAO", "Laos", "eastAsia"],
        ["BEN", "Benin", "africa"],
        ["TGO", "Togo", "africa"],
        ["ZMB", "Zambiya", "africa"],
        ["SUR", "Surinam", "southAmerica"],
        ["PRY", "Paraguay", "southAmerica"],
        ["SVN", "Slovenya", "europe"]
    ]
};


// 3. GAME STATE - CLOSURE

function createGame(onUpdate, onFinish) {

    let score = 0;
    let lives = START_LIVES;
    let correct = 0;
    let wrong = 0;
    let time = GAME_TIME;

    let interval;
    let deadline;
    let running = false;

    function getState() {

        const total = correct + wrong;

        const accuracy = total === 0
            ? 0
            : Math.round(correct / total * 100);

        return {
            score,
            lives,
            correct,
            wrong,
            time,
            accuracy
        };
    }

    function finish() {

        if (!running) return;

        running = false;
        clearInterval(interval);

        onFinish(getState());
    }

    function tick() {

        if (!running) return;

        time = Math.max(
            0,
            Math.ceil((deadline - performance.now()) / 1000)
        );

        onUpdate(getState());

        if (time === 0) {
            finish();
        }
    }

    function start() {

        running = true;
        deadline = performance.now() + GAME_TIME * 1000;

        onUpdate(getState());

        interval = setInterval(tick, 100);
    }

    function answer(isCorrect) {

        tick();

        if (!running) return false;

        if (isCorrect) {
            score += POINTS;
            correct++;
        } else {
            lives--;
            wrong++;
        }

        onUpdate(getState());

        if (lives === 0) {
            finish();
        }

        return true;
    }

    function stop() {
        running = false;
        clearInterval(interval);
    }

    return {
        start,
        answer,
        stop,
        getState,
        isRunning: () => running
    };
}


// 4. SCREEN MANAGEMENT

function showScreen(screenId) {

    const screens = [
        "mainMenu",
        "gameScreen",
        "resultScreen",
        "leaderboardScreen"
    ];

    screens.forEach(id => {
        $(id).hidden = id !== screenId;
    });

    $("homeBtn").hidden = screenId === "mainMenu";
}


// 5. MAP STYLING

function countryStyle() {

    const dark =
        document.body.classList.contains("dark-theme");

    return {
        fillColor: dark ? "#4679ad" : "#9bbfdf",
        color: dark ? "#bed9ef" : "#52799e",
        weight: 1,
        fillOpacity: 0.85
    };
}

function highlightAnswer(layer, isCorrect) {

    layer.setStyle({
        fillColor: isCorrect ? "#22c55e" : "#ef233c",
        color: isCorrect ? "#86efac" : "#fda4af",
        weight: 2,
        fillOpacity: 1
    });
}


// 6. LEAFLET MAP

async function initMap() {

    if (!map) {

        map = L.map("map", {
            minZoom: 1,
            maxZoom: 8,
            zoomSnap: 0.25,
            zoomDelta: 0.5
        }).setView([15, 0], 2);

        map.attributionControl.addAttribution("Natural Earth");
    }

    if (!countriesLayer) {

        const response = await fetch(GEOJSON_URL);

        if (!response.ok) {
            throw new Error("Harita verisi yüklenemedi.");
        }

        const data = await response.json();

        countriesLayer = L.geoJSON(data, {

            filter: feature =>
                feature.properties.ADMIN !== "Antarctica",

            style: countryStyle,

            onEachFeature: function (feature, layer) {

                const code =
                    feature.properties.ADM0_A3 ||
                    feature.properties.ISO_A3;

                countryLayers.set(code, layer);

                // Country event handlers

                layer.on("mouseover", function () {

                    if (!locked && selectedLayer !== layer) {
                        layer.setStyle({
                            weight: 2,
                            fillOpacity: 1
                        });
                    }
                });

                layer.on("mouseout", function () {

                    if (selectedLayer !== layer) {
                        countriesLayer.resetStyle(layer);
                    }
                });

                layer.on("click", function () {
                    checkAnswer(code, layer);
                });
            }

        }).addTo(map);
    }
}


// 7. NEXT QUESTION

function nextQuestion() {

    if (!game || !game.isRunning()) return;

    if (selectedLayer) {
        countriesLayer.resetStyle(selectedLayer);
        selectedLayer = null;
    }

    locked = true;
    questionNumber++;

    let level;
    let levelName;

    if (questionNumber <= 3) {
        level = "easy";
        levelName = "Kolay";
    } else if (questionNumber <= 6) {
        level = "medium";
        levelName = "Orta";
    } else {
        level = "hard";
        levelName = "Zor";
    }

    const available = questions[level].filter(
        country => countryLayers.has(country[0])
    );

    let pool = available.filter(
        country => !usedCountries.has(country[0])
    );

    // Reuse countries when the pool is exhausted
    if (pool.length === 0) {

        available.forEach(country => {
            usedCountries.delete(country[0]);
        });

        pool = available;
    }

    if (pool.length === 0) {
        $("feedback").textContent = "Ülke verisi bulunamadı.";
        game.stop();
        return;
    }

    const index = Math.floor(Math.random() * pool.length);

    target = pool[index];

    usedCountries.add(target[0]);

    $("targetCountry").textContent = target[1];
    $("difficulty").textContent = levelName;
    $("questionNumber").textContent = questionNumber;

    $("feedback").textContent = "Doğru ülkeyi seç!";
    $("feedback").className = "";

    // Automatic regional zoom
    map.stop();

    map.fitBounds(regions[target[2]], {
        padding: [20, 20],
        maxZoom: 4,
        animate: true,
        duration: 0.5
    });

    locked = false;
}


// 8. CHECK COUNTRY SELECTION

function checkAnswer(code, layer) {

    if (!game || !game.isRunning() || locked || !target) {
        return;
    }

    locked = true;

    const isCorrect = code === target[0];

    selectedLayer = layer;
    selectedCorrect = isCorrect;

    highlightAnswer(layer, isCorrect);

    if (!game.answer(isCorrect)) return;

    if (!game.isRunning()) return;

    if (isCorrect) {

        $("feedback").textContent =
            "Doğru cevap! +100 puan";

        $("feedback").className = "correct";

    } else {

        $("feedback").textContent =
            "Yanlış cevap! -1 can";

        $("feedback").className = "wrong";
    }

    // Wait briefly before the next question
    nextTimer = setTimeout(nextQuestion, 700);
}


// 9. DOM UPDATES

function updateStats(state) {

    $("timer").textContent = state.time;
    $("score").textContent = state.score;
    $("accuracy").textContent = state.accuracy + "%";

    $("lives").textContent =
        "♥ ".repeat(state.lives) +
        "♡ ".repeat(START_LIVES - state.lives);

    $("timer").style.color =
        state.time <= 10 ? "#ef233c" : "var(--blue)";
}


// 10. START GAME

async function startGame() {

    if (loading) return;

    const currentSession = ++sessionId;

    clearTimeout(nextTimer);

    if (game) game.stop();

    locked = true;
    target = null;
    questionNumber = 0;

    usedCountries.clear();

    showScreen("gameScreen");

    $("targetCountry").textContent = "Yükleniyor...";
    $("feedback").textContent = "Harita hazırlanıyor.";

    loading = true;
    $("startBtn").disabled = true;

    try {

        await initMap();

        if (currentSession !== sessionId) return;

        map.invalidateSize();

        if (selectedLayer) {
            countriesLayer.resetStyle(selectedLayer);
            selectedLayer = null;
        }

        game = createGame(updateStats, endGame);

        game.start();
        nextQuestion();

    } catch (error) {

        $("feedback").textContent = error.message;
        console.error(error);

    } finally {

        loading = false;
        $("startBtn").disabled = false;
    }
}


// 11. GAME OVER

function endGame(state) {

    clearTimeout(nextTimer);

    locked = true;
    target = null;

    $("finalScore").textContent = state.score;
    $("correctCount").textContent = state.correct;
    $("wrongCount").textContent = state.wrong;

    $("finalAccuracy").textContent =
        state.accuracy + "%";

    $("elapsedTime").textContent =
        (GAME_TIME - state.time) + " sn";

showScreen("resultScreen");
saveScore(state);
renderResultChart(state);
}


// 12. RETURN TO MAIN MENU

function goHome() {

    sessionId++;

    clearTimeout(nextTimer);

    if (game) {
        game.stop();
    }

    locked = true;
    target = null;

    showScreen("mainMenu");
}


// 13. THEME SWITCH

function toggleTheme() {

    const dark =
        document.body.classList.toggle("dark-theme");

    document.body.classList.toggle("light-theme", !dark);

    $("themeBtn").textContent =
        dark ? "☀ Açık Tema" : "☾ Koyu Tema";

    if (countriesLayer) {

        countriesLayer.setStyle(countryStyle());

        if (selectedLayer) {
            highlightAnswer(
                selectedLayer,
                selectedCorrect
            );
        }
    }
}


// 14. EVENT HANDLERS

$("startBtn").addEventListener("click", startGame);

$("restartBtn").addEventListener("click", startGame);

$("homeBtn").addEventListener("click", goHome);

$("resultMenuBtn").addEventListener("click", goHome);

$("themeBtn").addEventListener("click", toggleTheme);

$("rulesBtn").addEventListener("click", function () {
    $("rulesModal").showModal();
});

$("closeRulesBtn").addEventListener("click", function () {
    $("rulesModal").close();
});

$("backBtn").addEventListener("click", goHome);


// 16. LEADERBOARD

const STORAGE_KEY = "countryRushScores";

function getScores() {

    try {
        const scores = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );

        return Array.isArray(scores) ? scores : [];

    } catch (error) {
        return [];
    }
}

function saveScore(state) {

    const playerName =
        $("playerName").value.trim() || "Misafir";

    const scores = getScores();

    scores.push({
        name: playerName,
        score: state.score,
        accuracy: state.accuracy,
        date: new Date().toISOString()
    });

    scores.sort((a, b) =>
        b.score - a.score ||
        b.accuracy - a.accuracy
    );

    const topScores = scores.slice(0, 10);

    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(topScores)
        );
    } catch (error) {
        console.error("Skor kaydedilemedi.", error);
    }
}

function showLeaderboard() {

    showScreen("leaderboardScreen");

    const scores = getScores();
    const table = $("leaderboardBody");

    table.textContent = "";

    if (scores.length === 0) {

        const row = table.insertRow();
        const cell = row.insertCell();

        cell.colSpan = 4;
        cell.textContent = "Henüz skor bulunmuyor.";

        return;
    }

    scores.forEach((player, index) => {

        const row = document.createElement("tr");

        const values = [
            index + 1,
            player.name,
            player.score,
            player.accuracy + "%"
        ];

        values.forEach(value => {

            const cell = document.createElement("td");

            cell.textContent = value;
            row.appendChild(cell);
        });

        table.appendChild(row);
    });
}


// Leaderboard event handlers

$("leaderboardBtn").addEventListener(
    "click", showLeaderboard
);

$("resultLeaderboardBtn").addEventListener(
    "click", showLeaderboard
);


// 15. RESULT CHART

let resultChart;

function renderResultChart(state) {

    if (typeof Chart === "undefined") return;

    if (resultChart) {
        resultChart.destroy();
    }

    const textColor = getComputedStyle(document.body)
        .getPropertyValue("--text").trim();

    const total = state.correct + state.wrong;

    resultChart = new Chart($("resultChart"), {

        type: "doughnut",

        data: {
            labels: total === 0
                ? ["Cevap verilmedi"]
                : ["Doğru Cevap", "Yanlış Cevap"],

            datasets: [{
                data: total === 0
                    ? [1]
                    : [state.correct, state.wrong],

                backgroundColor: total === 0
                    ? ["#64748b"]
                    : ["#22c55e", "#ef233c"],

                borderWidth: 0,
                hoverOffset: 8
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "70%",

            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: textColor,
                        padding: 20
                    }
                }
            }
        }
    });
}

// 16. LEADERBOARD



function getScores() {

    try {
        const scores = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );

        return Array.isArray(scores) ? scores : [];

    } catch (error) {
        return [];
    }
}

function saveScore(state) {

    const playerName =
        $("playerName").value.trim() || "Misafir";

    const scores = getScores();

    scores.push({
        name: playerName,
        score: state.score,
        accuracy: state.accuracy,
        date: new Date().toISOString()
    });

    scores.sort((a, b) =>
        b.score - a.score ||
        b.accuracy - a.accuracy
    );

    const topScores = scores.slice(0, 10);

    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(topScores)
        );
    } catch (error) {
        console.error("Skor kaydedilemedi.", error);
    }
}

function showLeaderboard() {

    showScreen("leaderboardScreen");

    const scores = getScores();
    const table = $("leaderboardBody");

    table.textContent = "";

    if (scores.length === 0) {

        const row = table.insertRow();
        const cell = row.insertCell();

        cell.colSpan = 4;
        cell.textContent = "Henüz skor bulunmuyor.";

        return;
    }

    scores.forEach((player, index) => {

        const row = document.createElement("tr");

        const values = [
            index + 1,
            player.name,
            player.score,
            player.accuracy + "%"
        ];

        values.forEach(value => {

            const cell = document.createElement("td");

            cell.textContent = value;
            row.appendChild(cell);
        });

        table.appendChild(row);
    });
}


// Leaderboard event handlers

$("leaderboardBtn").addEventListener(
    "click", showLeaderboard
);

$("resultLeaderboardBtn").addEventListener(
    "click", showLeaderboard
);
 
