# Modernist design system (Kurzreferenz)

**Mockup lokal ansehen:** `python3 -m http.server` in diesem Ordner, dann `http://localhost:8000/Fetcharr.dc.html` (braucht Internet — `support.js` lädt React/Babel von unpkg). Interaktiv: alle Screens über die Sidebar, Add-Download-Dialog über den Fetch-Button.

Quelle: Claude-Design-Projekt `c6d71759-a5f7-4d5e-b69e-96a742bb69a0`, DS `modernist-039253e9`.

Flat, architektonisch, komplett in Archivo: Rot auf Weiß, sichtbares Raster, **0px Corner-Radius**, starke 2px-Linien. Nichts schwebt, nichts ist dekoriert — Ausrichtung und Divider organisieren alles; Labels sitzen flush left (auch in Buttons), Fotos in Schwarz-Weiß (.grayscale).

- Ground `--color-bg` #f3f2f2, Text #201e1d, ein Akzent **#ec3013**; Neutral- und Akzent-Ramps 100–900 (OKLCH, gleiche Lightness-Skala)
- Font: Archivo (Heading 800, Body 400), Monospace für technische Werte (Args, Cron, IDs, Größen)
- Komponenten: .btn (primary/secondary/ghost/icon/block), .tag, .field/.input/.radio/.seg, .card + .elev-*, .nav, .table, .dialog; Icons: Lucide
- States: Hover/Pressed aus der Akzent-Ramp, :focus-visible 2px Akzent-Outline, disabled 45% Opacity
- Don't: keine runden Ecken, keine zentrierten Button-Labels, Divider nicht zu Haarlinien abschwächen, Bilder nicht kolorieren
