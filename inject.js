(function() {
    const cachedPlayerResponses = {};
    let restoreCaptionTrack = null;

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        
        if (url) {
            if (url.includes('api/timedtext')) {
                try {
                    const response = await originalFetch.apply(this, args);
                    const clone = response.clone();
                    clone.text().then(text => {
                        if (text && hasSubtitleCues(text)) {
                            window.postMessage({ type: 'YT_INTERCEPTED_SUBTITLES', url: url, data: text }, '*');
                            if (restoreCaptionTrack) {
                                restoreCaptionTrack();
                                restoreCaptionTrack = null;
                            }
                        }
                    }).catch(() => {});
                    return response;
                } catch (e) {
                    return originalFetch.apply(this, args);
                }
            }

            if (url.includes('youtubei/v1/player') || url.includes('youtubei/v1/next')) {
                try {
                    const response = await originalFetch.apply(this, args);
                    const clone = response.clone();
                    clone.json().then(data => {
                        if (data) {
                            const videoId = data?.videoDetails?.videoId || data?.currentVideoEndpoint?.watchEndpoint?.videoId;
                            if (videoId) {
                                cachedPlayerResponses[videoId] = data;
                                const tracks = extractTracksFromData(data);
                                if (tracks && tracks.length > 0) {
                                    window.postMessage({ type: 'YT_CAPTIONS_TRACKS_AVAILABLE', videoId: videoId, tracks: tracks }, '*');
                                }
                            }
                        }
                    }).catch(() => {});
                    return response;
                } catch (e) {
                    return originalFetch.apply(this, args);
                }
            }
        }

        return originalFetch.apply(this, args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            if (this._url) {
                if (this._url.includes('api/timedtext') && this.responseText && hasSubtitleCues(this.responseText)) {
                    window.postMessage({ type: 'YT_INTERCEPTED_SUBTITLES', url: this._url, data: this.responseText }, '*');
                    if (restoreCaptionTrack) {
                        restoreCaptionTrack();
                        restoreCaptionTrack = null;
                    }
                }
                if ((this._url.includes('youtubei/v1/player') || this._url.includes('youtubei/v1/next')) && this.responseText) {
                    try {
                        const data = JSON.parse(this.responseText);
                        const videoId = data?.videoDetails?.videoId || data?.currentVideoEndpoint?.watchEndpoint?.videoId;
                        if (videoId) {
                            cachedPlayerResponses[videoId] = data;
                            const tracks = extractTracksFromData(data);
                            if (tracks && tracks.length > 0) {
                                window.postMessage({ type: 'YT_CAPTIONS_TRACKS_AVAILABLE', videoId: videoId, tracks: tracks }, '*');
                            }
                        }
                    } catch (e) {}
                }
            }
        });
        return originalSend.apply(this, arguments);
    };

    function hasSubtitleCues(text) {
        if (!text || typeof text !== 'string') return false;
        const trimmed = text.trim();
        if (!trimmed) return false;

        if (trimmed.startsWith('{') && (trimmed.includes('"events"') || trimmed.includes('"segs"'))) {
            return true;
        }
        if (trimmed.includes('<text') || trimmed.includes('<p ') || trimmed.includes('<p>') || trimmed.includes('<s>')) {
            return true;
        }
        if (trimmed.includes('WEBVTT') || trimmed.includes('-->')) {
            return true;
        }
        return false;
    }

    function extractTracksFromData(data) {
        if (!data) return null;
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
                       data?.playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && Array.isArray(tracks) && tracks.length > 0) {
            return tracks;
        }
        return null;
    }

    function getCaptionTracksFromPage(targetVideoId) {
        if (targetVideoId && cachedPlayerResponses[targetVideoId]) {
            const tracks = extractTracksFromData(cachedPlayerResponses[targetVideoId]);
            if (tracks) return tracks;
        }

        const player = document.getElementById('movie_player');
        if (player) {
            if (typeof player.getPlayerResponse === 'function') {
                const pr = player.getPlayerResponse();
                if (pr) {
                    const prVideoId = pr?.videoDetails?.videoId;
                    if (!targetVideoId || !prVideoId || prVideoId === targetVideoId) {
                        const tracks = extractTracksFromData(pr);
                        if (tracks) return tracks;
                    }
                }
            }

            try {
                if (typeof player.loadModule === 'function') {
                    player.loadModule('captions');
                }
                if (typeof player.getOption === 'function') {
                    const tracklist = player.getOption('captions', 'tracklist');
                    if (tracklist && Array.isArray(tracklist) && tracklist.length > 0) {
                        return tracklist.map(t => ({
                            baseUrl: t.baseUrl || t.url || '',
                            languageCode: t.languageCode || t.vssId?.replace(/^[a-z]\./, '') || 'en',
                            name: { simpleText: t.languageName || t.name || t.displayName || 'Subtitles' },
                            kind: t.kind || (t.vssId?.startsWith('a.') ? 'asr' : undefined),
                            vssId: t.vssId
                        })).filter(t => Boolean(t.baseUrl));
                    }
                }
            } catch (e) {}
        }

        const watchFlexy = document.querySelector('ytd-watch-flexy') || document.querySelector('ytd-watch-grid');
        if (watchFlexy) {
            const pr = watchFlexy.playerData || watchFlexy.data?.playerResponse;
            if (pr) {
                const tracks = extractTracksFromData(pr);
                if (tracks) return tracks;
            }
        }

        const pageManager = document.querySelector('ytd-page-manager');
        if (pageManager && typeof pageManager.getCurrentPage === 'function') {
            const page = pageManager.getCurrentPage();
            if (page && page.playerData) {
                const tracks = extractTracksFromData(page.playerData);
                if (tracks) return tracks;
            }
        }

        if (window.ytInitialPlayerResponse) {
            const initVideoId = window.ytInitialPlayerResponse?.videoDetails?.videoId;
            if (!targetVideoId || !initVideoId || initVideoId === targetVideoId) {
                const tracks = extractTracksFromData(window.ytInitialPlayerResponse);
                if (tracks) return tracks;
            }
        }

        return null;
    }

    async function fetchInnerTubePlayerResponse(targetVideoId) {
        try {
            let apiKey = '';
            let context = {
                client: {
                    clientName: 'WEB',
                    clientVersion: '2.20240101.01.00',
                    hl: navigator.language || 'en',
                    gl: 'US'
                }
            };

            if (window.ytcfg && typeof window.ytcfg.get === 'function') {
                apiKey = window.ytcfg.get('INNERTUBE_API_KEY') || '';
                const cfgContext = window.ytcfg.get('INNERTUBE_CONTEXT');
                if (cfgContext) {
                    context = cfgContext;
                }
            }

            const endpoint = apiKey ? `/youtubei/v1/player?key=${apiKey}&prettyPrint=false` : '/youtubei/v1/player';
            const res = await originalFetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    context: context,
                    videoId: targetVideoId
                }),
                credentials: 'same-origin'
            });

            if (res.ok) {
                const data = await res.json();
                if (data) {
                    cachedPlayerResponses[targetVideoId] = data;
                    const tracks = extractTracksFromData(data);
                    if (tracks && tracks.length > 0) {
                        return tracks;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    async function fetchHtmlPlayerResponse(targetVideoId) {
        try {
            const res = await originalFetch(`/watch?v=${targetVideoId}`, { credentials: 'same-origin' });
            const html = await res.text();
            
            const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
            if (match && match[1]) {
                try {
                    const data = JSON.parse(match[1]);
                    if (data) {
                        cachedPlayerResponses[targetVideoId] = data;
                        return extractTracksFromData(data);
                    }
                } catch (e) {}
            }

            const captionMatch = html.match(/"captionTracks":\s*(\[.+?\])/);
            if (captionMatch && captionMatch[1]) {
                try {
                    const tracks = JSON.parse(captionMatch[1]);
                    if (tracks && Array.isArray(tracks)) {
                        return tracks;
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }

    async function fetchSubtitleContent(url) {
        if (!url) return null;

        const formats = ['json3', 'srv1', '', 'vtt'];
        for (const fmt of formats) {
            try {
                let fetchUrl = url;
                if (fmt) {
                    fetchUrl = fetchUrl.replace(/([?&])fmt=[^&]*/g, '$1').replace(/[?&]$/, '');
                    fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fmt=' + fmt;
                } else {
                    fetchUrl = fetchUrl.replace(/([?&])fmt=[^&]*/g, '$1').replace(/[?&]$/, '');
                }

                const response = await originalFetch(fetchUrl, { credentials: 'same-origin' });
                if (response.ok) {
                    const text = await response.text();
                    if (hasSubtitleCues(text)) {
                        return text;
                    }
                }
            } catch (e) {}
        }

        try {
            const response = await originalFetch(url, { credentials: 'same-origin' });
            if (response.ok) {
                const text = await response.text();
                if (text && text.trim()) return text;
            }
        } catch (e) {}

        return null;
    }

    async function resolveAllCaptionTracks(targetVideoId) {
        let tracks = getCaptionTracksFromPage(targetVideoId);
        if (tracks && tracks.length > 0) return tracks;

        tracks = await fetchInnerTubePlayerResponse(targetVideoId);
        if (tracks && tracks.length > 0) return tracks;

        let attempts = 0;
        while (attempts < 6) {
            await new Promise(r => setTimeout(r, 200));
            tracks = getCaptionTracksFromPage(targetVideoId);
            if (tracks && tracks.length > 0) return tracks;
            attempts++;
        }

        tracks = await fetchHtmlPlayerResponse(targetVideoId);
        if (tracks && tracks.length > 0) return tracks;

        return [];
    }

    window.addEventListener('message', async function(event) {
        if (event.source !== window || !event.data || !event.data.type) return;

        if (event.data.type === 'GET_YT_CAPTION_TRACKS') {
            const targetVideoId = event.data.videoId;
            const tracks = await resolveAllCaptionTracks(targetVideoId);

            window.postMessage({
                type: 'YT_CAPTION_TRACKS_RESPONSE',
                videoId: targetVideoId,
                tracks: tracks || []
            }, '*');
        }

        if (event.data.type === 'FETCH_SUBTITLE_URL') {
            const targetVideoId = event.data.videoId;
            const targetUrl = event.data.url;
            const text = await fetchSubtitleContent(targetUrl);

            window.postMessage({
                type: 'FETCH_SUBTITLE_RESULT',
                videoId: targetVideoId,
                url: targetUrl,
                data: text || ''
            }, '*');
        }

        if (event.data.type === 'TRIGGER_PLAYER_CAPTIONS') {
            const targetVideoId = event.data.videoId;
            const targetLang = event.data.lang;

            const player = document.getElementById('movie_player');
            if (player) {
                try {
                    if (typeof player.loadModule === 'function') {
                        player.loadModule('captions');
                    }

                    const tracklist = typeof player.getOption === 'function' ? player.getOption('captions', 'tracklist') : null;
                    if (tracklist && Array.isArray(tracklist) && tracklist.length > 0) {
                        const tracks = tracklist.map(t => ({
                            baseUrl: t.baseUrl || t.url || '',
                            languageCode: t.languageCode || t.vssId?.replace(/^[a-z]\./, '') || 'en',
                            name: { simpleText: t.languageName || t.name || t.displayName || 'Subtitles' },
                            kind: t.kind || (t.vssId?.startsWith('a.') ? 'asr' : undefined),
                            vssId: t.vssId
                        })).filter(t => Boolean(t.baseUrl));

                        if (tracks.length > 0) {
                            window.postMessage({ type: 'YT_CAPTIONS_TRACKS_AVAILABLE', videoId: targetVideoId, tracks: tracks }, '*');
                        }

                        const targetTrack = (targetLang ? tracklist.find(t => t.languageCode === targetLang) : null) || tracklist[0];
                        if (targetTrack && typeof player.setOption === 'function') {
                            player.setOption('captions', 'track', targetTrack);
                        }
                    }

                    const prevTrack = typeof player.getOption === 'function' ? player.getOption('captions', 'track') : null;
                    const hasActiveTrack = prevTrack && Boolean(prevTrack.languageCode);

                    if (typeof player.toggleSubtitlesOn === 'function' && !hasActiveTrack) {
                        player.toggleSubtitlesOn();
                        restoreCaptionTrack = () => {
                            try {
                                if (typeof player.toggleSubtitlesOff === 'function') {
                                    player.toggleSubtitlesOff();
                                }
                            } catch (e) {}
                        };
                        setTimeout(() => {
                            if (restoreCaptionTrack) {
                                restoreCaptionTrack();
                                restoreCaptionTrack = null;
                            }
                        }, 8000);
                    }
                } catch (e) {}
            }
        }
    });
})();
