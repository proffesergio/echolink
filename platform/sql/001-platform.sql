BEGIN;
CREATE SCHEMA IF NOT EXISTS creator;
CREATE TABLE IF NOT EXISTS creator.migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),auth_subject text NOT NULL UNIQUE,email text NOT NULL,name text NOT NULL,
 role text NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','super_admin')),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 email_verified boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX accounts_email_unique ON creator.accounts(lower(email));
CREATE TABLE creator.plans(
 id text PRIMARY KEY,name text NOT NULL,page_limit integer NOT NULL CHECK(page_limit BETWEEN 1 AND 1000),post_limit integer NOT NULL CHECK(post_limit BETWEEN 1 AND 100000),
 generation_limit integer NOT NULL DEFAULT 20 CHECK(generation_limit BETWEEN 1 AND 100000),period_days integer NOT NULL CHECK(period_days BETWEEN 1 AND 366),
 usd_minor integer CHECK(usd_minor>=0),bdt_minor integer CHECK(bdt_minor>=0),enabled boolean NOT NULL DEFAULT true,features jsonb NOT NULL DEFAULT '{}');
INSERT INTO creator.plans(id,name,page_limit,post_limit,generation_limit,period_days) VALUES
 ('free','Free trial',1,3,12,7),('starter','Starter',3,90,180,30),('growth','Growth',10,600,1200,30),('agency','Agency',30,2400,4800,30);
CREATE TABLE creator.workspaces(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,owner_id uuid NOT NULL REFERENCES creator.accounts(id),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 niche text NOT NULL DEFAULT 'general',language text NOT NULL DEFAULT 'English',onboarded boolean NOT NULL DEFAULT false,desired_pages integer NOT NULL DEFAULT 1 CHECK(desired_pages BETWEEN 1 AND 1000),
 trial_started_at timestamptz NOT NULL DEFAULT now(),trial_ends_at timestamptz NOT NULL DEFAULT now()+interval '7 days',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.memberships(workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),account_id uuid NOT NULL REFERENCES creator.accounts(id),role text NOT NULL DEFAULT 'admin' CHECK(role IN ('owner','admin','editor')),PRIMARY KEY(workspace_id,account_id));
CREATE TABLE creator.subscriptions(
 workspace_id uuid PRIMARY KEY REFERENCES creator.workspaces(id),plan_id text NOT NULL REFERENCES creator.plans(id),status text NOT NULL DEFAULT 'trialing' CHECK(status IN ('trialing','active','past_due','canceled','expired')),
 period_start timestamptz NOT NULL DEFAULT now(),period_end timestamptz NOT NULL DEFAULT now()+interval '7 days',provider text NOT NULL DEFAULT 'trial',provider_customer text,provider_subscription text UNIQUE,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.connections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),provider text NOT NULL,name text NOT NULL,config jsonb NOT NULL DEFAULT '{}',
 secret_cipher text,status text NOT NULL DEFAULT 'saved',last_test_at timestamptz,last_test_result jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id));
CREATE TABLE creator.websites(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),name text NOT NULL,url text NOT NULL,kind text NOT NULL CHECK(kind IN ('news','blog','ecommerce')),
 connector text NOT NULL CHECK(connector IN ('wordpress','shopify','woocommerce','json_catalog','public_product','webhook')),connection_id uuid,config jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,connection_id) REFERENCES creator.connections(workspace_id,id));
CREATE TABLE creator.pages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),name text NOT NULL,niche text NOT NULL,kind text NOT NULL CHECK(kind IN ('news','blog','ecommerce','creator','quotes','education','entertainment')),
 language text NOT NULL DEFAULT 'English',fb_page_id text,fb_verified boolean NOT NULL DEFAULT false,facebook_connection_id uuid,text_connection_id uuid,image_connection_id uuid,
 website_id uuid,website_publishing boolean NOT NULL DEFAULT false,aggregation_enabled boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT false,require_review boolean NOT NULL DEFAULT true,
 timezone text NOT NULL DEFAULT 'Asia/Dhaka',window_start text NOT NULL DEFAULT '09:00',window_end text NOT NULL DEFAULT '23:00',daily_cap integer NOT NULL DEFAULT 3 CHECK(daily_cap BETWEEN 0 AND 200),
 gap_minutes integer NOT NULL DEFAULT 60 CHECK(gap_minutes BETWEEN 1 AND 10080),brand jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT aggregation_enabled OR kind='news'),CHECK(fb_page_id IS NULL OR fb_page_id~'^[0-9]+$'),CHECK(NOT website_publishing OR website_id IS NOT NULL),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,website_id) REFERENCES creator.websites(workspace_id,id),
 FOREIGN KEY(workspace_id,facebook_connection_id) REFERENCES creator.connections(workspace_id,id),FOREIGN KEY(workspace_id,text_connection_id) REFERENCES creator.connections(workspace_id,id),FOREIGN KEY(workspace_id,image_connection_id) REFERENCES creator.connections(workspace_id,id));
CREATE UNIQUE INDEX verified_page_workspace ON creator.pages(fb_page_id) WHERE fb_verified;
CREATE TABLE creator.feeds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,page_id uuid NOT NULL,name text NOT NULL,url text NOT NULL,fallback_url text,active boolean NOT NULL DEFAULT true,
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),UNIQUE(page_id,url));
CREATE TABLE creator.products(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,website_id uuid NOT NULL,external_id text NOT NULL,title text NOT NULL,description text NOT NULL DEFAULT '',url text NOT NULL,
 image_url text,price numeric(18,4),compare_at_price numeric(18,4),currency text,available boolean NOT NULL DEFAULT true,attributes jsonb NOT NULL DEFAULT '{}',fetched_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(website_id,external_id),FOREIGN KEY(workspace_id,website_id) REFERENCES creator.websites(workspace_id,id));
