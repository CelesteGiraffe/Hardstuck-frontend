# Project Notes – Hardstuck — Rocket League Training Journal

### Purpose
This project is a Rocket League training journal that tracks:
- the skills I practise,
- the routines and timers I use,
- the details of each training session,
- and my real in-game MMR via a BakkesMod plugin.

The idea is similar to a weight journal:
- training = exercise,
- timers = workout structure,
- MMR = the scale,
- charts = visual progress.

The goal is to understand how my practice sessions relate to my competitive results.

---

### High-Level Structure
The project is split into three simple, understandable parts:

1. **API (Node + SQLite)**
   - Local-only REST API.
   - Stores skills, presets, sessions, and MMR logs.
   - Designed to stay small and easy to maintain.

2. **UI (Svelte + TypeScript)**
   - Browser-based interface.
   - Allows me to build presets, run timers, take notes, and view training history.
   - Only communicates with the API for data.

3. **BakkesMod Plugin**
   - Written in C++ for BakkesMod.
   - After each match, it posts the current MMR and playlist to the API.
   - Provides automatic “weigh-in” data.

---

### Core Concept
The app behaves like a fitness journal:
- **Skills** = exercises.
- **Timer presets** = workout routines.
- **Training sessions** = logged workouts.
- **MMR logs** = weigh-ins recorded automatically.
- **Charts** = progress visualisation.

My training time (“input”) is compared to my MMR trend (“output”) to help me stay consistent.

---

### Goals for the Project
- Keep the entire system readable and maintainable.
- Avoid frameworks that generate a huge number of files.
- Remain fully offline and local.
- Make expansion possible later without rewriting the base.

---

### What is *not* included (on purpose)
- No cloud syncing.
- No user accounts.
- No online features.
- No complex UI framework layers.
- No heavy configuration systems.

This is meant to be simple, fast, and controlled by me.

---

### End State (Definition of Done)
A working tool where I can:
- Manage skills and categories.
- Create training presets.
- Run timers and record actual time + notes.
- Automatically ingest MMR from BakkesMod.
- View charts for:
  - training time per skill,
  - MMR trend over time,
  - basic correlations.

The project stays modular, clean, and built around the principle: *keep it simple and understandable*.
