// content.js

let subtitles = [];
let uiContainer = null;
let currentVideoId = null;
let injectLoaded = false;
let activeSubtitleIndex = -1;
let isAutoScrollActive = true;
let videoElement = null;

// 1. Inject inject.js into the main world to access window objects
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => {
    injectLoaded = true;
    script.remove();
};
(document.head || document.documentElement).appendChild(script);


// 2. Listen for YouTube SPA navigation events
document.addEventListener('yt-navigate-finish', handleNavigation);
document.addEventListener('yt-page-data-updated', handleNavigation);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleNavigation);
} else {
    handleNavigation();
}

function handleNavigation() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    
    // If we're not on a watch page, clean up
    if (!videoId) {
        removeUI();
        currentVideoId = null;
        return;
    }
    
    // If the video ID hasn't changed, do nothing
    if (videoId === currentVideoId) return;
    
    currentVideoId = videoId;
    subtitles = [];
    activeSubtitleIndex = -1;
    
    // Slight delay to ensure the player is fully initialized after navigation
    setTimeout(() => {
        initSubtitleSearch();
    }, 1500);
}


// 3. Main initialization function
async function initSubtitleSearch() {
    removeUI();
    await injectUI();
    
    // Wait for the injected script to load (should be almost instant)
    let attempts = 0;
    while (!injectLoaded && attempts < 50) {
        await new Promise(r => setTimeout(r, 50));
        attempts++;
    }
    
    try {
        updateStatus('Fetching subtitles...');
        const pr = await getPlayerResponse();
        
        const captions = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!captions || captions.length === 0) {
            updateStatus('No subtitles available for this video (or they are auto-generated and disabled).');
            return;
        }
        
        // Find English subtitles, or fallback to the first available track
        let track = captions.find(t => t.languageCode === 'en' && !t.kind) || // preferred: manual English
                    captions.find(t => t.languageCode === 'en') ||            // fallback: auto-generated English
                    captions[0];                                              // fallback: whatever is first
                    
        if (!track || !track.baseUrl) {
            updateStatus('Could not find a valid subtitle track.');
            return;
        }
        
        // Fetch the XML transcript
        const response = await fetch(track.baseUrl);
        const xmlText = await response.text();
        
        parseSubtitles(xmlText);
        
        if (subtitles.length === 0) {
            updateStatus('Failed to parse subtitles.');
        } else {
            updateStatus('');
            const input = uiContainer ? uiContainer.querySelector('#yt-subtitle-search-input') : document.getElementById('yt-subtitle-search-input');
            if (input) {
                input.disabled = false;
                input.placeholder = `Search in ${subtitles.length} lines...`;
            }
            
            // Set up video synchronization and render full transcript
            setupVideoSync();
            renderResults('');
        }
    } catch (err) {
        console.error('Subtitle Search Error:', err);
        updateStatus('Error loading subtitles. Check console for details.');
    }
}


// 4. Communication with the main world
function getPlayerResponse() {
    return new Promise((resolve) => {
        const listener = (event) => {
            if (event.source !== window || event.data.type !== 'YT_PLAYER_RESPONSE') return;
            window.removeEventListener('message', listener);
            resolve(event.data.data);
        };
        
        window.addEventListener('message', listener);
        window.postMessage({ type: 'GET_YT_PLAYER_RESPONSE' }, '*');
        
        // Timeout after 3 seconds if no response
        setTimeout(() => {
            window.removeEventListener('message', listener);
            resolve(null);
        }, 3000);
    });
}


// 5. XML Parsing logic
function parseSubtitles(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xmlDoc.getElementsByTagName('text');
    
    subtitles = [];
    for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        const start = parseFloat(node.getAttribute('start'));
        let text = node.textContent || '';
        
        // Decode common HTML entities
        text = text.replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&#39;/g, "'")
                   .replace(/&quot;/g, '"');
                   
        // Remove styling tags like <font color="...">
        text = text.replace(/<[^>]+>/g, '');
        
        subtitles.push({ start, text });
    }
}


