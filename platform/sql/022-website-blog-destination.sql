BEGIN;
ALTER TABLE creator.pages DROP CONSTRAINT pages_destination_type_check;
ALTER TABLE creator.pages ADD CONSTRAINT pages_destination_type_check CHECK(destination_type IN ('facebook_page','facebook_profile','website'));
ALTER TABLE creator.pages ADD CONSTRAINT website_profile_destination_check CHECK(destination_type<>'website' OR (kind='blog' AND website_publishing AND website_id IS NOT NULL AND facebook_connection_id IS NULL AND fb_page_id IS NULL AND NOT fb_verified));
INSERT INTO creator.migrations(name) VALUES('022-website-blog-destination.sql');
COMMIT;
