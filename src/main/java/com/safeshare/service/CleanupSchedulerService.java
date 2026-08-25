package com.safeshare.service;

import com.safeshare.entity.FileVersion;
import com.safeshare.entity.ShareLink;
import com.safeshare.repository.FileRepository;
import com.safeshare.repository.ShareLinkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;

@Service
@RequiredArgsConstructor
@Slf4j
public class CleanupSchedulerService {

    private final ShareLinkRepository shareLinkRepository;
    private final FileRepository fileRepository;
    private final S3Client s3Client;

    @Value("${aws.s3.bucket}")
    private String bucketName;

    /**
     * Runs daily at 2 AM.
     *
     * Step 1: Find share links that are expired or revoked for MORE than 7 days
     *         and delete just those individual links. Other links on the same file are untouched.
     *
     * Step 2: After deleting old links, check each affected file.
     *         If the file now has ZERO share links remaining, delete all its
     *         physical file versions from disk and remove the file DB record.
     *         If any links (active or recent) still exist, the file is kept safe.
     */
    @Scheduled(cron = "0 0 2 * * ?")
    @Transactional
    public void cleanupExpiredFiles() {
        log.info("Starting scheduled cleanup of expired/revoked share links");

        LocalDateTime cutoff = LocalDateTime.now().minusDays(7);

        // Find all individual share links that are expired or revoked for 7+ days
        List<ShareLink> oldLinks = shareLinkRepository.findExpiredOrRevokedBefore(cutoff);

        if (oldLinks.isEmpty()) {
            log.info("No expired/revoked links older than 7 days found. Cleanup skipped.");
            return;
        }

        // Collect the file IDs these old links belonged to (before we delete the links)
        Set<Long> affectedFileIds = new HashSet<>();
        for (ShareLink link : oldLinks) {
            affectedFileIds.add(link.getFile().getId());
        }

        // Step 1: Delete each old share link individually
        int deletedLinksCount = 0;
        for (ShareLink link : oldLinks) {
            log.info("Deleting old share link ID {} (token: {}) for file ID {}",
                    link.getId(), link.getToken(), link.getFile().getId());
            shareLinkRepository.delete(link);
            deletedLinksCount++;
        }
        log.info("Step 1 complete: Deleted {} old share link(s)", deletedLinksCount);

        // Step 2: For each affected file, check if ANY share links remain
        // Only delete the file + all versions if ZERO links are left
        int deletedFilesCount = 0;
        for (Long fileId : affectedFileIds) {
            long remainingLinks = shareLinkRepository.countAllLinksForFile(fileId);

            if (remainingLinks > 0) {
                log.info("File ID {} still has {} link(s) remaining — keeping file.", fileId, remainingLinks);
                continue;
            }

            // Zero links remain — safe to delete the file and all its versions
            fileRepository.findById(fileId).ifPresent(file -> {
                for (FileVersion version : file.getVersions()) {
                    try {
                        s3Client.deleteObject(DeleteObjectRequest.builder()
                                .bucket(bucketName)
                                .key(version.getStoragePath())
                                .build());
                        log.info("Deleted version from S3: {}", version.getStoragePath());
                    } catch (Exception e) {
                        log.error("Failed to delete version from S3: {}", version.getStoragePath(), e);
                    }
                }
                fileRepository.delete(file);
                log.info("Deleted file record: '{}' (ID: {})", file.getOriginalFilename(), file.getId());
            });
            deletedFilesCount++;
        }

        log.info("Cleanup complete. Links deleted: {}. Files deleted: {}.", deletedLinksCount, deletedFilesCount);
    }
}
