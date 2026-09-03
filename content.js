let subtitles = [];
let uiContainer = null;
let currentVideoId = null;
let activeSubtitleIndex = -1;
let isAutoScrollActive = true;
let videoElement = null;
let isLoadingSubtitles = false;
let subtitleLoadTimeout = null;

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => {
    script.remove();
};
(document.head || document.documentElement).appendChild(script);

document.addEventListener('yt-navigate-finish', handleNavigation);
document.addEventListener('yt-page-data-updated', handleNavigation);
document.addEventListener('yt-player-updated', handleNavigation);
window.addEventListener('popstate', handleNavigation);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleNavigation);
} else {
    handleNavigation();
}

setInterval(checkUiAndVideoState, 1000);

window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    if (event.data.type === 'YT_INTERCEPTED_SUBTITLES' && event.data.data && event.data.data.trim()) {
        const parsed = parseSubtitles(event.data.data);
        if (parsed && parsed.length > 0) {
            subtitles = parsed;
            onSubtitlesLoaded();
        }
    }

    if (event.data.type === 'YT_CAPTIONS_TRACKS_AVAILABLE' && event.data.videoId === currentVideoId) {
        if (subtitles.length === 0 && event.data.tracks && event.data.tracks.length > 0) {
            loadSubtitlesFromTracks(event.data.tracks, event.data.videoId);
        }
    }
});

function getVideoIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function handleNavigation() {
    const videoId = getVideoIdFromUrl();

    if (!videoId) {
        removeUI();
        currentVideoId = null;
        subtitles = [];
        activeSubtitleIndex = -1;
        return;
    }

    if (videoId !== currentVideoId) {
        currentVideoId = videoId;
        subtitles = [];
        activeSubtitleIndex = -1;
        isLoadingSubtitles = false;

        if (subtitleLoadTimeout) clearTimeout(subtitleLoadTimeout);

        ensureUiInjected();
        showLoading();

        subtitleLoadTimeout = setTimeout(() => {
            startSubtitleFlow(videoId);
        }, 300);
    } else {
        ensureUiInjected();
    }
}

function checkUiAndVideoState() {
    const videoId = getVideoIdFromUrl();
    if (!videoId) return;

    if (videoId !== currentVideoId) {
        handleNavigation();
        return;
    }

    ensureUiInjected();

    if (!videoElement || !document.body.contains(videoElement)) {
        setupVideoSync();
    }
}

function ensureUiInjected() {
    const videoId = getVideoIdFromUrl();
    if (!videoId) return;

    const existingContainer = document.getElementById('yt-subtitle-search-container');
    if (existingContainer && document.body.contains(existingContainer)) {
        uiContainer = existingContainer;
        return;
    }

    injectUI();
}

function injectUI() {
    const videoId = getVideoIdFromUrl();
    if (!videoId) return;

    if (!uiContainer) {
        uiContainer = document.createElement('div');
        uiContainer.id = 'yt-subtitle-search-container';
        uiContainer.innerHTML = `
            <div class="yt-ss-header">
                <h3>Subtitle Search</h3>
                <div class="yt-ss-header-actions">
                    <button id="yt-ss-sync-btn" class="yt-ss-sync-btn" style="display: none;">Sync to Video</button>
                    <a href="https://www.buymeacoffee.com/sajadtroy" target="_blank" title="Buy me a coffee" class="yt-ss-bmc-btn">
                        <img src="${chrome.runtime.getURL('src/bmcbrand/SVG_Files/bmc-button.svg')}" alt="Buy me a coffee" />
                    </a>
                </div>
            </div>
            <div class="yt-ss-search-box">
                <input type="text" id="yt-subtitle-search-input" placeholder="Loading..." disabled autocomplete="off" spellcheck="false" />
            </div>
            <div id="yt-ss-status"></div>
            <div id="yt-ss-results"></div>
        `;
        attachEventListeners();
    }

    const selectors = [
        '#secondary-inner',
        '#secondary #items',
        'ytd-watch-next-secondary-results-renderer #items',
        'ytd-watch-next-secondary-results-renderer',
        '#secondary',
        '#panels',
        '#primary-inner #below',
        '#primary-inner ytd-comments',
        '#primary-inner',
        '#below'
    ];

    let targetElement = null;
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && document.body.contains(el)) {
            targetElement = el;
            break;
        }
    }

    if (targetElement) {
        if (targetElement.id === 'primary-inner' || targetElement.id === 'below' || targetElement.tagName.toLowerCase() === 'ytd-comments') {
            targetElement.parentNode.insertBefore(uiContainer, targetElement);
        } else {
            targetElement.insertBefore(uiContainer, targetElement.firstChild);
        }

        if (subtitles.length > 0) {
            onSubtitlesLoaded();
        } else if (isLoadingSubtitles) {
            showLoading();
        }
    }
}

