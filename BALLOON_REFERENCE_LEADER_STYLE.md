# Approved default balloon leader style

This build uses the uploaded reference style by default:

- one straight diagonal leader from the edge of the numbered circle
- long visible leader length
- arrowhead stops before the original dimension/extension/leader line
- no overlap with dimension numbers or tolerance text
- green inspection balloon/leader in preview and exported drawings

Primary code locations:

- `backend/app/services/gemini_analyzer.py` → `_balloon_offset(...)` controls automatic circle distance/position.
- `frontend/assets/js/app.js` and `assets/js/app.js` → `leaderEndpoints(...)` controls the visible leader start/end clearance.
- `backend/app/services/pdf_processor.py` → `export_ballooned_pdf(...)` controls the downloaded PDF/image balloon leader.

Current default auto-position offsets begin around 190 px horizontally and 132 px vertically, with larger fallback offsets for crowded drawings.