CREATE TABLE creator.posts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,page_id uuid NOT NULL,type text NOT NULL CHECK(type IN ('news','blog','product_sale','quote','original','image')),
 title text NOT NULL,body text NOT NULL DEFAULT '',source_url text,source_hash text,product_id uuid,caption text NOT NULL DEFAULT '',seo jsonb NOT NULL DEFAULT '{}',creative jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','scheduled','publishing','published','failed','unknown','rejected')),
 version integer NOT NULL DEFAULT 1,approved_version integer,scheduled_at timestamptz,published_at timestamptz,fb_post_id text,website_url text,last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),
 FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),FOREIGN KEY(workspace_id,product_id) REFERENCES creator.products(workspace_id,id));
CREATE UNIQUE INDEX post_source_dedup ON creator.posts(page_id,source_hash) WHERE source_hash IS NOT NULL;
CREATE TABLE creator.assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),post_id uuid,path text NOT NULL,mime text NOT NULL,width integer,height integer,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id));
CREATE TABLE creator.usage_reservations(
 workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),post_id uuid NOT NULL,period_start timestamptz NOT NULL,status text NOT NULL CHECK(status IN ('reserved','consumed','released','unknown')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,post_id),FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id));
CREATE TABLE creator.tasks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid,post_id uuid,kind text NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','blocked','unknown','canceled')),
 input jsonb NOT NULL DEFAULT '{}',result jsonb,progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),phase text NOT NULL DEFAULT 'Queued',events jsonb NOT NULL DEFAULT '[]',
 lease_until timestamptz,not_before timestamptz NOT NULL DEFAULT now(),started_at timestamptz,finished_at timestamptz,heartbeat_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id),FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id));
CREATE INDEX task_due ON creator.tasks(status,not_before);
CREATE TABLE creator.publish_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,post_id uuid NOT NULL,task_id uuid NOT NULL,outcome text NOT NULL DEFAULT 'started',remote_id text,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,post_id) REFERENCES creator.posts(workspace_id,id),FOREIGN KEY(workspace_id,task_id) REFERENCES creator.tasks(workspace_id,id));
CREATE UNIQUE INDEX one_live_attempt ON creator.publish_attempts(post_id) WHERE outcome IN ('started','published','unknown');
CREATE TABLE creator.activity(id bigserial PRIMARY KEY,workspace_id uuid REFERENCES creator.workspaces(id),actor_id uuid REFERENCES creator.accounts(id),action text NOT NULL,resource_type text,resource_id text,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX activity_workspace ON creator.activity(workspace_id,created_at DESC);
CREATE TABLE creator.payment_methods(id text PRIMARY KEY,label text NOT NULL,markets text[] NOT NULL,instructions text NOT NULL DEFAULT '',enabled boolean NOT NULL DEFAULT false,config jsonb NOT NULL DEFAULT '{}');
INSERT INTO creator.payment_methods(id,label,markets) VALUES('bank','Bank transfer',ARRAY['international','local']),('stripe','Cards / Stripe',ARRAY['international']),('crypto','Crypto transfer',ARRAY['international']),('bkash','bKash',ARRAY['local']),('nagad','Nagad',ARRAY['local']),('cash','Cash',ARRAY['local']);
CREATE TABLE creator.payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),plan_id text NOT NULL REFERENCES creator.plans(id),method text NOT NULL REFERENCES creator.payment_methods(id),
 amount_minor integer NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency IN ('USD','BDT')),reference text NOT NULL,note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','refunded')),reviewed_by uuid REFERENCES creator.accounts(id),review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,UNIQUE(method,reference));
CREATE TABLE creator.billing_events(provider text NOT NULL,event_id text NOT NULL,payload_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_id));
CREATE TABLE creator.campaigns(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),page_id uuid NOT NULL,name text NOT NULL,goal text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','ready','paused','active','completed')),brief jsonb NOT NULL DEFAULT '{}',start_at timestamptz,end_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,page_id) REFERENCES creator.pages(workspace_id,id));
CREATE TABLE creator.ad_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES creator.workspaces(id),campaign_id uuid NOT NULL,account_id text NOT NULL,
 name text NOT NULL,budget_minor integer NOT NULL CHECK(budget_minor>0),currency text NOT NULL,objective text NOT NULL,status text NOT NULL DEFAULT 'draft',config jsonb NOT NULL DEFAULT '{}',remote_id text,
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,campaign_id) REFERENCES creator.campaigns(workspace_id,id));
CREATE TABLE creator.platform_settings(key text PRIMARY KEY,value jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO creator.platform_settings(key,value) VALUES('release', '{"publicSignup":true,"livePublishing":false,"adSpending":false}');
-- Defense in depth. API/worker queries also always carry workspace_id. The
-- super-admin bypass is a transaction-local server decision, never a request header.
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['connections','websites','pages','feeds','products','posts','assets','usage_reservations','tasks','publish_attempts','activity','payments','campaigns','ad_drafts'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_rows ON creator.%I USING (workspace_id::text=current_setting(''creator.workspace_id'',true) OR current_setting(''creator.super_admin'',true)=''true'') WITH CHECK (workspace_id::text=current_setting(''creator.workspace_id'',true) OR current_setting(''creator.super_admin'',true)=''true'')',name);
 END LOOP;
END $$;
INSERT INTO creator.migrations(name) VALUES('001-platform.sql');
COMMIT;
