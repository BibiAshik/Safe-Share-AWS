package com.safeshare.controller;

import com.safeshare.dto.response.FileResponse;
import com.safeshare.dto.response.FileVersionResponse;
import com.safeshare.entity.FileVersion;
import com.safeshare.security.UserPrincipal;
import com.safeshare.service.FileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.List;

import software.amazon.awssdk.services.s3.S3Client;
import org.springframework.beans.factory.annotation.Value;

@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
@Tag(name = "Files", description = "File upload, management, and versioning")
public class FileController {

    private final FileService fileService;
    private final S3Client s3Client;

    @Value("${aws.s3.bucket}")
    private String bucketName;

    @PostMapping("/upload")
    @Operation(summary = "Upload a new file")
    public ResponseEntity<FileResponse> uploadFile(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UserPrincipal principal) throws IOException {
        FileResponse response = fileService.uploadFile(file, principal.getUser());
        return ResponseEntity.ok(response);
    }

    @GetMapping
    @Operation(summary = "List files with optional search and pagination")
    public ResponseEntity<Page<FileResponse>> listFiles(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        Page<FileResponse> files = fileService.listFiles(
                principal.getUser(), search,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return ResponseEntity.ok(files);
    }

    @DeleteMapping("/{fileId}")
    @Operation(summary = "Delete a file and all its versions and links")
    public ResponseEntity<Void> deleteFile(
            @PathVariable Long fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        fileService.deleteFile(fileId, principal.getUser());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{fileId}/versions")
    @Operation(summary = "Upload a new version of an existing file")
    public ResponseEntity<FileVersionResponse> uploadNewVersion(
            @PathVariable Long fileId,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal UserPrincipal principal) throws IOException {
        FileVersionResponse response = fileService.uploadNewVersion(fileId, file, principal.getUser());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{fileId}/versions")
    @Operation(summary = "List all versions of a file (newest first)")
    public ResponseEntity<List<FileVersionResponse>> listVersions(
            @PathVariable Long fileId,
            @AuthenticationPrincipal UserPrincipal principal) {
        List<FileVersionResponse> versions = fileService.listVersions(fileId, principal.getUser());
        return ResponseEntity.ok(versions);
    }

    @GetMapping("/{fileId}/versions/{versionId}/download")
    @Operation(summary = "Download a specific historical version")
    public ResponseEntity<InputStreamResource> downloadVersion(
            @PathVariable Long fileId,
            @PathVariable Long versionId,
            @AuthenticationPrincipal UserPrincipal principal) throws IOException {
        FileVersion version = fileService.getVersionForDownload(fileId, versionId, principal.getUser());

        software.amazon.awssdk.core.ResponseInputStream<software.amazon.awssdk.services.s3.model.GetObjectResponse> s3Object =
                s3Client.getObject(software.amazon.awssdk.services.s3.model.GetObjectRequest.builder()
                        .bucket(bucketName)
                        .key(version.getStoragePath())
                        .build());

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + version.getStoredFilename() + "\"")
                .contentLength(version.getFileSize())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(new InputStreamResource(s3Object));
    }

    @PostMapping("/{fileId}/versions/{versionId}/revert")
    @Operation(summary = "Revert to a specific version (creates a new version copying that one)")
    public ResponseEntity<FileVersionResponse> revertToVersion(
            @PathVariable Long fileId,
            @PathVariable Long versionId,
            @AuthenticationPrincipal UserPrincipal principal) throws IOException {
        FileVersionResponse response = fileService.revertToVersion(fileId, versionId, principal.getUser());
        return ResponseEntity.ok(response);
    }
}