function removeUI() {
    if (uiContainer && uiContainer.parentNode) {
        uiContainer.parentNode.removeChild(uiContainer);
    }
    uiContainer = null;
}

function updateStatus(msg, isRetryable = false) {
    const statusEl = uiContainer ? uiContainer.querySelector('#yt-ss-status') : document.getElementById('yt-ss-status');
    if (statusEl) {
        if (!msg) {
            statusEl.innerHTML = '';
            statusEl.style.display = 'none';
            return;
        }

        if (isRetryable && currentVideoId) {
            statusEl.innerHTML = `<span>${msg}</span> <a href="#" id="yt-ss-retry-link" style="color: var(--ss-active-border); text-decoration: underline; margin-left: 6px; cursor: pointer;">Retry</a>`;
            const retryLink = statusEl.querySelector('#yt-ss-retry-link');
            if (retryLink) {
                retryLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (currentVideoId) startSubtitleFlow(currentVideoId);
                });
            }
        } else {
            statusEl.textContent = msg;
        }
        statusEl.style.display = 'block';
    }
}

function showLoading() {
    isLoadingSubtitles = true;
    updateStatus('');
    const resultsContainer = uiContainer ? uiContainer.querySelector('#yt-ss-results') : document.getElementById('yt-ss-results');
    if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="yt-ss-loading-container"><div class="yt-ss-spinner"></div></div>';
    }
    const input = uiContainer ? uiContainer.querySelector('#yt-subtitle-search-input') : document.getElementById('yt-subtitle-search-input');
    if (input) {
        input.disabled = true;
        input.placeholder = 'Loading subtitles...';
    }
}

function clearLoading() {
    isLoadingSubtitles = false;
    const resultsContainer = uiContainer ? uiContainer.querySelector('#yt-ss-results') : document.getElementById('yt-ss-results');
    if (resultsContainer && resultsContainer.querySelector('.yt-ss-loading-container')) {
        resultsContainer.innerHTML = '';
    }
}

async function startSubtitleFlow(videoId) {
    if (subtitles.length > 0 && currentVideoId === videoId) {
        clearLoading();
        onSubtitlesLoaded();
        return;
    }

    showLoading();

    let tracks = await requestCaptionTracks(videoId);
    if (currentVideoId !== videoId) return;

    if (tracks && tracks.length > 0) {
        const loaded = await loadSubtitlesFromTracks(tracks, videoId);
        if (loaded || subtitles.length > 0) return;
    }

    window.postMessage({ type: 'TRIGGER_PLAYER_CAPTIONS', videoId: videoId }, '*');
    const intercepted = await waitForSubtitles(4000, videoId);

    if (currentVideoId !== videoId) return;
    if (intercepted || subtitles.length > 0) return;

    tracks = await requestCaptionTracks(videoId);
    if (currentVideoId !== videoId) return;

    if (tracks && tracks.length > 0) {
        const loaded = await loadSubtitlesFromTracks(tracks, videoId);
        if (loaded || subtitles.length > 0) return;
    }

    if (subtitles.length === 0 && currentVideoId === videoId) {
        updateStatus('No subtitles available for this video.', true);
        clearLoading();
        const input = uiContainer ? uiContainer.querySelector('#yt-subtitle-search-input') : document.getElementById('yt-subtitle-search-input');
        if (input) {
            input.disabled = true;
            input.placeholder = 'No subtitles available';
        }
    }
}

