# TimeCraft

**Offline School Timetable & Fixture Manager**  
Developed by **Tammarjan** · Developer: **Tammarjan94@gmail.com**

TimeCraft is a lightweight, Android-first school timetable and substitute-fixture manager. It is designed to work offline after the app files have been installed.

## Current build
This repository is the source of TimeCraft. The first implementation focuses on:
- Local school, teacher, class and subject records
- Weekly timetable generation with teacher/class clash prevention
- Manual timetable editing
- Substitute fixture assignment with eligibility, availability and workload checks
- Local backup and restore
- Installable offline PWA shell

## Privacy and storage
Operational data stays in the browser's local IndexedDB database. There is no cloud account, analytics, tracking, or server-side database in this version. Export a backup regularly; clearing browser/app storage or uninstalling the app can remove local data.

## Run
Open `index.html` in a modern browser for development. For installation and reliable offline caching, serve the repository over HTTPS (for example, GitHub Pages). The app itself does not need a network connection after its first successful load.

## Copyright
Copyright (c) 2026 Tammarjan. All rights reserved.  
Developer contact: Tammarjan94@gmail.com

This source is published for review and personal use by its owner. No permission is granted to copy, redistribute, modify, sublicense, or commercially exploit it without prior written permission from the copyright holder. See [LICENSE](LICENSE).

## Important
A backup file is not a sync service. Keep copies somewhere safe, especially before changing phones or reinstalling the app.
