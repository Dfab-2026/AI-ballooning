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

## Vercel deployment (configured)
This package is configured for a **single Vercel deployment** with `backend` as the Vercel **Root Directory**.

1. In Vercel Project Settings, set **Root Directory** to `backend`.
2. Add `GEMINI_API_KEY` under **Settings → Environment Variables** (Production/Preview as needed). Never commit the real key.
3. Redeploy. Vercel serves the bundled UI from `/` and the FastAPI endpoints from the same origin.
4. On Vercel, generated uploads, previews, PDFs, Excel files, manifests, and analysis cache are written under `/tmp/ballooning_data` because `/var/task` is read-only.

### Storage note
Vercel `/tmp` storage is ephemeral. The upload → analyze → review → download workflow works within the active serverless instance, but long-term project history is not guaranteed. Persistent project history should later be moved to object storage/database (for example Vercel Blob/S3 + a database).
