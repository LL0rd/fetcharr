# Fetcharr — Design

**Datum:** 2026-08-19
**Status:** Entwurf zur Review

Selbst-gehosteter Medien-Downloader auf yt-dlp-Basis — Nachfolger von YoutubeDL-Material mit modernem Stack, als einzelner Docker-Container optimiert für Unraid.

## Ziele

- Funktionaler Ersatz für YoutubeDL-Material im Umfang „Kern + Medienserver-Fokus"
- Ein Container, eine Portfreigabe, Unraid-Community-Applications-tauglich
- Bibliothek direkt konsumierbar durch Jellyfin/Plex (NFO, Thumbnails, saubere Ordner)
- Single-User (ein Admin), API-Key für Automationen

**Nicht-Ziele:** Multi-User/Rollen/LDAP, Twitch-Chat-Download, öffentliche Sharing-Links, Watch-Together (Concurrent Streams), MongoDB, YouTube-API-Suche, Browser-Extension (ersetzt durch PWA Share Target), Self-Updater im Container (Update via Unraid/Watchtower).

## Stack

| Schicht | Technologie |
|---|---|
| Frontend | Nuxt 4 (Vue 3, TypeScript), eigene Komponenten nach dem „Modernist"-Designsystem (siehe UI-Design), PWA (@vite-pwa/nuxt) |
| API | Nitro/H3-Routes (`/api/*`), Zod-Validierung, OpenAPI-Generierung + Swagger-UI unter `/api/docs` |
| Worker | Eigener Node-22-Prozess (TypeScript), Queue-Consumer + Scheduler (croner) |
| Prozess-Supervision | s6-overlay: startet Nuxt + Worker, Signal-Handling, Auto-Restart |
| DB | SQLite (better-sqlite3, WAL) + Drizzle ORM, Migrations via drizzle-kit |
| Monorepo | pnpm-Workspaces: `apps/web`, `apps/worker`, `packages/db`, `packages/shared` |
| Live-Updates | SSE (Nuxt → Browser) für Queue-/Task-/Subscription-Status |
| Binaries | yt-dlp: Auto-Update zur Laufzeit nach `/config/bin`; ffmpeg/ffprobe + deno im Image |
| Tests | Vitest (Worker-Logik, API-Routes), yt-dlp gemockt |
| i18n | @nuxtjs/i18n, Start: Deutsch + Englisch |

## UI-Design

Referenz-Mockup in Claude Design erstellt: Projekt `c6d71759-a5f7-4d5e-b69e-96a742bb69a0` (`Fetcharr.dc.html`). Lokale Kopie: `docs/design/Fetcharr.dc.html` + `docs/design/styles.css` + `docs/design/design-system.md`. Das Mockup ist die verbindliche Referenz für Layout, Zustände und Wording der abgedeckten Screens.

**Designsystem „Modernist":** flat, architektonisch, Archivo (Heading 800/Body 400), **0px Radius**, starke 2px-Divider, Ground #f3f2f2, ein Akzent #ec3013, OKLCH-Ramps 100–900, Lucide-Icons, Monospace für technische Werte (Args, Cron, IDs, Größen). Buttons/Labels flush left. Tokens/Klassen aus `styles.css` übernehmen (btn/tag/field/input/seg/card/table/dialog) — kein UI-Framework-Standardlook; statt Nuxt UI werden eigene schlanke Komponenten auf diesen Klassen gebaut (Headless-Verhalten wo nötig via reka-ui).

