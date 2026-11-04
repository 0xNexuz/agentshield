# AgentShield frontend direction

**Status:** pre-event visual and interaction study, 2026-10-26. This is not hackathon implementation evidence.

## Visual idea

AgentShield presents autonomous payment authority as something powerful that must be held within a human-defined boundary. The user supplied three reference images: a crowned guardian, a winged statue with blackletter energy, and a stippled robotic hand. A new composite image merges those exact motifs into one scene. The guardian represents the owner, the statue the mandate, and the hand the agent's request. A radiant NEAR Protocol mark now replaces the original globe at the point of decision.

This artwork is the hero image, rather than a row of separate reference panels. Inner views use the original images as chapter-specific details. The interface uses obsidian black, cold ivory, restrained gray-green, etched texture, thin rules, Cormorant Garamond display type, selective UnifrakturCook blackletter, and IBM Plex Mono labels. The brand mark is a simple cross-like asterisk. The visual language is Gothic and archival, with technical precision in the controls.

## Copy and product truth

The lead line is **“Power to act. Authority to stop.”** The owner specifies identity, recipient, amount, daily and total budget, and expiry. The agent requests payment under that mandate. The NEAR contract vault enforces it. It is deployed on NEAR Testnet; this is not a mainnet or audited security claim.

The vault is deployed on NEAR Testnet. One restricted-agent payment has settled and three contract rejections are independently verified, and the site rechecks them against public RPC. The Mandate form is a browser-only draft. Owner pause and revoke controls stay disabled until a wallet signing flow is verified end to end. Revocation is tested in NEAR Sandbox only, and NEAR AI inference has not run. Keep authorization, chain submission, and settlement confirmation distinct. Never fill product screens with invented balances or receipts.

## Interaction rules

- Navigation uses a thin moving underline and immediate view switching.
- Artwork can brighten and scale slightly on hover; cards shift within their ruled rows.
- Buttons lift and invert subtly. Inputs use a clear border and focus state.
- A soft page entrance and slow artwork reveal support the image without blocking interaction.
- `prefers-reduced-motion` disables animation and smooth scrolling.
- The local draft form remains keyboard accessible and validates NEAR testnet account IDs and exact decimal amounts before local storage.

## Assets and permissions

The supplied source images live in `assets/crowned-guardian.png`, `assets/winged-statue.png`, and `assets/robotic-hand.png`. The active generated composite is `assets/agentshield-near-composite-v2.png`; its central mark was refined against the NEAR organization's logo. These are user-provided references and a derived design study. On 2026-11-04 the owner confirmed they hold the usage rights to the three supplied images.

## Cinematic layer (2026-11-02)

Judge Mode, Attack the Vault, and the prompt-injection challenge use eight original plates in `assets/cinematic/`. They were generated from text prompts only, with no third-party image given to the model. The character bible, prompts, provenance, and asset inventory are in `../AgentShield-Cinematic-Art-Direction.md`. The usage-rights caution above still applies to the three supplied reference images and the composite hero.

## Preloader (2026-11-03)

The first-visit preloader (`preloader.css`, `preloader.js`) puts a hand-drawn sticker agent over the existing hero composite. The agent is drawn as inline SVG with a white die-cut border, inked limbs, a slit visor and a gold four-point star, and it runs in place. It borrows only the sticker-cutout style of the fourth reference the owner supplied; it is an original drawing, not a copy of that character. The hero artwork itself is unchanged. The preloader waits for the hero image, fonts and page load, shows for at least 1.8 s on a first visit (0.6 s on repeat visits in the same tab), never longer than 5 s, and can be skipped with Escape, a click or the Skip intro button. With reduced motion it does not animate. Without JavaScript it hides itself after 7 s.

## Favicon (2026-11-03)

The favicon is the site's ✣ brand sigil, drawn as an original vector: four ivory balloon spokes with a gold centre on an obsidian tile. Files: `favicon.ico` (16/32/48), `assets/icons/favicon.svg`, `assets/icons/apple-touch-icon.png` (180, square; iOS rounds it), and `assets/icons/icon-192.png` / `icon-512.png` (mark inside the maskable safe zone) listed in `site.webmanifest`.
