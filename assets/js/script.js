// ==========================================================================
// APLIKASI BACA AL-QUR'AN ONLINE (saw-it)
// ==========================================================================

// ===============================
// GLOBAL STATE & CONFIG
// ===============================
let currentAudio = null;
let audioDockHideTimer = null;
let audioDockTransitionTimer = null;
let currentButton = null;
let autoPlayEnabled = true;
let allSurahData = [];
let currentOpenSurah = null;
let currentSurahDetail = null; // Menyimpan data surah yang sedang dibuka di modal
let playingAyahSurahDetail = null;
let activeSurahId = 1;
let carouselPointerStart = null;
let readingProgressObserver = null;
let lastSavedReadingPosition = "";
let currentPlayingSurah = null; // Nomor surah yang sedang diputar di beranda
let currentPlayingAyah = null; // Nomor ayat yang sedang diputar audionya
let audioSessionId = 0; // ID unik sesi pemutaran audio untuk mencegah race-condition
let selectedQari = localStorage.getItem("selectedQari") || "03"; // Default Sudais (03) atau Mishari (05)
const surahCache = {}; // Cache in-memory untuk memuat surah instan
const dialogReturnFocus = new WeakMap();
let activeDialog = null;
let modalRequestId = 0;
let listRequestId = 0;
let switchWarningRequestId = 0;
let bodyOverflowBeforeDialog = null;

const QARI_LIST = [
    { id: "01", name: "Abdullah Al-Juhany" },
    { id: "02", name: "Abdul-Muhsin Al-Qasim" },
    { id: "03", name: "Abdurrahman as-Sudais" },
    { id: "04", name: "Ibrahim Al-Dossari" },
    { id: "05", name: "Misyari Rasyid Al-Afasi" },
    { id: "06", name: "Yasser Al-Dosari" }
];

// ===============================
// INITIALIZATION
// ===============================
init();

function init() {
    setupAutoplayToggle();
    setupRememberToggle();
    setupQariSelector();
    setupMediaSession();
    setupDarkMode();
    setupScrollTop();
    setupFloatingToolbar();
    setupGlobalClick();
    setupSearch();
    setupKeyboardListeners();
    setupAdaptiveExperience();
    setupAudioDock();
    setupPremiumInteractions();

    activeSurahId = getLastReadSurahId() || 1;
    loadSurahList();
}

function setupPremiumInteractions() {
    setupWelcomeBackgroundInteractions();
    setupAmbientParticles();
    setupMagneticButtons();
}

