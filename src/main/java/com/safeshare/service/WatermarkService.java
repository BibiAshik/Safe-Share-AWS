package com.safeshare.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class WatermarkService {

    /**
     * Stamps a watermark at the bottom-right corner of every page of the PDF.
     * The original file on disk is never modified — only the returned byte array is stamped.
     */
    public byte[] addWatermark(byte[] pdfBytes, String accessInfo) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            String watermarkText = accessInfo;

            for (PDPage page : document.getPages()) {
                PDRectangle mediaBox = page.getMediaBox();

                try (PDPageContentStream contentStream = new PDPageContentStream(
                        document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {

                    contentStream.beginText();
                    contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 8);
                    contentStream.setNonStrokingColor(0.5f, 0.5f, 0.5f);

                    // Position at bottom-right corner
                    float textWidth = watermarkText.length() * 3.5f; // approximate
                    float x = mediaBox.getWidth() - textWidth - 20;
                    float y = 15;
                    contentStream.newLineAtOffset(x, y);
                    contentStream.showText(watermarkText);
                    contentStream.endText();
                }
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            document.save(outputStream);
            return outputStream.toByteArray();
        }
    }
}
