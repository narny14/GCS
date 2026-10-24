-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Hôte : 127.0.0.1:3306
-- Généré le : sam. 24 oct. 2026 à 12:49
-- Version du serveur : 11.8.9-MariaDB-log
-- Version de PHP : 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `u641923167_gcs`
--

-- --------------------------------------------------------

--
-- Structure de la table `meal_options`
--

CREATE TABLE `meal_options` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `group_key` enum('base','viande','accompagnement','legumes','boisson','supplements') NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `image_url` varchar(500) DEFAULT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Déchargement des données de la table `meal_options`
--

INSERT INTO `meal_options` (`id`, `group_key`, `name`, `description`, `price`, `image_url`, `is_available`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 'base', 'Riz nature', 'Portion de riz', 2.00, NULL, 1, 1, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(2, 'base', 'Pâtes', 'Portion de pâtes', 2.50, NULL, 1, 2, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(3, 'viande', 'Poulet grillé', 'Portion de poulet', 4.50, NULL, 1, 1, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(4, 'viande', 'Bœuf', 'Portion de bœuf', 5.50, NULL, 1, 2, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(5, 'accompagnement', 'Frites', 'Portion de frites', 2.00, NULL, 1, 1, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(6, 'legumes', 'Salade composée', 'Salade fraîche', 1.50, NULL, 1, 1, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(7, 'boisson', 'Eau', 'Bouteille d’eau', 1.00, NULL, 1, 1, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(8, 'boisson', 'Soda', 'Canette', 1.80, NULL, 1, 2, '2026-10-21 12:48:39', '2026-10-21 12:48:39'),
(9, 'supplements', 'Fromage supplémentaire', 'Portion de fromage', 0.80, NULL, 1, 1, '2026-10-21 12:48:39', '2026-10-21 12:48:39');

-- --------------------------------------------------------

--
-- Structure de la table `notifications`
--

CREATE TABLE `notifications` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `order_id` bigint(20) UNSIGNED DEFAULT NULL,
  `recipient_type` enum('customer','restaurant','admin') NOT NULL DEFAULT 'customer',
  `notification_type` varchar(64) NOT NULL,
  `title` varchar(180) NOT NULL,
  `body` varchar(1000) NOT NULL,
  `data_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`data_json`)),
  `delivery_status` enum('queued','sent','partial','failed','not_configured') NOT NULL DEFAULT 'queued',
  `sent_count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `failed_count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `last_error` varchar(1000) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `sent_at` datetime DEFAULT NULL,
  `read_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `notification_deliveries`
--

CREATE TABLE `notification_deliveries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `notification_id` bigint(20) UNSIGNED NOT NULL,
  `device_id` bigint(20) UNSIGNED DEFAULT NULL,
  `platform` enum('android','ios','web','unknown') NOT NULL DEFAULT 'unknown',
  `token_fingerprint` char(64) NOT NULL,
  `delivery_status` enum('sent','failed','invalid_token') NOT NULL,
  `provider_message_id` varchar(255) DEFAULT NULL,
  `error_code` varchar(128) DEFAULT NULL,
  `error_message` varchar(1000) DEFAULT NULL,
  `attempted_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `orders`
--

CREATE TABLE `orders` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_number` varchar(24) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `status` enum('pending','accepted','preparing','ready','picked_up','cancelled') NOT NULL DEFAULT 'pending',
  `payment_method` enum('cash_pickup') NOT NULL DEFAULT 'cash_pickup',
  `payment_status` enum('unpaid','paid') NOT NULL DEFAULT 'unpaid',
  `customer_name` varchar(120) NOT NULL,
  `customer_phone` varchar(40) NOT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `ready_at` datetime DEFAULT NULL,
  `picked_up_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `order_items`
--

CREATE TABLE `order_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED DEFAULT NULL,
  `product_name` varchar(150) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `quantity` int(10) UNSIGNED NOT NULL,
  `line_total` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `order_item_options`
--

CREATE TABLE `order_item_options` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_item_id` bigint(20) UNSIGNED NOT NULL,
  `meal_option_id` bigint(20) UNSIGNED DEFAULT NULL,
  `option_group` varchar(30) NOT NULL,
  `option_name` varchar(150) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `quantity` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `line_total` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `order_status_history`
--

CREATE TABLE `order_status_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED NOT NULL,
  `changed_by_user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `old_status` varchar(32) DEFAULT NULL,
  `new_status` varchar(32) NOT NULL,
  `customer_message` varchar(1000) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Structure de la table `products`
--

CREATE TABLE `products` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `category` varchar(80) NOT NULL DEFAULT 'Fast-food',
  `is_available` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `products`
--

INSERT INTO `products` (`id`, `name`, `description`, `image_url`, `price`, `category`, `is_available`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 'Burger classique', 'Steak, salade, tomate et sauce maison', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80', 7.50, 'Burgers', 1, 1, '2026-10-19 20:03:50', '2026-10-20 18:36:16'),
(2, 'Frites', 'Portion de frites croustillantes', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=600&q=80', 2.50, 'Frites', 1, 2, '2026-10-19 20:03:50', '2026-10-20 18:36:16'),
(3, 'Poulet croustillant', 'Poulet pané avec accompagnement', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=600&q=80', 8.90, 'Poulet', 1, 3, '2026-10-19 20:03:50', '2026-10-20 18:36:16'),
(4, 'Boisson', 'Boissons disponibles au restaurant', 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=800&q=80', 2.00, 'Boissons', 1, 10, '2026-10-20 18:32:30', '2026-10-20 19:05:44'),
(5, 'Porc', 'Plat de porc préparé par le restaurant', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=800&q=80', 8.00, 'Porcs', 1, 11, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(6, 'Poisson', 'Plat de poisson préparé par le restaurant', 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80', 9.00, 'Poissons', 1, 12, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(7, 'Légumes', 'Assortiment de légumes préparés', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80', 4.00, 'Legumes', 1, 13, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(8, 'Chèvre', 'Viande de chèvre préparée par le restaurant', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=800&q=80', 10.00, 'Chevres', 1, 14, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(9, 'Vache', 'Viande de bœuf préparée par le restaurant', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=800&q=80', 12.00, 'Vaches', 1, 15, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(10, 'Lapin', 'Plat de lapin préparé par le restaurant', 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80', 11.00, 'Lapins', 1, 16, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(11, 'Dindon', 'Plat de dindon préparé par le restaurant', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80', 10.00, 'Dindons', 1, 17, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(12, 'Gibier', 'Plat de gibier préparé par le restaurant', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80', 14.00, 'Gibiers', 1, 18, '2026-10-20 18:32:30', '2026-10-20 19:02:50'),
(13, 'Pizza classique', 'Pizza garnie avec sauce tomate et fromage', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80', 8.00, 'Pizza', 1, 1, '2026-10-20 18:59:47', '2026-10-20 18:59:47'),
(14, 'Soso', 'Poulet a la congolaise', 'https://gcs-byteatomeneons-com-216696.hostingersite.com/uploads/1792692641340-8df043158f26265f9ba2.jpg', 3.50, 'Poulet', 1, 0, '2026-10-22 18:10:41', '2026-10-22 18:10:41');

-- --------------------------------------------------------

--
-- Structure de la table `product_ratings`
--

CREATE TABLE `product_ratings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED DEFAULT NULL,
  `stars` tinyint(3) UNSIGNED NOT NULL,
  `comment` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Déchargement des données de la table `product_ratings`
--

INSERT INTO `product_ratings` (`id`, `product_id`, `user_id`, `order_id`, `stars`, `comment`, `created_at`, `updated_at`) VALUES
(1, 1, 1, NULL, 3, NULL, '2026-10-21 14:08:31', '2026-10-21 14:08:31'),
(2, 13, 1, NULL, 2, NULL, '2026-10-22 06:36:00', '2026-10-22 06:36:00');

-- --------------------------------------------------------

--
-- Structure de la table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `email` varchar(190) NOT NULL,
  `phone` varchar(40) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('customer','admin') NOT NULL DEFAULT 'customer',
  `fcm_token` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Déchargement des données de la table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `phone`, `password_hash`, `role`, `fcm_token`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'Mimolokwa', 'spencermimo@gmail.com', '0818278312', '$2b$12$ROgUOoIghujtyujqwd4FpOicObNi9iVy7.XZQqsS1sNvVdJxpUCSW', 'admin', NULL, 1, '2026-10-20 03:35:40', '2026-10-22 07:41:05'),
(5, 'Bonjour', 'bonjou@gmail.com', '0818278312', '$2b$12$dY5xLgYN5VjfYl70RpmIzuyhQVeyHMxDU9jss3nWUqDJN0GvKUJni', 'customer', NULL, 1, '2026-10-24 11:59:12', '2026-10-24 11:59:12');

-- --------------------------------------------------------

--
-- Structure de la table `user_devices`
--

CREATE TABLE `user_devices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `installation_id` varchar(128) NOT NULL,
  `fcm_token` varchar(4096) NOT NULL,
  `platform` enum('android','ios','web','unknown') NOT NULL DEFAULT 'unknown',
  `device_label` varchar(160) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_seen_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Index pour les tables déchargées
--

--
-- Index pour la table `meal_options`
--
ALTER TABLE `meal_options`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_meal_options_group` (`group_key`,`is_available`,`sort_order`);

--
-- Index pour la table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notif_user_created` (`user_id`,`created_at`),
  ADD KEY `idx_notif_order` (`order_id`,`created_at`),
  ADD KEY `idx_notif_status_created` (`delivery_status`,`created_at`);

--
-- Index pour la table `notification_deliveries`
--
ALTER TABLE `notification_deliveries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_delivery_notification` (`notification_id`),
  ADD KEY `idx_delivery_device` (`device_id`);

--
-- Index pour la table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_orders_number` (`order_number`),
  ADD KEY `idx_orders_status_created` (`status`,`created_at`),
  ADD KEY `idx_orders_user_created` (`user_id`,`created_at`);

--
-- Index pour la table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_order_items_order` (`order_id`),
  ADD KEY `fk_order_items_product` (`product_id`);

--
-- Index pour la table `order_item_options`
--
ALTER TABLE `order_item_options`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_order_item_options_item` (`order_item_id`),
  ADD KEY `fk_order_item_options_option` (`meal_option_id`);

--
-- Index pour la table `order_status_history`
--
ALTER TABLE `order_status_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_status_history_order` (`order_id`,`created_at`),
  ADD KEY `fk_status_history_user` (`changed_by_user_id`);

--
-- Index pour la table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_products_available` (`is_available`,`sort_order`);

--
-- Index pour la table `product_ratings`
--
ALTER TABLE `product_ratings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_product_rating_user_product` (`user_id`,`product_id`),
  ADD KEY `idx_product_ratings_product` (`product_id`,`created_at`),
  ADD KEY `fk_product_ratings_order` (`order_id`);

--
-- Index pour la table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_users_email` (`email`),
  ADD KEY `idx_users_role` (`role`);

--
-- Index pour la table `user_devices`
--
ALTER TABLE `user_devices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_user_installation` (`user_id`,`installation_id`),
  ADD UNIQUE KEY `uq_device_token` (`fcm_token`(255)),
  ADD KEY `idx_devices_user_active` (`user_id`,`is_active`);

--
-- AUTO_INCREMENT pour les tables déchargées
--

--
-- AUTO_INCREMENT pour la table `meal_options`
--
ALTER TABLE `meal_options`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `notification_deliveries`
--
ALTER TABLE `notification_deliveries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT pour la table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT pour la table `order_item_options`
--
ALTER TABLE `order_item_options`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT pour la table `order_status_history`
--
ALTER TABLE `order_status_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `products`
--
ALTER TABLE `products`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT pour la table `product_ratings`
--
ALTER TABLE `product_ratings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT pour la table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT pour la table `user_devices`
--
ALTER TABLE `user_devices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Contraintes pour les tables déchargées
--

--
-- Contraintes pour la table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `notification_deliveries`
--
ALTER TABLE `notification_deliveries`
  ADD CONSTRAINT `fk_delivery_device` FOREIGN KEY (`device_id`) REFERENCES `user_devices` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_delivery_notification` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE CASCADE;

--
-- Contraintes pour la table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE;

--
-- Contraintes pour la table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Contraintes pour la table `order_item_options`
--
ALTER TABLE `order_item_options`
  ADD CONSTRAINT `fk_order_item_options_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_order_item_options_option` FOREIGN KEY (`meal_option_id`) REFERENCES `meal_options` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Contraintes pour la table `order_status_history`
--
ALTER TABLE `order_status_history`
  ADD CONSTRAINT `fk_status_history_user` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Contraintes pour la table `product_ratings`
--
ALTER TABLE `product_ratings`
  ADD CONSTRAINT `fk_product_ratings_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_product_ratings_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_product_ratings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Contraintes pour la table `user_devices`
--
ALTER TABLE `user_devices`
  ADD CONSTRAINT `fk_device_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
