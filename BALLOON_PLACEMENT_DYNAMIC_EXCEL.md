# Balloon placement + dynamic Excel update

- AI balloons are placed beside the detected dimension/callout on the same horizontal line; circles no longer float over dimension text.
- Manual balloons follow the same same-line placement rule.
- `INSPECTED QTY = N` produces exactly N editable measurement/result columns in the web report and generated XLSX (up to 50).
- The workbook does not insert worksheet rows/columns, so the original merged signature blocks and embedded signature/image anchors remain unchanged.
- Browser report cells support drag-resizing of column width and row height for Excel-like editing.
- Downloaded XLSX remains a normal fully editable Excel workbook.
- Existing PDF/Excel separate downloads and ZIP bulk downloads are unchanged.
