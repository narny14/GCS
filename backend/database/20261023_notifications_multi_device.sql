-- FastFood One: migration additive. Exportez la base avant exécution.
-- Hypothèse à vérifier : users.id existe et est compatible avec BIGINT UNSIGNED.
CREATE TABLE IF NOT EXISTS user_devices (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 user_id BIGINT UNSIGNED NOT NULL,
 installation_id VARCHAR(128) NOT NULL,
 fcm_token VARCHAR(4096) NOT NULL,
 platform ENUM('android','ios','web','unknown') NOT NULL DEFAULT 'unknown',
 device_label VARCHAR(160) NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_user_installation(user_id,installation_id),
 UNIQUE KEY uq_device_token(fcm_token(255)), KEY idx_devices_user_active(user_id,is_active),
 CONSTRAINT fk_device_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 user_id BIGINT UNSIGNED NULL,
 order_id BIGINT UNSIGNED NULL,
 recipient_type ENUM('customer','restaurant','admin') NOT NULL DEFAULT 'customer',
 notification_type VARCHAR(64) NOT NULL,
 title VARCHAR(180) NOT NULL,
 body VARCHAR(1000) NOT NULL,
 data_json JSON NULL,
 delivery_status ENUM('queued','sent','partial','failed','not_configured') NOT NULL DEFAULT 'queued',
 sent_count INT UNSIGNED NOT NULL DEFAULT 0,
 failed_count INT UNSIGNED NOT NULL DEFAULT 0,
 last_error VARCHAR(1000) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 sent_at DATETIME NULL,
 read_at DATETIME NULL,
 PRIMARY KEY(id), KEY idx_notif_user_created(user_id,created_at),
 KEY idx_notif_order(order_id,created_at), KEY idx_notif_status_created(delivery_status,created_at),
 CONSTRAINT fk_notification_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_deliveries (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 notification_id BIGINT UNSIGNED NOT NULL,
 device_id BIGINT UNSIGNED NULL,
 platform ENUM('android','ios','web','unknown') NOT NULL DEFAULT 'unknown',
 token_fingerprint CHAR(64) NOT NULL,
 delivery_status ENUM('sent','failed','invalid_token') NOT NULL,
 provider_message_id VARCHAR(255) NULL,
 error_code VARCHAR(128) NULL,
 error_message VARCHAR(1000) NULL,
 attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), KEY idx_delivery_notification(notification_id), KEY idx_delivery_device(device_id),
 CONSTRAINT fk_delivery_notification FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
 CONSTRAINT fk_delivery_device FOREIGN KEY(device_id) REFERENCES user_devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 order_id BIGINT UNSIGNED NOT NULL,
 changed_by_user_id BIGINT UNSIGNED NULL,
 old_status VARCHAR(32) NULL,
 new_status VARCHAR(32) NOT NULL,
 customer_message VARCHAR(1000) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), KEY idx_status_history_order(order_id,created_at),
 CONSTRAINT fk_status_history_user FOREIGN KEY(changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
