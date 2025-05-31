# 🎬 ThemeSongFinder

Have you ever been touched by the songs from movies you've watched and wanted to add them to your Spotify playlist?

**ThemeSongFinder** is a Chrome extension that detects when you're watching a movie or TV show on YouTube TV and offers to add its theme song to your Spotify playlist — automatically and securely.

---

## Features

- ✅ Detects the title of the video on YouTube TV.
- ✅ Uses Wikipedia to check if the video is a movie, drama, or film.
- ✅ Authenticates securely with Spotify using the PKCE flow (no secrets exposed).
- ✅ Searches for the theme song on Spotify.
- ✅ Prompts the user to add the song to their playlist.

---

## Installation (Developer Mode)

1. Clone this repository.
2. Open [chrome://extensions/](chrome://extensions/) in Chrome.
3. Enable **Developer Mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. Make sure you've replaced your credentials to the corresponding ID variables in contentScript.js and background.js. There are 3 variables in total: playlistID is in contentScript.js, and chromeExtensionID and clientId is in background.js .

---

## How It Works

1. The content script detects video title and monitors playback time.
2. When the video has 5 minutes or less remaining:
   - Wikipedia is queried.
   - If it's a valid film/drama/etc, the extension fetches the theme song from Spotify.
   - A prompt asks if you’d like to add the song to your playlist.
3. All handled movies are stored in-memory (per session) to avoid duplicate prompts.

---

## Permissions Used

- `storage` – For storing Spotify tokens.
- `tabs` – To inject scripts into active video tabs.
- `scripting` – For programmatic script injection.
- `identity` – To authenticate with Spotify.
- `host_permissions` – To access YouTube, Wikipedia, and Spotify.

---

## 📁 File Structure

├── background.js
├── contentScript.js
├── manifest.json
├── constants.js # ← Not committed, holds sensitive keys
└── README.md

---

## ⚠️ Disclaimer

This project is for educational/demo purposes and is not affiliated with Spotify, YouTube, or Wikipedia.

---

## 🧑‍💻 Author

Built by ML ✨
Feel free to fork, improve, or reach out with suggestions!
