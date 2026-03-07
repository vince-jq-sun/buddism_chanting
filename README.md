# Buddhist Chanting

This repository contains two outputs built from the same chant source material:

- `booklet/`: the LaTeX chant booklet sources
- `docs/`: the static website for GitHub Pages

The web version is Pali-first and shows English translations on demand with a long press.

## Repo Layout

```text
buddism_chanting/
├── booklet/   # LaTeX chant sources and booklet-related assets
├── docs/      # Static website published via GitHub Pages
├── reports/   # Translation and proofreading notes
└── scripts/   # Utility scripts such as tex -> json extraction
```

## Local Preview

Preview the website:

```bash
cd /Users/vince/Documents/GitHub/buddism_chanting/docs
python3 -m http.server 4173
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Regenerate Web Data

The website content is extracted directly from the Pali chapter files in `booklet/`.

```bash
cd /Users/vince/Documents/GitHub/buddism_chanting
python3 scripts/extract_chants.py
```

This updates:

- `docs/data/chapters.json`

The extraction intentionally excludes:

- `booklet/s02-homage-to-great-master.tex`

## Booklet Workflow

Compile the LaTeX booklet from inside `booklet/` so relative includes continue to work:

```bash
cd /Users/vince/Documents/GitHub/buddism_chanting/booklet
xelatex chantbook.tex
```

If you use a different LaTeX engine or build tool, keep the working directory as `booklet/`.

## Publishing

For GitHub Pages, publish the `docs/` directory.
