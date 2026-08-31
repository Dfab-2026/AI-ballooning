# Balloon accuracy, sequencing and export fixes

This build adds stricter balloon filtering and continuous numbering.

- AI candidates below `GEMINI_MIN_CONFIDENCE` (default `0.68`) are rejected.
- Administrative/title-block text, bare item numbers and obvious non-inspection text are rejected.
- The analysis prompt requires targets to land on visible dimension/callout text, not blank areas.
- Deleting a balloon automatically renumbers all remaining balloons `1..N`.
- Manual renumbering also writes the new sequence back to the drawing state.
- PDF export renumbers again on the server before drawing the PDF.
- Excel report generation renumbers rows again on the server before writing XLSX.
- Separate PDF/XLSX downloads and bulk ZIP downloads use the finalized sequence.

Recommended Vercel environment setting:

`GEMINI_MIN_CONFIDENCE=0.68`

Raise to `0.72` or `0.75` if you prefer fewer, higher-confidence balloons. Lowering it may increase false positives.
