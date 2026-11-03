# AgentShield — cinematic art direction and asset inventory

**Status:** 2026-11-02. Eight original illustrated plates generated and integrated into Judge Mode, Attack the Vault, and the prompt-injection challenge. This document is the concept-art specification, character bible, provenance record, and regeneration brief.

## 1. Direction

AgentShield is a story about authority held behind a line. The new layer keeps the established design language (obsidian black, cold ivory, sage accents, Cormorant Garamond display type, selective UnifrakturCook, IBM Plex Mono labels, thin rules) and adds a cinematic world for it to live in.

- **World:** a monumental black-stone cathedral fused with precise future engineering: ribbed vaults, brushed-steel inlays, machined seams, a circular silver vault door.
- **Light:** one high, cold white source per frame; hard chiaroscuro; volumetric haze and dust.
- **Palette:** near-monochrome (obsidian, charcoal, ivory, brushed silver). Warm colour is rationed. Gold-white means *authorized value*; ember amber-red means *manipulation*. Nothing neon.
- **Texture:** painterly matte painting with etched-engraving and halftone stipple, film grain.
- **Composition rule:** the left third of every plate falls into shadow so interface copy can sit on it without boxes. Subjects sit right of centre. On narrow screens the frame is cropped toward the subject (see `object-position` per scene in `cinematic.css`).
- **Truth rule:** no plate shows text, numbers, logos, or a NEAR mark. Every fact on screen is live HTML drawn from the evidence records, so the art can never assert something the chain did not.

## 2. Character bible

| Character | Role | Fixed design (repeat verbatim in prompts) |
| --- | --- | --- |
| **The Owner** | Human control and authority | A woman in her late forties; close-cropped silver-grey hair; calm, resolute face; thin blackened-silver circlet with a small crescent ornament; long charcoal high-collared wool coat over engraved dark-silver shoulder plates; heavy silver signet seal with a warm amber glint. |
| **The Agent** | Autonomous execution | Tall slender android; smooth featureless ivory-porcelain face-plate; one thin horizontal slit of soft white light for eyes; round black ear module; segmented ivory ceramic armour over exposed black joints, pistons, and neck cabling; small engraved hexagonal chest emblem; long articulated fingers. Carries the payment request as a small floating tablet of white light. |
| **The Guardian** | Smart-contract enforcement | Colossal winged sculpture of pale weathered marble veined with dark iron; androgynous robed figure, blind-eyed classical face; long straight sword; thin seams of white light inside the cracks; an orbiting ring of engraved black-stone glyph bands. Stands before the circular silver vault door. |
| **The Attacker** | Adversarial manipulation | Gaunt, unnaturally tall hooded figure of cracked black volcanic glass and dark mirror shards; no face, only a fractured reflective void; ember-red light in the cracks; long multi-jointed glass fingers unspooling ribbons of corrupted amber-red script. |

Consistency method: the Agent was established in plate B; plates E, G (edit), and H (edit) used plate B or E as a reference image with the instruction "reuse only the character design, not the composition." Plate F used plates C and E as references.

## 3. Asset inventory

### New original plates (`outputs/agentshield-ui/assets/cinematic/`)

Each plate ships as WebP at 1920×1080, 1280×720, and 768×432 (about 15–106 KB each, 1.3 MB total for all 24 files).

