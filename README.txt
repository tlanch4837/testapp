Atlas Life — Presentation App (Pure HTML/CSS/JS)
=====================================================
Plug-and-play deck with persistent right panel and live plan recommender.

How to run
----------
1) Unzip this folder anywhere.
2) Open `index.html` in Chrome, Edge, or Firefox.
   - If the browser blocks local `fetch` for `file://`, the app auto-falls back
     to embedded JSON, so it still works offline.

Key features
------------
- Full-screen slides with keyboard nav (←/→, Space; Home/End).
- Bullet “builds” that reveal step-by-step.
- Persistent right-hand panel (20% width; on mobile becomes a fixed bottom sheet ~30% height).
- Live pricing math (Monthly/Annual) and Bronze/Silver/Gold recommender.
- Print to PDF cleanly (handout mode).
- No external CDNs.

Files
-----
- index.html
- styles.css
- app.js
- data/company.json
- data/conditions.json
- data/objections.json
- data/logo.svg
