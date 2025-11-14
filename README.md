# Rocket League Training Journal

A local-first Rocket League training journal that combines:
- structured practice timers,
- skill tracking,
- training session logs,
- and automatic MMR updates from a BakkesMod plugin.

The goal is to treat Rocket League improvement like a fitness program: track training (input) and compare it to ranked results (output).

---

## Overview

This project consists of three main parts:

### 1. Local API (Node + SQLite)
- Stores all persistent data.
- Exposes simple REST endpoints for:
  - skills,
  - timer presets,
  - training sessions,
  - MMR logs.
  - aggregated skill summaries for charting (e.g., minutes per skill over a date range).
- Designed to be small and easy to understand.

### 2. Front-End UI (Svelte + TypeScript)
- Runs in the browser.
- Allows me to:
  - create and edit skills,
  - build preset training routines,
  - run timed training sessions with notes,
  - review history,
  - view charts connecting training to MMR performance.

### 3. BakkesMod Plugin (C++)
- Sends MMR snapshots to the API after matches.
- Provides accurate, automatic “weigh-in” records.
- Helps correlate training with real competitive results.

---

## Philosophy
Keep the system:
- local,
- simple,
- modular,
- and fully understandable by me.

Avoid unnecessary frameworks, generated file forests, or cloud dependencies. Everything should feel lightweight and easy to maintain.

---

## Features (Planned or Completed)

### Training Features
- Create and manage skills.
- Build timer presets with blocks (focus time, rest time, VOD review, etc.).
- Start a preset from the Home screen and let the timer guide you through each block.
- Run training sessions with a live timer and block-by-block notes.
- Log all actual durations and session notes.

### MMR Tracking
- Automatic MMR logging from BakkesMod plugin.
- Manual MMR logging if needed.
- SQLite storage for all match results.

### Analytics
- Time spent per skill (bar charts).
- Overall training volume over time.
- MMR trends per playlist (line charts).
- Basic comparison of training vs performance.

---

## Folder Structure

This repo includes:
- an `api/` folder for the Node + SQLite server,
- a `ui/` folder for the Svelte front-end,
- space reserved for a `bakkes_plugin/` folder containing the eventual C++ plugin code.

Each part is kept small and isolated so the project is easy to maintain.

---

## Getting Started

1. Start the API:
   - navigate to `api/`
   - install dependencies
   - run the server on localhost

2. Start the UI:
   - navigate to `ui/`
   - install dependencies
   - run the dev server in a browser

3. (Later) Enable the BakkesMod plugin to start sending MMR logs automatically.

---

## License
Local personal project — no license required unless I add one later.