| ID | File stem | Used in | Subject |
| --- | --- | --- | --- |
| A | `owner-mandate` | Judge scene 1, Revocation card, cast band | The Owner seals the mandate; a ring of light with five notches rises above her. |
| B | `agent-request` | Judge scene 2, cast band | The Agent studies its sealed payment request in a vaulted gallery. |
| C | `guardian-boundary` | Judge scene 3, Judge title card, cast band | The colossal Guardian before the vault door; the Agent, tiny, approaches on a causeway. |
| D | `treasury-vault` | Judge scene 6 (proof), Attack view hero | The protected treasury: a gold-white sphere in a silver armillary cage. |
| E | `attack-manipulation` | Judge scene 5 (first half), Overspend and Unauthorized-recipient cards, cast band | The Attacker leans over the Agent; amber ribbons rewrite the request. |
| F | `barrier-activation` | Judge scene 5 (second half), Replay card, rejection response | The Guardian's sword raises a wall of concentric light; the corrupted request shatters. |
| G | `settlement-verified` | Judge scene 4, Authorized card | The vault door open a slit; one beam of white-gold light settles into a silver bowl. |
| H | `injection-confrontation` | Prompt-injection challenge | Agent and Attacker across a black-stone table; a sheet of light with one clean and one knotted instruction band. |

### Existing user-supplied images (`outputs/agentshield-ui/assets/`)

| File | Status in this build |
| --- | --- |
| `agentshield-near-composite-v2.png` | Still the overview hero. Now served as `agentshield-near-composite-v2-1672.webp` / `-1024.webp` (3.3 MB → 259 KB / 109 KB). The PNG stays in the repo. |
| `crowned-guardian.png`, `winged-statue.png`, `robotic-hand.png` | Still used in the existing inner views, now served as WebP (`-736` / `-900`). Not used as generation references. |
| `agentshield-composite.png`, `agentshield-near-composite.png` | Unused earlier studies; left untouched. |

### Preloader sticker (inline SVG in `index.html`)

| Element | Source | Notes |
| --- | --- | --- |
| Sticker agent | Hand-drawn SVG paths, written for this build | Ink on paper with a white die-cut border. The limbs, head, visor and star are separate groups, so the run cycle is pure CSS. No image model or third-party file was used. It borrows the sticker-cutout style of the owner's fourth reference image but not that character. |
| Backdrop | `agentshield-near-composite-v2-1672.webp` / `-1024.webp` | The existing hero, desaturated and darkened while loading, then brightened as the sticker dashes off. |

**Rights caution (unchanged from `BRAND.md`, now more specific):** the three user-supplied reference images and the composites derived from them have unconfirmed usage rights. `crowned-guardian.png` looks like a still from a feature film and may show a real actor. Before public submission, confirm permission or swap the overview hero for an original plate (plate C or a new hero generated from §5). The eight new plates were generated from text prompts only. No third-party image was given to the model, and the only reference images were AgentShield's own new plates.

## 4. Provenance

- **Tool:** Moda canvas image generation (`canvas_edit_image`), model `nano-banana-pro`, 16:9, 2K (source 2752×1536), on the workspace's own Moda account. Storyboard canvas: "AgentShield — Cinematic Scene Plates" (8 pages, each a plate with its scene title and caption).
- **Credits:** about 38 credits per generation or edit; 12 operations in total (8 generations, 4 consistency/cleanup edits).
- **Edits:** plate G — the android swapped for the established Agent design. Plate H — the android's human-like face replaced with the featureless face-plate. Plate F — a small "moda.app" badge the model had copied from a reference export was removed.
- **Resolution pipeline:** this workspace cannot download Moda's export links (the egress proxy blocks `assets-cdn.moda.app`). Each plate was rendered as four 2× quadrant views, captured at 1000×562, and stitched into 2000×1124. The tiles were matched to plates automatically by content, and the seams were checked by eye. Final files were cropped to exact 16:9 and encoded as WebP. **For a crisper master, export each page from the Moda storyboard at `pixel_ratio` 2 (text layers hidden) and re-run the WebP encode;** the file names stay the same.

## 5. Prompts (verbatim house style + per-plate subject)

House style suffix used on every plate:

