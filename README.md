# InspectBalloon — Final Report Workflow

## Workflow
1. Upload drawings.
2. Analyze and auto-balloon.
3. Review every drawing and mark it Reviewed.
4. Click **Next: Inspection Report**.
5. Verify/edit the report page built from the uploaded **ZLAS Final Inspection Report** Excel template.
6. Download the current drawing as a ballooned PDF and its matching report as an editable XLSX.
7. Or download the complete project ZIP containing one PDF + one XLSX pair per drawing.

## Important behavior
- There is no PDF download button in the review page anymore.
- Downloads are available only after all drawings have been reviewed and the user enters the report stage.
- The original uploaded Excel template is stored at `backend/templates/final_inspection_template.xlsx` unchanged.
- Only report data cells are updated: Part Name, Drawing No, Customer, Date, quantities, revision, inspection rows, optional readings, remarks and sign-off names.
- Downloaded report files remain normal editable Excel workbooks.
- If a drawing has more than 16 characteristics, additional inspection sheets are created using the same template layout.
- Each drawing keeps its own report data and its own PDF/XLSX pair.

## Run backend
```powershell
cd "D:\DFAB PROJECT\ballooning\backend"
venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

## Run frontend
```powershell
cd "D:\DFAB PROJECT\ballooning\frontend"
python -m http.server 5500
```

Open `http://localhost:5500`.


## Report manager update
- Final report screen shows every reviewed drawing separately with its own preview.
- Matching Excel reports are listed separately and stay synchronized with the selected drawing.
- Download Drawings asks Separate (current PDF) or Bulk ZIP (all PDFs).
- Download Excel Reports asks Separate (current XLSX) or Bulk ZIP (all XLSX files).
- Drawing title-block fields are applied to the Excel template when detected: drawing number, part name, customer, revision, drawing date and total quantity.
- Balloon rows populate SL.NO, description, dimension/requirement and suggested instrument; measurement readings remain editable.


## Editor usability update
- Mouse wheel / trackpad now scrolls the drawing viewport normally; it no longer changes zoom.
- Drawing zoom changes only with +, -, Fit drawing, or double-click Fit.
- Drawings open using the normal fit-to-workspace zoom.
- Review screen text, controls, panel headings, drawing tabs, characteristics and footer were enlarged for desktop readability.
- Report manager cards and headings were enlarged while keeping the fixed-screen layout.

## Viewer / review / Excel UX update (vNext)
- Drawing viewer now uses a conventional floating zoom control: `- | percentage | + | Fit`.
- Mouse wheel and trackpad keep normal document scrolling/panning; they do not change zoom.
- The old duplicate zoom buttons in the left tool rail are hidden.
- Every drawing card has a dedicated round review indicator: red = pending, green with check = reviewed. Click it directly to toggle review state.
- The top Mark reviewed button mirrors the same state and turns green after review.
- The report editor now shows the logo from the exact uploaded Excel template and keeps the complete template inside an independently scrollable Excel surface.
- The Excel area supports vertical and horizontal scrolling for large report content.
- Export still starts from the exact uploaded workbook; logo/images and formatting are preserved. Continuation sheets also receive the uploaded template images.

## GitHub-safe setup
- Real API keys must stay only in `backend/.env`; this file is ignored by Git.
- Copy `backend/.env.example` to `backend/.env` locally, then add your own key.
- Do not commit `node_modules`, Python caches, generated analysis cache, project runtime data, or local editor files.
- If a real key was ever committed previously, revoke/rotate it before using the repository again.

## Permanent Vercel deployment layout

This repository now deploys from the repository root (`./`). Do not set Vercel Root Directory to `backend`.

- `app/main.py` is the single Vercel entrypoint and imports the real application from `backend/app/main.py`.
- Runtime/generated files use `/tmp/ballooning_data` automatically on Vercel; `/var/task` is never used for writes.
- The frontend is served by the FastAPI app from `frontend/`, so the site and API use one deployment/domain.
- `GEMINI_API_KEY` must be configured in Vercel Project Settings -> Environment Variables and must never be committed.
- `/tmp` is ephemeral. For permanent project history, move generated project data to persistent object/database storage later.


## Canonical local / Vercel entrypoint

Use `main.py` from the repository root for both local Uvicorn and Vercel FastAPI deployment. Vercel settings: Framework Preset **FastAPI**, Root Directory `./`, default build/install/output settings, and `GEMINI_API_KEY` in Environment Variables. The production API is under `/api/*`; `/api/health` is the deployment check. Do not add `vercel.json`.

## FINAL VERCEL CONFIGURATION

Use **Framework Preset: Other**. Do not use FastAPI or FastHTML presets for this package.
The root `vercel.json` explicitly builds `main.py` with the Vercel Python runtime and sends all routes to the same ASGI app.
See `VERCEL_SETUP.md` for the exact settings and environment variables.
