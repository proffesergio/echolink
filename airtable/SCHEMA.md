# Complete Airtable schema

Create all three tables with the exact names below. No existing records are supplied.
CSV files contain headers only; JSON includes field types, select choices and link targets.

- Create all three tables, then resolve Linked Page fields to the Page Configurations table.
- IDs use single line text for API provisioning. Airtable record IDs are the runtime relational keys.
- Posting windows use HH:mm text; Timestamp Logged is a writable date/time supplied by the worker.
- FB Permanent Page Token is a legacy placeholder; worker authentication uses secret aliases.

## [] Page Configurations

| Field | Type | Options / relationship |
| --- | --- | --- |
| Page ID | singleLineText |  |
| FB Page Name | singleLineText |  |
| FB Page ID | singleLineText |  |
| FB Permanent Page Token | singleLineText | Legacy placeholder. Use FB Secret Alias and local credential storage instead. |
| Target Language | singleSelect | Bangla, English, Bilingual-Mix |
| AI Infrastructure Target | singleSelect | Ollama, LocalAI, LM Studio, Neon AI Gateway |
| Local Endpoint URL | singleLineText |  |
| Model Identifier | singleLineText |  |
| Temperature | number |  |
| Posting Window Start | singleLineText |  |
| Posting Window End | singleLineText |  |
| Max Posts Per Day | number |  |
| Require Human Approval | checkbox |  |
| Active Status | checkbox |  |
| Timezone | singleLineText |  |
| AI Secret Alias | singleLineText |  |
| FB Secret Alias | singleLineText |  |
| Source Comment Delay Minutes | number |  |
| Minimum Minutes Between Posts | number |  |

## [] Ingestion Feeds

| Field | Type | Options / relationship |
| --- | --- | --- |
| Feed ID | singleLineText |  |
| Linked Page | multipleRecordLinks | [] Page Configurations |
| Feed Name | singleLineText |  |
| RSS / Scraper URL | url |  |
| Fallback URL | url |  |
| Active Status | checkbox |  |

## [] Content Log & Deduplication

| Field | Type | Options / relationship |
| --- | --- | --- |
| Log ID | singleLineText |  |
| Automation ID | singleLineText |  |
| Article Hash ID | singleLineText |  |
| Semantic Vector ID | singleLineText |  |
| Linked Page | multipleRecordLinks | [] Page Configurations |
| Source Title | singleLineText |  |
| Source URL | url |  |
| Extracted Text Content | multilineText |  |
| AI Generated Caption | multilineText |  |
| Media Attachment URLs | multilineText |  |
| Status | singleSelect | Queued, Pending Approval, Approved, Posted, Skipped (Duplicate), Skipped (Outside Window), Failed, Publishing, Publish Unknown, Dry Run, Rejected, Draft |
| Approval Decision | singleSelect | Approved, Rejected |
| FB Post ID Reference | singleLineText |  |
| Timestamp Logged | dateTime |  |
| Timestamp Published | dateTime |  |
| Source Comment Status | singleSelect | Queued, Sending, Sent, Unknown, Failed, Skipped |
| Source Comment ID | singleLineText |  |
| Source Comment Due At | dateTime |  |
| Outcome Detail | multilineText |  |
| Source Published At | dateTime |  |
| Scheduled At | dateTime |  |
| Editorial Analysis | multilineText |  |
| Image Suggestion | multilineText |  |
| Selection Score | number |  |
| Selection Reason | multilineText |  |
| Dashboard Panel | singleLineText |  |
| Website Article URL | url |  |
| Website Post ID | singleLineText |  |
| Website Status | singleSelect | Draft, Published, Failed, Unknown |