function setupWelcomeBackgroundInteractions() {
    const welcome = document.getElementById("welcome-screen");
    if (!welcome) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lowPowerDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
    const dataSaver = navigator.connection?.saveData === true;
    const glow = welcome.querySelector(".welcome-cursor-glow");
    const card = welcome.querySelector(".welcome-card");
    let frameId = 0;
    let pointerX = 0;
    let pointerY = 0;

    const isEnabled = () => finePointer.matches && !reducedMotion.matches &&
        !lowPowerDevice && !dataSaver && window.innerWidth > 700;
    const reset = () => {
        welcome.classList.remove("has-pointer");
        welcome.style.setProperty("--welcome-pattern-x", "0px");
        welcome.style.setProperty("--welcome-pattern-y", "0px");
        welcome.style.setProperty("--welcome-arch-x", "0px");
        welcome.style.setProperty("--welcome-arch-y", "0px");
        welcome.style.setProperty("--welcome-ornament-x", "0px");
        welcome.style.setProperty("--welcome-ornament-y", "0px");
        welcome.style.setProperty("--welcome-tilt-x", "0deg");
        welcome.style.setProperty("--welcome-tilt-y", "0deg");
        welcome.classList.remove("has-card-pointer");
    };

    welcome.addEventListener("pointermove", event => {
        if (!isEnabled() || event.pointerType !== "mouse" || welcome.hidden) return;

        const bounds = welcome.getBoundingClientRect();
        const normalizedX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
        const normalizedY = (event.clientY - bounds.top) / bounds.height * 2 - 1;
        pointerX = event.clientX - bounds.left;
        pointerY = event.clientY - bounds.top;
        welcome.classList.add("has-pointer");
        welcome.style.setProperty("--welcome-pattern-x", `${normalizedX * -8}px`);
        welcome.style.setProperty("--welcome-pattern-y", `${normalizedY * -8}px`);
        welcome.style.setProperty("--welcome-arch-x", `${normalizedX * 5}px`);
        welcome.style.setProperty("--welcome-arch-y", `${normalizedY * 5}px`);
        welcome.style.setProperty("--welcome-ornament-x", `${normalizedX * -12}px`);
        welcome.style.setProperty("--welcome-ornament-y", `${normalizedY * -12}px`);

        if (card) {
            const cardBounds = card.getBoundingClientRect();
            const cardX = (event.clientX - cardBounds.left) / cardBounds.width * 2 - 1;
            const cardY = (event.clientY - cardBounds.top) / cardBounds.height * 2 - 1;
            welcome.style.setProperty("--welcome-tilt-x", `${Math.max(-1, Math.min(1, cardY)) * -5}deg`);
            welcome.style.setProperty("--welcome-tilt-y", `${Math.max(-1, Math.min(1, cardX)) * 5}deg`);
            welcome.classList.add("has-card-pointer");
        }

        if (!glow || frameId) return;
        frameId = window.requestAnimationFrame(() => {
            frameId = 0;
            glow.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%)`;
        });
    }, { passive: true });

    welcome.addEventListener("pointerleave", reset);
    finePointer.addEventListener("change", () => {
        if (!isEnabled()) reset();
    });
    reducedMotion.addEventListener("change", () => {
        if (!isEnabled()) reset();
    });
    window.addEventListener("resize", () => {
        if (!isEnabled()) reset();
    }, { passive: true });
}

function replayEntryAnimation(element) {
    if (!element) return;
    element.classList.remove("is-entering");
    void element.offsetWidth;
    element.classList.add("is-entering");
    window.setTimeout(() => element.classList.remove("is-entering"), 760);
}

function setupAmbientParticles() {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lowPowerDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
    const dataSaver = navigator.connection?.saveData === true;
    if (!finePointer.matches || reducedMotion.matches || lowPowerDevice || dataSaver) return;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    canvas.className = "ambient-particles";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);

    let width = 0;
    let height = 0;
    let particles = [];
    let frameId = 0;
    let lastFrameTime = 0;
    let frameCount = 0;
    let isRunning = false;

    const isEnabled = () => finePointer.matches && !reducedMotion.matches && window.innerWidth > 700;

    function resizeCanvas() {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const count = Math.min(34, Math.max(16, Math.round((width * height) / 42000)));
        particles = Array.from({ length: count }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.4 + 0.45,
            alpha: Math.random() * 0.16 + 0.05,
            vx: (Math.random() - 0.5) * 0.12,
            vy: (Math.random() - 0.5) * 0.1,
            phase: Math.random() * Math.PI * 2
        }));
        if (isEnabled()) drawParticles();
    }

    function drawParticles(timestamp = 0) {
        context.clearRect(0, 0, width, height);
        particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            if (particle.x < -4) particle.x = width + 4;
            else if (particle.x > width + 4) particle.x = -4;
            if (particle.y < -4) particle.y = height + 4;
            else if (particle.y > height + 4) particle.y = -4;

            const shimmer = 0.72 + Math.sin(timestamp / 1500 + particle.phase) * 0.18;
            context.beginPath();
            context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            context.fillStyle = `rgba(74, 222, 128, ${particle.alpha * shimmer})`;
            context.fill();
        });
    }

    function animate(timestamp) {
        if (!isRunning) return;
        frameId = window.requestAnimationFrame(animate);
        if (timestamp - lastFrameTime < 32) return;
        lastFrameTime = timestamp;
        frameCount++;
        if (frameCount % 2 === 0) drawParticles(timestamp);
    }

    function startAnimation() {
        if (isRunning || document.hidden) return;
        isRunning = true;
        frameId = window.requestAnimationFrame(animate);
    }

    function stopAnimation() {
        isRunning = false;
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = 0;
    }

    function syncAnimationPreference() {
        if (isEnabled()) {
            canvas.style.display = "";
            resizeCanvas();
            startAnimation();
        } else {
            stopAnimation();
            context.clearRect(0, 0, width, height);
            canvas.style.display = "none";
        }
    }

    window.addEventListener("resize", syncAnimationPreference, { passive: true });
    finePointer.addEventListener("change", syncAnimationPreference);
    reducedMotion.addEventListener("change", syncAnimationPreference);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopAnimation();
        else syncAnimationPreference();
    });
    resizeCanvas();
    syncAnimationPreference();
}

function setupMagneticButtons() {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const selector = ".primary-button, .secondary-button, .carousel-control, #floatingToolbarBtn, .audio-dock-controls button, .carousel-audio-play, .search-clear-btn, .home-button";
    let activeButton = null;
    let pendingFrame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const resetButton = button => {
        if (!button) return;
        button.style.translate = "";
    };

    document.addEventListener("pointermove", event => {
        if (!finePointer.matches || window.innerWidth <= 700 || event.pointerType !== "mouse") return;
        const button = event.target.closest(selector);
        if (activeButton !== button) {
            resetButton(activeButton);
            activeButton = button;
        }
        if (!button || button.disabled) return;

        pointerX = event.clientX;
        pointerY = event.clientY;
        if (pendingFrame) return;
        pendingFrame = window.requestAnimationFrame(() => {
            pendingFrame = 0;
            if (!activeButton?.isConnected) return;
            const rect = activeButton.getBoundingClientRect();
            const strength = activeButton.classList.contains("primary-button") ? 0.12 : 0.08;
            const x = Math.max(-4, Math.min(4, (pointerX - rect.left - rect.width / 2) * strength));
            const y = Math.max(-4, Math.min(4, (pointerY - rect.top - rect.height / 2) * strength));
            activeButton.style.translate = `${x}px ${y}px`;
        });
    }, { passive: true });

    document.addEventListener("pointerout", event => {
        if (!activeButton || activeButton.contains(event.relatedTarget)) return;
        resetButton(activeButton);
        activeButton = null;
    }, { passive: true });

    window.addEventListener("blur", () => {
        resetButton(activeButton);
        activeButton = null;
    });
    window.addEventListener("resize", () => {
        if (window.innerWidth > 700) return;
        resetButton(activeButton);
        activeButton = null;
    }, { passive: true });
}

function getLastReadSurahId() {
    const position = getSavedReadingPosition();
    return position ? position.surah : null;
}

function isRememberLastReadEnabled() {
    return localStorage.getItem("rememberLastRead") === "true";
}

function getSavedReadingPosition() {
    if (!isRememberLastReadEnabled()) return null;

    for (const key of ["adaptiveLastRead", "lastRead"]) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            const surah = Number(value && value.surah);
            const checked = Array.isArray(value && value.checked)
                ? value.checked.map(Number).filter(number => Number.isInteger(number) && number > 0)
                : [];
            const ayah = Number(value && value.ayah) || (checked.length ? Math.max(...checked) : 1);
            if (Number.isInteger(surah) && surah >= 1 && surah <= 114 &&
                Number.isInteger(ayah) && ayah > 0) {
                return { surah, ayah };
            }
        } catch (error) {
            console.warn(`Progres bacaan (${key}) tidak dapat dibaca:`, error);
        }
    }
    return null;
}

function saveAdaptiveReadingPosition(surah, ayah) {
    if (!isRememberLastReadEnabled()) {
        lastSavedReadingPosition = "";
        return;
    }

    const position = { surah: Number(surah), ayah: Math.max(1, Number(ayah) || 1) };
    const serialized = JSON.stringify(position);
    if (serialized === lastSavedReadingPosition) return;
    try {
        localStorage.setItem("adaptiveLastRead", serialized);
        lastSavedReadingPosition = serialized;
    } catch (error) {
        console.warn("Progres bacaan tidak dapat disimpan:", error);
    }
}

function observeModalReadingProgress(container, surahId) {
    if (readingProgressObserver) readingProgressObserver.disconnect();
    if (!("IntersectionObserver" in window)) return;
    readingProgressObserver = new IntersectionObserver(entries => {
        const visibleAyah = entries
            .filter(entry => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visibleAyah) {
            saveAdaptiveReadingPosition(surahId, visibleAyah.target.dataset.ayah);
        }
    }, { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.5, 1] });
    container.querySelectorAll(".ayat-item").forEach(item => readingProgressObserver.observe(item));
}

function setupAdaptiveExperience() {
    const welcome = document.getElementById("welcome-screen");
    const experience = document.getElementById("quran-experience");
    const startButton = document.getElementById("welcome-start");
    const resumeButton = document.getElementById("welcome-resume-button");
    const homeButton = document.getElementById("home-button");
    const carousel = document.getElementById("surah-carousel");

    history.replaceState({ adaptiveView: "welcome" }, "");
    document.body.classList.add("welcome-active");
    replayEntryAnimation(welcome);

    if (startButton) {
        startButton.addEventListener("click", () => enterQuranExperience(activeSurahId, true));
    }
    if (resumeButton) {
        resumeButton.addEventListener("click", () => {
            const position = getSavedReadingPosition();
            if (position) enterQuranExperience(position.surah, true, true, position.ayah);
        });
    }
    if (homeButton) {
        homeButton.addEventListener("click", showWelcomeScreen);
    }

    document.getElementById("carousel-previous")?.addEventListener("click", () => navigateCarousel(-1));
    document.getElementById("carousel-next")?.addEventListener("click", () => navigateCarousel(1));
    const textSize = document.getElementById("reader-text-size");
    if (textSize) {
        const savedSize = Number(localStorage.getItem("readerTextSize"));
        if (Number.isInteger(savedSize) && savedSize >= 22 && savedSize <= 40) {
            textSize.value = String(savedSize);
        }
        applyReaderTextSize(textSize.value);
        textSize.addEventListener("input", () => {
            localStorage.setItem("readerTextSize", textSize.value);
            applyReaderTextSize(textSize.value);
        });
    }

    if (carousel) {
        carousel.addEventListener("keydown", event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                navigateCarousel(event.key === "ArrowLeft" ? -1 : 1);
            }
        });
        carousel.addEventListener("pointerdown", event => {
            carouselPointerStart = event.clientX;
        });
        carousel.addEventListener("pointerup", event => {
            if (carouselPointerStart === null) return;
            const distance = event.clientX - carouselPointerStart;
            carouselPointerStart = null;
            if (Math.abs(distance) > 45) navigateCarousel(distance < 0 ? 1 : -1);
        });
        carousel.addEventListener("pointercancel", () => {
            carouselPointerStart = null;
        });
    }

    window.addEventListener("popstate", event => {
        if (activeDialog) closeDialog(activeDialog);
        if (event.state && event.state.adaptiveView === "reader") {
            if (welcome) welcome.hidden = true;
            if (experience) experience.hidden = false;
            replayEntryAnimation(experience);
            document.body.classList.remove("welcome-active");
            const surahId = Number(event.state.surah);
            if (Number.isInteger(surahId)) {
                activeSurahId = surahId;
                renderSurahCarousel();
            }
            updateAudioDock();
        } else {
            pauseAudioForWelcome();
            if (experience) experience.hidden = true;
            if (welcome) welcome.hidden = false;
            replayEntryAnimation(welcome);
            document.body.classList.add("welcome-active");
            updateAudioDock();
            syncWelcomeResume();
            document.getElementById("welcome-start")?.focus();
        }
    });
}

function enterQuranExperience(surahId, addHistory, isResume = false, ayahToScroll) {
    const welcome = document.getElementById("welcome-screen");
    const experience = document.getElementById("quran-experience");
    if (!welcome || !experience) return;

    welcome.hidden = true;
    experience.hidden = false;
    replayEntryAnimation(experience);
    document.body.classList.remove("welcome-active");
    if (addHistory) {
        history.pushState({ adaptiveView: "reader", surah: surahId }, "");
    }
    activeSurahId = Number(surahId) || 1;
    renderSurahCarousel();
    if (isResume) {
        openSurahModal(activeSurahId, ayahToScroll, document.getElementById("welcome-resume-button"));
    } else {
        document.getElementById("surah-search")?.focus();
    }
}

function showWelcomeScreen() {
    const welcome = document.getElementById("welcome-screen");
    const experience = document.getElementById("quran-experience");
    if (!welcome || !experience) return;
    pauseAudioForWelcome();
    history.pushState({ adaptiveView: "welcome" }, "");
    experience.hidden = true;
    welcome.hidden = false;
    replayEntryAnimation(welcome);
    document.body.classList.add("welcome-active");
    updateAudioDock();
    syncWelcomeResume();
    document.getElementById("welcome-start")?.focus();
}

function pauseAudioForWelcome() {
    if (currentAudio && !currentAudio.paused) {
        handleMediaSessionPause();
    }
}

function syncWelcomeResume() {
    const resumeButton = document.getElementById("welcome-resume-button");
    const resumeText = document.getElementById("welcome-resume");
    const surahId = getLastReadSurahId();
    const position = getSavedReadingPosition();
    const surah = allSurahData.find(item => item.nomor === surahId);
    if (!resumeButton || !resumeText || !surahId || !position || !surah) {
        if (resumeButton) resumeButton.hidden = true;
        if (resumeText) resumeText.hidden = true;
        return;
    }

    resumeText.textContent = `Terakhir dibaca: Surah ${surah.namaLatin}, ayat ${position.ayah}.`;
    resumeText.hidden = false;
    resumeButton.hidden = false;
}

function applyReaderTextSize(size) {
    const value = `${Number(size)}px`;
    document.getElementById("modal-ayat")?.style.setProperty("--reader-arabic-size", value);
}

function navigateCarousel(direction) {
    const nextId = activeSurahId + direction;
    if (nextId < 1 || nextId > 114) return;
    activeSurahId = nextId;
    renderSurahCarousel();
    if (!document.getElementById("quran-experience").hidden) {
        history.pushState({ adaptiveView: "reader", surah: nextId }, "");
    }
}

function applySavedAyahProgress(container, surahId) {
    if (!isRememberLastReadEnabled()) return;
    let lastRead;
    try {
        lastRead = JSON.parse(localStorage.getItem("lastRead"));
    } catch (error) {
        console.warn("Progres bacaan tersimpan tidak dapat dibaca:", error);
        return;
    }
    if (!lastRead || Number(lastRead.surah) !== surahId) return;
    const checked = Array.isArray(lastRead.checked) ? lastRead.checked.map(Number) : [];
    container.querySelectorAll(".ayat-item").forEach(item => {
        const ayah = Number(item.dataset.ayah);
        const isChecked = checked.length ? checked.includes(ayah) : Number(lastRead.ayah) >= ayah;
        item.classList.toggle("checked", isChecked);
        const button = item.querySelector(".check-btn");
        button?.classList.toggle("checked", isChecked);
        button?.setAttribute("aria-pressed", String(isChecked));
        if (button) {
            button.setAttribute("aria-label", `${isChecked ? "Batalkan tanda" : "Tandai"} ayat ${ayah} selesai dibaca`);
            button.title = `${isChecked ? "Batalkan tanda" : "Tandai"} ayat ${ayah} dibaca`;
        }
    });
}

function renderSurahCarousel() {
    const track = document.getElementById("carousel-track");
    if (!track || !allSurahData.length) return;
    const fragment = document.createDocumentFragment();
    [-1, 0, 1].forEach(offset => {
        const surahId = activeSurahId + offset;
        if (surahId < 1 || surahId > 114) {
            const spacer = document.createElement("div");
            spacer.className = "carousel-card-shell carousel-card-empty";
            spacer.setAttribute("aria-hidden", "true");
            fragment.append(spacer);
            return;
        }
        const surah = allSurahData[surahId - 1];
        const shell = document.createElement("div");
        shell.className = "carousel-card-shell";
        shell.dataset.carouselOffset = String(offset);
        const isCurrentSurahPlaying = Boolean(
            offset === 0 && currentAudio && currentPlayingAyah === null &&
            currentPlayingSurah === surah.nomor && !currentAudio.paused
        );
        const card = document.createElement("button");
        card.className = `carousel-card${offset === 0 ? " is-active" : ""}`;
        card.type = "button";
        card.dataset.surah = String(surah.nomor);
        card.dataset.carouselOffset = String(offset);
        card.setAttribute("aria-label", `Pilih Surah ${surah.namaLatin}`);
        if (offset === 0) card.setAttribute("aria-current", "true");

        const number = document.createElement("span");
        number.className = "carousel-number";
        number.textContent = String(surah.nomor).padStart(3, "0");
        const arabic = document.createElement("span");
        arabic.className = "carousel-arabic";
        arabic.lang = "ar";
        arabic.dir = "rtl";
        arabic.textContent = surah.nama;
        const name = document.createElement("strong");
        name.textContent = surah.namaLatin;
        const details = document.createElement("span");
        details.textContent = `${surah.arti} · ${surah.jumlahAyat} Ayat`;
        card.append(number, arabic, name, details);
        card.addEventListener("click", () => {
            activeSurahId = surah.nomor;
            renderSurahCarousel();
            openSurahModal(surah.nomor, undefined, document.querySelector(`.carousel-card[aria-current="true"]`));
        });
        shell.append(card);
        if (offset === 0) {
            const audioButton = document.createElement("button");
            audioButton.id = "carousel-audio-play";
            audioButton.className = `carousel-audio-play${isCurrentSurahPlaying ? " is-playing" : ""}`;
            audioButton.type = "button";
            audioButton.setAttribute(
                "aria-label",
                `${isCurrentSurahPlaying ? "Jeda" : "Putar"} audio Surah ${surah.namaLatin}`
            );
            audioButton.title = `${isCurrentSurahPlaying ? "Jeda" : "Putar"} audio Surah ${surah.namaLatin}`;
            const playIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            playIcon.setAttribute("class", "carousel-play-icon");
            playIcon.setAttribute("viewBox", "0 0 24 24");
            playIcon.setAttribute("width", "18");
            playIcon.setAttribute("height", "18");
            playIcon.setAttribute("fill", "currentColor");
            playIcon.setAttribute("aria-hidden", "true");
            const playPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            playPath.setAttribute("d", "M7 4v16l13-8z");
            playIcon.append(playPath);
            const pauseIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            pauseIcon.setAttribute("class", "carousel-pause-icon");
            pauseIcon.setAttribute("viewBox", "0 0 24 24");
            pauseIcon.setAttribute("width", "18");
            pauseIcon.setAttribute("height", "18");
            pauseIcon.setAttribute("fill", "currentColor");
            pauseIcon.setAttribute("aria-hidden", "true");
            const pausePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pausePath.setAttribute("d", "M6 5h4v14H6zm8 0h4v14h-4z");
            pauseIcon.append(pausePath);
            audioButton.append(playIcon, pauseIcon);
            audioButton.addEventListener("click", toggleActiveSurahAudio);
            shell.append(audioButton);
        }
        fragment.append(shell);
    });
    track.replaceChildren(fragment);
    track.setAttribute("aria-label", `Surah ${allSurahData[activeSurahId - 1]?.namaLatin || activeSurahId} dipilih`);
    document.getElementById("carousel-previous").disabled = activeSurahId <= 1;
    document.getElementById("carousel-next").disabled = activeSurahId >= 114;
    updateAudioDock();
}

function toggleActiveSurahAudio() {
    const surah = allSurahData.find(item => item.nomor === activeSurahId);
    if (!surah) return;

    if (currentAudio && currentPlayingAyah === null && currentPlayingSurah === surah.nomor) {
        if (currentAudio.paused) handleMediaSessionPlay();
        else handleMediaSessionPause();
        return;
    }

    stopAllAudio();
    startNewAudio(null, getFullSurahAudioUrl(surah), null, surah.nomor);
}

function buildSurahNavigation(container, surah) {
    container.replaceChildren();
    if (surah.suratSebelumnya) {
        container.append(createNavigationButton(-1, surah.suratSebelumnya, () =>
            openSurahModal(surah.suratSebelumnya.nomor, undefined, document.activeElement)
        ));
    } else {
        container.append(document.createElement("span"));
    }
    if (surah.suratSelanjutnya) {
        container.append(createNavigationButton(1, surah.suratSelanjutnya, () =>
            openSurahModal(surah.suratSelanjutnya.nomor, undefined, document.activeElement)
        ));
    }
}

function setupAudioDock() {
    const dock = document.getElementById("audio-dock");
    const dragHandle = dock?.querySelector(".audio-dock-track");

    if (dock && dragHandle) {
        let dragStart = null;
        dragHandle.title = "Geser untuk memindahkan pemutar";
        dragHandle.setAttribute("aria-label", "Pegangan pemutar. Geser dengan mouse atau sentuhan untuk memindahkan.");

        dragHandle.addEventListener("pointerdown", event => {
            if (!event.isPrimary || event.button !== 0) return;
            const rect = dock.getBoundingClientRect();
            dragStart = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: rect.left,
                top: rect.top,
                moved: false
            };
            dragHandle.setPointerCapture(event.pointerId);
        });

        dragHandle.addEventListener("pointermove", event => {
            if (!dragStart || event.pointerId !== dragStart.pointerId) return;
            const deltaX = event.clientX - dragStart.x;
            const deltaY = event.clientY - dragStart.y;
            if (!dragStart.moved && Math.hypot(deltaX, deltaY) < 5) return;
            dragStart.moved = true;

            const maxLeft = Math.max(8, window.innerWidth - dock.offsetWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - dock.offsetHeight - 8);
            const left = Math.min(maxLeft, Math.max(8, dragStart.left + deltaX));
            const top = Math.min(maxTop, Math.max(8, dragStart.top + deltaY));
            dock.style.left = `${left}px`;
            dock.style.top = `${top}px`;
            dock.style.right = "auto";
            dock.style.bottom = "auto";
            dock.style.transform = "none";
            dock.classList.add("is-dragging");
            event.preventDefault();
        });

        const finishDockDrag = event => {
            if (!dragStart || event.pointerId !== dragStart.pointerId) return;
            dragStart = null;
            dock.classList.remove("is-dragging");
            if (dragHandle.hasPointerCapture(event.pointerId)) {
                dragHandle.releasePointerCapture(event.pointerId);
            }
        };
        dragHandle.addEventListener("pointerup", finishDockDrag);
        dragHandle.addEventListener("pointercancel", finishDockDrag);

        window.addEventListener("resize", () => {
            if (dock.hidden || dock.style.top === "") return;
            const maxLeft = Math.max(8, window.innerWidth - dock.offsetWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - dock.offsetHeight - 8);
            dock.style.left = `${Math.min(maxLeft, Math.max(8, dock.offsetLeft))}px`;
            dock.style.top = `${Math.min(maxTop, Math.max(8, dock.offsetTop))}px`;
        });
    }

    document.getElementById("audio-toggle")?.addEventListener("click", () => {
        if (!currentAudio) {
            const button = document.querySelector(`.surah-card[data-surah="${activeSurahId}"] .play-btn`);
            if (button) {
                handlePlayClick(button);
            } else {
                const surah = allSurahData.find(item => item.nomor === activeSurahId);
                if (surah) startNewAudio(null, getFullSurahAudioUrl(surah), null, surah.nomor);
            }
            return;
        }
        if (currentAudio.paused) handleMediaSessionPlay();
        else handleMediaSessionPause();
    });
    document.getElementById("audio-previous")?.addEventListener("click", () => handleMediaTrackChange(-1));
    document.getElementById("audio-next")?.addEventListener("click", () => handleMediaTrackChange(1));
    document.getElementById("audio-progress")?.addEventListener("input", event => {
        if (currentAudio && Number.isFinite(currentAudio.duration)) {
            currentAudio.currentTime = (Number(event.currentTarget.value) / 100) * currentAudio.duration;
        }
    });
    updateAudioDock();
}

function clearAudioDockTimers() {
    if (audioDockHideTimer !== null) {
        clearTimeout(audioDockHideTimer);
        audioDockHideTimer = null;
    }
    if (audioDockTransitionTimer !== null) {
        clearTimeout(audioDockTransitionTimer);
        audioDockTransitionTimer = null;
    }
}

function showAudioDock(dock, experience) {
    clearAudioDockTimers();
    if (dock.hidden) {
        dock.hidden = false;
        void dock.offsetWidth;
    }
    dock.classList.add("is-visible");
    experience.classList.add("has-visible-audio-dock");
}

function hideAudioDock(dock, experience, immediate = false) {
    dock.classList.remove("is-visible");
    if (immediate) {
        clearAudioDockTimers();
        dock.hidden = true;
        experience?.classList.remove("has-visible-audio-dock");
        return;
    }

    if (audioDockTransitionTimer !== null) clearTimeout(audioDockTransitionTimer);
    audioDockTransitionTimer = setTimeout(() => {
        audioDockTransitionTimer = null;
        if (dock.classList.contains("is-visible")) return;
        dock.hidden = true;
        experience?.classList.remove("has-visible-audio-dock");
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280);
}

function updateAudioDock() {
    const dock = document.getElementById("audio-dock");
    const label = document.querySelector(".audio-dock-label");
    const title = document.getElementById("audio-dock-title");
    const subtitle = document.getElementById("audio-dock-subtitle");
    const toggle = document.getElementById("audio-toggle");
    const progress = document.getElementById("audio-progress");
    if (!dock || !title || !subtitle || !toggle || !progress) return;

    const surahId = currentPlayingAyah !== null && playingAyahSurahDetail
        ? playingAyahSurahDetail.nomor
        : currentPlayingSurah || activeSurahId;
    const surah = allSurahData.find(item => item.nomor === surahId);
    const isPlaying = Boolean(currentAudio && !currentAudio.paused);
    const hasAudio = Boolean(currentAudio);
    const isLoading = Boolean(currentAudio && !currentAudio.paused && currentAudio.readyState < 3);
    const experience = document.getElementById("quran-experience");
    const canShowDock = hasAudio && experience && !experience.hidden &&
        !document.body.classList.contains("welcome-active");
    if (!canShowDock) {
        hideAudioDock(dock, experience, true);
    } else if (isPlaying) {
        showAudioDock(dock, experience);
    } else if (dock.classList.contains("is-visible") && audioDockHideTimer === null) {
        audioDockHideTimer = setTimeout(() => {
            audioDockHideTimer = null;
            if (!currentAudio || !currentAudio.paused) return;
            hideAudioDock(dock, experience);
        }, 1000);
    }
    dock.classList.toggle("is-loading", isLoading);
    dock.setAttribute("aria-busy", String(isLoading));
    document.body.classList.toggle("has-active-audio", hasAudio);
    const surahPlayButton = document.getElementById("carousel-audio-play");
    if (surahPlayButton) {
        const selectedSurah = allSurahData.find(item => item.nomor === activeSurahId);
        const isSelectedSurahPlaying = Boolean(
            currentAudio && currentPlayingAyah === null &&
            currentPlayingSurah === activeSurahId && !currentAudio.paused
        );
        surahPlayButton.classList.toggle("is-playing", isSelectedSurahPlaying);
        surahPlayButton.setAttribute(
            "aria-label",
            `${isSelectedSurahPlaying ? "Jeda" : "Putar"} audio Surah ${selectedSurah?.namaLatin || activeSurahId}`
        );
        surahPlayButton.title = `${isSelectedSurahPlaying ? "Jeda" : "Putar"} audio Surah ${selectedSurah?.namaLatin || activeSurahId}`;
    }
    if (label) label.textContent = isPlaying ? "Sedang diputar" : hasAudio ? "Dijeda" : "Siap diputar";
    title.textContent = surah ? `Surah ${surah.namaLatin}${currentPlayingAyah !== null ? ` · Ayat ${currentPlayingAyah}` : ""}` : "Pilih surah untuk mulai mendengarkan";
    subtitle.textContent = currentAudio
        ? `${QARI_LIST.find(item => item.id === selectedQari)?.name || "Qari"} · ${getAudioSourceName(currentAudio.currentSrc || currentAudio.src)}`
        : "Audio tidak diputar otomatis";
    toggle.setAttribute("aria-label", isPlaying ? "Jeda audio" : "Putar audio");
    toggle.title = isPlaying ? "Jeda audio" : "Putar audio";
    toggle.classList.toggle("is-playing", isPlaying);
    progress.value = currentAudio && currentAudio.duration
        ? String(Math.round((currentAudio.currentTime / currentAudio.duration) * 100))
        : "0";
}

// ===============================
// PILIHAN PEMBACA (QARI SELECTOR)
// ===============================
function setupQariSelector() {
    const globalSelect = document.getElementById("global-qari-select");
    const modalSelect = document.getElementById("modal-qari-select");

    if (globalSelect) {
        globalSelect.value = selectedQari;
        globalSelect.addEventListener("change", function () {
            changeQari(this.value);
        });
    }

    if (modalSelect) {
        modalSelect.value = selectedQari;
        modalSelect.addEventListener("change", function () {
            changeQari(this.value);
        });
    }
}

function getMediaSession() {
    return "mediaSession" in navigator ? navigator.mediaSession : null;
}

function setupMediaSession() {
    const mediaSession = getMediaSession();
    if (!mediaSession || typeof mediaSession.setActionHandler !== "function") return;

    const actionHandlers = {
        play: handleMediaSessionPlay,
        pause: handleMediaSessionPause,
        previoustrack: () => handleMediaTrackChange(-1),
        nexttrack: () => handleMediaTrackChange(1)
    };

    Object.entries(actionHandlers).forEach(([action, handler]) => {
        try {
            mediaSession.setActionHandler(action, handler);
        } catch (error) {
            if (error.name !== "NotSupportedError") {
                console.warn(`Gagal mendaftarkan kontrol media "${action}":`, error);
            }
        }
    });
}

function getFullSurahAudioUrl(surah) {
    if (surah.audioFull) {
        const audioUrl = surah.audioFull[selectedQari] || surah.audioFull["03"] || Object.values(surah.audioFull)[0];
        if (audioUrl) return audioUrl;
    }

    const paddedNum = String(surah.nomor).padStart(3, "0");
    return `https://cdn.equran.id/audio-full/Abdurrahman-as-Sudais/${paddedNum}.mp3`;
}

function getAudioSourceName(audioUrl) {
    try {
        return new URL(audioUrl, window.location.href).hostname || window.location.host;
    } catch (error) {
        console.warn("Gagal membaca sumber audio:", error);
        return window.location.host;
    }
}

function updateMediaSessionMetadata(surah, ayahNum, audioUrl) {
    const mediaSession = getMediaSession();
    if (!mediaSession || typeof window.MediaMetadata !== "function" || !surah) return;

    const audioMap = ayahNum === null
        ? surah.audioFull
        : surah.ayat && surah.ayat.find(ayah => ayah.nomorAyat === ayahNum)?.audio;
    const audioReciter = audioMap && Object.entries(audioMap).find(([, url]) => url === audioUrl);
    const qari = QARI_LIST.find(item => item.id === (audioReciter ? audioReciter[0] : selectedQari));
    const surahName = surah.namaLatin || `Surah ${surah.nomor}`;

    try {
        mediaSession.metadata = new window.MediaMetadata({
            title: ayahNum === null ? `Surah ${surahName}` : `Surah ${surahName} - Ayat ${ayahNum}`,
            artist: qari ? qari.name : "Qari",
            album: getAudioSourceName(audioUrl)
        });
    } catch (error) {
        console.warn("Gagal memperbarui metadata media:", error);
    }
}

function setMediaSessionPlaybackState(state) {
    const mediaSession = getMediaSession();
    if (!mediaSession) return;

    try {
        mediaSession.playbackState = state;
    } catch (error) {
        console.warn("Gagal memperbarui status pemutaran media:", error);
    }
}

function clearMediaSession() {
    const mediaSession = getMediaSession();
    if (!mediaSession) return;

    try {
        mediaSession.metadata = null;
    } catch (error) {
        console.warn("Gagal menghapus metadata media:", error);
    }
    setMediaSessionPlaybackState("none");
}

function attachMediaSessionAudioEvents(audio) {
    audio.addEventListener("play", () => {
        if (currentAudio === audio) {
            setMediaSessionPlaybackState("playing");
            updateAudioDock();
        }
    });
    audio.addEventListener("pause", () => {
        if (currentAudio === audio && !audio.ended) {
            setMediaSessionPlaybackState("paused");
            updateAudioDock();
        }
    });
    audio.addEventListener("waiting", () => {
        if (currentAudio === audio) updateAudioDock();
    });
    audio.addEventListener("playing", () => {
        if (currentAudio === audio) {
            setMediaSessionPlaybackState("playing");
            updateAudioDock();
        }
    });
    audio.addEventListener("timeupdate", () => {
        if (currentAudio === audio) updateAudioDock();
    });
}

function handleMediaSessionPlay() {
    const audio = currentAudio;
    if (!audio || !audio.paused) return;

    function updatePlayingUI() {
        if (currentAudio !== audio) return;
        if (currentPlayingAyah !== null) {
            setAyahPlayingState(currentPlayingAyah, currentButton, true);
        } else {
            reactivateCurrentUI();
        }
    }

    try {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.then(updatePlayingUI).catch(error => {
                if (error.name !== "AbortError") {
                    console.warn("Gagal melanjutkan audio dari kontrol media:", error);
                }
            });
        } else {
            updatePlayingUI();
        }
    } catch (error) {
        console.error("Gagal melanjutkan audio dari kontrol media:", error);
    }
}

function handleMediaSessionPause() {
    if (!currentAudio) return;

    currentAudio.pause();
    if (currentPlayingAyah !== null) {
        setAyahPlayingState(currentPlayingAyah, currentButton, false);
    } else {
        deactivateCurrentUI();
    }
}

function handleMediaTrackChange(direction) {
    const wasPlaying = currentAudio ? !currentAudio.paused : true;

    if (currentPlayingAyah !== null && playingAyahSurahDetail && Array.isArray(playingAyahSurahDetail.ayat)) {
        const surah = playingAyahSurahDetail;
        const currentIndex = surah.ayat.findIndex(ayah => ayah.nomorAyat === currentPlayingAyah);
        const targetAyah = surah.ayat[currentIndex + direction];
        if (!targetAyah) return;

        stopAllAudio();
        if (wasPlaying) {
            playAyahAudio(targetAyah.nomorAyat, undefined, surah);
        } else {
            prepareAyahAudio(targetAyah.nomorAyat, surah);
        }
        return;
    }

    if (currentPlayingSurah === null) return;
    const currentIndex = allSurahData.findIndex(surah => surah.nomor === currentPlayingSurah);
    const targetSurah = allSurahData[currentIndex + direction];
    if (!targetSurah) return;

    const card = document.querySelector(`.surah-card[data-surah="${targetSurah.nomor}"]`);
    const button = card ? card.querySelector(".play-btn") : null;
    const audioUrl = getFullSurahAudioUrl(targetSurah);
    stopAllAudio();
    activeSurahId = targetSurah.nomor;
    renderSurahCarousel();
    if (document.getElementById("surah-modal")?.classList.contains("show")) {
        openSurahModal(targetSurah.nomor, undefined, document.querySelector(`.carousel-card[aria-current="true"]`));
    }
    if (wasPlaying) {
        startNewAudio(button, audioUrl, card, targetSurah.nomor);
    } else {
        prepareFullSurahAudio(button, audioUrl, card, targetSurah.nomor);
    }
}

function changeQari(newQariId) {
    selectedQari = newQariId;
    localStorage.setItem("selectedQari", selectedQari);

    // Sinkronkan kedua dropdown
    const globalSelect = document.getElementById("global-qari-select");
    const modalSelect = document.getElementById("modal-qari-select");
    if (globalSelect && globalSelect.value !== selectedQari) globalSelect.value = selectedQari;
    if (modalSelect && modalSelect.value !== selectedQari) modalSelect.value = selectedQari;

    // Perbarui URL data-audio pada semua kartu surah di list
    updateAllCardAudioSources();

    // 1️⃣ Jika sedang memutar audio ayat di dalam modal:
    if (currentPlayingAyah !== null && playingAyahSurahDetail) {
        const ayahNumToPlay = currentPlayingAyah;
        const surah = playingAyahSurahDetail;
        const wasPaused = currentAudio ? currentAudio.paused : false;

        stopAllAudio();

        if (!wasPaused) {
            playAyahAudio(ayahNumToPlay, undefined, surah);
        } else {
            prepareAyahAudio(ayahNumToPlay, surah);
        }
        return;
    }

    // 2️⃣ Jika sedang memutar audio surah penuh di beranda:
    if (currentPlayingSurah !== null && currentAudio) {
        const surahIdToPlay = currentPlayingSurah;
        const wasPaused = currentAudio.paused;

        const surah = allSurahData.find(s => s.nomor === surahIdToPlay);
        const card = document.querySelector(`.surah-card[data-surah="${surahIdToPlay}"]`);
        const btn = card ? card.querySelector(".play-btn") : null;

        if (surah) {
            const newAudioUrl = getFullSurahAudioUrl(surah);
            if (btn) btn.dataset.audio = newAudioUrl;

            stopAllAudio();

            if (!wasPaused) {
                startNewAudio(btn, newAudioUrl, card, surah.nomor);
            } else {
                prepareFullSurahAudio(btn, newAudioUrl, card, surah.nomor);
            }
        }
    }
}

function updateAllCardAudioSources() {
    document.querySelectorAll(".surah-card").forEach(card => {
        const surahId = parseInt(card.dataset.surah, 10);
        const surah = allSurahData.find(s => s.nomor === surahId);
        if (!surah) return;

        const audioUrl = getFullSurahAudioUrl(surah);

        const playBtn = card.querySelector(".play-btn");
        if (playBtn) {
            playBtn.dataset.audio = audioUrl;
        }
    });
}

// ===============================
// LOAD & RENDER SURAH LIST
// ===============================
async function loadSurahList() {
    const surahList = document.getElementById("surah-list");

    const requestId = ++listRequestId;
    if (surahList) {
        const loading = document.createElement("div");
        loading.className = "loading-indicator";
        loading.textContent = "Memuat daftar surah...";
        surahList.replaceChildren(loading);
    }

    try {
        const result = await loadSurahListData();
        if (requestId !== listRequestId) return;
        allSurahData = result.data;
        Object.values(surahCache).forEach(surah => {
            if (surah._dataSource !== "local") return;
            const getAdjacent = id => {
                const summary = allSurahData.find(item => item.nomor === id);
                return summary ? { nomor: summary.nomor, namaLatin: summary.namaLatin, nama: summary.nama } : null;
            };
            surah.suratSebelumnya = surah.nomor > 1 ? getAdjacent(surah.nomor - 1) : null;
            surah.suratSelanjutnya = surah.nomor < 114 ? getAdjacent(surah.nomor + 1) : null;
        });
        if (result.source === "local") {
            setScreenReaderStatus("Daftar surah dimuat dari salinan lokal. Data tetap tersimpan pada perangkat.");
        } else {
            setScreenReaderStatus("Daftar surah berhasil dimuat.");
        }
        renderSurahCarousel();
        syncWelcomeResume();
        updateAudioDock();
        document.getElementById("surah-search")?.dispatchEvent(new Event("input"));
    } catch (error) {
        if (requestId !== listRequestId) return;
        console.error("Gagal memuat daftar surah dari API dan salinan lokal:", error);
        if (!surahList) {
            setScreenReaderStatus("Daftar surah gagal dimuat.");
            return;
        }
        const errorState = document.createElement("div");
        errorState.className = "error-state";
        const message = document.createElement("p");
        message.textContent = "Gagal memuat daftar surah. Periksa koneksi dan coba lagi.";
        const retryButton = document.createElement("button");
        retryButton.className = "retry-btn";
        retryButton.type = "button";
        retryButton.textContent = "Coba Lagi";
        retryButton.addEventListener("click", loadSurahList);
        errorState.append(message, retryButton);
        surahList.replaceChildren(errorState);
        setScreenReaderStatus("Daftar surah gagal dimuat.");
    }
}

function renderSurahList(data, keyword = "") {
    const surahList = document.getElementById("surah-list");
    if (!surahList) return;

    if (!data || data.length === 0) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        emptyState.textContent = "Surah tidak ditemukan. Coba kata kunci lain seperti Al-Fatihah, Yasin, atau Pembukaan.";
        surahList.replaceChildren(emptyState);
        return;
    }

    const fragment = document.createDocumentFragment();

    data.forEach((surah, index) => {
        const card = createSurahCard(surah, keyword);
        if (index < 12) {
            card.style.setProperty("--card-index", index);
            card.classList.add("card-animate-in");
        }
        fragment.append(card);
    });

    surahList.replaceChildren(fragment);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendHighlightedText(element, text, keyword) {
    const value = typeof text === "string" ? text : "";
    if (!keyword) {
        element.textContent = value;
        return;
    }

    const regex = new RegExp(escapeRegExp(keyword), "gi");
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(value)) !== null) {
        if (match.index > lastIndex) {
            element.append(document.createTextNode(value.slice(lastIndex, match.index)));
        }
        const highlight = document.createElement("mark");
        highlight.className = "search-highlight";
        highlight.textContent = match[0];
        element.append(highlight);
        lastIndex = match.index + match[0].length;
    }
    element.append(document.createTextNode(value.slice(lastIndex)));
}

