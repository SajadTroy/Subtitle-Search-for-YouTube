(function() {
    window.addEventListener('message', function(event) {
        if (event.source !== window || event.data.type !== 'GET_YT_PLAYER_RESPONSE') return;
        
        let pr = null;
        
        const player = document.getElementById('movie_player');
        if (player && player.getPlayerResponse) {
            pr = player.getPlayerResponse();
        } 
        else if (window.ytInitialPlayerResponse) {
            pr = window.ytInitialPlayerResponse;
        }
        
        Promise.resolve(pr).then(resolvedPr => {
            window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: resolvedPr }, '*');
        }).catch(err => {
            window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: null }, '*');
        });
    });
})();
