# AETHER

An original cinematic portfolio experience by Bekassyl Zhaksylyk. The visitor's job is to explore a beautiful world by scrolling. Primary action: Begin the journey. Secondary actions: chapter navigation, optional sound, reduced motion, replay, source.

## Direction

Editorial fine art meets a heavenly film title sequence. An ivory angel and clouds occupy the right of the opening frame, balanced by a restrained left-aligned serif headline. Small technical captions and thin rules contrast the sculptural imagery. Bronze, limestone, smoke, and warm white form a multidimensional palette. No cards or dashboard conventions.

The original user brief asks for angels, morning, heaven, real 3D, and spectacular scroll animation. The key observable decisions are: a dominant angel on first paint; real feather meshes and unfolding wings; three distinguishable chapters; camera and art transitions tied to native scroll; usable navigation at every chapter.

## Layout and tokens

- Target viewports: 1440x900 and 390x844.
- Source of visual tokens: `src/style.css` `:root`.
- Heading: self-hosted Cormorant Garamond, 400/italic.
- UI: self-hosted Manrope, 400/500.
- `--ink`: #f4f0e7; `--muted`: #c5c2b7; `--gold`: #d2b786; `--base`: #242521.
- Fixed WebGL canvas and background below content. No scroll hijacking.
- Mobile typography shrinks without horizontal overflow. Touch controls retain 44px targets.

## State contract

- Loading: HTML content and atmospheric CSS background appear immediately; image decode and WebGL initialization enhance in place.
- Empty: not applicable; no remote collection or user-generated content.
- Error: WebGL failure keeps all text, artwork, and navigation usable. Audio failure is announced by a polite status message and the toggle remains off.
- Partial: missing image retains legible scene gradient; unavailable WebGL retains the complete narrative.
- Success: chapter navigation lands on real sections, replay returns to opening, source opens the real repository.
- Permission: browser audio only begins after user interaction; no authentication or permissions required.
- Reduced motion: system preference respected; user can pause ambient motion. Text remains visible, scrolling stays native.

## Assets

Original generated cinematic art, embedded locally. All 3D feathers, wing arrangement, orbital architecture, particles, and synthesized ambient sound are authored in code. No remote hotlinked assets. Asset generation details live in `ASSETS.md`.
