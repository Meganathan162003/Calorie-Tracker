# kcal – Calorie Tracker

A simple, mobile-first calorie and protein tracker built with plain HTML, CSS and JavaScript.
No frameworks, no server, no internet connection needed.

## Run it
1. Keep `index.html`, `style.css` and `script.js` in the same folder.
2. Double-click `index.html` (or open it in any modern browser).

## Use it
- **Home** – calorie ring, a Quick add form that saves foods as permanent one-tap buttons you can drag (press and hold on touch screens) to reorder, protein and calorie progress bars, and a table of today's food with totals.
- **Food** – add a food with its name, calories and protein; edit, duplicate or delete entries; search entries by name; pick any date.
- **History** – browse any date, see the 7-day calorie chart, average calories and daily goal status.
- **Settings** – change the calorie and protein goals and the light/dark theme. Export or import a JSON backup, or clear all data.

Data is saved in your browser's localStorage (key `thali.calorieTracker.v1`).

## Put it on your phone's home screen
The home-screen icon comes from `manifest.webmanifest` and the PNG files in `icons/`, so keep those with `index.html`.
Phones only treat the app as installable when it is served over **https** (for example Netlify, GitHub Pages or Cloudflare Pages) – opening the file straight from storage cannot install it.
After uploading the whole folder, open the https link in Chrome → ⋮ → *Install app* / *Add to Home screen*.
Icons are saved when you add the shortcut, so **delete the old shortcut and add it again** after changing the logo.
