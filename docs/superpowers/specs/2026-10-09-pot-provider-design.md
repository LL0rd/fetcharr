# PO-Token-Provider im Image

**Datum:** 2026-10-09 · **Status:** umgesetzt

## Problem

YouTube liefert Medien-Streams seit September 2026 nur noch mit Proof-of-Origin-Token (POT)
aus. Ohne Token endet jeder Download in `HTTP Error 403: Forbidden`, unabhängig von Client,
Proxy oder IP. yt-dlp kann Tokens nicht selbst erzeugen, sondern fragt dafür einen Provider
über sein PO-Token-Provider-Framework.

## Entscheidung

[bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider) (2.0.2)
wird fest ins Image gebaut:

- **Server** als dritter s6-Dienst `pot` neben `web` und `worker`: `node /app/pot/build/main.js`,
  gebunden an `127.0.0.1:4416` (der Default des Plugins, keine Konfiguration nötig). Läuft als
  `abc`. Der Worker hängt von `pot` ab, damit der erste Job den Server schon vorfindet.
- **Plugin** als Zip unter `/etc/yt-dlp/plugins/`, einem der systemweiten Plugin-Ordner, die
  auch die PyInstaller-Builds von yt-dlp laden. Damit nutzen Worker, Subscription-Check und
  der Probe-Endpunkt den Provider automatisch; kein `--extractor-args` nötig.
- **Build**: eigene Stage `pot` aus dem Release-Tarball, `npm ci` + `npx tsc`, danach
  `npm ci --omit=dev`; nur `build/`, `node_modules/`, `package.json` wandern ins Runtime-Image.
- **Proxy**: das Plugin reicht den Proxy des yt-dlp-Aufrufs an den Server durch; die
  Proxy-Liste aus den Settings gilt damit auch für die Token-Erzeugung.
- **Sichtbarkeit**: der Worker fragt beim Start `GET /ping` ab und loggt Version oder
  Nichterreichbarkeit. Fehlt der Server, laufen Downloads wie bisher (ohne Token).

Verworfen: separater Container (Unraid-Nutzer müssten zwei Container pflegen, Netzwerk
zwischen beiden ist eine Fehlerquelle); Script-Modus (spawnt pro Aufruf einen Node-Prozess,
schlechter Token-Cache).

## Altersbeschränkte Videos

Ohne Cookies gibt es nur einen Hebel: die Embed-Clients `tv_embedded,web_embedded`, die bei
einbettbaren Videos die Altersabfrage umgehen. Der Runner erkennt `Sign in to confirm your
age` im stderr des ersten Laufs und startet genau einen zweiten Lauf, in dem der
Client-Pin durch die Embed-Clients ersetzt ist. Scheitert auch der, bleibt der Fehler mit dem
Original-stderr stehen.

## Tests

- `packages/shared`: `isAgeRestricted`, `withAgeGateClients` (ersetzt den Pin, lässt andere
  Args stehen).
- `apps/worker`: Runner-Test mit `FAKE_AGE_GATE=1` (Fake-yt-dlp scheitert ohne Embed-Clients,
  liefert mit ihnen); `pot.test.ts` für den Startup-Ping.
- Docker-Build lokal plus Livetest auf 10.2.0.200.
