# AETHER — design direction

An immersive sculpture gallery that becomes a battlefield. The dominant visual is live, rotatable geometry: ivory and antique gold on one side, charcoal and ember on the other. Two luminous portals anchor the composition. Sparse editorial typography and quiet instrument-like controls leave room for the characters.

The primary actions are entering a portal, inspecting a character, and awakening the sword. A 1,000-character searchable catalog provides direct access to every generated design. Controls remain ordinary accessible HTML around the WebGL stage.

## Composition

- Desktop target: 1440×900. Mobile review target: 390×844.
- Cormorant Garamond for editorial text; Manrope for controls. Both are self-hosted with Cyrillic subsets.
- Full-screen canvas with a restrained fixed header, lower-left selected-character details, bottom-center camera controls and lower-right collection control.
- Scene lighting and portal color distinguish the realms; heaven has a blue/gold colonnade and mist, hell has black rock and red lava.
- Detailed figures are promoted on selection. Simplified distant figures preserve the same seeded identity.
- Combat uses a clear central stage, health bars, restrained event captions and a result/replay panel.

## Motion

Camera destinations ease into place while direct orbit and zoom remain under the visitor's control. Character movement combines skeletal poses, physical follow-through, weapon motion and bounded effects. Army movement has individual phases to avoid synchronized rows.

Reduced motion pauses ambient animation and lowers battle movement. The explicit battle action still produces a playable sequence. Sound is opt-in.

## State contract

- Loading: visible progress text until a real WebGL scene is ready.
- Collection empty: centered search message and clear-search control.
- Selection: exact identity and matching detailed mesh, with focus returned to the canvas.
- World: distinct environment and an explicit return action.
- Battle: controls that conflict with combat are unavailable; replay creates a fresh seed.
- Archive: scans load on demand, with a loading state and recoverable error.
- WebGL failure: visible explanation and reload action.
- Dialogs: native modal focus behavior, Escape to close, focus restoration.

## Asset direction

No image backdrop stands in for the interactive figures. Procedural characters are volumetric meshes. The museum archive is separate and credited. Sources and licenses are in `ASSETS.md`.
