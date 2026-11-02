# Google Drive synchronization setup

The application continues to work offline before Google authentication is configured.

1. Open https://console.cloud.google.com/ and create/select a Google Cloud project.
2. Enable **Google Drive API**.
3. Configure the **Google Auth Platform consent screen**. Select External for a personal Google account, and add your own Google address as a test user if in testing mode. Request only the scope `https://www.googleapis.com/auth/drive.file`. Verify any consent-screen restrictions applicable to Drive scopes before publishing beyond personal use.
4. Create an OAuth client with **Application type: Web application**. Add these **Authorized JavaScript origins**: `https://lazythomas.github.io`. Do not enter a path in the origin.
5. Copy the **OAuth client ID**, which ends in `.apps.googleusercontent.com`, into `config.js` as the value of `window.HABIT_GRID_GOOGLE_CLIENT_ID`.
6. Commit `config.js`. A browser OAuth client ID is public configuration, not a secret. Never commit OAuth client secrets, access tokens, refresh tokens, or passwords.
7. Let GitHub Pages deploy. Reload Habit Grid, select **Connect Google Drive**, grant permission, and repeat on your other Apple devices using the same Google account.

**Data:** A visible folder named `Habit Grid` is created in My Drive, containing one JSON snapshot per connected device. Each device merges versioned checkmarks and habit entries; latest timestamp wins when editing the same entry. Keep device clocks accurate.

**Important limitations:** The first sync creates cloud data; it does not migrate an arbitrary older Drive database. Offline changes sync when the app is open and online. Access tokens are kept in memory (not persisted); you may need to reconnect after reloading. Simultaneous conflicting changes to the exact same habit/day use a last-write-wins rule rather than user review. Deleting a JSON device file from Drive can remove data that exists only in that file. Google OAuth test-mode authorization and token restrictions may require periodic reauthentication. This is personal-use software and has not undergone an external security audit.
