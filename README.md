# Timer3

A clean, presentation-ready countdown timer for corporate training sessions, workshops, breaks, and exercises. It is the successor to [timer2](https://github.com/neiltucker/timer2), redesigned for projectors and large displays.

👉 **[🚀 Launch Live In-Browser Timer](https://neiltucker.github.io/timer3/)** (Runs instantly on any device)

It is a static site: no build step, no dependencies, and no network access needed at run time. It works offline from a USB stick in a training room.

---

## Features

- **Six countdown styles** (press `1`–`6` to switch):
  - **Ring**: a progress ring that drains as time passes.
  - **Digital**: large numerals with a progress bar.
  - **Flip clock**: split-flap cards that flip each second.
  - **Hourglass**: falling sand that piles up below.
  - **Liquid**: a tank of liquid with gentle waves and bubbles.
  - **Time disc**: a coloured sector that shrinks as time runs out.
- **Presets** from 1 minute to 1 hour, plus a custom minutes-and-seconds duration up to 12 hours.
- **Session title** shown above the timer, e.g. "Coffee break" or "Group exercise 2".
- **Adjust while running** with **+1 min** and **−1 min**.
- **\"Ends at\" clock time**, so the room knows when to be back.
- **Colour warnings**: amber when the warning threshold is reached (default 2 minutes), red for the last 30 seconds.
- **At zero**:
  - A gentle three-note chime.
  - An optional custom message, e.g. \"Please return to your seats\".
  - Optional overtime count (`+00:42`).
- **Optional soft ticks** during the final 10 seconds.
- **Presenter friendly**:
  - Full-screen mode (`F`).
  - Controls hide automatically while the timer runs.
  - The screen is kept awake while running.
- **Light and dark themes**, and six corporate accent colours.
- **Shareable links** that open with a preset duration, style, and title, e.g. `index.html?m=10&mode=hourglass&title=Coffee%20break`.
- **Accurate timing**: time is based on a target timestamp rather than a counting interval, so it never drifts and stays correct in background tabs.
- **Accessible**:
  - Full keyboard control.
  - Screen-reader announcements at milestones.
  - Respects the system \"reduce motion\" setting.
- **Settings are remembered** in the browser, in local storage.

---

## 🎓 Built for Trainers & Instructors

Created to support corporate technical training delivered by:
* **[Software Tutorial Services](https://www.softwaretutorialservices.com)** — Enterprise instructor-led technical training across Microsoft SQL Server, Azure Cloud, Windows Server, PowerShell, and Python.
* **[Courseware Studio](https://coursewarestudio.ai)** — AI-powered courseware generation platform producing accredited syllabi, student manuals, slide decks, and SCORM/xAPI packages.

### Related Free Tools for Trainers
* **[Markdown to SCORM](https://github.com/neiltucker/markdown-to-scorm)** — Compile raw markdown into SCORM 2004 LMS packages in your browser.
* **[SCORM & LMS Test Harness](https://github.com/neiltucker/scorm-lms-test-harness)** — Test SCORM packages locally without an LMS.
* **[Courseware Samples](https://github.com/neiltucker/courseware-samples)** — Download sample training manuals and syllabus proposals.

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Start / pause |
| `R` | Reset |
| `↑` / `↓` | Add / subtract one minute |
| `1`–`6` | Switch display style |
| `F` | Full screen |
| `T` | Light / dark theme |
| `M` | Sound on / off |
| `?` | Settings |

---

## Run it locally

**Option 1: open the file.** Double-click `index.html`. Everything works directly from disk.

**Option 2: use a local web server** (closest to how GitHub Pages serves it). Use either of these:

```bash
# Python 3
python -m http.server 8080

# or Node.js
nnpx serve .
```

Then open <http://localhost:8080> (or the URL `npx serve` prints).

> Browsers block audio until you interact with the page, so the chime is enabled when you first press **Start**. Use **Settings → Test chime** to check the volume in the room.

---

## URL parameters

| Parameter | Example | Meaning |
| --- | --- | --- |
| `m` | `m=10` | Minutes (decimals allowed, e.g. `m=1.5`) |
| `s` | `s=30` | Additional seconds |
| `mode` | `mode=flip` | `ring`, `digital`, `flip`, `hourglass`, `liquid`, `pie` |
| `title` | `title=Lunch` | Session title |
| `accent` | `accent=teal` | `blue`, `teal`, `indigo`, `emerald`, `slate`, `burgundy` |

---

## Project structure

```
index.html        Markup, settings dialog, and controls
css/styles.css    Theme tokens, layout, and styles for each display mode
js/modes.js       The six countdown visualizations
js/app.js         Timer engine, sound, settings, keyboard, and full screen
```

### Adding a display style

Add an object to `window.TimerModes` in `js/modes.js` with `id`, `name`, `icon` (SVG path markup) and `create(container)`. `create` returns `{ update(state), destroy() }`. `update` receives `{ remaining, duration, fraction, text, phase, level, sub }` every animation frame. Use `var(--state)` in CSS so the style follows the normal, warning and critical colours.
