# Excel signature/stamp alignment fix

- The preview now shows the template stamp inside the same large signature row used by the downloaded workbook.
- QC stamp is centered in the E:I block; Approved stamp is centered in J:M.
- Export uses a fixed OneCellAnchor in Excel row 34, so stamps do not stretch or drift when row height or inspected quantity changes.
- Row 35 remains the fixed INSPECTED BY / QC INCHARGE / APPROVED BY label row.
- Signature/stamp images are scaled proportionally to stay fully inside row 34.
