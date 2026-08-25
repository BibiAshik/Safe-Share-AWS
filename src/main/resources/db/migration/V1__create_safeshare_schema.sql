CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    email_verified BIT DEFAULT b'0',
    auth_provider VARCHAR(255) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_users_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE files (
    id BIGINT NOT NULL AUTO_INCREMENT,
    owner_id BIGINT NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(255) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_files_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE file_versions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    file_id BIGINT NOT NULL,
    version_number INT NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path VARCHAR(255) NOT NULL,
    uploaded_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_file_versions_file FOREIGN KEY (file_id) REFERENCES files (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE share_links (
    id BIGINT NOT NULL AUTO_INCREMENT,
    file_id BIGINT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expiry_time DATETIME(6),
    max_downloads INT,
    current_downloads INT NOT NULL DEFAULT 0,
    password_hash VARCHAR(255),
    is_active BIT NOT NULL DEFAULT b'1',
    revoked_at DATETIME(6),
    watermark_enabled BIT NOT NULL DEFAULT b'0',
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_share_links_token UNIQUE (token),
    CONSTRAINT fk_share_links_file FOREIGN KEY (file_id) REFERENCES files (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE access_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    share_link_id BIGINT NOT NULL,
    ip_address VARCHAR(255),
    browser VARCHAR(255),
    device VARCHAR(255),
    accessed_at DATETIME(6) NOT NULL,
    status VARCHAR(255) NOT NULL,
    reason VARCHAR(255),
    PRIMARY KEY (id),
    CONSTRAINT fk_access_logs_share_link FOREIGN KEY (share_link_id) REFERENCES share_links (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE account_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT,
    token VARCHAR(80) NOT NULL,
    user_id BIGINT NOT NULL,
    token_type VARCHAR(40) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    used_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_account_tokens_token UNIQUE (token),
    CONSTRAINT fk_account_tokens_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_files_owner_id ON files (owner_id);
CREATE INDEX idx_file_versions_file_id_version ON file_versions (file_id, version_number);
CREATE INDEX idx_share_links_file_id ON share_links (file_id);
CREATE INDEX idx_share_links_expiry_time ON share_links (expiry_time);
CREATE INDEX idx_share_links_revoked_at ON share_links (revoked_at);
CREATE INDEX idx_access_logs_share_link_accessed ON access_logs (share_link_id, accessed_at);
CREATE INDEX idx_account_tokens_user_type ON account_tokens (user_id, token_type);
