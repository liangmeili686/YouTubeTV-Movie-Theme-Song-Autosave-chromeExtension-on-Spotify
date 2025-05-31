//import { chromeExtensionID, clientId } from './constants.js';
let handledMovies = [];

chrome.runtime.onInstalled.addListener(async () => {
    console.log("1");
    const manifest = chrome.runtime.getManifest();

    for (const cs of manifest.content_scripts) {
        const tabs = await chrome.tabs.query({ url: cs.matches });

        for (const tab of tabs) {
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                continue;
            }

            //inject content script
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: cs.js
            });

            //send orphan check event
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (id) => {
                    const event = new Event(`${id}-orphanCheck`);
                    window.dispatchEvent(event);
                },
                args: [chrome.runtime.id]
            });
        }
    }
    console.log("2");
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FETCH_WIKIPEDIA") {
        fetch(request.url)
            .then(res => res.text())
            .then(html => sendResponse({ html }))
            .catch(error => {
                console.error("Fetch failed:", error);
                sendResponse({ error: true });
            });

        // Must return true to allow async sendResponse
        return true;
    }

    if (request.type === "START_SPOTIFY_AUTH") {
        startSpotifyAuth();
    }
    
    if (request.type === "CHECK_MOVIE") {
        const alreadyHandled = handledMovies.includes(request.title);
        sendResponse({ handled: alreadyHandled });
        return true;
    }

    if (request.type === "MARK_MOVIE") {
        if (!handledMovies.includes(request.title)) {
            handledMovies.push(request.title);
        }
    }

    if (request.type === "GET_SPOTIFY_TOKEN") {
        getValidAccessToken().then(token => {
            sendResponse({ access_token: token });
        });
        return true;
    }

    /*
    if (request.type === "GET_PLAYLIST_ID") {
        sendResponse({ playlistID });
        return true;
    }
    */
    
});

const clientId = "YOUR CLIENT ID";
const chromeExtensionID = "CHROME EXTENSION ID";
const redirectUri = `https://${chromeExtensionID}.chromiumapp.org/callback`;
const scopes = 'playlist-modify-public user-read-private';

function generateCodeVerifier(length = 128) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let verifier = '';
    for (let i = 0; i < length; i++) {
        verifier += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    console.log("3");
    return verifier;
}

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    console.log("4");
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function startSpotifyAuth() {
    console.log("5, auth started");
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    chrome.storage.local.set({ verifier }, () => {
        const authUrl = `https://accounts.spotify.com/authorize?` +
            `client_id=${clientId}` +
            `&response_type=code` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&code_challenge_method=S256` +
            `&code_challenge=${challenge}`;
    
        chrome.identity.launchWebAuthFlow(
            { url: authUrl, interactive: true },
            async (redirectedTo) => {
                if (chrome.runtime.lastError) {
                    console.error("Auth error:", chrome.runtime.lastError);
                    return;
                }
    
                const urlParams = new URLSearchParams(new URL(redirectedTo).search);
                const authCode = urlParams.get('code');
                if (authCode) {
                    await exchangeToken(authCode);
                }
            }
        );
    });
    console.log("6");
}

async function exchangeToken(authCode) {
    console.log("7");
    chrome.storage.local.get("verifier", async (result) => {
        const verifier = result.verifier;

        const body = new URLSearchParams();
        body.append('client_id', clientId);
        body.append('grant_type', 'authorization_code');
        body.append('code', authCode);
        body.append('redirect_uri', redirectUri);
        body.append('code_verifier', verifier);

        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        const tokenResponse = await res.json();
        if (tokenResponse.access_token) {
            chrome.storage.local.set({
                access_token: tokenResponse.access_token,
                refresh_token: tokenResponse.refresh_token,
                expires_at: Date.now() + tokenResponse.expires_in * 1000
            });
            console.log("\ud83c\udf89 Spotify Access Token:", tokenResponse.access_token);
        } else {
            console.error("Token exchange failed:", tokenResponse);
        }
    });
    console.log("8");
}

async function getValidAccessToken() {
    console.log("9");
    return new Promise((resolve) => {
        chrome.storage.local.get(["access_token", "refresh_token", "expires_at"], async (tokens) => {
            if (tokens.access_token && Date.now() < tokens.expires_at) {
                console.log("Token is still valid");
                return resolve(tokens.access_token);
            }

            if (tokens.refresh_token) {
                console.log("Refreshing token...");
                const body = new URLSearchParams();
                body.append("grant_type", "refresh_token");
                body.append("refresh_token", tokens.refresh_token);
                body.append("client_id", clientId);

                try {
                    const res = await fetch("https://accounts.spotify.com/api/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body
                    });
                    const newTokens = await res.json();
                    if (newTokens.access_token) {
                        chrome.storage.local.set({
                            access_token: newTokens.access_token,
                            expires_at: Date.now() + newTokens.expires_in * 1000
                        });
                        return resolve(newTokens.access_token);
                    } else {
                        console.error("Refresh failed:", newTokens);
                        return resolve(null);
                    }
                } catch (err) {
                    console.error("Error refreshing token:", err);
                    return resolve(null);
                }
            }

            console.warn("No access or refresh token available");
            resolve(null);
        });
    });
}