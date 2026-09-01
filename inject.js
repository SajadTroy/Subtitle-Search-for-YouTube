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
                        if (text && text.trim()) {
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
                if (this._url.includes('api/timedtext') && this.responseText && this.responseText.trim()) {
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

        const formats = ['', 'json3', 'srv1', 'vtt'];
        for (const fmt of formats) {
            try {
                let fetchUrl = url;
                if (fmt && !fetchUrl.includes(`fmt=${fmt}`)) {
                    fetchUrl = fetchUrl.replace(/([?&])fmt=[^&]*/g, '$1').replace(/[?&]$/, '');
                    fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fmt=' + fmt;
                }
                const response = await originalFetch(fetchUrl, { credentials: 'same-origin' });
                if (response.ok) {
                    const text = await response.text();
                    if (text && text.trim()) {
                        return text;
                    }
                }
            } catch (e) {}
        }
        return null;
    }

    window.addEventListener('message', async function(event) {
        if (event.source !== window || !event.data || !event.data.type) return;

        if (event.data.type === 'GET_YT_CAPTION_TRACKS') {
            const targetVideoId = event.data.videoId;
            let tracks = getCaptionTracksFromPage(targetVideoId);

            if (!tracks && targetVideoId) {
                let attempts = 0;
                while (!tracks && attempts < 10) {
                    await new Promise(r => setTimeout(r, 200));
                    tracks = getCaptionTracksFromPage(targetVideoId);
                    attempts++;
                }

                if (!tracks) {
                    tracks = await fetchHtmlPlayerResponse(targetVideoId);
                }
            }

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

                    const prevTrack = typeof player.getOption === 'function' ? player.getOption('captions', 'track') : null;
                    const tracklist = typeof player.getOption === 'function' ? player.getOption('captions', 'tracklist') : null;

                    if (tracklist && Array.isArray(tracklist) && tracklist.length > 0) {
                        const targetTrack = (targetLang ? tracklist.find(t => t.languageCode === targetLang) : null) || tracklist[0];
                        if (targetTrack && typeof player.setOption === 'function') {
                            player.setOption('captions', 'track', targetTrack);
                            if (typeof player.toggleSubtitlesOn === 'function') {
                                player.toggleSubtitlesOn();
                            }

                            restoreCaptionTrack = () => {
                                try {
                                    if (!prevTrack || !prevTrack.languageCode) {
                                        player.setOption('captions', 'track', {});
                                        if (typeof player.toggleSubtitlesOff === 'function') {
                                            player.toggleSubtitlesOff();
                                        }
                                    } else {
                                        player.setOption('captions', 'track', prevTrack);
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
                    } else if (typeof player.toggleSubtitlesOn === 'function') {
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
