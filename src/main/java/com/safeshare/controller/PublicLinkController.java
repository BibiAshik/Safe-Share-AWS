package com.safeshare.controller;

import com.safeshare.dto.request.LinkPasswordRequest;
import com.safeshare.entity.AccessStatus;
import com.safeshare.entity.FileVersion;
import com.safeshare.entity.ShareLink;
import com.safeshare.service.*;
import com.safeshare.util.BotUserAgentFilter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

@RestController
@RequestMapping("/public/s")
@RequiredArgsConstructor
@Tag(name = "Public Links", description = "Public file access — no authentication required")
public class PublicLinkController {

    private final DownloadService downloadService;
    private final FileService fileService;
    private final WatermarkService watermarkService;
    private final DocumentPreviewService documentPreviewService;
    private final AccessLogService accessLogService;
    private final BotUserAgentFilter botUserAgentFilter;
    private final S3Client s3Client;

    @Value("${aws.s3.bucket}")
    private String bucketName;

    @GetMapping("/{token}")
    @Operation(summary = "Validate a share link and return its status")
    public ResponseEntity<Map<String, Object>> validateLink(
            @PathVariable String token,
            HttpServletRequest request) {
        Map<String, Object> status = downloadService.getLinkStatus(token, request);
        return ResponseEntity.ok(status);
    }

    @PostMapping("/{token}/verify")
    @Operation(summary = "Verify password for a password-protected link")
    public ResponseEntity<Map<String, Object>> verifyPassword(
            @PathVariable String token,
            @Valid @RequestBody LinkPasswordRequest passwordRequest,
            HttpServletRequest request) {
        downloadService.verifyPassword(token, passwordRequest.getPassword(), request);
        downloadService.markPasswordVerified(token, request);

        ShareLink link = downloadService.validateLink(token);
        return ResponseEntity.ok(Map.of(
                "status", "OK",
                "message", "Password verified",
                "fileType", link.getFile().getFileType(),
                "fileName", link.getFile().getOriginalFilename()
        ));
    }

    @GetMapping("/{token}/preview")
    @Operation(summary = "Preview a file inline (PDF via iframe, images via img tag)")
    public ResponseEntity<?> previewFile(
            @PathVariable String token,
            HttpServletRequest request) throws IOException {
        ShareLink link = downloadService.validateLink(token);
        downloadService.requirePasswordAccess(link, token, request);

        // Log preview access for real humans only — skip social media preview bots
        boolean isBot = botUserAgentFilter.isBot(request.getHeader("User-Agent"));
        if (!isBot) {
            accessLogService.logAccess(link, request, AccessStatus.SUCCESS, "File previewed");
        }

        FileVersion latestVersion = fileService.getLatestVersion(link.getFile().getId());

        String fileType = link.getFile().getFileType().toLowerCase();
        byte[] fileBytes = s3Client.getObject(
                GetObjectRequest.builder()
                        .bucket(bucketName)
                        .key(latestVersion.getStoragePath())
                        .build(),
                ResponseTransformer.toBytes()).asByteArray();

        MediaType mediaType;
        switch (fileType) {
            case "pdf":
                mediaType = MediaType.APPLICATION_PDF;
                break;
            case "jpg":
            case "jpeg":
                mediaType = MediaType.IMAGE_JPEG;
                break;
            case "png":
                mediaType = MediaType.IMAGE_PNG;
                break;
            case "docx":
                try (InputStream is = s3Client.getObject(GetObjectRequest.builder().bucket(bucketName).key(latestVersion.getStoragePath()).build())) {
                    String html = documentPreviewService.renderDocxAsHtml(is, link.getFile().getOriginalFilename());
                    return ResponseEntity.ok()
                            .contentType(MediaType.TEXT_HTML)
                            .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                            .body(html);
                }
            case "xls":
            case "xlsx":
                try (InputStream is = s3Client.getObject(GetObjectRequest.builder().bucket(bucketName).key(latestVersion.getStoragePath()).build())) {
                    String workbookHtml = documentPreviewService.renderWorkbookAsHtml(is, link.getFile().getOriginalFilename());
                    return ResponseEntity.ok()
                            .contentType(MediaType.TEXT_HTML)
                            .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                            .body(workbookHtml);
                }
            default:
                return ResponseEntity.ok(Map.of(
                        "status", "NO_PREVIEW",
                        "message", "Preview not available for this file type, please download"
                ));
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(fileBytes);
    }

    @GetMapping("/{token}/download")
    @Operation(summary = "Download a file (with watermark if enabled for PDFs)")
    public ResponseEntity<?> downloadFile(
            @PathVariable String token,
            HttpServletRequest request) throws IOException {
        // Re-validate link on every download attempt (never trust a stale page)
        ShareLink link = downloadService.validateLink(token);
        downloadService.requirePasswordAccess(link, token, request);

        // Always count and log every download — no bot exemption here.
        // Social media bots (Telegram, WhatsApp etc.) never call /download directly,
        // so the bot check was unnecessary and created an exploit: anyone spoofing
        // a bot User-Agent could bypass the max download limit entirely.
        downloadService.incrementDownloadCount(token);
        accessLogService.logAccess(link, request, AccessStatus.SUCCESS, "File downloaded");

        FileVersion latestVersion = fileService.getLatestVersion(link.getFile().getId());
        byte[] fileBytes = s3Client.getObject(
                GetObjectRequest.builder()
                        .bucket(bucketName)
                        .key(latestVersion.getStoragePath())
                        .build(),
                ResponseTransformer.toBytes()).asByteArray();

        // Apply watermark if enabled and file is PDF
        if (link.getWatermarkEnabled() && "pdf".equalsIgnoreCase(link.getFile().getFileType())) {
            String accessInfo = "anonymous";
            fileBytes = watermarkService.addWatermark(fileBytes, accessInfo);
        }

        String originalFilename = link.getFile().getOriginalFilename();

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + originalFilename + "\"")
                .contentLength(fileBytes.length)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(fileBytes);
    }
}