function renderFilteredSurahs(keyword) {
    if (!Array.isArray(allSurahData) || allSurahData.length === 0) return;

    if (!keyword) {
        renderSurahList(allSurahData);
        return;
    }

    const filtered = allSurahData.filter(surah =>
        (surah.namaLatin && surah.namaLatin.toLowerCase().includes(keyword)) ||
        (surah.arti && surah.arti.toLowerCase().includes(keyword)) ||
        (surah.nomor && surah.nomor.toString().includes(keyword)) ||
        (surah.tempatTurun && surah.tempatTurun.toLowerCase().includes(keyword))
    );

    renderSurahList(filtered, keyword);
}

function setScreenReaderStatus(message) {
    const status = document.getElementById("data-status");
    if (status) status.textContent = message;
}

function isSafeMediaUrl(value) {
    if (typeof value !== "string" || value.trim() === "") return false;
    try {
        const protocol = new URL(value, window.location.href).protocol;
        return protocol === "https:" || protocol === "http:";
    } catch (error) {
        return false;
    }
}

function validateAudioMap(audioMap, fieldName) {
    if (audioMap === undefined || audioMap === null) return;
    if (typeof audioMap !== "object" || Array.isArray(audioMap)) {
        throw new Error(`${fieldName} bukan objek yang valid.`);
    }

    Object.entries(audioMap).forEach(([reciter, url]) => {
        if (!/^\d{2}$/.test(reciter) || !isSafeMediaUrl(url)) {
            throw new Error(`${fieldName} berisi alamat audio yang tidak valid.`);
        }
    });
}

