BEGIN;
CREATE TYPE creator.entity_type AS ENUM ('PERSONAL_PROFILE','BUSINESS_PAGE','CREATOR_PAGE');
ALTER TABLE creator.pages ADD COLUMN entity_type creator.entity_type;
UPDATE creator.pages SET entity_type=CASE WHEN destination_type='facebook_profile' THEN 'PERSONAL_PROFILE' WHEN kind='creator' THEN 'CREATOR_PAGE' ELSE 'BUSINESS_PAGE' END::creator.entity_type;
ALTER TABLE creator.pages ALTER COLUMN entity_type SET NOT NULL;
-- NULL means omitted; BEFORE INSERT assigns legacy destinations without
-- accepting an explicitly contradictory non-NULL entity type.
CREATE FUNCTION creator.derive_page_entity_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.entity_type IS NULL THEN
  NEW.entity_type := CASE WHEN NEW.destination_type='facebook_profile' THEN 'PERSONAL_PROFILE' WHEN NEW.kind='creator' THEN 'CREATOR_PAGE' ELSE 'BUSINESS_PAGE' END::creator.entity_type;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER pages_derive_entity_type BEFORE INSERT ON creator.pages FOR EACH ROW EXECUTE FUNCTION creator.derive_page_entity_type();
ALTER TABLE creator.pages ADD CONSTRAINT pages_entity_destination_check CHECK((entity_type='PERSONAL_PROFILE')=(destination_type='facebook_profile'));
ALTER TABLE creator.pages ADD COLUMN IF NOT EXISTS profile_config jsonb NOT NULL DEFAULT '{}';
-- Preserve every existing language, prompt, preset and workflow configuration.
-- Named defaults apply only when creating a new profile through the API.
ALTER TABLE creator.pages ADD CONSTRAINT pages_profile_config_object_check CHECK(jsonb_typeof(profile_config)='object');
ALTER TABLE creator.pages ADD CONSTRAINT pages_profile_language_mode_check CHECK(NOT profile_config ? 'language_mode' OR profile_config->>'language_mode' IN ('SINGLE_LANGUAGE','DUAL_BILINGUAL'));
ALTER TABLE creator.pages ADD CONSTRAINT pages_profile_primary_language_check CHECK(NOT profile_config ? 'primary_language' OR profile_config->>'primary_language' IN ('bn','en'));
ALTER TABLE creator.pages ADD CONSTRAINT pages_profile_domain_preset_check CHECK(NOT profile_config ? 'domain_preset' OR profile_config->>'domain_preset' IN ('GENERAL','ISLAMIC','EDUCATION','SCIENCE','AI','ISLAMIC_SCIENCE_AI'));
ALTER TABLE creator.pages ADD CONSTRAINT pages_profile_languages_check CHECK(NOT profile_config ? 'languages' OR (jsonb_typeof(profile_config->'languages')='array' AND profile_config->'languages' IN ('["bn"]'::jsonb,'["en"]'::jsonb,'["bn","en"]'::jsonb,'["en","bn"]'::jsonb)));
INSERT INTO creator.migrations(name) VALUES('018-profile-config.sql');
COMMIT;
