# SafeShare — Secure File Sharing Platform — Build Prompt

Build a full-stack secure file-sharing web application called **SafeShare** using **Java Spring Boot** for the backend and **plain HTML, CSS, and JavaScript** (no frontend framework, no Tailwind, no Bootstrap) for the frontend.

---

## 1. Assumptions (change if needed, otherwise proceed with these)

- Max upload file size: 25 MB
- JWT access token expiry: 24 hours (no refresh token flow — keep it simple)
- QR code library: ZXing
- PDF preview: rendered via `<iframe>` pointing to a preview endpoint
- Image preview: rendered via `<img>` tag
- Docx and Zip: no inline preview — show "Preview not available for this file type, please download"
- Watermark position: bottom-right corner of every page of the PDF
- Database: MySQL
- Redis: used for share-link validation caching and atomic download-count increments
- File storage: local disk only for now (`/uploads` directory), structured so it can be swapped for AWS S3 later without touching business logic

---

## 2. Core Features (implement now)

1. **User Authentication**
   - Landing page (`index.html`) shows only two buttons: **Register** and **Login** — clicking either opens a popup/modal with that form; there are no separate register/login pages
   - Register/Login with email + password (JWT-based)
   - Google OAuth2 login as an alternative
   - Passwords stored with BCrypt
   - JWT is valid for exactly 24 hours from issue; after it expires, any authenticated request fails with 401 and the frontend redirects back to the landing page, requiring login again
   - **Logout** button clears the JWT from client-side storage (localStorage) immediately and redirects to the landing page; the next login always issues a brand-new JWT with a fresh 24-hour expiry

2. **File Upload**
   - Allowed types: PDF, Images (jpg/png), Docx, Zip
   - Max size 25 MB, reject others with a clear error
   - Files stored on local disk under a per-user folder structure
   - Each upload creates a `File` record in DB (not just disk storage)

3. **File Versioning**
   - Owner can upload a new version of an existing file (e.g. an updated resume) without creating a new share link
   - Every version is kept — nothing is overwritten or deleted; each upload creates a new `FileVersion` record with an incrementing version number
   - Existing share links automatically serve the latest version on the next download (a link points to the file, not to a version frozen at link-creation time)
   - Owner can view full version history on the dashboard (version number, upload date, file size) and download any older version directly
   - Owner can "revert" to an older version — this creates a new version entry that copies the old file's content, keeping history append-only (never mutates or deletes past versions)

4. **Secure Share Link Generation**
   - Generate a random UUID token per share link (never expose the real file path or file name in the URL)
   - Owner can configure per link:
     - Expiry date/time
     - Max download count
     - Optional password protection (BCrypt hash)
     - Optional watermark toggle (PDF only, bottom-right corner)
   - Owner can revoke a link instantly (`isActive = false`)

5. **Link Access Flow (public landing page, no login required)**
   - On link open: check `isActive` → check expiry → check download count → check password (if set)
   - If any check fails, show the relevant state (expired / revoked / limit reached / wrong password)
   - If all checks pass, show a preview (if supported) and a Download button
   - Ignore known bot/link-preview crawlers (Telegram, WhatsApp, Slack, facebookexternalhit user-agents) — do not count these as real visits/downloads

6. **Download Handling**
   - Atomic download-count increment using Redis (avoid race conditions on simultaneous downloads)
   - If watermark is enabled and file is PDF, stamp "Downloaded by [access email or 'anonymous'] on [timestamp]" at the bottom-right of every page at download time (original stored file is never modified)
   - Log every access attempt: IP address, browser, device, timestamp, success/failure reason

7. **QR Code Generation**
   - Generate a QR code image for every share link (encodes the share URL), shown on the dashboard next to each link

8. **Preview Before Download**
   - PDF: inline preview via iframe
   - Images: inline preview via img tag
   - Docx/Zip: no preview, download-only message

9. **Dashboard (authenticated)**
   - List of user's uploaded files with their share links, download counts, expiry, active/revoked status
   - Search files by filename
   - Pagination (Spring Data JPA `Pageable`)
   - Version history view per file (upload new version, download an old version, revert to an old version)
   - Access log view per file (IP, device, browser, timestamp)
   - Revoke / delete actions

10. **Scheduled Cleanup**
    - A scheduled job (runs daily) physically deletes files from disk that have been expired or revoked for more than 7 days

