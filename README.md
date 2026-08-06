# DerJ — Website

DJ · Licht-Designer · Veranstalter aus München.

## Struktur
```
├── index.html          # Hauptseite
├── impressum.html      # Impressum (§5 TMG)
├── datenschutz.html    # Datenschutzerklärung (DSGVO)
├── CNAME               # Custom domain: derj.de
├── .nojekyll           # Disable Jekyll processing
├── fonts/
│   ├── fonts.css       # @font-face declarations
│   ├── anton/          # woff2 font files
│   ├── archivoblack/
│   ├── blackopsone/
│   ├── chakrapetch/
│   ├── inter/
│   ├── majormonodisplay/
│   ├── orbitron/
│   ├── spacegrotesk/
│   ├── synemono/
│   ├── vt323/
│   └── wallpoet/
```

## Hosting
GitHub Pages — Static site, kein Backend nötig.

## Deployment
1. Repo auf GitHub pushen
2. Settings → Pages → Source: main branch / root
3. CNAME file aktiviert derj.de Custom Domain
4. DNS: A-Record auf GitHub Pages IPs
