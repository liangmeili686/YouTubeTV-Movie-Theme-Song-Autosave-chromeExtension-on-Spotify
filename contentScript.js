window.hasTriggered = false;
window.currentTitle = "";

//define a unique event name using the extension's runtime ID
const orphanCheckEvent = `${chrome.runtime.id}-orphanCheck`;

//function to unregister event listeners and clean up
function unregisterOrphan() {
    window.removeEventListener(orphanCheckEvent, unregisterOrphan);
}

//event listener for the orphan check event
window.addEventListener(orphanCheckEvent, unregisterOrphan);

//check if the movie's song has already been added to the playlist with a json-like feature, chrome storage 
function hasMovieBeenHandled(title) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "CHECK_MOVIE", title }, (response) => {
            resolve(response.handled);
        });
    });
}

//if not, add movie title into the storage
function markMovieAsHandled(title) {
    chrome.runtime.sendMessage({ type: "MARK_MOVIE", title });
}

//get Token when needed
function getSpotifyToken() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_SPOTIFY_TOKEN" }, (response) => {
            resolve(response);
        });
    });
}

//get playlist ID
/*
function getPlaylistID() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_PLAYLIST_ID" }, (response) => {
        resolve(response.playlistID);
        });
    });
}
*/

//get title
async function getCurrentTitle() {

    //if not in last five minutes, skip
    if(!getTimeInSeconds()){
        return;
    }

    //find title
    const titleElement = document.querySelector('.ypc-video-title-text');

    if (!titleElement) return;
    const title = titleElement.innerText.trim();

    if (window.currentTitle !== title) {
        console.log("🎬 New title detected:", title);
        window.currentTitle = title;
        window.hasTriggered = false; // Reset so prompt can happen again for new movie
    }

    await new Promise(resolve => setTimeout(resolve, 5000));

    const adDurationEl = document.querySelector('.ad-attribution .remaining-duration');
    const adTime = adDurationEl ? adDurationEl.textContent.trim() : "";

    if (adTime.length > 0) {
        console.log("Ad is currently playing — skipping!");
        return;
    }
    
    // Skip if same movie already triggered this session
    if (window.hasTriggered) {
        console.log("Already triggered for this session!");
        return;
    }
    
    // Skip if same movie was handled in the past
    const alreadyHandled = await hasMovieBeenHandled(title);
    if (alreadyHandled) {
        console.log("Movie already handled previously — skipping!");
        return;
    }

    //determine if the video is a movie
    const encodedTitle = title.replaceAll(" ", "_");
    const url = `https://en.wikipedia.org/w/index.php?search=${encodedTitle}`;

    chrome.runtime.sendMessage(
        {
            type: "FETCH_WIKIPEDIA",
            url: url
        },
        async (response) => {
            if (response?.error || !response?.html) {
            alert("Oop! It seems there are something wrong with searching on Wikipedia!");
            return;
            }

            const keywords = ["movie", "film", "drama"];
            const plainText = response.html.toLowerCase();

            const found = keywords.some(keyword => plainText.includes(keyword));
        
            if (found) {
                let tokenResponse = await getSpotifyToken();

                if (!tokenResponse || !tokenResponse.access_token) {
                    chrome.runtime.sendMessage({ type: "START_SPOTIFY_AUTH" });

                    // Wait for token to become available
                    for (let i = 0; i < 10; i++) { // Try for ~10 seconds
                        await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1s
                        tokenResponse = await getSpotifyToken();
                        if (tokenResponse && tokenResponse.access_token) break;
                    }

                    if (!tokenResponse || !tokenResponse.access_token) {
                        console.error("Still no token after waiting — exiting");
                        return;
                    }
                }

                const themeSong = await searchSpotifyTrack(title, tokenResponse.access_token);
                if (!themeSong) {
                    alert("No theme song found.");
                    return;
                }

                const userWantsToAdd = confirm(`🎵 Do you want to add "${themeSong.name}" to your Spotify playlist?`);
                if (userWantsToAdd) {

                    if (!tokenResponse.access_token) {
                        console.error("Token became undefined after user confirmation.");
                        return;
                    }

                    markMovieAsHandled(title);
                    await addSong(themeSong.uri, tokenResponse.access_token);
                    alert("✅ Added to playlist!");

                } else {
                    alert("You refused to add it to playlist!");
                }
                window.hasTriggered = true;
            }
        }
    );
}

