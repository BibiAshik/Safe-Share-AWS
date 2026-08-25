package com.safeshare.service;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

@Service
public class DocumentPreviewService {

    private static final int MAX_SHEETS = 8;
    private static final int MAX_ROWS = 200;
    private static final int MAX_COLUMNS = 30;

    public String renderDocxAsHtml(InputStream inputStream, String title) throws IOException {
        try (XWPFDocument document = new XWPFDocument(inputStream)) {
            StringBuilder body = new StringBuilder();

            for (IBodyElement element : document.getBodyElements()) {
                if (element instanceof XWPFParagraph paragraph) {
                    appendParagraph(body, paragraph);
                } else if (element instanceof XWPFTable table) {
                    appendDocxTable(body, table);
                }
            }

            if (body.isEmpty()) {
                body.append("<p class=\"muted\">No previewable text found in this document.</p>");
            }

            return wrapHtml(title, body.toString(), """
                    .page { max-width: 780px; min-height: 960px; margin: 24px auto; padding: 56px; background: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, .12); }
                    h1 { font-size: 18px; margin: 0 0 24px; }
                    p { margin: 0 0 12px; line-height: 1.55; }
                    .muted { color: #64748b; text-align: center; padding: 48px 0; }
                    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
                    td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
                    strong { font-weight: 700; }
                    em { font-style: italic; }
                    @media (max-width: 768px) { .page { margin: 12px; padding: 24px; min-height: auto; } }
                    """);
        }
    }

    public String renderWorkbookAsHtml(InputStream inputStream, String title) throws IOException {
        try (Workbook workbook = WorkbookFactory.create(inputStream)) {
            DataFormatter formatter = new DataFormatter();
            StringBuilder body = new StringBuilder();

            int sheetLimit = Math.min(workbook.getNumberOfSheets(), MAX_SHEETS);
            for (int i = 0; i < sheetLimit; i++) {
                Sheet sheet = workbook.getSheetAt(i);
                body.append("<section class=\"sheet\"><h2>")
                        .append(escapeHtml(sheet.getSheetName()))
                        .append("</h2><div class=\"table-wrap\"><table>");

                int lastRow = Math.min(sheet.getLastRowNum(), MAX_ROWS - 1);
                for (int rowIndex = 0; rowIndex <= lastRow; rowIndex++) {
                    Row row = sheet.getRow(rowIndex);
                    body.append("<tr>");
                    int lastCell = row == null ? 0 : Math.min(row.getLastCellNum(), MAX_COLUMNS);
                    for (int colIndex = 0; colIndex < lastCell; colIndex++) {
                        Cell cell = row.getCell(colIndex, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        String tag = rowIndex == 0 ? "th" : "td";
                        body.append("<").append(tag).append(">")
                                .append(escapeHtml(cell == null ? "" : formatter.formatCellValue(cell)))
                                .append("</").append(tag).append(">");
                    }
                    body.append("</tr>");
                }

                body.append("</table></div></section>");
            }

            if (body.isEmpty()) {
                body.append("<p class=\"muted\">No previewable spreadsheet data found.</p>");
            }

            return wrapHtml(title, body.toString(), """
                    .page { max-width: 1180px; min-height: 960px; margin: 24px auto; padding: 40px; background: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, .12); }
                    h1 { font-size: 18px; margin: 0 0 24px; }
                    h2 { font-size: 15px; margin: 24px 0 10px; }
                    .sheet:first-of-type h2 { margin-top: 0; }
                    .table-wrap { overflow: auto; border: 1px solid #cbd5e1; border-radius: 8px; }
                    table { width: 100%; border-collapse: collapse; font-size: 13px; }
                    th, td { border: 1px solid #e2e8f0; padding: 7px 9px; white-space: nowrap; text-align: left; }
                    th { position: sticky; top: 0; background: #eff6ff; font-weight: 700; }
                    .muted { color: #64748b; text-align: center; padding: 48px 0; }
                    @media (max-width: 768px) { .page { margin: 12px; padding: 20px; min-height: auto; } }
                    """);
        } catch (Exception ex) {
            throw new IOException("Unable to preview spreadsheet", ex);
        }
    }

    private void appendParagraph(StringBuilder html, XWPFParagraph paragraph) {
        StringBuilder content = new StringBuilder();
        for (XWPFRun run : paragraph.getRuns()) {
            String text = run.text();
            if (text == null || text.isBlank()) {
                continue;
            }
            String escaped = escapeHtml(text);
            if (run.isBold()) {
                escaped = "<strong>" + escaped + "</strong>";
            }
            if (run.isItalic()) {
                escaped = "<em>" + escaped + "</em>";
            }
            content.append(escaped);
        }

        if (!content.isEmpty()) {
            html.append("<p>").append(content).append("</p>");
        }
    }

    private void appendDocxTable(StringBuilder html, XWPFTable table) {
        html.append("<table>");
        for (XWPFTableRow row : table.getRows()) {
            html.append("<tr>");
            for (XWPFTableCell cell : row.getTableCells()) {
                html.append("<td>").append(escapeHtml(cell.getText())).append("</td>");
            }
            html.append("</tr>");
        }
        html.append("</table>");
    }

    private String wrapHtml(String title, String body, String styles) {
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>%s</title>
                    <style>
                        body { margin: 0; background: #eef2ff; color: #0f172a; font-family: Arial, sans-serif; }
                        %s
                    </style>
                </head>
                <body>
                    <main class="page">
                        <h1>%s</h1>
                        %s
                    </main>
                </body>
                </html>
                """.formatted(escapeHtml(title), styles, escapeHtml(title), body);
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
