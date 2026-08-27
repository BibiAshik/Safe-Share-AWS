package com.safeshare.service;

import com.safeshare.dto.response.AccessLogResponse;
import com.safeshare.entity.AccessLog;
import com.safeshare.entity.AccessStatus;
import com.safeshare.entity.ShareLink;
import com.safeshare.mapper.AccessLogMapper;
import com.safeshare.repository.AccessLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AccessLogService {

    private final AccessLogRepository accessLogRepository;
    private final AccessLogMapper accessLogMapper;

    public void logAccess(ShareLink shareLink, HttpServletRequest request,
                          AccessStatus status, String reason) {
        String userAgent = request.getHeader("User-Agent");

        AccessLog log = AccessLog.builder()
                .shareLink(shareLink)
                .ipAddress(getClientIp(request))
                .browser(parseBrowser(userAgent))
                .device(parseDevice(userAgent))
                .status(status)
                .reason(reason)
                .build();

        accessLogRepository.save(log);
    }

    public Page<AccessLogResponse> getLogsByLink(Long shareLinkId, Pageable pageable) {
        return accessLogRepository.findByShareLinkIdOrderByAccessedAtDesc(shareLinkId, pageable)
                .map(accessLogMapper::toResponse);
    }

    public String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isBlank()) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isBlank()) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }

    private String parseBrowser(String userAgent) {
        if (userAgent == null) return "Unknown";
        if (userAgent.contains("Edg")) return "Edge";
        if (userAgent.contains("Chrome")) return "Chrome";
        if (userAgent.contains("Firefox")) return "Firefox";
        if (userAgent.contains("Safari")) return "Safari";
        if (userAgent.contains("Opera") || userAgent.contains("OPR")) return "Opera";
        return "Other";
    }

    private String parseDevice(String userAgent) {
        if (userAgent == null) return "Unknown";
        if (userAgent.contains("Mobile") || userAgent.contains("Android")) return "Mobile";
        if (userAgent.contains("Tablet") || userAgent.contains("iPad")) return "Tablet";
        return "Desktop";
    }
}