function validateSurahSummaries(data) {
    if (!Array.isArray(data) || data.length !== 114) {
        throw new Error("Respons daftar surah tidak berisi 114 surah.");
    }

    const ids = new Set();
    data.forEach(surah => {
        if (!surah || !Number.isInteger(surah.nomor) || surah.nomor < 1 || surah.nomor > 114 ||
            typeof surah.nama !== "string" || typeof surah.namaLatin !== "string" ||
            typeof surah.arti !== "string" || typeof surah.tempatTurun !== "string" ||
            !Number.isInteger(surah.jumlahAyat) || surah.jumlahAyat < 1 || ids.has(surah.nomor)) {
            throw new Error("Respons daftar surah memiliki metadata atau nomor yang tidak valid.");
        }
        validateAudioMap(surah.audioFull, `Audio surah ${surah.nomor}`);
        ids.add(surah.nomor);
    });

    for (let id = 1; id <= 114; id++) {
        if (!ids.has(id)) throw new Error(`Nomor surah ${id} tidak ada pada daftar.`);
    }

    return data.slice().sort((a, b) => a.nomor - b.nomor);
}

function validateSurahDetail(surah, expectedId) {
    if (!surah || surah.nomor !== expectedId || typeof surah.nama !== "string" ||
        typeof surah.namaLatin !== "string" || typeof surah.arti !== "string" ||
        typeof surah.tempatTurun !== "string" || !Number.isInteger(surah.jumlahAyat) ||
        !Array.isArray(surah.ayat) || surah.ayat.length !== surah.jumlahAyat) {
        throw new Error(`Struktur detail surah ${expectedId} tidak valid.`);
    }

    const ayahNumbers = new Set();
    surah.ayat.forEach(ayah => {
        if (!ayah || !Number.isInteger(ayah.nomorAyat) || ayah.nomorAyat < 1 ||
            ayah.nomorAyat > surah.jumlahAyat || typeof ayah.teksArab !== "string" ||
            typeof ayah.teksIndonesia !== "string" ||
            (ayah.teksLatin !== undefined && typeof ayah.teksLatin !== "string") ||
            (ayah.audio !== undefined && ayah.audio !== null &&
                (typeof ayah.audio !== "object" || Array.isArray(ayah.audio)))) {
            throw new Error(`Data ayat pada surah ${expectedId} tidak valid.`);
        }
        validateAudioMap(ayah.audio, `Audio ayat ${ayah.nomorAyat}`);
        if (ayahNumbers.has(ayah.nomorAyat)) {
            throw new Error(`Nomor ayat ${ayah.nomorAyat} terduplikasi.`);
        }
        ayahNumbers.add(ayah.nomorAyat);
    });

    for (let number = 1; number <= surah.jumlahAyat; number++) {
        if (!ayahNumbers.has(number)) throw new Error(`Ayat ${number} tidak ada.`);
    }
    validateAudioMap(surah.audioFull, `Audio surah ${expectedId}`);

    surah.ayat.sort((a, b) => a.nomorAyat - b.nomorAyat);
    return surah;
}