// 6. UI Injection and management
function injectUI() {
    return new Promise((resolve) => {
        if (document.getElementById('yt-subtitle-search-container')) {
            uiContainer = document.getElementById('yt-subtitle-search-container');
            resolve();
            return;
        }
        
        uiContainer = document.createElement('div');
        uiContainer.id = 'yt-subtitle-search-container';
        uiContainer.innerHTML = `
            <div class="yt-ss-header">
                <h3>Subtitle Search</h3>
                <button id="yt-ss-sync-btn" class="yt-ss-sync-btn" style="display: none;">Sync to Video</button>
            </div>
            <div class="yt-ss-search-box">
                <input type="text" id="yt-subtitle-search-input" placeholder="Loading..." disabled autocomplete="off" spellcheck="false" />
            </div>
            <div id="yt-ss-status"></div>
            <div id="yt-ss-results"></div>
        `;
        
        // Repeatedly try to insert into the DOM because YouTube loads elements dynamically
        const insertInterval = setInterval(() => {
            const secondaryCol = document.querySelector('#secondary-inner') || document.querySelector('ytd-watch-next-secondary-results-renderer');
            const primaryCol = document.querySelector('#primary-inner');
            
            if (secondaryCol) {
                secondaryCol.insertBefore(uiContainer, secondaryCol.firstChild);
                clearInterval(insertInterval);
                attachEventListeners();
                resolve();
            } else if (primaryCol) {
                // Fallback for theater mode or mobile layouts where secondary column doesn't exist
                const comments = document.querySelector('ytd-comments');
                if (comments) {
                    primaryCol.insertBefore(uiContainer, comments);
                    clearInterval(insertInterval);
                    attachEventListeners();
                    resolve();
                }
            }
        }, 500);
        
        // Stop trying after 15 seconds to prevent infinite looping
        setTimeout(() => {
            clearInterval(insertInterval);
            resolve();
        }, 15000);
    });
}

function removeUI() {
    if (uiContainer && uiContainer.parentNode) {
        uiContainer.parentNode.removeChild(uiContainer);
    }
    uiContainer = null;
}

function updateStatus(msg) {
    const statusEl = uiContainer ? uiContainer.querySelector('#yt-ss-status') : document.getElementById('yt-ss-status');
    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.style.display = msg ? 'block' : 'none';
    }
}


// 7. Event Listeners & Search Logic
function attachEventListeners() {
    const input = uiContainer ? uiContainer.querySelector('#yt-subtitle-search-input') : document.getElementById('yt-subtitle-search-input');
    if (input) {
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            renderResults(query);
        });
    }
    
    const syncBtn = uiContainer ? uiContainer.querySelector('#yt-ss-sync-btn') : document.getElementById('yt-ss-sync-btn');
    const resultsContainer = uiContainer ? uiContainer.querySelector('#yt-ss-results') : document.getElementById('yt-ss-results');
    
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            isAutoScrollActive = true;
            syncBtn.style.display = 'none';
            if (activeSubtitleIndex !== -1) {
                highlightActiveSubtitle();
            }
        });
    }
    
    // Detect manual scrolling to break auto-sync
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
            // Only break sync if they click the container background/scrollbar, not a subtitle item
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
    
    // If no query, show all subtitles. Otherwise, filter.
    let matches = [];
    if (!query) {
        matches = subtitles.map((sub, index) => ({ ...sub, index }));
    } else {
        matches = subtitles
            .map((sub, index) => ({ ...sub, index }))
            .filter(sub => sub.text.toLowerCase().includes(query))
            .slice(0, 200); // Limit results when searching
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
            // Resume auto-scroll when a user explicitly clicks a subtitle
            isAutoScrollActive = true;
            const syncBtn = uiContainer ? uiContainer.querySelector('#yt-ss-sync-btn') : document.getElementById('yt-ss-sync-btn');
            if (syncBtn) syncBtn.style.display = 'none';
        });
        
        fragment.appendChild(div);
    });
    
    resultsContainer.appendChild(fragment);
    
    // If resetting the view (no query), immediately highlight the active one
    if (!query && activeSubtitleIndex !== -1) {
        highlightActiveSubtitle();
    }
}


// 8. Video Syncing Logic
function setupVideoSync() {
    videoElement = document.querySelector('video');
    if (videoElement) {
        videoElement.removeEventListener('timeupdate', syncSubtitles);
        videoElement.addEventListener('timeupdate', syncSubtitles);
    }
}

function syncSubtitles() {
    const input = uiContainer ? uiContainer.querySelector('#yt-subtitle-search-input') : null;
    if (input && input.value.trim().length > 0) return; // Don't auto-scroll while searching
    
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
            
            // Only scroll if the item is outside the currently visible area
            if (itemBottom > scrollTop + containerHeight) {
                // Item is below the view, scroll down just enough to see it
                resultsContainer.scrollTo({
                    top: itemBottom - containerHeight,
                    behavior: 'smooth'
                });
            } else if (itemTop < scrollTop) {
                // Item is above the view, scroll up just enough to see it
                resultsContainer.scrollTo({
                    top: itemTop,
                    behavior: 'smooth'
                });
            }
        }
    }
}


// 9. Utility functions
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