**Screens im Mockup:**
- **Auth:** First-run-Setup (Passwort min. 12 Zeichen, wiederholen) / Login — Umschalter, Karte zentriert
- **App-Rahmen:** Sidebar (Default; Topbar als Variante) mit Nav Queue (Badge = aktive Jobs)/Library/Subscriptions/Tasks/Storage/Settings, Footer mit App- und yt-dlp-Version, „new image available"-Tag, Sign out. Header: URL-Eingabe + „Fetch", Link `/api/docs`, Notification-Glocke mit Ungelesen-Zähler und Dropdown
- **Add-Download-Dialog (Probe):** Thumbnail + Metadaten, Format-Segmente (best/1080p/720p/audio), aufklappbares Advanced (Custom Args, Output-Template, Crop Start/Ende, Zielordner, SponsorBlock remove/mark/off), **Args-Preview live**, „Add to queue"
- **Queue:** Tabelle (Default; Karten-Variante), Spalten Status-Punkt/Titel+Kanal/Format/Progress+%/Speed/ETA/Size/Priority (manual/bulk/subscription)/Aktionen (Pause/Resume/Retry/Cancel); Zeile expandierbar → generierte Args, stderr mit Versuchszähler, uid/Erstellzeit/Zielpfad; Kopf: Zusammenfassung, Pause all, Clear finished
- **Library:** Grid (Default) / Liste, Suche, Filter All/Video/Audio/Favs, Sortierung Date/Title/Size, Favoriten-Stern, Dauer-Badge auf Thumbnail
- **Subscriptions:** Tabelle Name (+paused/RSS-Tags)/Typ (channel/playlist/generic)/Cron/Qualität/Letzter Check/Archiv-Zähler/Aktionen (Check now, Edit), „Add subscription"
- **Tasks:** wie spezifiziert, inkl. Confirm-Button mit Zähler („Confirm: delete 3"), Status-Tags (ok/idle/confirming/auto_confirm), „Reset stuck tasks"
- **Storage:** Stat-Kacheln Used/Free/Files/Bytes today; Balken-Liste mit Tabs By channel/By subscription/By type (inkl. „Livestream recordings")
- **Settings:** Tabs Downloader (Output-Template, Max parallel, Rate limit, Default-Format, SponsorBlock-Default), Extra (Toggles: NFO, Thumbnails, Sidecar-JSON, Podcast-RSS, View counter & resume positions), API (API-Key + Regenerate, Endpoint-Übersicht), Subscriptions (Default-Cron, Default-Qualität, Redownload fresh uploads, Record livestreams), Advanced (globale Args, Custom User-Agent, Cookies-Dropzone, Log level)
- **Notifications:** eigene Seite + Glocken-Dropdown, Mark all read

**Aus dem Mockup in die Spec übernommene Festlegungen:** Passwort-Mindestlänge 12; Default-Output-Template `/downloads/%(uploader)s/%(title)s [%(id)s].%(ext)s`; Queue-Badge in der Nav; Fehler-Hinweis bei bekannten yt-dlp-Fehlerklassen direkt im stderr-Panel („run the Update yt-dlp task"); View-Counter/Resume-Positionen als abschaltbares Feature; „new image available" in der Sidebar.

**Im Mockup nicht enthalten (gilt trotzdem, Design folgt dem System):** Player-Ansicht, Playlists & Kategorien, Archiv-Verwaltung, Logs-Viewer, Bulk-Import-Dialog, Notification-Kanal-Einstellungen (ntfy/Gotify/Discord/Webhook — im Mockup nur als Fußnote referenziert), Subscription-Edit-Dialog, PWA-Share-Target-Flow.

**Abweichung vom Mockup:** Das Mockup ist Light-only. Umsetzung liefert zusätzlich eine Dark-Variante über die Token-Ebene (gleiche Ramps, invertierter Ground), Umschaltung per prefers-color-scheme + manueller Toggle.

### Prozessmodell & IPC

Zwei Prozesse, ein Container. Kommunikation ausschließlich über SQLite:

- **Nuxt (UI + API):** legt Jobs an, liest Status, streamt Änderungen per SSE (in-process DB-Polling, gedrosselt).
- **Worker:** pollt `jobs` (500 ms), claimt atomar (`UPDATE … WHERE status='queued' RETURNING`), spawnt yt-dlp-Child-Prozesse, schreibt Progress (max. 1×/s) zurück. Führt Scheduler aus (Subscription-Checks, Tasks).
- Crash-Recovery: Beim Worker-Start werden Jobs mit `status='running'` auf `queued` zurückgesetzt; Tasks mit `running`-Flag werden zurückgesetzt.
- SQLite im WAL-Modus verkraftet zwei schreibende Prozesse; alle Schreibzugriffe laufen über kurze Transaktionen.

## Datenmodell (Drizzle, Auszug)

- `settings` — Key-Value, ersetzt config.json; Kategorien wie im Original (Downloader, Extra, API, Subscriptions, Advanced)
- `files` — Medien: uid, url, title, uploader, duration, Dateipfad, Typ (video/audio), Größe, Thumbnail, upload_date, sub_id?, category_id?, favorite, view_count, sponsorblock-Flags, Metadaten-JSON
- `jobs` — Queue: uid, url, type, options-JSON, status (queued/running/paused/finished/errored/cancelled), priority, progress (%/Speed/ETA/Bytes), stderr-Log, attempts/max_attempts, sub_id?, created/started/finished
- `subscriptions` — url, name, type (channel/playlist/generic), Intervall (Cron), paused, timerange, Titel-Regex, max. Qualität, custom args/output, sponsorblock, record_livestreams, eigene Archivnutzung
- `archive` — extractor, media_id, type, sub_id?, title, Zeitstempel (ersetzt archive.txt-Dateien; Export/Import ins yt-dlp-Format)
- `playlists` — manuell: name, uids[], Dauer
- `categories` — name, Auto-Regeln (Feld/Operator/Wert), Priorität
- `tasks` — key, schedule-JSON, options-JSON, running/confirming, last_ran, last_confirmed
- `task_runs` — Historie: task_key, Start/Dauer, Ergebnis-Zusammenfassung, Fehler
- `notifications` — In-App: Typ, Titel, Body, url, read, Zeitstempel
- `auth` — Admin-Passwort-Hash (argon2), API-Key, Session-Secrets

## Features

### Download

- URL(s) einwerfen → Format-Probe (verfügbare Qualitäten Video/Audio), Auswahl oder „beste"
- Audio-Only: MP3/M4A-Extraktion mit ID3-Tags/Cover
- Playlist-/Kanal-URLs: Erkennung, Einzeljobs pro Video
- Bulk-Import: viele URLs (Textfeld/Datei-Upload) als Batch mit niedrigerer Priorität
- Pro Download: Custom Args, Custom Output-Template, Crop (Start/Ende via ffmpeg), SponsorBlock (remove/mark/aus), Zielordner
- Args-Preview: zeigt generierte yt-dlp-Args vor dem Start
- Livestream-Aufnahme: laufende Streams mit `--live-from-start`
- Globale Settings: Default-Output-Template, globale Args, Rate-Limit, max. parallele Downloads, Cookies (Upload-UI), Custom User-Agent

### Queue-Manager

- Live-Ansicht (SSE): Fortschritt, Speed, ETA, Dateigröße
- Pause/Resume/Cancel/Retry pro Job und global; Clear finished
- Priorisierung: manuell > Bulk > Subscription
- Fehlerhafte Jobs: stderr einsehbar, Retry mit Backoff (attempts/max_attempts)

### Bibliothek

- Grid/Liste, Suche, Filter (Typ, Quelle/Kanal, Subscription, Kategorie, Favoriten), Sortierung (Datum, Titel, Dauer, Größe, Views)
- HTML5-Player mit Range-Streaming, Thumbnails/Poster, Weiterschauen-Position
- Favoriten, View-Counter
- Aktionen: Löschen (Datei+DB, optional mit Archiv-Blacklist), Umbenennen, in Playlist/Kategorie schieben, ZIP-Download mehrerer Dateien
- Playlists (manuell) und Kategorien (Auto-Regeln, z. B. „uploader enthält X → Kategorie Y")
- Ordnerstruktur: `/downloads/video/<Kanal>/…`, `/downloads/audio/…`, `/downloads/subscriptions/<Sub>/…`

### Subscriptions

- Kanäle/Playlists (YouTube u. a.) + generische yt-dlp-URLs
- Pro Sub: Check-Intervall (Cron), paused, Titel-Regex, timerange (nur Videos ab Datum), max. Qualität, Typ video/audio, Custom Args/Output, SponsorBlock, Livestream-Mitschnitt, redownload_fresh_uploads
- yt-dlp-Archiv pro Subscription (DB-basiert, Export als archive.txt)
- Manueller „Jetzt prüfen"-Button, Check-Cancel, Lauf-Historie

### Medienserver-Integration

- NFO-Dateien (Jellyfin/Kodi-Schema), Thumbnails, Sidecar-Metadata-JSON
- Podcast-RSS-Feed pro Audio-Subscription (abonnierbar, mit API-Key-Token)

### Archiv-Verwaltung

- UI: Einträge durchsuchen/löschen (= erneuter Download möglich), Import bestehender archive.txt, Export ins yt-dlp-Format

### Tasks & Wartung

Tabelle im UI: Titel, letzter Lauf, letzte Bestätigung, Status/Zeitplan, Aktionen (Jetzt ausführen / Zeitplan / Optionen). Zweiphasiges Modell: `run` (prüfen/sammeln) → `confirm` (destruktive Aktion), optional `auto_confirm`.

| Task | Run | Confirm | Optionen |
|---|---|---|---|
| Backup DB | `VACUUM INTO` nach `/config/backups/` (+ Settings/Cookies) | – | Aufbewahrungsanzahl |
| Missing files check | DB-Einträge ohne Datei finden | Einträge löschen | auto_confirm |
| Import missing DB records | `/downloads` nach unbekannten Dateien scannen, Import inkl. Sidecar/ffprobe | – | – |
| Find duplicate files | Duplikate (URL/Hash) finden | Duplikate entfernen | auto_confirm |
| Update yt-dlp | Versions-Check | Binary nach `/config/bin` laden | auto_confirm (Default an, nightly) |
| Delete old files | Dateien älter X Tage listen | löschen (Datei+DB) | threshold_days, Ausnahmen Favoriten/Subs |
| Rebuild database | – | DB aus Dateisystem neu aufbauen (Auto-Backup vorher) | – |
| Import aus YoutubeDL-Material | Alt-Instanz analysieren (local_db.json, Archive, Medien) | Übernahme nach Fetcharr | Pfad zur Alt-Instanz |

- Scheduler im Worker (croner), TZ-aware; einmalig (Timestamp) oder wiederkehrend (Wochentage+Uhrzeit); laufender Task wird bei Trigger übersprungen
- Task-Historie (`task_runs`) im UI einsehbar
- Restore DB from backup (mit Neustart), Reset tasks (hängende Flags zurücksetzen)

### Notifications

- **In-App:** Notification-Center (Glocke, ungelesen-Zähler): Download fertig/fehlgeschlagen, Subscription-Funde, Task-Ergebnisse
- **Extern:** ntfy, Gotify, Discord-Webhook, generischer Webhook; pro Ereignistyp aktivierbar

### Monitoring & System

- `/api/health` (Healthcheck für Docker/Unraid)
- `/metrics` (Prometheus): Queue-Länge, Downloads Erfolg/Fehler gesamt, aktive Downloads, Bytes geladen, Speicher pro Subscription, yt-dlp-Version
- Storage-Dashboard in der UI: Plattenplatz pro Kanal/Subscription/Typ, sortierbar
- Logs-Viewer (Worker + Web, strukturiert via pino), Log-Level einstellbar
- Versions-Check gegen Container-Registry: Hinweis „neues Image verfügbar"

### Auth & API

- Erststart: Admin-Passwort setzen (Setup-Screen)
- Session-Cookie (sealed, h3 `useSession`; Session-Secret wird beim ersten Start generiert und als Datei in `/config` persistiert), argon2-Hash (`@node-rs/argon2`)
- Ein API-Key (`?apiKey=` oder Header) für Automationen; regenerierbar
- OpenAPI-Spec aus Zod-Schemas generiert, Swagger-UI unter `/api/docs`

### PWA / Share Target

- Installierbare PWA; Android/Desktop: „Teilen → Fetcharr" öffnet Download-Dialog mit vorausgefüllter URL
- Bookmarklet als Fallback für Desktop-Browser

## Docker & Unraid

- Basis `node:22-bookworm-slim` (glibc wegen deno), Multi-Stage, Ziel < 400 MB
- Im Image: ffmpeg/ffprobe (static), deno (JS-Runtime für yt-dlp, außer armv7), atomicparsley
- yt-dlp wird zur Laufzeit nach `/config/bin` geladen/aktualisiert (Container-Rebuild-frei)
- s6-overlay: Prozess 1 Nuxt, Prozess 2 Worker; sauberes SIGTERM-Handling (laufende Downloads → Job zurück auf queued)
- Envs: `PUID`, `PGID`, `TZ`, `UMASK` (linuxserver.io-Konvention)
- Volumes: `/config` (DB, Settings, Backups, Cookies, yt-dlp), `/downloads` (Medien); ein Port (3000)
- Healthcheck im Image; Unraid-Template-XML + Icon im Repo (Community Applications)
- CI: GitHub Actions, Build amd64+arm64, Push ghcr.io, Release-Tags + `latest`

## Fehlerbehandlung

- Jobs: attempts/max_attempts mit Exponential-Backoff; stderr pro Job gespeichert und in UI anzeigbar
- Worker-Crash: s6 restartet; running-Jobs werden requeued (Archiv verhindert Doppel-Downloads)
- yt-dlp-Ausfall (Site-Änderungen): Fehlerklasse erkannt → Hinweis „yt-dlp-Update ausführen" in Notification
- DB-Migrationen laufen beim Start (drizzle-kit), Backup vor Migration
- Downloads schreiben erst in `<ziel>/.tmp/`, Move nach Erfolg (keine halben Dateien in Jellyfin)

## Teststrategie

- Vitest: Queue-Claiming (Nebenläufigkeit), Args-Generator (Matrix aus Optionen), yt-dlp-Output-Parser, Archiv-Logik, Auto-Kategorisierung, Cron-Berechnung — yt-dlp als Mock (fixture JSONs)
- API-Route-Tests gegen In-Memory-SQLite
- Ein E2E-Smoke-Test im CI: Container bauen, starten, Health + Login + Fake-Download (yt-dlp-Stub)
