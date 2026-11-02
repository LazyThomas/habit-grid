# Habit Grid

Personal iPhone-friendly habit tracker with a swipeable month-by-day grid, checkmarks, habit editing, and monthly totals.

## Publish on GitHub Pages
Open **Settings → Pages**. Select **Deploy from a branch**, branch **main**, folder **/(root)**, and save. After GitHub confirms deployment, open https://lazythomas.github.io/habit-grid/.

## Install on iPhone
Open the published site in Safari, tap **Share → Add to Home Screen**.

## Data and sync
This deployed version currently stores checkmarks locally on each device. It does **not** sync between iPhone and Mac yet. The previous v1.1 ZIP contains an optional Supabase sync client, which still needs cloud-project/database configuration and deployment. Never commit service-role keys or passwords. Clearing local browser data may erase your habits.

## Scope
Monthly grid, touch checkmarks, add/edit/delete habits, month navigation, and completion totals. Yearly overview is intentionally deferred.
