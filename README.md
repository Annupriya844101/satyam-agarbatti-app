# Satyam Agarbatti – order and dispatch app

Works offline. All data stays on the phone. First login: **admin / admin123** (the app makes you change it).

## Get the APK (pick one)

**A. GitHub, no installs on your PC (easiest)**
1. Create a free GitHub account and a new private repository.
2. Upload everything in this folder (keep the `.github` folder).
3. Open the repository's **Actions** tab, choose **Build Android APK**, press **Run workflow**.
4. After about 5 minutes, open the finished run and download **satyam-agarbatti-apk**. Unzip it and send `app-debug.apk` to the phone.
5. On the phone, open the file and allow "Install unknown apps" when asked.

**B. On your own PC** (needs Node.js 20, JDK 17, Android Studio)
```
npm install
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```
The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

**C. No build at all:** open `satyam-agarbatti.html` in Chrome on the phone, then menu → Add to Home screen.

## Changing the app
Edit files in `www/` (`js/logic.js` holds the business rules, `js/app.js` the screens), then rebuild. Run `python3 build_single_file.py` to refresh the single-file version.