async function fetchJsonWithTimeout(url, timeoutMs = 10000) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutId;
    const timeout = new Promise((resolve, reject) => {
        timeoutId = window.setTimeout(() => {
            if (controller) controller.abort();
            reject(new Error(`Permintaan data melewati batas waktu ${timeoutMs / 1000} detik.`));
        }, timeoutMs);
    });

    try {
        const request = fetch(url, controller ? { signal: controller.signal } : undefined)
            .then(response => {
                if (!response.ok) throw new Error(`Server mengembalikan HTTP ${response.status}.`);
                return response.json();
            });
        return await Promise.race([request, timeout]);
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function adaptLocalSurahList(records) {
    if (!Array.isArray(records) || records.length !== 114) {
        throw new Error("Daftar surah lokal tidak berisi 114 rekaman.");
    }

    const summaries = records.map(record => {
        const translations = record && record.name_translations;
        const recitation = record && record.recitation;
        const surah = {
            nomor: record && record.number_of_surah,
            nama: translations && translations.ar,
            namaLatin: record && record.name,
            arti: translations && translations.id,
            tempatTurun: record && record.place === "Mecca" ? "Mekah" :
                record && record.place === "Medina" ? "Madinah" : record && record.place,
            jumlahAyat: record && record.number_of_ayah,
            audioFull: isSafeMediaUrl(recitation) ? { "05": recitation } : {}
        };
        return surah;
    });

    return validateSurahSummaries(summaries);
}

function adaptLocalSurahDetail(record, expectedId) {
    if (!record || record.number_of_surah !== expectedId ||
        !Array.isArray(record.verses) || record.verses.length !== record.number_of_ayah) {
        throw new Error(`Data lokal surah ${expectedId} tidak lengkap atau tidak valid.`);
    }

    const translations = record.name_translations || {};
    const audioFull = {};
    if (Array.isArray(record.recitations)) {
        record.recitations.forEach(recitation => {
            if (!recitation || typeof recitation.name !== "string" || !isSafeMediaUrl(recitation.audio_url)) return;
            const name = recitation.name.toLowerCase();
            if (name.includes("afasy")) audioFull["05"] = recitation.audio_url;
            if (name.includes("sudais")) audioFull["03"] = recitation.audio_url;
        });
    }

    const adjacentSurah = id => {
        const summary = allSurahData.find(item => item.nomor === id);
        return summary ? { nomor: summary.nomor, namaLatin: summary.namaLatin, nama: summary.nama } : null;
    };

    const surah = {
        nomor: expectedId,
        nama: typeof translations.ar === "string" ? translations.ar : "",
        namaLatin: record.name,
        arti: typeof translations.id === "string" ? translations.id : record.name,
        tempatTurun: record.place === "Mecca" ? "Mekah" :
            record.place === "Medina" ? "Madinah" : record.place,
        jumlahAyat: record.number_of_ayah,
        audioFull,
        suratSebelumnya: expectedId > 1 ? adjacentSurah(expectedId - 1) : null,
        suratSelanjutnya: expectedId < 114 ? adjacentSurah(expectedId + 1) : null,
        ayat: record.verses.map(ayah => ({
            nomorAyat: ayah.number,
            teksArab: ayah.text,
            teksLatin: "",
            teksIndonesia: ayah.translation_id,
            audio: {}
        }))
    };

    validateSurahDetail(surah, expectedId);
    surah._dataSource = "local";
    return surah;
}

async function loadSurahListData() {
    try {
        const response = await fetchJsonWithTimeout("https://equran.id/api/v2/surat");
        if (!response || !Array.isArray(response.data)) {
            throw new Error("Respons daftar surah tidak memiliki data.");
        }
        return { data: validateSurahSummaries(response.data), source: "api" };
    } catch (apiError) {
        console.warn("API daftar surah tidak dapat digunakan; mencoba salinan lokal:", apiError);
        const records = await fetchJsonWithTimeout("assets/data/surah-list2.json");
        return { data: adaptLocalSurahList(records), source: "local" };
    }
}

async function loadSurahDetailData(id) {
    if (surahCache[id]) return surahCache[id];

    try {
        const response = await fetchJsonWithTimeout(`https://equran.id/api/v2/surat/${id}`);
        if (!response || !response.data) {
            throw new Error(`Respons detail surah ${id} tidak memiliki data.`);
        }
        const surah = validateSurahDetail(response.data, id);
        surah._dataSource = "api";
        surahCache[id] = surah;
        return surah;
    } catch (apiError) {
        console.warn(`API detail surah ${id} tidak dapat digunakan; mencoba salinan lokal:`, apiError);
        try {
            const record = await fetchJsonWithTimeout(`assets/data/${id}.json`);
            const surah = adaptLocalSurahDetail(record, id);
            surahCache[id] = surah;
            return surah;
        } catch (localError) {
            throw new Error(`Gagal memuat data surah ${id} dari API maupun salinan lokal. API: ${apiError.message} Salinan lokal: ${localError.message}`);
        }
    }
}

function setupSearch() {
    const searchInput = document.getElementById("surah-search");
    const clearBtn = document.getElementById("search-clear-btn");
    const suggestions = document.getElementById("surah-suggestions");
    if (!searchInput) return;
    let matches = [];
    let activeIndex = -1;

    function updateClearBtn() {
        if (!clearBtn) return;
        clearBtn.classList.toggle("visible", searchInput.value.trim().length > 0);
    }

    function renderSuggestions() {
        if (!suggestions) return;
        const keyword = searchInput.value.trim().toLocaleLowerCase();
        activeIndex = -1;
        if (!keyword) {
            matches = [];
            suggestions.replaceChildren();
            suggestions.hidden = true;
            searchInput.setAttribute("aria-expanded", "false");
            searchInput.removeAttribute("aria-activedescendant");
            return;
        }

        matches = allSurahData.filter(surah => [
            surah.namaLatin,
            surah.arti,
            surah.nama,
            String(surah.nomor),
            surah.tempatTurun
        ].some(value => String(value || "").toLocaleLowerCase().includes(keyword))).slice(0, 8);

        const fragment = document.createDocumentFragment();
        matches.forEach((surah, index) => {
            const option = document.createElement("button");
            option.type = "button";
            option.id = `surah-suggestion-${surah.nomor}`;
            option.className = "surah-suggestion";
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", "false");
            const number = document.createElement("span");
            number.className = "suggestion-number";
            number.textContent = String(surah.nomor);
            const name = document.createElement("span");
            name.className = "suggestion-name";
            const latin = document.createElement("strong");
            latin.textContent = surah.namaLatin;
            const details = document.createElement("span");
            details.textContent = `${surah.arti} · ${surah.jumlahAyat} Ayat`;
            name.append(latin, details);
            const arabic = document.createElement("span");
            arabic.className = "suggestion-arabic";
            arabic.lang = "ar";
            arabic.dir = "rtl";
            arabic.textContent = surah.nama;
            option.append(number, name, arabic);
            option.addEventListener("mousedown", event => event.preventDefault());
            option.addEventListener("click", () => selectSurahSuggestion(index));
            fragment.append(option);
        });
        if (!matches.length) {
            const empty = document.createElement("p");
            empty.className = "suggestions-empty";
            empty.textContent = "Surah tidak ditemukan. Coba nama, arti, atau nomor surah.";
            fragment.append(empty);
        }
        suggestions.replaceChildren(fragment);
        suggestions.hidden = false;
        searchInput.setAttribute("aria-expanded", "true");
        searchInput.removeAttribute("aria-activedescendant");
    }

    function setActiveSuggestion(index) {
        if (!matches.length || !suggestions) return;
        activeIndex = (index + matches.length) % matches.length;
        suggestions.querySelectorAll(".surah-suggestion").forEach((option, optionIndex) => {
            const selected = optionIndex === activeIndex;
            option.setAttribute("aria-selected", String(selected));
            if (selected) {
                searchInput.setAttribute("aria-activedescendant", option.id);
                option.scrollIntoView({ block: "nearest" });
            }
        });
    }

    function selectSurahSuggestion(index) {
        const surah = matches[index];
        if (!surah) return;
        searchInput.value = surah.namaLatin;
        updateClearBtn();
        matches = [];
        activeIndex = -1;
        if (suggestions) {
            suggestions.replaceChildren();
            suggestions.hidden = true;
        }
        searchInput.setAttribute("aria-expanded", "false");
        searchInput.removeAttribute("aria-activedescendant");
        activeSurahId = surah.nomor;
        renderSurahCarousel();
        history.pushState({ adaptiveView: "reader", surah: activeSurahId }, "");
        setScreenReaderStatus(`Carousel berpindah ke Surah ${surah.namaLatin}. Pilih kartu untuk membuka bacaan.`);
    }

    searchInput.addEventListener("input", () => {
        updateClearBtn();
        renderSuggestions();
    });

    searchInput.addEventListener("keydown", event => {
        if (event.key === "ArrowDown" && matches.length) {
            event.preventDefault();
            setActiveSuggestion(activeIndex + 1);
        } else if (event.key === "ArrowUp" && matches.length) {
            event.preventDefault();
            setActiveSuggestion(activeIndex < 0 ? matches.length - 1 : activeIndex - 1);
        } else if (event.key === "Enter" && matches.length) {
            event.preventDefault();
            selectSurahSuggestion(activeIndex < 0 ? 0 : activeIndex);
        } else if (event.key === "Escape" && suggestions && !suggestions.hidden) {
            suggestions.hidden = true;
            searchInput.setAttribute("aria-expanded", "false");
            searchInput.removeAttribute("aria-activedescendant");
        }
    });

    if (clearBtn) {
        clearBtn.addEventListener("click", function () {
            searchInput.value = "";
            updateClearBtn();
            renderSuggestions();
            searchInput.focus();
        });
    }

    document.addEventListener("click", event => {
        if (suggestions && !event.target.closest(".surah-search-wrapper")) {
            suggestions.hidden = true;
            searchInput.setAttribute("aria-expanded", "false");
            searchInput.removeAttribute("aria-activedescendant");
        }
    });
}

// ===============================
// SURAH CARD CREATION
// ===============================
function createPlayPauseIcon(isPause, size) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", isPause ? "icon-pause" : "icon-play");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");

    if (isPause) {
        ["6", "14"].forEach(x => {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", x);
            rect.setAttribute("y", "4");
            rect.setAttribute("width", "4");
            rect.setAttribute("height", "16");
            rect.setAttribute("rx", "1");
            svg.append(rect);
        });
    } else {
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", "6 3 20 12 6 21 6 3");
        svg.append(polygon);
    }

    return svg;
}

function createSurahCard(surah, keyword = "") {
    const card = document.createElement("article");
    card.className = "surah-card";
    card.dataset.surah = surah.nomor;

    const audioUrl = getFullSurahAudioUrl(surah);
    const isThisPlaying = currentAudio && !currentAudio.paused && (currentPlayingSurah === surah.nomor || currentAudio.src === audioUrl) && currentPlayingAyah === null;
    card.classList.toggle("active-card", Boolean(isThisPlaying));

    const openButton = document.createElement("button");
    openButton.className = "surah-open-btn";
    openButton.type = "button";
    openButton.setAttribute("aria-label", `Buka bacaan Surah ${surah.namaLatin}`);

    const top = document.createElement("div");
    top.className = "card-top";
    const number = document.createElement("span");
    number.className = "surah-number";
    number.textContent = String(surah.nomor);
    const arabicName = document.createElement("span");
    arabicName.className = "surah-ar";
    arabicName.lang = "ar";
    arabicName.dir = "rtl";
    arabicName.textContent = surah.nama;
    top.append(number, arabicName);

    const latinName = document.createElement("span");
    latinName.className = "surah-name";
    appendHighlightedText(latinName, surah.namaLatin, keyword);

    const information = document.createElement("span");
    information.className = "surah-info";
    appendHighlightedText(
        information,
        `${surah.arti} • ${surah.jumlahAyat} Ayat • ${surah.tempatTurun}`,
        keyword
    );

    const playingIndicator = document.createElement("span");
    playingIndicator.className = `playing-indicator${isThisPlaying ? " active" : ""}`;
    if (isThisPlaying) {
        const wave = document.createElement("span");
        wave.className = "eq-wave";
        wave.setAttribute("aria-hidden", "true");
        for (let index = 1; index <= 3; index++) {
            const bar = document.createElement("span");
            bar.className = `eq-bar eq-${index}`;
            wave.append(bar);
        }
        const label = document.createElement("span");
        label.className = "playing-label";
        label.textContent = "Sedang diputar";
        playingIndicator.append(wave, label);
    }

    openButton.append(top, latinName, information, playingIndicator);
    card.append(openButton);

    const playButton = document.createElement("button");
    playButton.className = `play-btn${isThisPlaying ? " playing" : ""}`;
    playButton.type = "button";
    playButton.dataset.audio = audioUrl;
    playButton.setAttribute("aria-label", `Putar atau jeda audio penuh Surah ${surah.namaLatin}`);
    playButton.title = `Putar atau jeda audio Surah ${surah.namaLatin}`;
    const playIcon = createPlayPauseIcon(false, 18);
    playIcon.classList.add("icon-play");
    playIcon.style.display = isThisPlaying ? "none" : "block";
    const pauseIcon = createPlayPauseIcon(true, 18);
    pauseIcon.classList.add("icon-pause");
    pauseIcon.style.display = isThisPlaying ? "block" : "none";
    playButton.append(playIcon, pauseIcon);
    card.append(playButton);

    const progressContainer = document.createElement("div");
    progressContainer.className = "progress-container";
    progressContainer.setAttribute("aria-hidden", "true");
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    if (isThisPlaying && currentAudio.duration) {
        progressBar.style.width = `${(currentAudio.currentTime / currentAudio.duration) * 100}%`;
    }
    progressContainer.append(progressBar);
    card.append(progressContainer);

    if (isThisPlaying) {
        currentButton = playButton;
    }

    return card;
}

// ===============================
// MODAL SURAH DETAIL
// ===============================
function getDialogFocusableElements(dialog) {
    return Array.from(dialog.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.getClientRects().length > 0);
}

function showAccessibleDialog(dialog, returnFocusElement, initialFocusSelector) {
    if (!dialog) return;
    if (activeDialog && activeDialog !== dialog) {
        closeAccessibleDialog(activeDialog, false);
    }

    if (!activeDialog) {
        bodyOverflowBeforeDialog = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    }
    const focusOrigin = returnFocusElement || document.activeElement;
    dialogReturnFocus.set(
        dialog,
        focusOrigin === document.body ? document.getElementById("surah-search") : focusOrigin
    );
    dialog.classList.add("show");
    dialog.setAttribute("aria-hidden", "false");
    activeDialog = dialog;
    const initialFocus = initialFocusSelector && dialog.querySelector(initialFocusSelector);
    const focusTarget = initialFocus || getDialogFocusableElements(dialog)[0] || dialog;
    window.setTimeout(() => {
        if (activeDialog === dialog && dialog.classList.contains("show")) focusTarget.focus();
    }, 0);
}

function closeAccessibleDialog(dialog, restoreFocus = true) {
    if (!dialog) return;
    dialog.classList.remove("show");
    dialog.setAttribute("aria-hidden", "true");
    if (activeDialog === dialog) {
        activeDialog = null;
        document.body.style.overflow = bodyOverflowBeforeDialog || "";
        bodyOverflowBeforeDialog = null;
    }
    if (!restoreFocus) return;

    const returnFocusElement = dialogReturnFocus.get(dialog);
    if (returnFocusElement && returnFocusElement.isConnected && typeof returnFocusElement.focus === "function") {
        returnFocusElement.focus();
    }
}

function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.id === "surah-modal") {
        closeSurahModal();
    } else {
        closeAccessibleDialog(dialog);
    }
}

function openSurahModalFromPopup(popup, id, ayahToScroll) {
    const returnFocusElement = dialogReturnFocus.get(popup);
    closeAccessibleDialog(popup, false);
    openSurahModal(id, ayahToScroll, returnFocusElement);
}

function createCheckIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon-check");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("points", "20 6 9 17 4 12");
    svg.append(polyline);
    return svg;
}

function createNavigationButton(direction, surah, onClick) {
    const button = document.createElement("button");
    button.className = "nav-surah-btn";
    button.type = "button";
    button.addEventListener("click", onClick);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const chevron = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    chevron.setAttribute("points", direction < 0 ? "15 18 9 12 15 6" : "9 18 15 12 9 6");
    svg.append(chevron);

    const text = document.createElement("span");
    text.textContent = direction < 0
        ? `Surah Sebelumnya (${surah.namaLatin})`
        : `Surah Selanjutnya (${surah.namaLatin})`;
    if (direction < 0) button.append(svg, text);
    else button.append(text, svg);
    return button;
}

function renderSurahModalTitle(container, surah, headingId = "modal-title-heading") {
    const heading = document.createElement("h2");
    heading.id = headingId;
    heading.tabIndex = -1;
    const name = document.createElement("span");
    name.textContent = `Surah ${surah.namaLatin}`;
    const arabicName = document.createElement("span");
    arabicName.className = "modal-surah-ar";
    arabicName.lang = "ar";
    arabicName.dir = "rtl";
    arabicName.textContent = surah.nama;
    heading.append(name, arabicName);

    const details = document.createElement("p");
    details.textContent = `${surah.arti} • ${surah.jumlahAyat} Ayat • ${surah.tempatTurun}`;
    container.replaceChildren(heading, details);

    if (surah._dataSource === "local") {
        const note = document.createElement("p");
        note.className = "data-source-note";
        note.textContent = "Menggunakan salinan lokal. Audio per ayat tidak tersedia pada data ini.";
        container.append(note);
    }
}

