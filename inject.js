// inject.js
// This script is injected into the main world to access YouTube's player variables directly,
// bypassing the isolated world restrictions of content scripts.

(function() {
    window.addEventListener('message', function(event) {
        // Only accept messages from the same frame and our specific event type
        if (event.source !== window || event.data.type !== 'GET_YT_PLAYER_RESPONSE') return;
        
        let pr = null;
        
        // 1. Try to get the player response from the movie_player element directly.
        // This is the most reliable way during SPA navigations.
        const player = document.getElementById('movie_player');
        if (player && player.getPlayerResponse) {
            pr = player.getPlayerResponse();
        } 
        // 2. Fallback to the global ytInitialPlayerResponse (usually only accurate on first load)
        else if (window.ytInitialPlayerResponse) {
            pr = window.ytInitialPlayerResponse;
        }
        
        // Send the data back to the content script safely, handling if it's a promise
        Promise.resolve(pr).then(resolvedPr => {
            window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: resolvedPr }, '*');
        }).catch(err => {
            window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: null }, '*');
        });
    });
})();
