import ExcelJS from "exceljs";
import { dryRunImport, type RawRow } from "../src/menu/import";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run menu:dryrun -- <path-to-excel-file>");
    process.exit(2);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    console.error("No worksheet found in the file.");
    process.exit(2);
  }

  // ExcelJS columns are 1-based. headers[c] is the header text of column c.
  const headers: string[] = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: RawRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const r: RawRow = { __row: rowNumber };
    let hasContent = false;
    headers.forEach((h, colNumber) => {
      if (!h) return;
      const v = row.getCell(colNumber).value;
      const value = v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v;
      r[h] = value ?? null;
      if (value !== null && value !== undefined && String(value).trim() !== "") hasContent = true;
    });
    if (hasContent) rows.push(r); // skip fully blank rows
  });

  const result = dryRunImport(rows);

  console.log("\n--- DRY RUN RESULTS (nothing was saved) ---");
  console.log(`Rows read: ${result.counts.rows}`);
  console.log(`Valid: ${result.counts.valid} (publishable: ${result.counts.publishable}, draft only: ${result.counts.draftOnly})`);
  console.log(`Warnings: ${result.counts.warnings}`);
  console.log(`Errors: ${result.counts.errors}`);

  if (result.issues.length > 0) {
    console.log("\n--- ISSUES ---");
    for (const issue of result.issues) console.log(`[Row ${issue.row}] [${issue.level.toUpperCase()}] ${issue.message}`);
  }

  if (result.ok) {
    console.log("\nDry run OK. No errors found.");
  } else {
    console.log("\nDry run FAILED. Fix the errors above before importing.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