function renderAyahList(container, surah) {
    const fragment = document.createDocumentFragment();
    surah.ayat.forEach((ayah, index) => {
        const item = document.createElement("div");
        item.className = "ayat-item";
        item.id = `ayah-${ayah.nomorAyat}`;
        item.dataset.ayah = ayah.nomorAyat;
        item.dataset.surah = surah.nomor;

        const actions = document.createElement("div");
        actions.className = "ayat-actions";
        const checkButton = document.createElement("button");
        checkButton.className = "check-btn";
        checkButton.type = "button";
        checkButton.dataset.ayah = ayah.nomorAyat;
        checkButton.setAttribute("aria-pressed", "false");
        checkButton.setAttribute("aria-label", `Tandai ayat ${ayah.nomorAyat} selesai dibaca`);
        checkButton.title = `Tandai ayat ${ayah.nomorAyat} dibaca`;
        checkButton.append(createCheckIcon());

        const playButton = document.createElement("button");
        playButton.className = "ayah-play-btn";
        playButton.type = "button";
        playButton.dataset.ayah = ayah.nomorAyat;
        const hasAudio = ayah.audio && Object.values(ayah.audio).some(isSafeMediaUrl);
        playButton.disabled = !hasAudio;
        playButton.setAttribute(
            "aria-label",
            hasAudio ? `Putar audio ayat ${ayah.nomorAyat}` : `Audio ayat ${ayah.nomorAyat} tidak tersedia`
        );
        playButton.title = hasAudio ? `Putar atau jeda ayat ${ayah.nomorAyat}` : "Audio per ayat tidak tersedia pada salinan lokal";
        const playIcon = createPlayPauseIcon(false, 14);
        const pauseIcon = createPlayPauseIcon(true, 14);
        pauseIcon.style.display = "none";
        playButton.append(playIcon, pauseIcon);
        actions.append(checkButton, playButton);

        const arabicText = document.createElement("div");
        arabicText.className = "ayat-text";
        arabicText.lang = "ar";
        arabicText.dir = "rtl";
        arabicText.append(document.createTextNode(ayah.teksArab));
        const badge = document.createElement("span");
        badge.className = "ayat-badge";
        badge.textContent = String(ayah.nomorAyat);
        arabicText.append(badge);

        item.append(actions, arabicText);
        if (ayah.teksLatin) {
            const latinText = document.createElement("div");
            latinText.className = "ayat-latin";
            latinText.textContent = ayah.teksLatin;
            item.append(latinText);
        }

        const translation = document.createElement("div");
        translation.className = "ayat-translation";
        translation.textContent = ayah.teksIndonesia;
        item.append(translation);
        fragment.append(item);

        if (index !== surah.ayat.length - 1) {
            const divider = document.createElement("div");
            divider.className = "ayat-divider";
            divider.append(createDividerSVG());
            fragment.append(divider);
        }
    });
    container.replaceChildren(fragment);
}

async function openSurahModal(id, ayahToScroll, returnFocusElement) {
    const surahId = Number.parseInt(id, 10);
    if (!Number.isInteger(surahId) || surahId < 1 || surahId > 114) return;
    const focusOrigin = returnFocusElement || document.activeElement;
    const focusSurahId = focusOrigin?.matches?.(".carousel-card")
        ? Number(focusOrigin.dataset.surah)
        : null;
    currentOpenSurah = surahId;
    activeSurahId = surahId;
    renderSurahCarousel();

    const modal = document.getElementById("surah-modal");
    const modalTitle = document.getElementById("modal-title");
    const modalAyat = document.getElementById("modal-ayat");
    const modalNav = document.getElementById("modal-nav");
    const modalSelect = document.getElementById("modal-qari-select");

    if (!modal || !modalTitle || !modalAyat) return;

    const requestId = ++modalRequestId;
    if (!modal.classList.contains("show")) {
        const modalReturnFocus = focusSurahId
            ? document.querySelector(`.carousel-card[data-surah="${focusSurahId}"]`) || focusOrigin
            : focusOrigin;
        showAccessibleDialog(modal, modalReturnFocus);
    }
    document.body.style.overflow = "hidden";

    if (typeof window.closeFloatingToolbarPanel === "function") {
        window.closeFloatingToolbarPanel();
    }

    if (modalSelect) {
        modalSelect.value = selectedQari;
    }

    const loadingTitle = document.createElement("h2");
    loadingTitle.id = "modal-title-heading";
    loadingTitle.textContent = "Memuat surah...";
    modalTitle.replaceChildren(loadingTitle);
    const loadingAyat = document.createElement("div");
    loadingAyat.className = "loading-indicator";
    loadingAyat.textContent = "Memuat ayat...";
    modalAyat.replaceChildren(loadingAyat);
    if (modalNav) modalNav.replaceChildren();

    try {
        const surah = await loadSurahDetailData(surahId);
        if (requestId !== modalRequestId) return;

        currentSurahDetail = surah;
        renderSurahModalTitle(modalTitle, surah);
        renderAyahList(modalAyat, surah);
        applySavedAyahProgress(modalAyat, surahId);
        if (!modal.contains(document.activeElement)) {
            modalTitle.querySelector("h2")?.focus();
        }

        if (modalNav) buildSurahNavigation(modalNav, surah);
        observeModalReadingProgress(modalAyat, surahId);

        // Tandai ayat yang sudah dibaca
        let lastRead = null;
        try {
            lastRead = JSON.parse(localStorage.getItem("lastRead"));
        } catch (e) {}

        let lastAyFromStorage = null;
        if (isRememberLastReadEnabled() && lastRead && lastRead.surah == surahId) {
            const checkedList = Array.isArray(lastRead.checked) ? lastRead.checked : [];
            if (checkedList.length > 0) {
                lastAyFromStorage = Math.max(...checkedList);
            } else if (lastRead.ayah !== undefined && lastRead.ayah !== null) {
                lastAyFromStorage = lastRead.ayah;
            }

            modalAyat.querySelectorAll(".ayat-item").forEach(item => {
                const num = parseInt(item.dataset.ayah, 10);
                const isChecked = checkedList.length > 0 ? checkedList.includes(num) : (lastAyFromStorage !== null && num <= lastAyFromStorage);

                if (isChecked) {
                    item.classList.add("checked");
                    const btn = item.querySelector(".check-btn");
                    if (btn) {
                        btn.classList.add("checked");
                        btn.setAttribute("aria-pressed", "true");
                        btn.setAttribute("aria-label", `Batalkan tanda ayat ${num} selesai dibaca`);
                        btn.title = `Batalkan tanda ayat ${num} dibaca`;
                    }
                }
            });
        }

        // Scroll ke ayat yang dituju
        const targetAyah = ayahToScroll !== undefined && ayahToScroll !== null ? ayahToScroll : lastAyFromStorage;
        if (targetAyah) {
            scrollToAyah(targetAyah, modalAyat);
        }

    } catch (error) {
        if (requestId !== modalRequestId) return;
        console.error("Error loading surah detail:", error);
        const errorTitle = document.createElement("h2");
        errorTitle.id = "modal-title-heading";
        errorTitle.textContent = "Surah tidak dapat dimuat";
        modalTitle.replaceChildren(errorTitle);
        const errorState = document.createElement("div");
        errorState.className = "error-state";
        const message = document.createElement("p");
        message.textContent = "Gagal memuat isi surah. Periksa koneksi dan coba lagi.";
        const retryButton = document.createElement("button");
        retryButton.className = "retry-btn";
        retryButton.type = "button";
        retryButton.textContent = "Coba Lagi";
        retryButton.addEventListener("click", () =>
            openSurahModal(surahId, ayahToScroll, dialogReturnFocus.get(modal))
        );
        errorState.append(message, retryButton);
        modalAyat.replaceChildren(errorState);
    }
}

function closeSurahModal() {
    const modal = document.getElementById("surah-modal");
    modalRequestId++;
    closeAccessibleDialog(modal);

    // Hentikan audio ayat jika sedang diputar di dalam modal
    if (currentPlayingAyah !== null) {
        stopAllAudio();
    }

    currentOpenSurah = null;
}

function scrollToAyah(ayahnomorAyat, container = document.getElementById("modal-ayat")) {
    setTimeout(() => {
        const target = container?.querySelector(`.ayat-item[data-ayah="${ayahnomorAyat}"]`);
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.add("ayah-highlight");
            setTimeout(() => {
                target.classList.remove("ayah-highlight");
            }, 2000);
        }
    }, 300);
}

function createDividerSVG() {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 800 40");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    [[0, 20, 320, 20], [480, 20, 800, 20]].forEach(points => {
        const line = document.createElementNS(namespace, "line");
        ["x1", "y1", "x2", "y2"].forEach((attribute, index) => line.setAttribute(attribute, String(points[index])));
        line.setAttribute("stroke", "currentColor");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("opacity", "0.3");
        svg.append(line);
    });

    const ornament = document.createElementNS(namespace, "g");
    ornament.setAttribute("transform", "translate(400,20)");
    const outerCircle = document.createElementNS(namespace, "circle");
    outerCircle.setAttribute("r", "8");
    outerCircle.setAttribute("fill", "none");
    outerCircle.setAttribute("stroke", "currentColor");
    outerCircle.setAttribute("stroke-width", "1.5");
    const innerCircle = document.createElementNS(namespace, "circle");
    innerCircle.setAttribute("r", "3");
    innerCircle.setAttribute("fill", "currentColor");
    ornament.append(outerCircle, innerCircle);
    [
        "M0 -14 L3 -6 L-3 -6 Z",
        "M0 14 L3 6 L-3 6 Z",
        "M14 0 L6 3 L6 -3 Z",
        "M-14 0 L-6 3 L-6 -3 Z"
    ].forEach(pathData => {
        const path = document.createElementNS(namespace, "path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", "currentColor");
        ornament.append(path);
    });
    svg.append(ornament);
    return svg;
}

// ===============================
// AUDIO PER AYAT (VERSE PLAYBACK)
// ===============================
function handleAyahPlayClick(ayahNum, button) {
    // Jika ayat yang sama sedang diputar
    const surahId = Number(button.closest(".ayat-item")?.dataset.surah);
    if (currentAudio && currentPlayingAyah === ayahNum && playingAyahSurahDetail?.nomor === surahId) {
        if (!currentAudio.paused) {
            currentAudio.pause();
            setAyahPlayingState(ayahNum, button, false);
        } else {
            currentAudio.play().catch(e => console.warn(e));
            setAyahPlayingState(ayahNum, button, true);
        }
        return;
    }

    // Putar audio ayat baru
    stopAllAudio();
    playAyahAudio(ayahNum, button);
}

function attachAyahAudioEvents(audio, ayahNum, audioUrl, sessionId, surah) {
    audio.onerror = () => {
        if (audioSessionId !== sessionId || currentAudio !== audio) return;
        console.error("Gagal memuat audio ayat:", audioUrl);
        resetAyahUI(ayahNum);
        currentAudio = null;
        currentPlayingAyah = null;
        playingAyahSurahDetail = null;
        currentButton = null;
        clearMediaSession();
    };

    audio.onended = () => {
        if (audioSessionId !== sessionId || currentAudio !== audio) return;
        resetAyahUI(ayahNum);
        currentAudio = null;
        currentPlayingAyah = null;
        playingAyahSurahDetail = null;
        currentButton = null;
        clearMediaSession();

        if (!autoPlayEnabled || !surah) return;
        const nextAyahNum = ayahNum + 1;
        const nextAyahExists = surah.ayat.some(ayah => ayah.nomorAyat === nextAyahNum);
        if (nextAyahExists) {
            setTimeout(() => {
                if (autoPlayEnabled) playAyahAudio(nextAyahNum, undefined, surah);
            }, 300);
        }
    };
}

function playAyahAudio(ayahNum, explicitButton, surah = currentSurahDetail) {
    if (!surah || !Array.isArray(surah.ayat)) return;

    const ayah = surah.ayat.find(a => a.nomorAyat === ayahNum);
    if (!ayah || !ayah.audio) {
        console.warn("Audio tidak tersedia untuk ayat ini.");
        return;
    }

    // Pilih URL audio sesuai qari yang dipilih
    const audioUrl = ayah.audio[selectedQari] || Object.values(ayah.audio)[0] || "";
    if (!audioUrl) return;

    const button = explicitButton || document.querySelector(`.ayat-item[data-surah="${surah.nomor}"][data-ayah="${ayahNum}"] .ayah-play-btn`);
    const item = button?.closest(".ayat-item");

    try {
        const thisSession = ++audioSessionId;
        const thisAudio = new Audio(audioUrl);
        currentAudio = thisAudio;
        currentPlayingAyah = ayahNum;
        playingAyahSurahDetail = surah;
        currentButton = button;
        attachMediaSessionAudioEvents(thisAudio);
        attachAyahAudioEvents(thisAudio, ayahNum, audioUrl, thisSession, surah);
        updateMediaSessionMetadata(surah, ayahNum, audioUrl);
        setMediaSessionPlaybackState("paused");

        setAyahPlayingState(ayahNum, button, true);

        if (item) {
            item.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        const playPromise = thisAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                if (err.name === 'AbortError') return;
                if (audioSessionId === thisSession) {
                    console.warn("Autoplay ayat dicegah:", err);
                    resetAyahUI(ayahNum);
                    setMediaSessionPlaybackState("paused");
                }
            });
        }

    } catch (e) {
        console.error("Gagal memulai audio ayat:", e);
        resetAyahUI(ayahNum);
        currentAudio = null;
        currentPlayingAyah = null;
        playingAyahSurahDetail = null;
        currentButton = null;
        clearMediaSession();
    }
}