11. **Rate Limiting**
    - Limit wrong-password attempts per share link (e.g. 5 attempts per 10 minutes) using Bucket4j, to prevent brute-forcing protected links

12. **API Documentation**
    - Swagger/OpenAPI docs for all endpoints

13. **Global Exception Handling**
    - Centralized exception handler returning consistent JSON error responses

---

## 3. Backend Dependencies (Maven `pom.xml`)

```xml
<dependencies>
    <!-- Core -->
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>

    <!-- Database -->
    <dependency><groupId>com.mysql</groupId><artifactId>mysql-connector-j</artifactId><scope>runtime</scope></dependency>

    <!-- Security & Auth -->
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-oauth2-client</artifactId></dependency>
    <dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-api</artifactId><version>0.12.5</version></dependency>
    <dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-impl</artifactId><version>0.12.5</version><scope>runtime</scope></dependency>
    <dependency><groupId>io.jsonwebtoken</groupId><artifactId>jjwt-jackson</artifactId><version>0.12.5</version><scope>runtime</scope></dependency>

    <!-- Redis -->
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-redis</artifactId></dependency>

    <!-- Rate limiting -->
    <dependency><groupId>com.bucket4j</groupId><artifactId>bucket4j-core</artifactId><version>8.10.1</version></dependency>

    <!-- PDF watermarking -->
    <dependency><groupId>org.apache.pdfbox</groupId><artifactId>pdfbox</artifactId><version>3.0.2</version></dependency>

    <!-- QR code -->
    <dependency><groupId>com.google.zxing</groupId><artifactId>core</artifactId><version>3.5.3</version></dependency>
    <dependency><groupId>com.google.zxing</groupId><artifactId>javase</artifactId><version>3.5.3</version></dependency>

    <!-- Swagger -->
    <dependency><groupId>org.springdoc</groupId><artifactId>springdoc-openapi-starter-webmvc-ui</artifactId><version>2.6.0</version></dependency>

    <!-- Utility -->
    <dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><optional>true</optional></dependency>

    <!-- Testing -->
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
</dependencies>
```

---

## 4. Backend Package Structure

```
com.safeshare
├── config
│   ├── SecurityConfig.java
│   ├── RedisConfig.java
│   ├── SwaggerConfig.java
│   ├── OAuth2Config.java
│   └── WebConfig.java (CORS)
│
├── controller
│   ├── AuthController.java          // register, login, google oauth callback (logout is client-side only — no endpoint needed)
│   ├── FileController.java          // upload, list, delete
│   ├── ShareLinkController.java     // create/update/revoke link, QR code endpoint
│   ├── PublicLinkController.java    // public: validate link, preview, download (no auth)
│   └── DashboardController.java     // search, pagination, access logs
│
├── service
│   ├── AuthService.java
│   ├── FileService.java              // upload, list, delete, and version upload/list/download/revert
│   ├── ShareLinkService.java
│   ├── WatermarkService.java
│   ├── QrCodeService.java
│   ├── AccessLogService.java
│   ├── DownloadService.java
│   └── CleanupSchedulerService.java
│
├── repository
│   ├── UserRepository.java
│   ├── FileRepository.java
│   ├── FileVersionRepository.java
│   ├── ShareLinkRepository.java
│   └── AccessLogRepository.java
│
├── entity
│   ├── User.java
│   ├── FileEntity.java
│   ├── FileVersion.java
│   ├── ShareLink.java
│   └── AccessLog.java
│
├── dto
│   ├── request/
│   │   ├── RegisterRequest.java
│   │   ├── LoginRequest.java
│   │   ├── ShareLinkCreateRequest.java
│   │   └── LinkPasswordRequest.java
│   └── response/
│       ├── AuthResponse.java
│       ├── FileResponse.java
│       ├── FileVersionResponse.java
│       ├── ShareLinkResponse.java
│       ├── AccessLogResponse.java
│       └── ErrorResponse.java
│
├── mapper
│   ├── FileMapper.java
│   ├── FileVersionMapper.java
│   ├── ShareLinkMapper.java
│   └── AccessLogMapper.java
│
├── security
│   ├── JwtUtil.java
│   ├── JwtAuthFilter.java
│   ├── JwtAuthEntryPoint.java
│   ├── OAuth2SuccessHandler.java
│   └── UserPrincipal.java
│
├── exception
│   ├── GlobalExceptionHandler.java
│   ├── LinkExpiredException.java
│   ├── LinkRevokedException.java
│   ├── DownloadLimitExceededException.java
│   ├── InvalidLinkPasswordException.java
│   └── FileNotFoundException.java
│
├── scheduler
│   └── ExpiredFileCleanupJob.java
│
└── util
    ├── TokenGenerator.java
    ├── FileTypeValidator.java
    └── BotUserAgentFilter.java
```

