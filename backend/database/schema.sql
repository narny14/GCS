
CREATE DATABASE IF NOT EXISTS fastfood_one
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fastfood_one;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  fcm_token TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Fast-food',
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_products_available (is_available, sort_order)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number VARCHAR(24) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','accepted','preparing','ready','picked_up','cancelled') NOT NULL DEFAULT 'pending',
  payment_method ENUM('cash_pickup') NOT NULL DEFAULT 'cash_pickup',
  payment_status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(40) NOT NULL,
  notes VARCHAR(500) NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ready_at DATETIME NULL,
  picked_up_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  KEY idx_orders_status_created (status, created_at),
  KEY idx_orders_user_created (user_id, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  product_name VARCHAR(150) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- Démo facultative : prix de démonstration, à remplacer dans phpMyAdmin.
INSERT INTO products (name, description, image_url, price, category, is_available, sort_order)
SELECT 'Burger classique', 'Steak, salade, tomate et sauce maison', NULL, 7.50, 'Burgers', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Burger classique');
INSERT INTO products (name, description, image_url, price, category, is_available, sort_order)
SELECT 'Frites', 'Portion de frites croustillantes', NULL, 2.50, 'Accompagnements', 1, 2
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Frites');
INSERT INTO products (name, description, image_url, price, category, is_available, sort_order)
SELECT 'Poulet croustillant', 'Poulet pané avec accompagnement', NULL, 8.90, 'Poulet', 1, 3
WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = 'Poulet croustillant');
