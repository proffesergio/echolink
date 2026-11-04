ALTER TABLE echolink.articles DROP CONSTRAINT articles_status_check;
ALTER TABLE echolink.articles ADD CONSTRAINT articles_status_check
CHECK (status IN ('Queued','Draft','Pending Approval','Approved','Posted','Skipped (Duplicate)','Failed','Publishing','Publish Unknown','Dry Run','Rejected'));
