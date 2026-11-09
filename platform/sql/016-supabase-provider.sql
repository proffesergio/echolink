BEGIN;
ALTER TABLE creator.database_profiles DROP CONSTRAINT database_profiles_provider_check;
ALTER TABLE creator.database_profiles ADD CONSTRAINT database_profiles_provider_check CHECK(provider IN ('local','neon','aiven','postgres','supabase'));
INSERT INTO creator.migrations(name) VALUES('016-supabase-provider.sql');
COMMIT;
