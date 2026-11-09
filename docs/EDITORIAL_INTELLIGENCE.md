# Editorial intelligence

Each Page keeps its own language, editorial settings, model, references and reviewed style memory. This release uses the existing Qwen3 Instruct model and bounded prompt context. It does not train model weights or claim automatic quality gains without evidence.

## Configure a Page

1. Open **Page settings → Language**. Choose **Bangla** for one Bangla caption on Facebook and Instagram. Proper product/model names and units can remain unchanged. Bilingual is still available when deliberately selected for another Page.
2. Under **Editorial intelligence**, add up to eight **public HTTPS reference links**, one per line. Add permitted text excerpts or your own observations in **Reference notes**. Save the Page, reopen it and choose **Analyze saved references**. Follow the real task in **Creative studio → Worker console**.
3. Review the analysis. It extracts general voice and text-described layout principles. A text model cannot inspect image composition from a link. Facebook/Instagram reference links are labelled **manual notes required**; they do not grant public-content API permissions. Protected, redirected or unavailable pages need a final public URL or pasted notes. The platform never claims to have read blocked content.
4. Set **Our writing style**, **Our visual style**, and the existing per-post-type prompts. Visual notes guide the image provider's backdrop prompt; the existing category-aware compositor preserves the real product, Page branding and typography. Choose **Adaptive** design variations to rotate category-aware signature, quiet and editorial product typography/motifs, or **Fixed** for the category signature. Variations are repeatable for a given post. Reference notes do not automatically rebuild layout code or imitate another brand's artwork.
5. If appropriate, enter a verified **image credit**. It appears on newly generated news images and in the website image-credit field. Only use images you have permission to publish; credit alone does not provide a license.

Save Page settings before starting analysis. Analysis is cached with a fingerprint of the saved URLs and notes; changing them stops the old summary from influencing caption prompts until it is analyzed again.

## News research and generation

The worker checks all active feeds for a Page, with at most three simultaneous downloads. Results are cached for ten minutes within that workspace/Page/feed configuration. Feed fallbacks remain active. Only the latest 24 hours are eligible.

It groups likely related headlines, checks exact URLs and recent story similarity against that Page's existing content, and ranks a shortlist using freshness, category balance, source coverage and image availability. In **Model ranking** mode, Qwen selects from at most eight candidates using supplied excerpts. Invalid or unavailable model ranking falls back to the deterministic score and records that fact. **Efficient ranking** skips that model call. These are editorial relevance scores, not verified popularity or trending scores.

For the chosen cluster, the worker reads up to three related reports from configured sources, then writes an original summary from the evidence. Source URLs, retrieval status, selection method, category and excerpts remain in the draft's **Private research** panel. Reading the same syndicated report on several domains is not independent confirmation. The model must preserve uncertainty, allegations and qualifications, and must not combine conflicting figures into a new claim. Number, language and unsupported-claim checks can correct once or hold the draft when unresolved; they are not a complete truth detector.

Routine publisher/link footers are omitted from new captions and website prose. Source provenance remains in database metadata. Quotes, allegations and report-dependent claims still need appropriate attribution in prose. No output may claim independent reporting that did not happen. Original summaries do not mean disguising copied articles as our own reporting.

The audience sees content, never instructions about automation, model runners or comment timers. The five-minute link-comment task remains independently configured under each Page's delivery settings. Its existence is not announced in a caption or baked into a news-image CTA.

## Reviewed learning

On a content card, choose **Teach this Page's style**, add a useful note, and mark **Use as a style example** or **Avoid this style**. Feedback is version checked, workspace scoped and stored against this Page. It does not approve or publish a post.

At most 20 examples are retained per Page. Each generation retrieves a bounded selection matching its post type and language. Examples guide voice and pacing; their old facts never become evidence for a new story or product. The generation records the editorial profile version and memory revision in post metadata. Every generation records bounded quality counts (generated, corrected, held) and objective warning categories. Future prompts reinforce the corresponding safeguards; old generated claims are never treated as evidence. Automatic approval/publication does not create training examples. Real Page engagement, where collected, remains observational guidance with a minimum sample threshold, rather than a guarantee of reach or a reason to exaggerate claims.

Use **Reviewed examples** in Page settings to inspect memory. Disable learning to stop retrieving examples, or **Reset style memory** to clear them. Manual notes and references remain. An ordinary Page-settings save cannot replace the server-owned feedback history.

## Next releases: evaluations, fine-tuning and video

1. Build a versioned evaluation set across news, apparel, electronics, quotes and educational Pages. Measure factual errors, language consistency, edit rate and draft acceptance before changing models or prompts. Add authorized search providers for research beyond configured feeds; no unrestricted browser/search agent is included in this release.
2. Collect explicitly reviewed, licensed examples and negative feedback with provenance, privacy review and opt-in export. Keep tenant datasets separate. Compare retrieval-only prompting with a small supervised LoRA adapter on a stronger supported GPU. Fine-tuning an existing model is a later option; training a foundation model from scratch is unsuitable for the current PCs and workload. [TRL's SFT documentation](https://huggingface.co/docs/trl/en/sft_trainer) describes the dataset-based fine-tuning approach.
3. Add a separately queued short-video pipeline: evidence-backed script → licensed media/storyboard → narration → timed captions → FFmpeg render → review → destination-specific delivery. Start with Text/Image/Reels campaign mixes and reusable motion templates; evaluate local video models on the Ubuntu machine before offering generative video. RX 5500 XT support and available VRAM must be tested, not inferred from its 8 GB label.
4. Version style profiles and experiments, compare outcomes against each Page's baseline, and add a rollback before enabling automatically proposed style changes. Engagement never overrides editorial truthfulness.

The pinned [Qwen3-4B-Instruct-2507 model](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) is a non-thinking checkpoint. Staged ranking, evidence retrieval and correction provide explicit workflow checks; this is not a switch that gives it a thinking-mode checkpoint's capabilities. Windows CPU/context/parallelism limits and overnight buffering remain in force.
