(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        if (url && url.includes('api/timedtext')) {
            try {
                const response = await originalFetch.apply(this, args);
                const clone = response.clone();
                clone.text().then(text => {
                    if (text && text.trim()) {
                        window.postMessage({ type: 'YT_INTERCEPTED_SUBTITLES', url: url, data: text }, '*');
                        if (window._restoreCaptionTrack) window._restoreCaptionTrack();
                    }
                }).catch(() => {});
                return response;
            } catch (e) {
                return originalFetch.apply(this, args);
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
            if (this._url && this._url.includes('api/timedtext') && this.responseText && this.responseText.trim()) {
                window.postMessage({ type: 'YT_INTERCEPTED_SUBTITLES', url: this._url, data: this.responseText }, '*');
                if (window._restoreCaptionTrack) window._restoreCaptionTrack();
            }
        });
        return originalSend.apply(this, arguments);
    };

    window.addEventListener('message', function(event) {
        if (event.source !== window) return;

        if (event.data.type === 'GET_YT_PLAYER_RESPONSE') {
            const expectedVideoId = event.data.videoId;
            
            const checkAndSend = (attempts) => {
                let pr = null;
                const player = document.getElementById('movie_player');
                if (player && player.getPlayerResponse) {
                    pr = player.getPlayerResponse();
                } else if (window.ytInitialPlayerResponse) {
                    pr = window.ytInitialPlayerResponse;
                }
                
                if (pr && pr.videoDetails && pr.videoDetails.videoId === expectedVideoId) {
                    Promise.resolve(pr).then(resolvedPr => {
                        window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: resolvedPr }, '*');
                    }).catch(() => {
                        window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: null }, '*');
                    });
                } else if (attempts < 20) {
                    setTimeout(() => checkAndSend(attempts + 1), 250);
                } else {
                    window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: null }, '*');
                }
            };
            
            checkAndSend(0);
        }

        if (event.data.type === 'FORCE_LOAD_SUBTITLES') {
            const expectedVideoId = event.data.videoId;
            const player = document.getElementById('movie_player');
            if (player) {
                const videoData = player.getVideoData && player.getVideoData();
                if (videoData && expectedVideoId && videoData.video_id !== expectedVideoId) {
                    return;
                }

                const options = player.getOption && player.getOption('captions', 'tracklist');
                if (options && options.length > 0) {
                    const currentTrack = player.getOption('captions', 'track');
                    const targetLang = event.data.lang || (options[0] && options[0].languageCode);
                    const targetTrack = options.find(t => t.languageCode === targetLang) || options[0];

                    if (targetTrack) {
                        player.toggleSubtitlesOn && player.toggleSubtitlesOn();
                        player.setOption('captions', 'track', targetTrack);
                        
                        window._restoreCaptionTrack = () => {
                            if (!currentTrack || !currentTrack.languageCode) {
                                player.setOption('captions', 'track', {});
                                player.toggleSubtitlesOff && player.toggleSubtitlesOff();
                            } else {
                                player.setOption('captions', 'track', currentTrack);
                            }
                            window._restoreCaptionTrack = null;
                        };

                        setTimeout(() => {
                            if (window._restoreCaptionTrack) window._restoreCaptionTrack();
                        }, 10000);
                    }
                } else {
                    player.toggleSubtitlesOn && player.toggleSubtitlesOn();
                    window._restoreCaptionTrack = () => {
                        player.toggleSubtitlesOff && player.toggleSubtitlesOff();
                        window._restoreCaptionTrack = null;
                    };
                    setTimeout(() => {
                        if (window._restoreCaptionTrack) window._restoreCaptionTrack();
                    }, 10000);
                }
            }
        }

    });
})();