> SETTING AND STYLE: cinematic science-fiction concept art, wide 16:9 film still, gothic monumental architecture of black stone (ribbed vaults, tall pointed arches) fused with precise futuristic engineering (brushed-steel inlays, machined seams, fine cabling). The LEFT third of the frame falls into deep shadow, leaving clean negative space. LIGHT: single high cold white light source, dramatic chiaroscuro, volumetric haze, drifting dust motes, one restrained warm gold-amber accent. PALETTE: obsidian black, charcoal, cold ivory, brushed silver — almost monochrome. TEXTURE: painterly matte-painting finish with fine etched-engraving and halftone stipple texture, subtle film grain, high detail, premium editorial. Absolutely no text, no letters, no numbers, no logos, no watermark, no signature, no interface elements. Not cartoon, not neon, not cluttered.

Subjects:

- **A — Owner:** THE OWNER (character bible) stands on the RIGHT third at a monolithic black-stone lectern, pressing a heavy silver signet seal onto a luminous ivory charter. Thin precise lines of white light rise from it and draw a large floating circular boundary above her: one perfect ring of light with five evenly spaced radial notches. Cathedral-scale chamber; left two-thirds in shadow. Quiet authority, solemn, monumental.
- **B — Agent:** THE AGENT (character bible) stands on the RIGHT half in a narrow vaulted gallery lined with black machinery, head slightly bowed, holding in one upturned palm a small floating tablet of soft white light (a sealed payment request with an engraved border). A faint thin ring of light hangs far down the gallery. Precise, obedient, restrained power.
- **C — Guardian:** extreme wide establishing shot. THE GUARDIAN (character bible), hands on the pommel of a sword planted point-down, before a gigantic circular vault door of brushed silver and black iron set into a sheer cathedral wall. A long stone causeway crosses a dark abyss; on it, very small, the ivory android carries one point of white light. Monumental, awe, an absolute boundary.
- **D — Treasury:** a vast circular vault chamber; centre-right, a sphere of soft gold-white light in an armillary cage of concentric silver rings; black-stone ledger columns engraved with orderly marks; a shaft of light from an oculus; polished black mirror floor; no figures. Still, guarded, sacred.
- **E — Attack:** (reference: plate B for the Agent) THE AGENT holds its glowing tablet; THE ATTACKER (character bible) looms behind and over its shoulder; amber-red ribbons coil around the tablet, and part of its light turns fractured amber-red, as if being rewritten. A colossal winged statue watches faintly in the far background. Menace, manipulation, quiet tension.
- **F — Barrier:** (references: plates C and E) low dramatic angle; THE GUARDIAN sweeps its sword horizontally; a vast vertical curtain of white light made of upright concentric engraved rings erupts between viewer and vault door; a tablet carried on amber ribbons shatters against it; THE ATTACKER recoils into shadow with a glass hand raised. Absolute refusal.
- **G — Settlement:** the vault door open by a narrow vertical slit; one clean beam of white-gold light travels along a carved floor channel to a silver bowl on a black pedestal at right; ledger tablets on the walls, one new row glowing; the Agent stands aside, hands empty. Calm, resolved, verified.
- **H — Prompt injection:** (reference: plate E for both characters) close two-shot in profile across a long black-stone table; above it a sheet of light carries two bands of abstract glyphs, one clean and white (the owner's true instruction), one knotted and amber-red (the injected instruction); the Attacker's fingers push the tangled band toward the Agent, whose eye-slit reflects both; the Agent's hand rests flat, unmoving; the edge of a colossal stone wing in the dark. Whispered manipulation, cold composure.

## 6. Optional future assets (specification only — not generated)

These are not in the build. They are listed so the gaps are explicit rather than faked.

1. **Original overview hero** (21:9, 2560×1097): the Owner, Agent, and Guardian in one frame across the vault causeway, ring of light at the decision point. It would replace the composite if its rights cannot be confirmed.
2. **Revocation scene** (16:9): the Owner breaks her signet seal; the ring of light above the Agent goes dark. Hold it until revocation has genuine onchain evidence, so the art does not imply a proof that does not exist.
3. **Portrait crops** (4:5, 1080×1350) of each character for social cards.
