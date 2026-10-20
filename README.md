# AETHER — The Other Side

owner: @gojosatorukz
assistant: bekasyl

**One thousand characters. Two worlds. A different battle each time.**

[Open AETHER](https://bekasyl00.github.io/aether-celestial-experience/) · [Source](https://github.com/bekasyl00/aether-celestial-experience)

![AETHER — angels, demons and two dimensional portals](docs/preview.webp)

An interactive creative development project by **Bekassyl Zhaksylyk**. Explore an original collection of 500 angels and 500 demons, enter their worlds, inspect any figure from every angle, and awaken the sword between the portals.

## Explore

- Drag to orbit, use the wheel or zoom controls to inspect details, and flip the selected figure.
- Open the collection to search all 1,000 characters or filter by faction. Selecting a character builds its matching detailed sculpture.
- Click a portal to enter heaven or hell. Each world has its own atmosphere, architecture, terrain and army.
- Activate the central sword to begin a battle with new fighters, tactics, damage rolls and an outcome generated from a fresh seed.
- Enable the synthesized ambient sound, pause motion, or choose balanced rendering.

The collection uses **original procedural geometry** across 20 archetypes. Individual designs vary in anatomy, wings, crowns, horns, faces, drapery, armor and regalia. These are 1,000 distinct generated meshes, not 1,000 independently hand-sculpted or scanned assets. Distant figures use simplified versions; selecting one generates its detailed counterpart with thousands of modeled elements.

The optional museum archive contains **two separately credited photogrammetry models**. They are static sculptures for inspection and are not used as rigged combat characters. See [ASSETS.md](ASSETS.md).

## Animation and physics

Battle characters have skeletal articulation for the torso, head, arms, wrists, legs and wings. Procedural choreography blends anticipation, strikes, blocks, evasions and recovery. Hands carry the blades.

A fixed-step dynamics solver adds momentum, hit impulses, gravity, floor contact, landing compression and spring motion for balance and wing follow-through. The armies use lighter GPU articulation and formation movement. This is an authored real-time animation system, not motion capture or a full cloth/ragdoll simulation.

Fresh battle seeds generate different action sequences and damage. Either faction can win; the same winner can naturally occur in consecutive battles. Reusing a seed reproduces its simulation.

## Run locally

Use Node.js 22.12+.

```bash
npm ci
npm run dev
```

Open the Vite address with `/aether-celestial-experience/`.

```bash
npm run check
npm run test:dynamics
npm run test:models
npm run build
npm run preview
```

For browser verification:

```bash
npx playwright install chromium
npm test
```

The suite starts Vite automatically. On macOS it can use an installed Google Chrome. Set `PLAYWRIGHT_BASE_URL` to test a running preview or the public deployment. The browser tests exercise actual WebGL state, collection identity, camera controls, portal clicks, model flipping, audio, accessibility states and combat.

See the [v2 verification record](docs/VERIFICATION.md) for completed checks and their scope.

`test:dynamics` checks floor contact, bounded ballistic jumps, damping, collision separation, consistency at 30/60/120 Hz, and 1,000 seeded battle sequences. `test:models` hashes all 1,000 geometries and checks actual skeletal vertex deformation, normalized weights and reset stability.

## Project map

| File | Responsibility |
| --- | --- |
| `src/main.js` | Interface, collection, accessibility and battle HUD |
| `src/realm.js` | Three.js scene, worlds, portals, selection and army rendering |
| `src/sculptures.js` | Seeded geometry and character designs |
| `src/rig.js` | Skeletons, skin weights and articulated models |
| `src/combat.js` | Battle simulation, choreography and effects |
| `src/physics.js` | Fixed-step dynamics, impulses and contact |
| `src/audio.js` | Optional Web Audio ambience |
| `src/style.css` | Composition, typography and responsive controls |
| `public/models/` | Two licensed archive scans, loaded on demand |
| `tests/experience.spec.js` | Desktop and mobile browser checks |

Built with JavaScript, Three.js, Vite, CSS and Web Audio. Fonts are self-hosted. No backend, account, external API or paid service is required to run the site.

## Deployment

The [GitHub Pages workflow](https://github.com/bekasyl00/aether-celestial-experience/actions/workflows/deploy.yml) installs locked dependencies, checks syntax, dynamics and model geometry, builds the site and deploys on pushes to `main`.

Rendering requires WebGL 2. A visible recovery screen appears if it is unavailable. Balanced mode reduces GPU cost; actual frame rate depends on the device. Ambient motion respects the system preference, and sound starts only after a user gesture.

## Credits

Created by **Bekassyl Zhaksylyk** with AI-assisted development. Authored code is [MIT licensed](LICENSE). Third-party models, fonts and dependencies retain their own licenses, documented in [ASSETS.md](ASSETS.md).
