CREATE TABLE `siteHeroSlides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`content` json NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`revision` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `siteHeroSlides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `moderationRecords` MODIFY COLUMN `entityType` enum('vendor','listing','review','message','conversation','notification','dispute','account','category','site_content','report') NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `notificationType` enum('inquiry_created','inquiry_reply_received','inquiry_resolved','vendor_approved','vendor_rejected','account_status_changed','vendor_status_changed','review_moderated','email_address_action_required','email_delivery_alert','contact_verification_otp','saved_search_match','saved_search_digest') NOT NULL;--> statement-breakpoint
CREATE INDEX `hero_slide_order_idx` ON `siteHeroSlides` (`sortOrder`,`id`);
--> statement-breakpoint
ALTER TABLE `listings` ADD `revision` int NOT NULL DEFAULT 1;
--> statement-breakpoint
INSERT INTO `siteHeroSlides` (`content`, `sortOrder`, `isActive`) VALUES
(JSON_OBJECT(
  'label', 'The marketplace introduction',
  'eyebrow', 'KWANTUHUB: THE AFRICAN DIASPORA MARKETPLACE',
  'headline', 'Where the diaspora', 'emphasis', 'finds home.',
  'description', 'Fabrics, food, language tutors, and wedding services from verified diaspora creators across North America.',
  'primaryLabel', 'Explore Marketplace', 'primaryHref', '/marketplace',
  'secondaryLabel', 'List Your Business', 'secondaryHref', '/vendor/onboarding',
  'note', 'Meet the people behind the work before you make an inquiry.',
  'image', '/media/public/kwantu-hero-fashion-maker_20399257_99e7dc6b.jpg',
  'alt', 'Diaspora textile vendor arranging a hand-dyed textile'
), 0, true),
(JSON_OBJECT(
  'label', 'Featured vendor spotlight',
  'eyebrow', 'VENDOR''S NOTE — VERIFIED VENDOR',
  'headline', 'Meet the hands', 'emphasis', 'behind the heirloom.',
  'description', 'Aunty Eki’s Ankara brings hand-selected textiles, thoughtful styling, and the energy of a familiar market stall to Houston and beyond.',
  'primaryLabel', 'Explore Aunty Eki’s archive', 'primaryHref', '/vendors/aunty-eki-s-ankara',
  'secondaryLabel', 'Meet more vendors', 'secondaryHref', '/vendors',
  'note', 'One storefront, a lifetime of pattern, ceremony, and memory.',
  'image', '/media/public/kwantu-ceremony-tailor_6da99e5d_14bae697.jpg',
  'alt', 'Tailor preparing a garment for a family celebration'
), 1, true),
(JSON_OBJECT(
  'label', 'Cultural language and heritage',
  'eyebrow', 'HERITAGE CONNECTION — LIVE TUTORING',
  'headline', 'Language is a', 'emphasis', 'living address.',
  'description', 'Gentle, family-centred Yorùbá sessions, conversational circles, and tutors who keep the sounds of home alive across time zones.',
  'primaryLabel', 'Browse Language Offerings', 'primaryHref', '/marketplace?category=education-learning',
  'secondaryLabel', 'Explore All Services', 'secondaryHref', '/marketplace?type=service',
  'note', 'Small group circles and one-on-one immersion classes.',
  'image', '/media/public/kwantu-tutor-family_96516297_e66523e7.jpg',
  'alt', 'Family enjoying language storytelling session together'
), 2, true);