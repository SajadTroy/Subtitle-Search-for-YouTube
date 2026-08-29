let subtitles = [];
let uiContainer = null;
let currentVideoId = null;
let injectLoaded = false;
let activeSubtitleIndex = -1;
let isAutoScrollActive = true;
let videoElement = null;

const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => {
    injectLoaded = true;
    script.remove();
};
(document.head || document.documentElement).appendChild(script);

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
    
    if (!videoId) {
        removeUI();
        currentVideoId = null;
        return;
    }
    
    if (videoId === currentVideoId) return;
    
    currentVideoId = videoId;
    subtitles = [];
    activeSubtitleIndex = -1;
    
    setTimeout(() => {
        initSubtitleSearch();
    }, 1500);
}

async function initSubtitleSearch() {
    removeUI();
    await injectUI();
    
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
        
        let track = captions.find(t => t.languageCode === 'en' && !t.kind) || 
                    captions.find(t => t.languageCode === 'en') ||            
                    captions[0];                                              
                    
        if (!track || !track.baseUrl) {
            updateStatus('Could not find a valid subtitle track.');
            return;
        }
        
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
            
            setupVideoSync();
            renderResults('');
        }
    } catch (err) {
        console.error('Subtitle Search Error:', err);
        updateStatus('Error loading subtitles. Check console for details.');
    }
}

function getPlayerResponse() {
    return new Promise((resolve) => {
        const listener = (event) => {
            if (event.source !== window || event.data.type !== 'YT_PLAYER_RESPONSE') return;
            window.removeEventListener('message', listener);
            resolve(event.data.data);
        };
        
        window.addEventListener('message', listener);
        window.postMessage({ type: 'GET_YT_PLAYER_RESPONSE' }, '*');
        
        setTimeout(() => {
            window.removeEventListener('message', listener);
            resolve(null);
        }, 3000);
    });
}

function parseSubtitles(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xmlDoc.getElementsByTagName('text');
    
    subtitles = [];
    for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        const start = parseFloat(node.getAttribute('start'));
        let text = node.textContent || '';
        
        text = text.replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<')
                   .replace(/&gt;/g, '>')
                   .replace(/&#39;/g, "'")
                   .replace(/&quot;/g, '"');
                   
        text = text.replace(/<[^>]+>/g, '');
        
        subtitles.push({ start, text });
    }
}

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
        
        const insertInterval = setInterval(() => {
            const secondaryCol = document.querySelector('#secondary-inner') || document.querySelector('ytd-watch-next-secondary-results-renderer');
            const primaryCol = document.querySelector('#primary-inner');
            
            if (secondaryCol) {
                secondaryCol.insertBefore(uiContainer, secondaryCol.firstChild);
                clearInterval(insertInterval);
                attachEventListeners();
                resolve();
            } else if (primaryCol) {
                const comments = document.querySelector('ytd-comments');
                if (comments) {
                    primaryCol.insertBefore(uiContainer, comments);
                    clearInterval(insertInterval);
                    attachEventListeners();
                    resolve();
                }
            }
        }, 500);
        
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
            .slice(0, 200); 
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
