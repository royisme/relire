---
paths:
  - "marketing/**"
  - ".github/workflows/pages.yml"
---

# Marketing site and deploy rules

- `marketing/` is a hand-written static landing page (English at the root, Chinese in `zh/`), separate from the app. It never imports app code, and app code never depends on it.
- GitHub Pages publishes the marketing page at the site root and the app build at `/app/`. Links into the app use that path; asset paths stay relative.
- The Pages workflow runs the type, translation and build checks before deploying; keep that gate.
- Product claims must match `PRODUCT.md`: reading and pronunciation help only, no listening, writing, mock exams or official scores.
