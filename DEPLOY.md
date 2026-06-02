# IM-PROVE — Deployment Guide
> Install your personal goals tracker on Mac and Samsung Android

---

## What's in the ZIP

```
improve-app/
├── index.html       ← Main app
├── app.js           ← All logic
├── sw.js            ← Service worker (offline support)
├── manifest.json    ← PWA config
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Option A — Host on GitHub Pages (FREE, recommended)

This is the easiest way to get a real URL you can install from on any device.

### Step 1: Create a GitHub account
Go to https://github.com and sign up (free).

### Step 2: Create a new repository
1. Click the **+** icon → **New repository**
2. Name it: `improve-app`
3. Set to **Public**
4. Click **Create repository**

### Step 3: Upload your files
1. Click **uploading an existing file**
2. Drag all files from the `improve-app/` folder (including the `icons/` subfolder)
3. Scroll down → click **Commit changes**

### Step 4: Enable GitHub Pages
1. Go to **Settings** → **Pages** (left sidebar)
2. Under "Source" select **Deploy from a branch**
3. Branch: `main` / Folder: `/ (root)` → click **Save**
4. Wait ~60 seconds, then your app is live at:
   `https://YOUR-USERNAME.github.io/improve-app/`

---

## Option B — Run locally with a simple server

If you want to test before hosting:

### Mac
Open Terminal and run:
```bash
cd ~/Downloads/improve-app
python3 -m http.server 8080
```
Then open: http://localhost:8080

### Windows
```bash
cd %USERPROFILE%\Downloads\improve-app
python -m http.server 8080
```

> ⚠️ You must use a server (not just open index.html directly) — service workers require HTTP/HTTPS.

---

## Installing on Mac (Safari)

Once your app is live at a URL:

1. Open **Safari** on your Mac
2. Go to your GitHub Pages URL
3. In the menu bar: **File → Add to Dock**
   *(or click the Share icon → "Add to Dock")*
4. Name it **IM-PROVE** → click **Add**
5. IM-PROVE now appears in your Dock and Launchpad like a native app

**Tip:** Safari on macOS Sonoma+ supports full PWA installation with offline mode. The app will open in its own window without browser chrome.

---

## Installing on Samsung Android (Chrome)

1. Open **Chrome** on your Samsung phone
2. Go to your GitHub Pages URL
3. Chrome will show a banner: **"Add IM-PROVE to Home screen"** → tap it
   *(If no banner: tap the 3-dot menu → "Add to Home screen")*
4. Tap **Add** on the confirmation dialog
5. IM-PROVE appears on your home screen with its own icon

**Enable notifications on Android:**
1. Open IM-PROVE from your home screen
2. Tap the 🔔 bell icon in the top right
3. Tap **Allow** when Chrome asks for permission
4. Your reminders are now active — they fire at the time you set for each goal

**Tip:** On Samsung, you can also go to Chrome Settings → "Install app" for a cleaner install experience.

---

## Enabling Real Reminders

The app stores reminder times per goal. On Android and Mac (Safari), browser notifications fire when:
- The app is open or running in the background
- You've tapped 🔔 and granted notification permission
- The current time matches your goal's reminder time (checked every minute)

For true background push notifications (fire even when app is closed), you'd need to host a small push notification server — ask Claude to help set that up if needed.

---

## Updating the App

When you want to update:
1. Edit the files locally
2. Go to your GitHub repository
3. Click a file → pencil icon to edit, or drag new files to upload
4. Commit the changes
5. GitHub Pages auto-deploys in ~30 seconds
6. On your device: open the app and pull to refresh (or close and reopen)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App doesn't install on Mac | Use Safari, not Chrome. Chrome on Mac doesn't support PWA install to Dock |
| "Add to Home screen" missing on Android | Make sure you're using Chrome (not Samsung Internet) and the site is HTTPS |
| Offline doesn't work | Visit the app once with internet so the service worker can cache files |
| Notifications don't fire | Grant notification permission via the 🔔 button; check your device's notification settings for Chrome |
| Data lost after update | Data is stored in localStorage — it persists through updates. Never cleared unless you clear browser data |

---

*IM-PROVE is a Progressive Web App — no App Store approval needed, no installation fee, works on any device with a modern browser.*
