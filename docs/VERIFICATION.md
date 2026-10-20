# AETHER v2 verification

Local release checks completed on 20 October 2026.

- JavaScript syntax checks and the production build passed.
- Dynamics checks passed for floor contact, ballistic jumps, collision separation, damping and 30/60/120 Hz consistency. One thousand battle seeds produced distinct action/damage sequences, with victories for both factions.
- Geometry checks found 1,000 distinct SHA-256 hashes across 20 archetypes. Skinning checks covered 477,175 vertex weights, independent joint deformation and stable bind/reset transforms.
- Browser verification covered 28 desktop/mobile cases: **27 passed and one intentional mobile archive-load skip**, aggregated from the initial run and targeted reruns after fixes. This is not presented as one uninterrupted clean run. Large archive GLBs were loaded and verified on desktop.
- Browser checks exercised actual WebGL rendering, camera transforms, collection identity and search, portal meshes, figure flipping, focus restoration, audio gestures, reduced motion, fallback/recovery, articulated combat, physical impulses, all 1,000 army participants and replay.
- Ten final production-preview captures covered overview, heaven, hell, collection and battle at 1440×900 and 390×844. Both capture sessions recorded no JavaScript errors. The README preview is from the v2 desktop capture.

Detailed local screenshots and runtime snapshots are retained under the ignored `work/qa-v2/` directory. The ECC design evidence checker validates the accompanying evidence record; visual review was performed separately.

The figures are generated sculptures, with lighter distant geometry and GPU army animation. The project does not claim motion capture, independently hand-sculpted assets, full ragdolls or a guaranteed frame rate. Physical-phone performance has not been measured.
