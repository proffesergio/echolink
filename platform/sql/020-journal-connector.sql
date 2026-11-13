BEGIN;
-- Add the signed publisher without changing existing stores or delivery receipts.
ALTER TABLE creator.websites DROP CONSTRAINT websites_connector_check;
ALTER TABLE creator.websites ADD CONSTRAINT websites_connector_check
 CHECK(connector IN ('wordpress','shopify','woocommerce','json_catalog','public_product','webhook','nobleseek_db','fabrything_db','fabrything_blog'));
INSERT INTO creator.migrations(name) VALUES('020-journal-connector.sql');
COMMIT;