---

## 5. Database Design (MySQL)

**users**
`id, name, email, password_hash (nullable if OAuth2), auth_provider (LOCAL/GOOGLE), created_at`

**files**
`id, owner_id (FK users), original_filename, file_type, created_at`

**file_versions**
`id, file_id (FK files), version_number, stored_filename, file_size, storage_path, uploaded_at`
- Every upload (initial and subsequent) creates a new row here; `version_number` starts at 1 and increments per file
- Downloads always resolve to the row with the highest `version_number` for that `file_id`, unless a specific historical version is explicitly requested from the dashboard
- Reverting to an old version copies that row's `stored_filename`/`storage_path` into a brand-new row with the next `version_number` — old rows are never deleted or edited

**share_links**
`id, file_id (FK files), token (unique), expiry_time, max_downloads, current_downloads, password_hash (nullable), is_active, watermark_enabled, created_at`

**access_logs**
`id, share_link_id (FK share_links), ip_address, browser, device, accessed_at, status (SUCCESS/FAILED/BLOCKED), reason`

---

## 6. API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/oauth2/google/callback

POST   /api/files/upload
GET    /api/files                     (search + pagination, query params: search, page, size)
DELETE /api/files/{fileId}

POST   /api/files/{fileId}/versions                          (upload a new version)
GET    /api/files/{fileId}/versions                          (list version history, newest first)
GET    /api/files/{fileId}/versions/{versionId}/download      (download a specific historical version)
POST   /api/files/{fileId}/versions/{versionId}/revert        (revert = create a new version copying this one)

POST   /api/links                     (create share link for a file)
PUT    /api/links/{linkId}            (update expiry/limit/password)
PATCH  /api/links/{linkId}/revoke
GET    /api/links/{linkId}/qrcode
GET    /api/links/{linkId}/logs

