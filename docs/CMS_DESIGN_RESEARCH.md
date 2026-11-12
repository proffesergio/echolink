# EchoLink CMS and Video Studio — design brief

Research checked 2026-11-11. This is a design specification; future video tools and social destinations are not connected by this work.

## Reference patterns

| Reference | Pattern adopted for EchoLink |
| --- | --- |
| [Buffer calendar](https://support.buffer.com/articles/how-to-use-buffers-calendar-feature-FSSKbH32DN) | Independent status/channel filters and calendar views; content lists must query their own scope rather than filter a small overview sample. |
| [Metricool planner](https://metricool.com/planner/) | One publishing workspace across brands and formats, with previews and planning controls close to content. |
| [Planable](https://help.planable.io/hc/en-us/articles/21715323068444-Getting-started-with-Planable) | Clear create/review/approve/schedule states and consistent list/calendar navigation. |
| [Descript video editor](https://www.descript.com/tools/video-editor) | Script-first editing, scenes, captions and audio belong in one project workflow. |
| [LTX storyboard generator](https://ltx.io/studio/platform/ai-storyboard-generator) | A script becomes an editable shot sequence, with scene-level visual direction. |
| [Frame.io review](https://frame.io/features/review-and-approval) | Review belongs to a particular version and time in the video, with comments and approval separated from export. |

These are product patterns, not a copy of another service's branding or interface. The approved EchoLink direction keeps the coral brand accent, adds a readable light content canvas and compact charcoal navigation, and makes operational state quieter and more precise.

## Content management

- A scoped Content Library: All, Drafts, Preparing, Scheduled, Published, Needs attention, Archive and Trash.
- Implemented: Page/status scope, search across loaded titles/captions, publication-time ordering, list/grid views and independent pagination. Additional destination/date/type filters remain design proposals.
- Last synced timestamp and explicit refresh; background updates retain focus and scroll.
- Expandable rows preserve source/context review, website/Facebook confirmations, comments, errors and existing editing dialogs. A separate detail drawer remains a design proposal. Scheduled rows are not shown as published.
- Calendar, Newsroom, Products, Media Library, Prompts, Connectors, Analytics and Settings share one shell. Existing factual/crisis review and uncertain delivery receipts retain their current meaning.

## Video Production — UI only

Project stages: Research → Brief → Script → Storyboard → Voice & captions → Edit → Review → Export.

Plan support for news/explainers, technology, ecommerce, education, food/travel and a custom niche. Project controls include target audience, language, voice, duration, aspect ratio, source links, reference media and per-stage custom prompts. A storyboard owns scenes, shots, narration, visual prompts, media permissions and reusable characters or brand references. The edit surface has video/audio/caption tracks, a preview and safe-area overlays. Review has version selection, time-based notes and a deliverables checklist.

YouTube, Facebook, Instagram and TikTok receive their own export/metadata profiles. Preview controls must not pretend a render or upload succeeded. Planned buttons are disabled or show a clear preview explanation. Example projects and media are labelled, without fabricated analytics or connected-account states.

## Candidate self-hosted connectors

| Tool | Future role | Design treatment |
| --- | --- | --- |
| [Ollama](https://docs.ollama.com/) | Research assistance, scripts, prompt planning | Self-hosted text connector; local and cloud availability are distinct. |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI) | Configurable visual/video workflows | Workflow and capability selector; not an assumed installed service. |
| [Whisper](https://github.com/openai/whisper) | Transcription and caption timing | Language/model selector and transcript review. |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | Local speech generation | Voice/language availability and licence details belong in its setup drawer. |
| [FFmpeg](https://ffmpeg.org/) | Media assembly and export | Local rendering capability, format settings and output inspection. |
| [LTX-Video](https://github.com/Lightricks/LTX-Video) | Future video model option through a compatible workflow | Model-specific licence and hardware requirements; not labelled as unlimited free hosted inference. |

Open-source/self-hosted tools still need suitable infrastructure. The design includes honest Not configured / Planned / UI preview states. This task installs no models, runs no video inference and submits no social videos.

Future uploads must use each destination's approved authorization and API flow; see [YouTube videos.insert](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert) and [TikTok Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started). Existing Facebook/Instagram delivery integrations are not evidence that YouTube or TikTok are connected.

## Functional defects addressed alongside design

Content previously filtered the overview's first 300 creation-sorted rows. Dedicated Page/status/bucket queries now sort Published by actual publication time and preserve pagination across refreshes. Workflow log following is confined to its own scroll viewport; navigation resets the page to the top, while polling preserves position.

Design assets and resumable canvas metadata are kept in ignored `.superdesign/`. The user approved the concrete SuperDesign CMS direction on November 11. The light CMS theme, grouped navigation, scoped Content library, Media library, Page prompt overview, newsroom entry and browser-local Video Studio planning surface are implemented. Video stages cover references/brief, scenes/scripts, voice/captions, timeline planning and review/platform deliverables. Drafts are scoped by workspace and Page; renders, exports, uploads and video AI connectors remain unavailable. No video backend or model was installed.

## Design integration and validation

SuperDesign provided the approved CMS and Video Studio flow. 12ui converted the approved CMS/research images to responsive HTML, then generated target-based alignment kits for Content, research, storyboard and export. Its drafting endpoint still rejected the renewed login scope; conversion and target alignment worked. The kits reported low selector overlap because real Page data, retained operations and honest empty/preview states differ from the example content. Safe shared spacing, typography, surfaces and extracted brand/icon assets were applied manually. No unsafe bulk selector patch was applied.

Reference news thumbnails, sample video frames, fictional reviewers, simulated progress and ready/connected states were replaced with actual assets or explicit placeholders. Existing publishing, crisis/factual holds and unknown-delivery reconciliation remain functional. Desktop/mobile browser validation covers freshness, ordering, focus/scroll preservation, pagination beyond the overview limit, video draft persistence/Page isolation and zero video API mutations.