function prepareAyahAudio(ayahNum, surah = currentSurahDetail) {
    if (!surah || !Array.isArray(surah.ayat)) return;

    const ayah = surah.ayat.find(a => a.nomorAyat === ayahNum);
    if (!ayah || !ayah.audio) return;

    const audioUrl = ayah.audio[selectedQari] || Object.values(ayah.audio)[0] || "";
    if (!audioUrl) return;

    const button = document.querySelector(`.ayat-item[data-surah="${surah.nomor}"][data-ayah="${ayahNum}"] .ayah-play-btn`);
    const thisSession = ++audioSessionId;
    const thisAudio = new Audio(audioUrl);
    currentAudio = thisAudio;
    currentPlayingAyah = ayahNum;
    playingAyahSurahDetail = surah;
    currentButton = button;
    attachMediaSessionAudioEvents(thisAudio);
    attachAyahAudioEvents(thisAudio, ayahNum, audioUrl, thisSession, surah);
    updateMediaSessionMetadata(surah, ayahNum, audioUrl);
    setMediaSessionPlaybackState("paused");

    setAyahPlayingState(ayahNum, button, false);
}

function setAyahPlayingState(ayahNum, button, isPlaying) {
    const surahFilter = playingAyahSurahDetail ? `[data-surah="${playingAyahSurahDetail.nomor}"]` : "";
    document.querySelectorAll(`.ayat-item${surahFilter}[data-ayah="${ayahNum}"]`).forEach(item => {
        item.classList.toggle("ayah-playing", isPlaying);
        const btn = item.querySelector(".ayah-play-btn");
        if (!btn) return;
        btn.classList.toggle("playing", isPlaying);
        const playIcon = btn.querySelector(".icon-play");
        const pauseIcon = btn.querySelector(".icon-pause");
        if (playIcon) playIcon.style.display = isPlaying ? "none" : "block";
        if (pauseIcon) pauseIcon.style.display = isPlaying ? "block" : "none";
    });
    if (button && !button.isConnected) return;
    if (button) {
        button.classList.toggle("playing", isPlaying);
        const playIcon = button.querySelector(".icon-play");
        const pauseIcon = button.querySelector(".icon-pause");
        if (playIcon) playIcon.style.display = isPlaying ? "none" : "block";
        if (pauseIcon) pauseIcon.style.display = isPlaying ? "block" : "none";
    }
    updateAudioDock();
}

function resetAyahUI(ayahNum) {
    setAyahPlayingState(ayahNum, null, false);
}

// ===============================
// REMEMBER LAST READ & CHECK AYAT
// ===============================
function markAyahAsRead(surahnomorAyat, ayahnomorAyat) {
    const items = document.querySelectorAll(
        `.ayat-item[data-surah="${surahnomorAyat}"][data-ayah="${ayahnomorAyat}"]`
    );
    const wasChecked = Array.from(items).some(item => item.classList.contains("checked"));
    const isChecked = !wasChecked;
    items.forEach(item => {
        item.classList.toggle("checked", isChecked);
        const button = item.querySelector(".check-btn");
        button?.classList.toggle("checked", isChecked);
        button?.setAttribute("aria-pressed", String(isChecked));
        if (button) {
            button.setAttribute("aria-label", `${isChecked ? "Batalkan tanda" : "Tandai"} ayat ${ayahnomorAyat} selesai dibaca`);
            button.title = `${isChecked ? "Batalkan tanda" : "Tandai"} ayat ${ayahnomorAyat} dibaca`;
        }
    });
    if (!isRememberLastReadEnabled()) return;

    let data = null;
    try {
        data = JSON.parse(localStorage.getItem("lastRead"));
    } catch (error) {
        console.warn("Progres ayat tersimpan tidak dapat dibaca:", error);
    }

    if (!data || Number(data.surah) !== surahnomorAyat) {
        data = {
            surah: surahnomorAyat,
            checked: []
        };
    }

    if (!Array.isArray(data.checked)) {
        data.checked = data.ayah ? [Number(data.ayah)] : [];
    }
    data.checked = data.checked.map(Number).filter(Number.isInteger);

    const index = data.checked.indexOf(ayahnomorAyat);
    if (isChecked && index === -1) data.checked.push(ayahnomorAyat);
    else if (!isChecked && index > -1) data.checked.splice(index, 1);

    data.ayah = data.checked.length > 0 ? Math.max(...data.checked) : null;
    try {
        localStorage.setItem("lastRead", JSON.stringify(data));
        saveAdaptiveReadingPosition(surahnomorAyat, ayahnomorAyat);
    } catch (error) {
        console.warn("Tanda ayat tidak dapat disimpan:", error);
    }
}

function setupRememberToggle() {
    const toggle = document.getElementById("rememberToggle");
    if (!toggle) return;

    toggle.checked = isRememberLastReadEnabled();

    toggle.addEventListener("change", () => {
        localStorage.setItem("rememberLastRead", String(toggle.checked));
        lastSavedReadingPosition = "";
        if (toggle.checked) {
            if (currentOpenSurah !== null) {
                const container = document.getElementById("modal-ayat");
                if (container) observeModalReadingProgress(container, currentOpenSurah);
            }
        } else {
            localStorage.removeItem("adaptiveLastRead");
            localStorage.removeItem("lastRead");
        }
        syncWelcomeResume();
    });
}

// ===============================
// AUDIO PLAYER ENGINE (FULL SURAH)
// ===============================
function setupAutoplayToggle() {
    const toggle = document.getElementById("autoplay-toggle");
    if (!toggle) return;

    const saved = localStorage.getItem("autoplayEnabled");
    if (saved !== null) {
        autoPlayEnabled = saved === "true";
        toggle.checked = autoPlayEnabled;
    } else {
        autoPlayEnabled = toggle.checked;
    }

    toggle.addEventListener("change", function () {
        autoPlayEnabled = this.checked;
        localStorage.setItem("autoplayEnabled", this.checked);
    });
}

function handlePlayClick(button) {
    const audioUrl = button.dataset.audio;
    const card = button.closest(".surah-card") || button.closest("a");
    const surahId = Number(card?.dataset.surah);

    // Jika audio yang sama diklik
    if (currentAudio && currentButton === button && currentPlayingAyah === null) {
        if (!currentAudio.paused) {
            pauseAudio();
        } else {
            resumeAudio();
        }
        return;
    }

    // Putar audio surah penuh baru
    stopAllAudio();
    if (Number.isInteger(surahId) && activeSurahId !== surahId) {
        activeSurahId = surahId;
        renderSurahCarousel();
    }
    startNewAudio(button, audioUrl, card);
}

function prepareFullSurahAudio(button, audioUrl, card, surahId) {
    const thisAudio = new Audio(audioUrl);
    const thisSession = ++audioSessionId;
    currentAudio = thisAudio;
    currentButton = button;
    currentPlayingAyah = null;
    currentPlayingSurah = surahId;
    attachMediaSessionAudioEvents(thisAudio);

    const surah = allSurahData.find(item => item.nomor === surahId);
    updateMediaSessionMetadata(surah, null, audioUrl);
    setMediaSessionPlaybackState("paused");
    attachFullSurahAudioEvents(thisAudio, button, audioUrl, card, thisSession);
    localStorage.setItem("lastPlayed", audioUrl);
    updateAudioDock();
}

function attachFullSurahAudioEvents(audio, button, audioUrl, card, sessionId) {
    const progressBar = card ? card.querySelector(".progress-bar") : null;
    if (progressBar) progressBar.style.width = "0%";

    audio.onerror = () => {
        if (audioSessionId !== sessionId || currentAudio !== audio) return;
        console.error("Gagal memutar audio:", audioUrl);
        resetUI(button, card);
        currentAudio = null;
        currentButton = null;
        currentPlayingSurah = null;
        clearMediaSession();
        updateAudioDock();
    };

    audio.ontimeupdate = () => {
        if (audioSessionId !== sessionId || !audio.duration || !progressBar) return;
        progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    };

    audio.onended = () => {
        if (audioSessionId !== sessionId || currentAudio !== audio) return;
        const endedSurahId = currentPlayingSurah;
        if (progressBar) progressBar.style.width = "0%";
        resetUI(button, card);
        currentAudio = null;
        currentButton = null;
        currentPlayingSurah = null;
        clearMediaSession();
        updateAudioDock();

        if (autoPlayEnabled) {
            playNext(button, endedSurahId);
        }
    };
}

function startNewAudio(button, audioUrl, card, surahId) {
    try {
        const thisSession = ++audioSessionId;
        const thisAudio = new Audio(audioUrl);
        currentAudio = thisAudio;
        currentButton = button;
        currentPlayingAyah = null;

        const activeSurahId = surahId || (card && card.dataset.surah ? parseInt(card.dataset.surah, 10) : null);
        currentPlayingSurah = activeSurahId;
        attachMediaSessionAudioEvents(thisAudio);
        const surah = allSurahData.find(item => item.nomor === activeSurahId);
        updateMediaSessionMetadata(surah, null, audioUrl);
        attachFullSurahAudioEvents(thisAudio, button, audioUrl, card, thisSession);

        const playPromise = thisAudio.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    if (audioSessionId === thisSession) {
                        activateUI(button, card);
                    }
                })
                .catch(err => {
                    if (err.name === "AbortError") return;
                    if (audioSessionId === thisSession) {
                        console.warn("Autoplay dicegah atau audio gagal:", err);
                        resetUI(button, card);
                        setMediaSessionPlaybackState("paused");
                        updateAudioDock();
                    }
                });
        } else {
            activateUI(button, card);
        }

        if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        localStorage.setItem("lastPlayed", audioUrl);
        updateAudioDock();
    } catch (error) {
        console.error("Gagal inisialisasi audio:", error);
        resetUI(button, card);
        currentAudio = null;
        currentButton = null;
        currentPlayingSurah = null;
        clearMediaSession();
    }
}

function pauseAudio() {
    if (currentAudio) {
        currentAudio.pause();
    }
    deactivateCurrentUI();
}

function resumeAudio() {
    if (currentAudio) {
        currentAudio.play().catch(e => console.warn(e));
    }
    reactivateCurrentUI();
}

function stopAllAudio() {
    audioSessionId++; // Invalidate any in-flight promises & callbacks

    if (currentAudio) {
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.ontimeupdate = null;
        currentAudio.pause();
        currentAudio.src = "";
        currentAudio = null;
    }

    // Reset tombol kartu surah
    document.querySelectorAll(".play-btn").forEach(btn => {
        btn.classList.remove("playing");
        const playIcon = btn.querySelector(".icon-play");
        const pauseIcon = btn.querySelector(".icon-pause");
        if (playIcon) playIcon.style.display = "block";
        if (pauseIcon) pauseIcon.style.display = "none";
    });

    document.querySelectorAll(".playing-indicator").forEach(el => {
        el.replaceChildren();
        el.classList.remove("active");
    });

    document.querySelectorAll(".surah-card").forEach(c => {
        c.classList.remove("active-card");
    });

    document.querySelectorAll(".progress-bar").forEach(bar => {
        bar.style.width = "0%";
    });

    // Reset tombol audio ayat
    if (currentPlayingAyah !== null) {
        resetAyahUI(currentPlayingAyah);
        currentPlayingAyah = null;
    }
    playingAyahSurahDetail = null;
    document.querySelectorAll(".ayat-item.ayah-playing").forEach(item => {
        item.classList.remove("ayah-playing");
    });
    document.querySelectorAll(".ayah-play-btn.playing").forEach(btn => {
        btn.classList.remove("playing");
        const playIcon = btn.querySelector(".icon-play");
        const pauseIcon = btn.querySelector(".icon-pause");
        if (playIcon) playIcon.style.display = "block";
        if (pauseIcon) pauseIcon.style.display = "none";
    });

    currentPlayingSurah = null;
    currentButton = null;
    clearMediaSession();
    updateAudioDock();
}

function setCardPlayingIndicator(card, isPlaying) {
    if (!card) return;
    const ind = card.querySelector(".playing-indicator");
    if (!ind) return;
    if (isPlaying) {
        const wave = document.createElement("span");
        wave.className = "eq-wave";
        wave.setAttribute("aria-hidden", "true");
        for (let index = 1; index <= 3; index++) {
            const bar = document.createElement("span");
            bar.className = `eq-bar eq-${index}`;
            wave.append(bar);
        }
        const label = document.createElement("span");
        label.className = "playing-label";
        label.textContent = "Sedang diputar";
        ind.replaceChildren(wave, label);
        ind.classList.add("active");
    } else {
        ind.replaceChildren();
        ind.classList.remove("active");
    }
}

function activateUI(button, card) {
    if (button) {
        button.classList.add("playing");
        const playIcon = button.querySelector(".icon-play");
        const pauseIcon = button.querySelector(".icon-pause");
        if (playIcon) playIcon.style.display = "none";
        if (pauseIcon) pauseIcon.style.display = "block";
    }

    if (card) {
        card.classList.add("active-card");
        setCardPlayingIndicator(card, true);
    }
}

function resetUI(button, card) {
    if (button) {
        button.classList.remove("playing");
        const playIcon = button.querySelector(".icon-play");
        const pauseIcon = button.querySelector(".icon-pause");
        if (playIcon) playIcon.style.display = "block";
        if (pauseIcon) pauseIcon.style.display = "none";
    }

    if (card) {
        card.classList.remove("active-card");
        setCardPlayingIndicator(card, false);
    }
}