function requestCaptionTracks(videoId) {
    return new Promise((resolve) => {
        const listener = (event) => {
            if (event.source !== window || !event.data) return;
            if (event.data.type === 'YT_CAPTION_TRACKS_RESPONSE' && event.data.videoId === videoId) {
                window.removeEventListener('message', listener);
                resolve(event.data.tracks || []);
            }
        };

        window.addEventListener('message', listener);
        window.postMessage({ type: 'GET_YT_CAPTION_TRACKS', videoId: videoId }, '*');

        setTimeout(() => {
            window.removeEventListener('message', listener);
            resolve([]);
        }, 4000);
    });
}

async function loadSubtitlesFromTracks(tracks, videoId) {
    if (!tracks || tracks.length === 0) return false;

    const userLang = (navigator.language || 'en').slice(0, 2).toLowerCase();

    let sortedTracks = [...tracks].sort((a, b) => {
        const aLang = (a.languageCode || '').toLowerCase();
        const bLang = (b.languageCode || '').toLowerCase();

        if (aLang === userLang && !a.kind) return -1;
        if (bLang === userLang && !b.kind) return 1;
        if (aLang === userLang) return -1;
        if (bLang === userLang) return 1;

        if (aLang === 'en' && !a.kind) return -1;
        if (bLang === 'en' && !b.kind) return 1;
        if (aLang === 'en') return -1;
        if (bLang === 'en') return 1;

        return 0;
    });

    for (const track of sortedTracks) {
        if (currentVideoId !== videoId) return false;
        const url = track.baseUrl || track.url;
        if (!url) continue;

        const content = await fetchSubtitleFromInject(url, videoId);
        if (content && content.trim()) {
            const parsed = parseSubtitles(content);
            if (parsed && parsed.length > 0) {
                subtitles = parsed;
                onSubtitlesLoaded();
                return true;
            }
        }

        try {
            const res = await fetch(url);
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim()) {
                    const parsed = parseSubtitles(text);
                    if (parsed && parsed.length > 0) {
                        subtitles = parsed;
                        onSubtitlesLoaded();
                        return true;
                    }
                }
            }
        } catch (e) {}
    }

    return false;
}

function fetchSubtitleFromInject(url, videoId) {
    return new Promise((resolve) => {
        const listener = (event) => {
            if (event.source !== window || !event.data) return;
            if (event.data.type === 'FETCH_SUBTITLE_RESULT' && event.data.videoId === videoId && event.data.url === url) {
                window.removeEventListener('message', listener);
                resolve(event.data.data || '');
            }
        };

        window.addEventListener('message', listener);
        window.postMessage({ type: 'FETCH_SUBTITLE_URL', videoId: videoId, url: url }, '*');

        setTimeout(() => {
            window.removeEventListener('message', listener);
            resolve('');
        }, 4000);
    });
}

