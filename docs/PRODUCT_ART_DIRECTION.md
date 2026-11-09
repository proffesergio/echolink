# Product-led sale creatives

Fabrything's sale direction uses the four supplied references for composition
and hierarchy. Their brand marks, campaign copy, models and product images are
not used as artwork. The actual connected catalogue supplies the product image.

## How a design is selected

The renderer inspects the product title, category, type, description and
documented attributes before choosing a visual direction. Title identity takes
precedence over an incorrect broad store category. A hand-wash package, for
example, does not inherit clothing properties from a generic catalogue label.

| Product family | Treatment |
| --- | --- |
| Polo | Light folded-paper geometry, condensed headline, faint POLO type |
| Kidswear | Warm paper rays, expressive rounded/handwritten heading, compact second line |
| Denim | Cool paper, condensed typography, faint DENIM type and vertical structure |
| Women's wear | Ivory architectural arch and a refined serif heading |
| Sportswear / socks | Light directional geometry and a compact athletic headline |
| Fans / charging / electronics | Cool studio surface and a separate verified specification rail |
| Beauty / household packaging | Quiet ivory editorial layout with documented quantity |
| Toys | Restrained playful shapes, without invented age or safety claims |
| Other products | Clean neutral studio treatment based on available catalogue facts |

The short heading comes from the actual catalogue title or the editor's custom
headline. Product proportions are preserved with an inside fit. The hero is
larger than the previous template; specifications occupy a separate rail
instead of covering the item. Square, portrait, story and landscape formats
retain dedicated space for type and footer controls. The Bold and Minimal
editor choices can override the primary typeface.

The supplied Fabrything logo remains the only added campaign logo. A dark
variant or adaptive transparent mark is selected for the light background.
Manufacturer marks physically printed on the product remain part of the real
photo. No additional FABRILIFE / PRODUCT EDIT headline or brand wordmark is
added. Facebook and Instagram handles sit in opposite bottom corners, with
the website in a centred contrast badge and click pointer.

## Facts and captions

Only recognized, documented values become callouts: fabric, GSM and fit for
clothing; battery capacity, explicit runtime, RPM, oscillation or power for
devices; volume or capacity for suitable packages. A charging duration is not
used as operating runtime. Missing specifications are omitted. Prices,
discounts, Colour and Collection labels are excluded. Design palette and font
instructions are not supplied as factual product properties to the caption
model.

The existing bilingual caption policy and channel-specific caption styles
are retained. The Page's editable sale instructions are under **Page settings
→ Post-type prompts → Product sale**; the custom post headline remains editable
on an individual draft. The category-aware composition is implemented in the
renderer and works with the designed background when no image model is linked.
An optional image provider generates an empty backdrop only.

## Cutout quality and limits

The local process uses CPU inference, soft alpha masks and edge matting for
U2-Net, with a 512-pixel working image for the matting solver. Full-resolution
source RGB is retained inside opaque product regions; only the soft fringe is
reconstructed. This bounds the extra CPU/RAM cost on the shared worker. It
validates subject coverage, soft-edge proportion and occupied border
area. A PNG with an almost opaque background does not qualify as an isolated
product. Cropping uses alpha bounds only, preserving pale fabric and packaging.
EXIF orientation is respected. Weak isolation retains the complete original
photo inside a clean panel; no product is silently chopped, stretched or
invented to hide a failed mask.

Apparel masks also remove tiny disconnected islands wholly outside the combined
main-subject bounds. This targets detached campaign badges and barcode debris
while retaining pairs, sets and details within the subject bounds. Devices do
not use this cleanup because a small isolated part may be a real accessory.
Socks use a dedicated paired-product threshold for tiny detached graphics
between or above the main sock silhouettes. These checks remain heuristic;
clean original photos are preferable to catalogue images containing artwork.

These are heuristic checks, not a guarantee of semantic segmentation accuracy.
Hair, transparent materials, low-resolution photos and pre-cropped subjects
still benefit from visual review or a clean source photograph.

The installed `u2netp` model remains in use on this PC. Seven real catalogue
photos were checked with matting enabled. A download of the optional larger
`isnet-general-use` model failed with a network timeout / invalid response,
followed by HTTP 504; its checksum did not validate and it was not enabled.

`PLATFORM_REMBG_MODEL` accepts `u2netp`, `u2net` or `isnet-general-use`.
Only a model already installed in the worker's private model cache is used;
generation jobs do not download missing weights. Empty configuration chooses
cached IS-Net if available, otherwise U2-Net-small. Inference processes exit
after each cutout and remain CPU-bound with two threads.

Implementation references:
[rembg models and matting](https://github.com/danielgatis/rembg),
[Sharp trimming behaviour](https://sharp.pixelplumbing.com/api-resize/#trim).

## Verification and rollout

`product-v7` identifies the new product composition. News and other niche
designs retain their own renderers. Published Facebook artwork is not replaced;
Instagram reuses existing price-free product artwork to keep the channels
consistent. **Creative studio → Refresh queued designs** applies the current
renderer to eligible unpublished content through the normal safe preparation
and scheduling flow.

The studio exposes product family, visual direction, photo treatment and
verified callouts for newly prepared content. Private preview JPEGs and a
contact sheet are under `platform/.local/verification/fabrything-products-v7/`.
Preview generation makes no publication request and creates no live posts.