function deactivateCurrentUI() {
    if (!currentButton) return;
    const card = currentButton.closest(".surah-card") || currentButton.closest("a");

    currentButton.classList.remove("playing");
    const playIcon = currentButton.querySelector(".icon-play");
    const pauseIcon = currentButton.querySelector(".icon-pause");
    if (playIcon) playIcon.style.display = "block";
    if (pauseIcon) pauseIcon.style.display = "none";

    if (card) {
        card.classList.remove("active-card");
        setCardPlayingIndicator(card, false);
    }
}

function reactivateCurrentUI() {
    if (!currentButton) return;
    const card = currentButton.closest(".surah-card") || currentButton.closest("a");

    currentButton.classList.add("playing");
    const playIcon = currentButton.querySelector(".icon-play");
    const pauseIcon = currentButton.querySelector(".icon-pause");
    if (playIcon) playIcon.style.display = "none";
    if (pauseIcon) pauseIcon.style.display = "block";

    if (card) {
        card.classList.add("active-card");
        setCardPlayingIndicator(card, true);
    }
}

function playNext(button, endedSurahId = currentPlayingSurah) {
    const surahId = endedSurahId || Number(button?.closest(".surah-card")?.dataset.surah);
    const currentIndex = allSurahData.findIndex(surah => surah.nomor === surahId);
    const nextSurah = allSurahData[currentIndex + 1];
    if (!nextSurah) return;
    const playbackSessionId = audioSessionId;

    setTimeout(() => {
        if (!autoPlayEnabled || audioSessionId !== playbackSessionId) return;
        activeSurahId = nextSurah.nomor;
        renderSurahCarousel();
        if (document.getElementById("surah-modal")?.classList.contains("show")) {
            openSurahModal(nextSurah.nomor, undefined, document.querySelector(`.carousel-card[aria-current="true"]`));
        }
        startNewAudio(null, getFullSurahAudioUrl(nextSurah), null, nextSurah.nomor);
    }, 800);
}

// ===============================
// RESUME & SWITCH WARNING POPUPS
// ===============================
async function checkResumePopup() {
    const returnFocusElement = document.activeElement;
    if (!isRememberLastReadEnabled()) return;

    let lastRead = null;
    try {
        lastRead = JSON.parse(localStorage.getItem("lastRead"));
    } catch (e) {}

    if (!lastRead || !Number.isInteger(Number(lastRead.surah)) ||
        Number(lastRead.surah) < 1 || Number(lastRead.surah) > 114) return;

    let lastAyFromStorage = null;
    if (Array.isArray(lastRead.checked) && lastRead.checked.length > 0) {
        lastAyFromStorage = Math.max(...lastRead.checked);
    } else if (lastRead.ayah !== undefined && lastRead.ayah !== null) {
        lastAyFromStorage = lastRead.ayah;
    }

    try {
        const surah = await loadSurahDetailData(Number(lastRead.surah));
        if (activeDialog || currentOpenSurah !== null) return;

        const popup = document.getElementById("resume-popup");
        const resumeSurah = document.getElementById("resume-surah");
        const resumeAyah = document.getElementById("resume-ayah");
        const resumeYes = document.getElementById("resume-yes");
        const resumeNo = document.getElementById("resume-no");
        if (!popup || !resumeSurah || !resumeAyah || !resumeYes || !resumeNo) return;

        resumeSurah.textContent = `Surah ${surah.namaLatin} (${surah.nama})`;
        resumeAyah.textContent = `Ayat ${lastAyFromStorage !== null ? lastAyFromStorage : "1"}`;

        showAccessibleDialog(popup, returnFocusElement, "#resume-yes");

        resumeYes.onclick = () => {
            openSurahModalFromPopup(popup, Number(lastRead.surah), lastAyFromStorage);
        };

        resumeNo.onclick = () => {
            closeAccessibleDialog(popup);
        };

        const closeBtn = document.getElementById("resume-close-btn");
        if (closeBtn) {
            closeBtn.onclick = () => closeAccessibleDialog(popup);
        }

        popup.onclick = e => {
            if (e.target === popup) closeAccessibleDialog(popup);
        };

    } catch (err) {
        console.error("Gagal memuat data surah resume:", err);
    }
}

async function showSwitchWarning(newSurahId) {
    const returnFocusElement = document.activeElement;
    const requestId = ++switchWarningRequestId;
    if (!isRememberLastReadEnabled()) {
        openSurahModal(newSurahId);
        return;
    }

    let lastRead = null;
    try {
        lastRead = JSON.parse(localStorage.getItem("lastRead"));
    } catch (e) {}

    if (!lastRead || !Number.isInteger(Number(lastRead.surah)) ||
        Number(lastRead.surah) < 1 || Number(lastRead.surah) > 114) {
        openSurahModal(newSurahId);
        return;
    }

    let lastAyFromStorage = null;
    if (Array.isArray(lastRead.checked) && lastRead.checked.length > 0) {
        lastAyFromStorage = Math.max(...lastRead.checked);
    } else if (lastRead.ayah !== undefined && lastRead.ayah !== null) {
        lastAyFromStorage = lastRead.ayah;
    }

    const popup = document.getElementById("switch-popup");
    const text = document.getElementById("switch-text");
    if (!popup || !text) {
        openSurahModal(newSurahId);
        return;
    }

    try {
        const surah = await loadSurahDetailData(Number(lastRead.surah));
        if (requestId !== switchWarningRequestId || activeDialog || currentOpenSurah !== null) return;
        const switchYes = document.getElementById("switch-yes");
        const switchLast = document.getElementById("switch-last");
        const switchNo = document.getElementById("switch-no");
        if (!switchYes || !switchLast || !switchNo) {
            openSurahModal(newSurahId);
            return;
        }

        text.replaceChildren();
        [
            ["warning-top", "Bacaan terakhir Anda tersimpan di:"],
            ["warning-surah", `Surah ${surah.namaLatin} (${surah.nama})`],
            ["warning-ayah", `Ayat ${lastAyFromStorage !== null ? lastAyFromStorage : "1"}`],
            ["warning-question", "Pilih tindakan yang ingin Anda lakukan:"]
        ].forEach(([className, content]) => {
            const line = document.createElement("div");
            line.className = className;
            line.textContent = content;
            text.append(line);
        });

        showAccessibleDialog(popup, returnFocusElement, "#switch-yes");

        switchYes.onclick = () => {
            openSurahModalFromPopup(popup, newSurahId);
        };

        switchLast.onclick = () => {
            openSurahModalFromPopup(popup, Number(lastRead.surah), lastAyFromStorage);
        };

        switchNo.onclick = () => {
            closeAccessibleDialog(popup);
        };

        const closeBtn = document.getElementById("switch-close-btn");
        if (closeBtn) {
            closeBtn.onclick = () => closeAccessibleDialog(popup);
        }

        popup.onclick = e => {
            if (e.target === popup) closeAccessibleDialog(popup);
        };

    } catch (err) {
        console.error(err);
        openSurahModal(newSurahId);
    }
}

// ===============================
// GLOBAL CLICK & INTERACTION HANDLER
// ===============================
function setupGlobalClick() {
    document.addEventListener("click", function (e) {
        // Klik Play / Pause button Surah Penuh
        const playBtn = e.target.closest(".play-btn");
        if (playBtn) {
            e.preventDefault();
            e.stopPropagation();
            handlePlayClick(playBtn);
            return;
        }

        // Klik Play / Pause button Audio Per Ayat
        const ayahPlayBtn = e.target.closest(".ayah-play-btn");
        if (ayahPlayBtn) {
            e.preventDefault();
            e.stopPropagation();
            const ayahNum = parseInt(ayahPlayBtn.dataset.ayah, 10);
            if (!isNaN(ayahNum)) {
                handleAyahPlayClick(ayahNum, ayahPlayBtn);
            }
            return;
        }

        // Klik Tombol Centang Ayat
        const checkBtn = e.target.closest(".check-btn");
        if (checkBtn) {
            e.preventDefault();
            e.stopPropagation();
            const ayahNum = parseInt(checkBtn.dataset.ayah, 10);
            const surahId = Number(checkBtn.closest(".ayat-item")?.dataset.surah);
            if (Number.isInteger(surahId) && !isNaN(ayahNum)) {
                markAyahAsRead(surahId, ayahNum);
            }
            return;
        }

        // Klik Tutup Modal
        if (e.target.closest(".modal-close-frame") || e.target.closest("#modal-close-btn")) {
            closeSurahModal();
            return;
        }

        // Klik Backdrop Modal
        const modal = document.getElementById("surah-modal");
        if (e.target === modal) {
            closeSurahModal();
            return;
        }

        // Klik Kartu Surah
        const card = e.target.closest(".surah-card[data-surah]");
        if (card) {
            e.preventDefault();
            switchWarningRequestId++;
            openSurahModal(card.dataset.surah);
        }
    });
}

function setupKeyboardListeners() {
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            if (activeDialog) {
                e.preventDefault();
                closeDialog(activeDialog);
                return;
            }
            if (typeof window.closeFloatingToolbarPanel === "function") {
                window.closeFloatingToolbarPanel();
            }
            return;
        }

        if (e.key === "Tab" && activeDialog) {
            const focusableElements = getDialogFocusableElements(activeDialog);
            if (focusableElements.length === 0) {
                e.preventDefault();
                activeDialog.focus();
                return;
            }

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];
            if (e.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
                e.preventDefault();
                first.focus();
            }
        }
    });
}

// ===============================
// DARK MODE SYSTEM
// ===============================
function setupDarkMode() {
    const toggle = document.getElementById("dark-mode-toggle");
    if (!toggle) return;

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const savedMode = localStorage.getItem("darkMode");
    let themeTransitionTimer = 0;
    const applyTheme = (isDark, animate = false) => {
        document.documentElement.classList.toggle("dark-mode", isDark);
        document.body.classList.toggle("dark-mode", isDark);
        if (!animate) return;
        document.body.classList.add("theme-transition");
        window.clearTimeout(themeTransitionTimer);
        themeTransitionTimer = window.setTimeout(
            () => document.body.classList.remove("theme-transition"),
            500
        );
    };

    if (savedMode !== null) {
        const isDark = savedMode === "true";
        applyTheme(isDark);
        toggle.checked = isDark;
    } else {
        const isDark = prefersDark.matches;
        applyTheme(isDark);
        toggle.checked = isDark;
    }

    toggle.addEventListener("change", function () {
        const isDark = this.checked;
        applyTheme(isDark, true);
        localStorage.setItem("darkMode", isDark);
    });

    prefersDark.addEventListener("change", function (e) {
        if (localStorage.getItem("darkMode") === null) {
            applyTheme(e.matches, true);
            toggle.checked = e.matches;
        }
    });
}

// ===============================
// SCROLL TO TOP
// ===============================
function setupScrollTop() {
    const btn = document.getElementById("scrollTopBtn");
    if (!btn) return;

    window.addEventListener("scroll", function () {
        if (window.scrollY > 250) {
            btn.classList.add("show");
        } else {
            btn.classList.remove("show");
        }
    });

    btn.addEventListener("click", function () {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });
}

// ===============================
// FLOATING CONTROLS TOOLBAR
// ===============================
function setupFloatingToolbar() {
    const container = document.getElementById("controls-toolbar-container");
    const toolbar = document.getElementById("controls-toolbar");
    const btn = document.getElementById("floatingToolbarBtn");
    const panel = document.getElementById("floating-toolbar-panel");
    const panelBody = document.getElementById("floating-toolbar-body");
    const closeBtn = document.getElementById("floating-toolbar-close-btn");

    if (!container || !toolbar || !btn || !panel || !panelBody) return;

    let isPanelOpen = false;

    function openPanel() {
        if (isPanelOpen) return;
        // Kunci min-height wadah asli agar halaman tidak melompat (Zero Cumulative Layout Shift)
        const currentHeight = toolbar.offsetHeight;
        if (currentHeight > 0) {
            container.style.minHeight = currentHeight + "px";
        }
        // Pindahkan elemen toolbar asli ke dalam panel floating (DOM reparenting)
        panelBody.appendChild(toolbar);
        panel.classList.add("show");
        panel.setAttribute("aria-hidden", "false");
        btn.classList.add("active");
        btn.setAttribute("aria-expanded", "true");
        isPanelOpen = true;
    }

    function closePanel() {
        if (!isPanelOpen) return;
        // Kembalikan toolbar ke wadah aslinya
        container.appendChild(toolbar);
        container.style.minHeight = "";
        panel.classList.remove("show");
        panel.setAttribute("aria-hidden", "true");
        btn.classList.remove("active");
        btn.setAttribute("aria-expanded", "false");
        isPanelOpen = false;
    }

    function togglePanel() {
        if (isPanelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    // Klik tombol floating membuka / menutup panel
    btn.addEventListener("click", function (e) {
        e.stopPropagation();
        togglePanel();
    });

    // Tombol close di dalam header panel
    if (closeBtn) {
        closeBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            closePanel();
        });
    }

    // Klik di luar panel menutup panel
    document.addEventListener("click", function (e) {
        if (isPanelOpen && !panel.contains(e.target) && !btn.contains(e.target)) {
            closePanel();
        }
    });

    // Tutup panel saat pengaturan inline kembali terlihat di halaman.
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) closePanel();
                });
            },
            {
                root: null,
                threshold: 0,
                rootMargin: "0px"
            }
        );

        observer.observe(container);
    }

    // Ekspor fungsi close untuk penanganan Escape atau saat modal dibuka
    window.closeFloatingToolbarPanel = closePanel;
    btn.classList.add("show");
}