function waitForSubtitles(timeout, videoId) {
    return new Promise((resolve) => {
        if (subtitles.length > 0) {
            resolve(true);
            return;
        }

        const interval = setInterval(() => {
            if (subtitles.length > 0 || currentVideoId !== videoId) {
                clearInterval(interval);
                resolve(subtitles.length > 0);
            }
        }, 150);

        setTimeout(() => {
            clearInterval(interval);
            resolve(subtitles.length > 0);
        }, timeout);
    });
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseSubtitles(responseText) {
    const list = [];
    if (!responseText || typeof responseText !== 'string') return list;

    try {
        const data = JSON.parse(responseText);
        if (data.events && Array.isArray(data.events)) {
            data.events.forEach(event => {
                if (!event.segs) return;
                const start = (event.tStartMs || 0) / 1000;
                let text = event.segs.map(seg => seg.utf8 || '').join('');
                text = decodeHtmlEntities(text.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
                if (text) {
                    list.push({ start, text });
                }
            });
            if (list.length > 0) return list.sort((a, b) => a.start - b.start);
        }
    } catch (e) {}

    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, 'text/xml');

        const textNodes = xmlDoc.getElementsByTagName('text');
        if (textNodes.length > 0) {
            for (let i = 0; i < textNodes.length; i++) {
                const node = textNodes[i];
                const start = parseFloat(node.getAttribute('start')) || 0;
                let text = decodeHtmlEntities(node.textContent || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                if (text) list.push({ start, text });
            }
            if (list.length > 0) return list.sort((a, b) => a.start - b.start);
        }

        const pNodes = xmlDoc.getElementsByTagName('p');
        if (pNodes.length > 0) {
            for (let i = 0; i < pNodes.length; i++) {
                const node = pNodes[i];
                let start = 0;
                if (node.getAttribute('t')) {
                    start = parseFloat(node.getAttribute('t')) / 1000;
                } else if (node.getAttribute('start')) {
                    start = parseFloat(node.getAttribute('start'));
                }

                let text = '';
                const sNodes = node.getElementsByTagName('s');
                if (sNodes.length > 0) {
                    for (let j = 0; j < sNodes.length; j++) {
                        text += sNodes[j].textContent || '';
                    }
                } else {
                    text = node.textContent || '';
                }

                text = decodeHtmlEntities(text).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                if (text) list.push({ start, text });
            }
            if (list.length > 0) return list.sort((a, b) => a.start - b.start);
        }
    } catch (e) {}

    if (responseText.includes('WEBVTT') || responseText.includes('-->')) {
        const vttRegex = /(?:(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3}))\s*-->\s*(?:(\d{2}:)?(\d{2}):(\d{2})[.,](\d{3}))\n([\s\S]*?)(?=\n\n|\n\d{2}:|\n*$)/g;
        let match;
        while ((match = vttRegex.exec(responseText)) !== null) {
            const h = match[1] ? parseFloat(match[1].replace(':', '')) : 0;
            const m = parseFloat(match[2]);
            const s = parseFloat(match[3]);
            const ms = parseFloat(match[4]) / 1000;
            const start = h * 3600 + m * 60 + s + ms;

            let text = decodeHtmlEntities(match[9].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
            if (text) list.push({ start, text });
        }
    }

    return list.sort((a, b) => a.start - b.start);
}

function onSubtitlesLoaded() {
    clearLoading();
    updateStatus('');

    const input = uiContainer ? uiContainer.querySelector('#yt-subtitle-search-input') : document.getElementById('yt-subtitle-search-input');
    if (input) {
        input.disabled = false;
        input.placeholder = `Search in ${subtitles.length} lines...`;
    }

    setupVideoSync();
    renderResults(input ? input.value.toLowerCase().trim() : '');
}

function attachEventListeners() {
    if (!uiContainer) return;

    const input = uiContainer.querySelector('#yt-subtitle-search-input');
    if (input) {
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            renderResults(query);
        });
    }

    const syncBtn = uiContainer.querySelector('#yt-ss-sync-btn');
    const resultsContainer = uiContainer.querySelector('#yt-ss-results');

    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            isAutoScrollActive = true;
            syncBtn.style.display = 'none';
            if (activeSubtitleIndex !== -1) {
                highlightActiveSubtitle();
            } else if (resultsContainer) {
                resultsContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    if (resultsContainer) {
        const breakSync = () => {
            if (isAutoScrollActive) {
                isAutoScrollActive = false;
                if (syncBtn) syncBtn.style.display = 'block';
            }
        };

        resultsContainer.addEventListener('wheel', breakSync, { passive: true });
        resultsContainer.addEventListener('touchstart', breakSync, { passive: true });
        resultsContainer.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Space'].includes(e.code)) {
                breakSync();
            }
        });
        resultsContainer.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.yt-ss-result-item')) {
                breakSync();
            }
        });
    }
}