//get current video's time, and only pop up window when there's 5 minutes or less left
function getTimeInSeconds() {
    const currentTime = document.querySelector(".ypmcs-control .current-time");
    const totalTime = document.querySelector(".ypmcs-control .duration");
    
    /*
    const currentTime = getVisibleText("span.current-time");
    const totalTime = getVisibleText("span.duration");
    */
    if(!currentTime || !totalTime){
        return;
    }

    //find time for current moment and total duration
    const partsCurrent = currentTime.textContent.split(":").map(Number).reverse();
    // duration time in YT has optional symbol /
    const partsTotal = totalTime.textContent.replace(/^\s*\/?\s*/, "").trim().split(":").map(Number).reverse();
    

    let secondsC = 0;
    let secondsT = 0;
    if (partsCurrent.length > 0) secondsC += partsCurrent[0];
    if (partsCurrent.length > 1) secondsC += partsCurrent[1] * 60;
    if (partsCurrent.length > 2) secondsC += partsCurrent[2] * 3600;

    if (partsTotal.length > 0) secondsT += partsTotal[0];
    if (partsTotal.length > 1) secondsT += partsTotal[1] * 60;
    if (partsTotal.length > 2) secondsT += partsTotal[2] * 3600;

    //if duration time is too short, skip because it is probably an ad
    if(secondsT <= 120){
        return false;
    }

    //calculating remaining time
    const remaining = secondsT - secondsC;

    if (remaining <= 300) {
        return true;
    } else {
        return false;
    }
}

//find song name
async function searchSpotifyTrack(title, accessToken) {
    
    const query = `${title} theme`; // or `${title} soundtrack`
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`;

    const res = await fetch(url, {
        headers: {
        'Authorization': `Bearer ${accessToken}`
        }
    });

    const data = await res.json();
    if (data.tracks && data.tracks.items.length > 0) {
        const track = data.tracks.items[0];
      return {name: track.name, uri: track.uri}; // Use this to add to playlist
    } else {
        console.log("No track found!");
        return null;
    }
}

//add song into spotify playlist
async function addSong(songURI, accessToken) {
    // const playlistID = await getPlaylistID();
    const playlistID = "YOUR PLAYLIST ID";

    const playlist = await fetch(`https://api.spotify.com/v1/playlists/${playlistID}/tracks`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            uris: [songURI],
            position: 0
        })
    });

    return playlist;
}


//wait for DOM and ad to be ready
function getCurrentTitleDelayed() {
    setTimeout(() => {
        getCurrentTitle();

        // Start interval only after initial delay
        if (!window.timer) {
            window.timer = setInterval(getCurrentTitle, 10000);
        }

        window.addEventListener("unload", () => {
            if (window.timer) {
                clearInterval(window.timer);
                window.timer = null;
            }
        });
    }, 5000);
}

function waitForDOMAndRun(retries = 10) {
    const titleElement = document.querySelector('.ypc-video-title-text');
    const timeNow = document.querySelector('.ypmcs-control .current-time');
    const timeTotal = document.querySelector('.ypmcs-control .duration');

    if (titleElement && timeNow && timeTotal) {
        getCurrentTitleDelayed();
    } else if (retries > 0) {
        console.log("DOM not ready yet, retrying...");
        setTimeout(() => waitForDOMAndRun(retries - 1), 500);
    } else {
        console.log("DOM elements not found after retries. Probably not on video page!");
    }
}

// Run this as soon as the script is injected
waitForDOMAndRun();

if (!window.lastTitle) {
    window.lastTitle = "";
}

if (window.observer) {
    window.observer.disconnect();
}

window.observer = new MutationObserver(() => {
    const titleElement = document.querySelector('.ypc-video-title-text');
    const newTitle = titleElement?.innerText?.trim();

    if (newTitle && newTitle !== window.lastTitle) {
        window.lastTitle = newTitle;
        window.hasTriggered = false;
        window.currentTitle = newTitle;
        getCurrentTitle();
    }
});

window.observer.observe(document.body, {
    childList: true,
    subtree: true,
});