GET    /public/s/{token}              (validate link, return status: OK/EXPIRED/REVOKED/LIMIT_REACHED/NEEDS_PASSWORD)
POST   /public/s/{token}/verify       (submit password)
GET    /public/s/{token}/preview      (inline preview for pdf/image)
GET    /public/s/{token}/download     (actual file download, watermark applied if enabled)
```

---

## 7. Frontend Structure (HTML + CSS + JS only)

```
/static
├── index.html          (landing page — shows only two buttons: Register and Login, both open a popup/modal; the actual forms live inside these modals, not on separate pages)
├── dashboard.html       (authenticated: upload, file list, search, pagination, links, logs)
├── share.html           (public landing page for a share link — preview/password/download)
│
├── /css
│   ├── style.css        (ALL main styling — desktop-first, includes modal/popup styling)
│   └── mobile.css        (ONLY media queries — loaded last, additive only, must never override or duplicate desktop rules, must not break desktop layout)
│
├── /js
│   ├── api.js            (central fetch wrapper, attaches JWT to Authorization header, and central place that handles a 401 response by clearing the token and redirecting to index.html)
│   ├── auth.js           (opens/closes the Register and Login modals, handles their form submissions, login/logout logic, JWT expiry handling)
│   ├── upload.js          (file upload logic)
│   ├── dashboard.js       (file list, search, pagination, revoke/delete)
│   ├── sharelink.js       (create/edit link, QR code display)
│   └── download.js        (public link page: validate, password prompt, preview, download)
│
└── /images               (already added by the user: favicon.png, logonpageicon.png, icon.png — just reference these three files directly, do not scaffold placeholders)
```

### Theme requirements
- **Light/white theme** (not dark mode) throughout, matching the SafeShare app icon's colour tone: white/very light backgrounds with navy-to-blue accents, consistent across every page and popup (landing page, its Register/Login modals, dashboard, public share page)
- Use CSS variables in `style.css` for theme colors so they're centralized, e.g.:
  ```css
  :root {
    --bg-primary: #ffffff;
    --bg-secondary: #f5f8ff;
    --accent: #2563eb;
    --accent-gradient: linear-gradient(135deg, #3b82f6, #1e3a8a);
    --accent-hover: #1d4ed8;
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --border-color: #e2e8f0;
    --danger: #dc2626;
    --success: #16a34a;
  }
  ```
- Buttons, links, active states, focus rings, progress bars — all use `--accent` or `--accent-gradient`
- Overall look: clean white cards on a very light background, navy for primary text, blue as the only accent/highlight color (matching the icon's "Safe" in dark navy and "Share" in blue)
- `style.css` must fully cover desktop layout on its own, with no reliance on `mobile.css` to function correctly

### Mobile requirement (important — keep isolated)
- `mobile.css` contains ONLY `@media (max-width: 768px)` (and smaller breakpoints if needed) rules
- Do not put any base/desktop styling in `mobile.css`
- Link `mobile.css` after `style.css` in every HTML file's `<head>`, so it only ever adds/overrides at the media-query level and never breaks desktop rendering
- Every HTML page must include both:
  ```html
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/mobile.css">
  ```

### Favicon / logo (already added by the user into `/images` — reference them directly)
- `/images/favicon.png` — small square icon only (shield + document + lock + share symbol, no text). Reference in every HTML `<head>`: `<link rel="icon" href="/images/favicon.png">`
- `/images/logonpageicon.png` — icon with the "SafeShare" wordmark stacked **below** it. Use as a large centered logo on `index.html`, above the Register/Login buttons
- `/images/icon.png` — icon with the "SafeShare" wordmark placed **to the right** of it (horizontal lockup). Use as the compact logo in the navbar/header on `dashboard.html` and on the public `share.html` page, so it's visible on every page both before and after login
- These three files already exist in `/images` — do not generate placeholders or treat the folder as empty

---

## 8. Detailed Feature Walkthrough (button-by-button, so every scenario is unambiguous)

### 8.1 Landing page (index.html)
Anyone arriving at the site sees only the SafeShare logo (`logonpageicon.png`) and two buttons: **Register** and **Login**. Nothing else is on this page — no forms are visible yet. Clicking either button opens a popup/modal on top of the same page (not a page navigation); the other button's modal is not shown at the same time. A close (×) button or clicking outside the modal closes it and returns to the plain landing page.

### 8.2 Register (inside the Register modal)
User clicks **Register**, the modal opens with name, email, and password fields plus a **Create Account** button. On click, frontend calls `POST /api/auth/register`. Backend checks if the email already exists → if yes, return 409 "Email already registered" and show this inline inside the still-open modal. If not, hash the password with BCrypt, save a `User` row with `auth_provider=LOCAL`, return an `AuthResponse` containing a JWT (24-hour expiry). Frontend stores the token in localStorage, closes the modal, and redirects to `dashboard.html`.

### 8.3 Login (inside the Login modal)
User clicks **Login**, the modal opens with email and password fields, a **Login** button, and a **Continue with Google** button. On email/password submit, frontend calls `POST /api/auth/login`. Wrong credentials → 401 "Invalid credentials," shown inline inside the still-open modal, modal stays open. Correct → backend returns a JWT (24-hour expiry), frontend stores it, closes the modal, redirects to `dashboard.html`.

### 8.4 Login with Google (inside the Login modal)
User clicks **Continue with Google** inside the Login modal. This redirects into Spring Security's OAuth2 flow to Google's consent screen (a full page redirect, not a modal, since Google requires this). On success, `OAuth2SuccessHandler` looks up an existing user by email with `auth_provider=GOOGLE`, or creates one if it's their first time. It issues a JWT the same way as normal login (24-hour expiry) and redirects back to `dashboard.html` with the token attached (e.g. as a URL fragment that JS reads immediately, stores, then strips from the address bar).

### 8.5 Token expiry (no button — happens automatically)
Every authenticated request from `dashboard.html` includes the JWT in the `Authorization` header via `api.js`. If the token has passed its 24-hour expiry, the backend rejects the request with 401 regardless of which endpoint was called. `api.js` treats any 401 response as "session expired": it clears the token from localStorage and redirects to `index.html`, where the user must log in again to receive a brand-new 24-hour token.

### 8.6 Logout button
User clicks **Logout** on the dashboard. Frontend immediately removes the JWT from localStorage and redirects to `index.html`. There is no server-side token blacklist — since JWT is stateless and kept simple per the assumptions above, "logging out" means the client stops holding and sending the token; the token would technically still be cryptographically valid until its original 24-hour expiry if someone else had captured it, but the legitimate user's browser no longer has or uses it. The next time this user logs in (Register/Login modal), a completely new JWT is issued with its own fresh 24-hour expiry, unrelated to the old one.

### 8.7 Upload File button
User clicks **Upload File**, picks a file. Frontend checks type/size client-side first for fast feedback, then calls `POST /api/files/upload` as multipart. Backend re-validates type and size (never trust the client), saves the file to disk under `/uploads/{userId}/{uuid}-{originalFilename}`, creates a `File` row, and creates the *first* `FileVersion` row with `version_number = 1`. The dashboard file list refreshes, showing the file tagged "v1".

### 8.8 Upload New Version button (on an existing file)
Each file row on the dashboard has an **Upload New Version** button. User picks an updated file (e.g. `resume_v2.pdf`). Frontend calls `POST /api/files/{fileId}/versions`. Backend confirms the requester owns this file, saves the new file to disk, and creates a new `FileVersion` row with `version_number = previous max + 1`. The old version's row is untouched — nothing is deleted or overwritten. Any share link already created for this file starts serving this new version on its very next download, because downloads always resolve to "the version with the highest `version_number` for this `file_id`" at request time — a link is never frozen to the version that existed when it was created.

### 8.9 Version History button
User clicks **Version History** on a file row. Frontend calls `GET /api/files/{fileId}/versions`, showing a list: v1 (date, size), v2 (date, size), v3 (date, size)... each row has two actions:
- **Download this version** → `GET /api/files/{fileId}/versions/{versionId}/download` → streams that exact historical file, regardless of what the current version is.
- **Revert to this version** → `POST /api/files/{fileId}/versions/{versionId}/revert` → backend copies that old version's stored content into a brand-new `FileVersion` row with the *next* version number (e.g. current is v5, user reverts to v2 → this creates v6 containing v2's content). History is never rewritten or deleted; this keeps an honest, append-only audit trail.

### 8.10 Create Share Link button
On a file row, user clicks **Share**. A form appears: expiry date/time picker, max downloads number field, optional password field, watermark on/off toggle. User clicks **Generate Link**. Frontend calls `POST /api/links` with the fileId and chosen settings. Backend generates a random UUID token, hashes the password if provided, saves the `ShareLink` row with `is_active=true, current_downloads=0`, and generates a QR code (ZXing) encoding the full share URL. The response returns the link + QR image. Frontend shows the link in a copyable box with a **Copy Link** button, plus the QR code.

### 8.11 Edit Link Settings button
User clicks **Edit** on an existing link, changes expiry or download limit, clicks **Save**. Frontend calls `PUT /api/links/{linkId}`. Backend updates only the provided fields — it never touches `current_downloads` or the token itself, so the URL never changes when its rules are edited.

### 8.12 Revoke button
User clicks **Revoke** next to a link. A confirmation prompt appears: "This will immediately block access — continue?" On confirm, frontend calls `PATCH /api/links/{linkId}/revoke`. Backend sets `is_active=false`. From this instant, anyone opening that link — even mid-session, even if they already had the page open — gets blocked on their very next request, because every access check re-reads `is_active` fresh (and any Redis cache of link validity must be invalidated the moment revoke happens).

### 8.13 Delete File button
User clicks **Delete** on a file. A confirmation prompt warns: "This will also delete all versions and disable all share links for this file." On confirm, frontend calls `DELETE /api/files/{fileId}`. Backend sets `is_active=false` on all of this file's share links, then deletes the `File` row, all its `FileVersion` rows, and the actual files from disk.

### 8.14 Recipient opens a share link (public, no login)
Someone clicks a `safeshare.com/s/{token}` link from anywhere — Telegram, Gmail, WhatsApp. `share.html` loads and immediately calls `GET /public/s/{token}`. Backend runs checks in this exact order, stopping at the first failure:
1. Token doesn't exist → "Link not found."
2. `is_active` is false → "This link has been revoked."
3. `now > expiry_time` → "This link has expired."
4. `current_downloads >= max_downloads` → "Download limit reached for this link."
5. A password is set → show a password screen instead of content.

If all checks pass and no password is pending, the page shows a preview (if supported) and a **Download** button.

Special case — bot/preview crawlers: if the request's User-Agent matches a known link-preview bot (Telegram, WhatsApp, Slack, `facebookexternalhit`), the backend still returns enough info to render a preview card, but does **not** write an `access_logs` entry and does **not** increment `current_downloads` for that hit — otherwise a messaging app's own background link-preview fetch would silently burn through the owner's download limit before a human ever clicked it.

### 8.15 Password entry screen
Recipient types a password, clicks **Unlock**. Frontend calls `POST /public/s/{token}/verify`. Backend first checks a Bucket4j rate-limit bucket keyed by the token (or IP+token) — more than 5 attempts in 10 minutes → 429 "Too many attempts, try again later," without even checking the password. Otherwise, compare the BCrypt hash: wrong → 401 "Incorrect password," log a FAILED entry in `access_logs`, let them retry (counts toward the rate limit); correct → return a short-lived access grant so the recipient can call preview/download without re-entering the password every time in the same session.

### 8.16 Preview (inline, before download)
PDF → `share.html` embeds `<iframe src="/public/s/{token}/preview">`. Image → uses `<img src="...">` directly. Docx/Zip → no preview element is rendered; instead: "Preview not available for this file type — please download to view." Viewing a preview never counts as a download and never increments `current_downloads` — preview is "look," download is "take," and they're tracked separately.

### 8.17 Download button
Recipient clicks **Download**. Frontend calls `GET /public/s/{token}/download`. Backend re-runs the same checks as 8.14 (never assume a page loaded a few minutes ago is still valid — the link could have been revoked or hit its limit since). If valid: atomically increment `current_downloads` via a Redis INCR-and-compare so two simultaneous downloads on the last remaining slot can't both succeed; log a SUCCESS entry (IP, browser, device, timestamp); if `watermark_enabled` is true and the file is a PDF, stamp the timestamp at the bottom-right corner of every page with PDFBox before streaming the response (the stored file on disk is never modified — only the outgoing copy is stamped); stream the bytes back with the correct `Content-Disposition`/`Content-Type` headers.

### 8.18 QR Code button
Each link on the dashboard has a **Show QR** button displaying the code generated at link-creation time. It always encodes the exact same share URL for that link — never regenerate it with different content.

### 8.19 Search box (dashboard)
User types in the search box. Frontend debounces (~300ms after typing stops), then calls `GET /api/files?search={query}&page=0&size=10`. Backend does a case-insensitive match on `original_filename`. Results replace the file list; pagination controls update based on the total count returned.

### 8.20 Access Logs view
User clicks **View Logs** on a link. Frontend calls `GET /api/links/{linkId}/logs`. Backend returns a paginated, newest-first list of `access_logs` rows: IP, browser, device, timestamp, status (SUCCESS/FAILED/BLOCKED) with a reason (e.g. "wrong password," "expired").

### 8.21 Scheduled Cleanup (no button — runs automatically)
Once a day, `ExpiredFileCleanupJob` finds share links where `is_active=false` OR `expiry_time < now`, and where that state has held for more than 7 days, then deletes the corresponding files (all versions) from disk and their DB rows. The user never directly triggers this.

---

## 9. Workflow Summary (short version of section 8)

1. User registers or logs in (JWT / Google OAuth2) → token stored client-side, attached to all authenticated requests
2. User uploads a file → stored on disk, DB record + first version created
3. User uploads a new version anytime → old versions kept, links auto-serve the latest
4. User creates a share link for that file → sets expiry, download limit, optional password, optional watermark toggle → backend generates UUID token, stores link config, generates QR code
5. User shares the link (any messaging app — it's just a URL)
6. Recipient opens link → backend validates (revoked? expired? limit reached? password needed?) → shows preview if supported → shows Download button
7. Recipient downloads → download count atomically incremented in Redis → access logged (IP, browser, device) → if watermark enabled and file is PDF, watermark stamped bottom-right at download time
8. Owner can view access logs, version history, revoke a link, or delete a file anytime from the dashboard
9. Scheduled job runs daily → deletes files whose links have been expired/revoked for 7+ days

---

## 10. Future Scope (do NOT implement now)

- AWS S3 storage integration (swap out local disk storage)
- Selective share links pinned to a specific version (currently all links always serve the latest version)
- Image watermarking (currently PDF only)
- Docx/Zip inline preview
- Elasticsearch-based search (currently basic JPA search)
- Multi-factor authentication
- Team/organization-level sharing and shared folders
- Email notifications when a link is accessed
- Access log export (CSV/PDF report)
- Refresh token flow (currently single JWT access token only)