function renderResults(query) {
    const resultsContainer = uiContainer ? uiContainer.querySelector('#yt-ss-results') : document.getElementById('yt-ss-results');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';

    let matches = [];
    if (!query) {
        matches = subtitles.map((sub, index) => ({ ...sub, index }));
    } else {
        matches = subtitles
            .map((sub, index) => ({ ...sub, index }))
            .filter(sub => sub.text.toLowerCase().includes(query))
            .slice(0, 300);
    }

    if (matches.length === 0) {
        resultsContainer.innerHTML = '<div class="yt-ss-no-results">No matches found.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    matches.forEach(match => {
        const div = document.createElement('div');
        div.className = 'yt-ss-result-item';
        div.setAttribute('data-index', match.index);

        const timeStr = formatTime(match.start);

        let highlightedText = match.text;
        if (query) {
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            highlightedText = match.text.replace(regex, '<span class="yt-ss-highlight">$1</span>');
        }

        div.innerHTML = `
            <span class="yt-ss-time">[${timeStr}]</span>
            <span class="yt-ss-text">${highlightedText}</span>
        `;

        div.addEventListener('click', () => {
            seekVideo(match.start);
            isAutoScrollActive = true;
            const syncBtn = uiContainer ? uiContainer.querySelector('#yt-ss-sync-btn') : document.getElementById('yt-ss-sync-btn');
            if (syncBtn) syncBtn.style.display = 'none';
        });

        fragment.appendChild(div);
    });

    resultsContainer.appendChild(fragment);

    if (!query && activeSubtitleIndex !== -1) {
        highlightActiveSubtitle();
    }
}

function setupVideoSync() {
    videoElement = document.querySelector('video');
    if (videoElement) {
        videoElement.removeEventListener('timeupdate', syncSubtitles);
        videoElement.addEventListener('timeupdate', syncSubtitles);

        const onPlay = () => {
            if (subtitles.length === 0 && currentVideoId && !isLoadingSubtitles) {
                startSubtitleFlow(currentVideoId);
            }
        };
        videoElement.removeEventListener('play', onPlay);
        videoElement.addEventListener('play', onPlay);
        videoElement.removeEventListener('playing', onPlay);
        videoElement.addEventListener('playing', onPlay);
    }
}

function syncSubtitles() {
    const input = uiContainer ? uiContainer.querySelector('#yt-subtitle-search-input') : null;
    if (input && input.value.trim().length > 0) return;

    if (!videoElement || subtitles.length === 0) return;

    const currentTime = videoElement.currentTime;

    let newIndex = -1;
    for (let i = 0; i < subtitles.length; i++) {
        const nextStart = i + 1 < subtitles.length ? subtitles[i+1].start : Infinity;
        if (currentTime >= subtitles[i].start && currentTime < nextStart) {
            newIndex = i;
            break;
        }
    }

    if (newIndex !== -1 && newIndex !== activeSubtitleIndex) {
        activeSubtitleIndex = newIndex;
        highlightActiveSubtitle();
    }
}

function highlightActiveSubtitle() {
    const resultsContainer = uiContainer ? uiContainer.querySelector('#yt-ss-results') : null;
    if (!resultsContainer) return;

    const oldActive = resultsContainer.querySelector('.yt-ss-active');
    if (oldActive) {
        oldActive.classList.remove('yt-ss-active');
    }

    const newActive = resultsContainer.querySelector(`.yt-ss-result-item[data-index="${activeSubtitleIndex}"]`);
    if (newActive) {
        newActive.classList.add('yt-ss-active');

        if (isAutoScrollActive) {
            const containerHeight = resultsContainer.clientHeight;
            const scrollTop = resultsContainer.scrollTop;
            const itemTop = newActive.offsetTop;
            const itemBottom = itemTop + newActive.clientHeight;

            if (itemBottom > scrollTop + containerHeight) {
                resultsContainer.scrollTo({
                    top: itemTop,
                    behavior: 'smooth'
                });
            } else if (itemTop < scrollTop) {
                resultsContainer.scrollTo({
                    top: itemBottom - containerHeight,
                    behavior: 'smooth'
                });
            }
        }
    }
}

function seekVideo(seconds) {
    const video = document.querySelector('video');
    if (video) {
        video.currentTime = seconds;
        if (video.paused) {
            video.play();
        }
        video.focus();
    }
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
