import * as THREE from 'three';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const lerp = THREE.MathUtils.lerp;
const smooth = (from, to, value) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/**
 * A transparent, self-contained celestial sculpture.
 *
 * getProgress returns the page's normalized scroll position (0–1).
 * No assets, controls, global styles, or application state are required.
 */
export function createCelestialScene({
  canvas,
  getProgress = () => 0,
  reducedMotion = false,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
  camera.position.set(0, 0.1, 9.4);

  scene.add(new THREE.HemisphereLight(0xfff7e8, 0x57472f, 1.8));
  const key = new THREE.DirectionalLight(0xfff5df, 3.2);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffdf96, 2.6);
  rim.position.set(4, 1, -3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xe3e9f6, 1.3);
  fill.position.set(-6, -1, 2);
  scene.add(fill);

  const geometries = new Set();
  const materials = new Set();
  const geometry = (value) => {
    geometries.add(value);
    return value;
  };
  const material = (value) => {
    materials.add(value);
    return value;
  };

  // A feather is a softly cupped, fluted surface, not a flat triangle.
  // The off-center spine and asymmetrical vanes give the silhouette a
  // natural taper even when viewed closely or from an oblique angle.
  const featherGeometry = (() => {
    const rows = 30;
    const columns = 8;
    const vertices = [];
    const indices = [];
    const uvs = [];
    for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      const taper = Math.pow(Math.sin(Math.PI * t), 0.68);
      for (let column = 0; column <= columns; column += 1) {
        const u = (column / columns) * 2 - 1;
        const side = u < 0 ? 0.44 : 0.56;
        const width = taper * (0.94 - t * 0.21);
        const x = u * side * width + 0.13 * t * t;
        const rib = (1 - Math.abs(u)) * 0.045 * taper;
        const flute =
          Math.sin((t * 24 - Math.abs(u) * 2.4) * Math.PI) *
          0.005 *
          Math.abs(u) *
          taper;
        const z =
          Math.sin(Math.PI * t) * 0.085 -
          u * u * 0.035 * taper +
          rib +
          flute +
          t * t * 0.08;
        vertices.push(x, t, z);
        uvs.push(column / columns, t);
        if (row < rows && column < columns) {
          const a = row * (columns + 1) + column;
          const b = a + columns + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    result.setIndex(indices);
    result.computeVertexNormals();
    return geometry(result);
  })();

  const spinePath = new THREE.CatmullRomCurve3(
    Array.from({ length: 9 }, (_, index) => {
      const t = index / 8;
      return new THREE.Vector3(
        0.13 * t * t,
        t,
        Math.sin(Math.PI * t) * 0.13 + t * t * 0.08 + 0.003,
      );
    }),
  );
  const spineGeometry = geometry(
    new THREE.TubeGeometry(spinePath, 20, 0.007, 4, false),
  );

  const featherMaterials = Array.from({ length: 4 }, (_, index) =>
    material(
      new THREE.MeshPhysicalMaterial({
        color: [0xf1e9d9, 0xfff5e5, 0xe8dcc7, 0xf8efdd][index],
        roughness: 0.42 + index * 0.035,
        metalness: 0.075,
        clearcoat: 0.28,
        clearcoatRoughness: 0.35,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      }),
    ),
  );
  const featherSpineMaterial = material(
    new THREE.MeshStandardMaterial({
      color: 0xb6995f,
      metalness: 0.58,
      roughness: 0.42,
      transparent: true,
      opacity: 0,
    }),
  );
  const driftingFeatherMaterial = material(
    new THREE.MeshPhysicalMaterial({
      color: 0xfff4df,
      metalness: 0.08,
      roughness: 0.48,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    }),
  );
  const driftingSpineMaterial = material(
    new THREE.MeshStandardMaterial({
      color: 0xc5a46b,
      metalness: 0.5,
      roughness: 0.4,
      transparent: true,
      opacity: 0.65,
    }),
  );
  const goldMaterial = material(
    new THREE.MeshStandardMaterial({
      color: 0xcaaa67,
      emissive: 0x9a6f25,
      emissiveIntensity: 0.24,
      metalness: 0.72,
      roughness: 0.3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const fineGoldMaterial = material(
    new THREE.MeshBasicMaterial({
      color: 0xe2c893,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );

  function makeFeather(bodyMaterial, shaftMaterial) {
    const feather = new THREE.Group();
    feather.add(new THREE.Mesh(featherGeometry, bodyMaterial));
    feather.add(new THREE.Mesh(spineGeometry, shaftMaterial));
    return feather;
  }

  const sculpture = new THREE.Group();
  scene.add(sculpture);
  const wingAssembly = new THREE.Group();
  sculpture.add(wingAssembly);
  const wings = [];
  const blades = [];

  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.scale.x = side;
    wing.position.set(side * 0.08, 0.25, 0);
    wingAssembly.add(wing);
    wings.push({ wing, side });

    // Long flight feathers describe a rising, crescent-shaped silhouette.
    // Successive overlapping tiers conceal their roots like carved marble.
    for (let tier = 0; tier < 3; tier += 1) {
      const count = [22, 19, 15][tier];
      for (let index = 0; index < count; index += 1) {
        const t = index / (count - 1);
        const root = new THREE.Vector3(
          0.16 + 1.7 * t,
          0.14 + 1.21 * t - Math.sin(Math.PI * t) * 0.16,
          tier * 0.055,
        );
        const tip = new THREE.Vector3(
          0.36 + 2.77 * Math.pow(t, 0.88),
          -1.69 + 4.04 * Math.pow(t, 1.32),
          0.08 + Math.sin(t * Math.PI) * 0.12,
        );
        const lengthFactor = [1, 0.72, 0.43][tier];
        const direction = tip.sub(root).multiplyScalar(lengthFactor);
        const length = direction.length();
        const feather = makeFeather(
          featherMaterials[(index + tier) % featherMaterials.length],
          featherSpineMaterial,
        );
        feather.position.copy(root);
        feather.position.y += tier * 0.035;
        feather.rotation.z = -Math.atan2(direction.x, direction.y);
        feather.rotation.x = 0.12 + Math.sin(t * Math.PI) * 0.14;
        feather.rotation.y = Math.sin(t * 4) * 0.12;
        feather.scale.set(
          (0.19 + Math.sin(Math.PI * t) * 0.12) *
            [1, 0.98, 0.85][tier],
          length,
          length * 0.7,
        );
        feather.renderOrder = tier;
        wing.add(feather);
        blades.push({
          feather,
          angle: feather.rotation.z,
          x: feather.rotation.x,
          t,
          tier,
        });
      }
    }

    // Small, overlapping covert feathers round the shoulder and leading edge.
    for (let index = 0; index < 14; index += 1) {
      const t = index / 13;
      const feather = makeFeather(
        featherMaterials[index % featherMaterials.length],
        featherSpineMaterial,
      );
      feather.position.set(
        0.1 + t * 1.74,
        0.11 + t * 1.19,
        0.22,
      );
      feather.rotation.set(0.2, -0.08, -1.8 + t * 0.3);
      feather.scale.set(0.23, 0.43 + t * 0.2, 0.4);
      wing.add(feather);
    }
  }

  const orbitAssembly = new THREE.Group();
  sculpture.add(orbitAssembly);
  const orbits = [];
  [
    { radius: 2.53, x: 0.28, y: 0.3, z: 0.08, width: 0.008 },
    { radius: 2.8, x: 1.07, y: -0.2, z: -0.26, width: 0.006 },
    { radius: 2.95, x: 0.68, y: 0.72, z: 0.18, width: 0.004 },
  ].forEach((config, index) => {
    const ring = new THREE.Mesh(
      geometry(
        new THREE.TorusGeometry(config.radius, config.width, 5, 160),
      ),
      index === 0 ? goldMaterial : fineGoldMaterial,
    );
    ring.rotation.set(config.x, config.y, config.z);
    ring.position.y = 0.12;
    orbits.push({ ring, ...config });
    orbitAssembly.add(ring);
  });

  const halo = new THREE.Mesh(
    geometry(new THREE.TorusGeometry(0.34, 0.012, 6, 90)),
    goldMaterial,
  );
  halo.position.set(0, 1.35, 0.34);
  halo.rotation.x = 0.22;
  wingAssembly.add(halo);

  // The last chapter resolves into a receding architectural gateway.
  const portal = new THREE.Group();
  scene.add(portal);
  const portalMaterials = [];
  const arches = [];
  for (let index = 0; index < 5; index += 1) {
    const archMaterial = material(
      new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0xe5ce9c : 0xf2e7cf,
        emissive: 0xc69643,
        emissiveIntensity: index === 0 ? 0.25 : 0.12,
        roughness: 0.34,
        metalness: index % 2 === 0 ? 0.58 : 0.18,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    portalMaterials.push(archMaterial);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.7, -2.25, 0),
      new THREE.Vector3(-1.7, -0.15, 0),
      new THREE.Vector3(-1.35, 1.28, 0),
      new THREE.Vector3(0, 2.45, 0),
      new THREE.Vector3(1.35, 1.28, 0),
      new THREE.Vector3(1.7, -0.15, 0),
      new THREE.Vector3(1.7, -2.25, 0),
    ]);
    const arch = new THREE.Mesh(
      geometry(new THREE.TubeGeometry(path, 90, index === 0 ? 0.026 : 0.016, 6, false)),
      archMaterial,
    );
    arch.position.z = -index * 0.8;
    arch.scale.setScalar(1 - index * 0.045);
    portal.add(arch);
    arches.push(arch);
  }
  const portalRingMaterial = material(
    new THREE.MeshBasicMaterial({
      color: 0xf4d995,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  const portalRing = new THREE.Mesh(
    geometry(new THREE.TorusGeometry(2.7, 0.009, 6, 180)),
    portalRingMaterial,
  );
  portalRing.position.z = -1.4;
  portal.add(portalRing);

  // Deliberately sparse foreground objects leave the hero artwork legible.
  const looseFeathers = [];
  const looseDefinitions = [
    [-4.15, 1.6, 1.1, 0.52, -0.58],
    [3.8, 1.05, 0.6, 0.65, 0.72],
    [-3.1, -1.7, 2.1, 0.38, -2.4],
    [2.7, -1.6, 2.6, 0.42, 2.2],
    [-1.8, 2.85, -0.5, 0.3, -0.85],
    [4.45, -0.2, -1.8, 0.36, 1.1],
    [-4.8, -0.5, -2.8, 0.33, -1.4],
  ];
  looseDefinitions.forEach(([x, y, z, size, angle], index) => {
    const feather = makeFeather(
      driftingFeatherMaterial,
      driftingSpineMaterial,
    );
    feather.scale.set(size * 0.4, size, size * 0.75);
    feather.rotation.set(0.1 + index * 0.3, index * 0.47, angle);
    scene.add(feather);
    looseFeathers.push({ feather, x, y, z, angle, phase: index * 1.72 });
  });

  // Seeded positions keep the composition consistent across visits.
  let seed = 47291;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const dustCount = 150;
  const dustPosition = new Float32Array(dustCount * 3);
  const dustSize = new Float32Array(dustCount);
  for (let index = 0; index < dustCount; index += 1) {
    dustPosition[index * 3] = (random() - 0.5) * 18;
    dustPosition[index * 3 + 1] = (random() - 0.5) * 12;
    dustPosition[index * 3 + 2] = (random() - 0.5) * 12;
    dustSize[index] = 0.6 + random() * 1.6;
  }
  const dustGeometry = geometry(new THREE.BufferGeometry());
  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(dustPosition, 3),
  );
  dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSize, 1));
  const dustMaterial = material(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.5 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
      },
      vertexShader: `
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 point = position;
          point.x += sin(uTime * 0.13 + position.y) * 0.12;
          point.y += sin(uTime * 0.09 + position.x) * 0.14;
          vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = clamp(aSize * uPixelRatio * (12.0 / -viewPosition.z), 1.0, 5.0);
          vAlpha = 0.38 + 0.4 * sin(position.x * 3.0 + uTime * 0.45);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float distanceToCenter = length(gl_PointCoord - 0.5);
          float glow = pow(max(0.0, 1.0 - distanceToCenter * 2.0), 1.6);
          gl_FragColor = vec4(1.0, 0.91, 0.72, glow * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  let width = 1;
  let height = 1;
  let mobile = false;
  let disposed = false;
  let motionReduced = Boolean(reducedMotion);
  let animationFrame = 0;
  let elapsed = 0;
  let previousTime = 0;
  let currentProgress = clamp01(Number(getProgress()) || 0);
  let lastRenderedProgress = -1;
  let forceRender = true;
  const pointer = new THREE.Vector2();
  const easedPointer = new THREE.Vector2();

  function resize() {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    mobile = width < 760;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dustGeometry.setDrawRange(0, mobile ? 85 : dustCount);
    forceRender = true;
  }

  function onPointerMove(event) {
    pointer.set(
      (event.clientX / width - 0.5) * 2,
      (event.clientY / height - 0.5) * 2,
    );
  }

  function onPointerLeave() {
    pointer.set(0, 0);
  }

  function updateComposition(progress, time) {
    const reveal = smooth(0.31, 0.43, progress);
    const dissolve = 1 - smooth(0.62, 0.8, progress);
    const wingOpacity = reveal * dissolve;
    const opening = smooth(0.32, 0.56, progress);
    const finalReveal = smooth(0.66, 0.84, progress);
    const sculptureScale = mobile ? Math.min(0.52, camera.aspect * 0.94) : 0.9;
    const breath = motionReduced ? 0 : Math.sin(time * 0.5) * 0.025;

    featherMaterials.forEach((value) => {
      value.opacity = wingOpacity;
      value.depthWrite = wingOpacity > 0.94;
    });
    featherSpineMaterial.opacity = wingOpacity * 0.7;
    featherSpineMaterial.depthWrite = wingOpacity > 0.94;
    goldMaterial.opacity = wingOpacity * 0.85;
    fineGoldMaterial.opacity = wingOpacity * 0.4;
    sculpture.visible = wingOpacity > 0.001;
    sculpture.scale.setScalar(sculptureScale);
    sculpture.position.set(
      mobile ? 0 : lerp(1.9, 1.25, opening),
      mobile ? 1.18 : -0.08,
      lerp(-1.3, 0.1, opening) - smooth(0.59, 0.8, progress) * 2.1,
    );
    sculpture.rotation.set(
      lerp(0.04, -0.12, opening),
      lerp(-0.3, 0.2, opening) + easedPointer.x * 0.045,
      -0.035 + breath * 0.2,
    );
    wingAssembly.position.y = breath;
    for (const { wing, side } of wings) {
      wing.rotation.y = side * lerp(1.05, 0.08, opening);
      wing.rotation.z = side * lerp(0.13, -0.045, opening);
      wing.rotation.x = lerp(-0.1, 0.03, opening);
    }
    for (const { feather, angle, x, t, tier } of blades) {
      feather.rotation.z =
        angle + (1 - opening) * (0.2 - t * 0.33) * (1 - tier * 0.12);
      feather.rotation.x =
        x + (motionReduced ? 0 : Math.sin(time * 0.65 + t * 3) * 0.012);
    }
    for (let index = 0; index < orbits.length; index += 1) {
      const { ring, x, y, z } = orbits[index];
      ring.rotation.set(
        x + opening * 0.18,
        y + progress * 0.7 + (motionReduced ? 0 : time * 0.015),
        z + opening * (index % 2 ? -0.2 : 0.16),
      );
    }
    halo.rotation.y = progress * 0.38;

    portal.visible = finalReveal > 0.001;
    portal.scale.setScalar(mobile ? 0.62 : 1.05);
    portal.position.set(
      mobile ? 0 : 1.1 * (1 - smooth(0.8, 1, progress)),
      0.08,
      lerp(-4, -0.6, finalReveal),
    );
    portal.rotation.y = lerp(-0.38, 0, finalReveal);
    portal.rotation.z = (1 - finalReveal) * -0.08;
    portalMaterials.forEach((value, index) => {
      value.opacity = finalReveal * (0.72 - index * 0.09);
    });
    arches.forEach((arch, index) => {
      arch.position.z = -index * lerp(0.5, 1.2, finalReveal);
    });
    portalRingMaterial.opacity = finalReveal * 0.42;
    portalRing.rotation.z = progress * 0.5;
    portalRing.rotation.y = Math.sin(progress * Math.PI) * 0.35;

    looseFeathers.forEach(({ feather, x, y, z, angle, phase }, index) => {
      const drift = motionReduced ? 0 : time;
      feather.visible = !mobile || index < 4;
      feather.position.set(
        x * (mobile ? 0.45 : 1) + Math.sin(drift * 0.12 + phase) * 0.14,
        y + Math.sin(drift * 0.17 + phase) * 0.2 + progress * 0.8,
        z - progress * 2.5,
      );
      feather.rotation.z = angle + Math.sin(drift * 0.13 + phase) * 0.17;
      feather.rotation.y = phase * 0.3 + drift * (index % 2 ? 0.035 : -0.025);
    });
    driftingFeatherMaterial.opacity = lerp(0.78, 0.36, reveal);
    driftingSpineMaterial.opacity = lerp(0.55, 0.24, reveal);

    dust.rotation.y = progress * 0.32 + (motionReduced ? 0 : time * 0.009);
    dust.position.y = progress * 0.7;
    dustMaterial.uniforms.uTime.value = time;
    dustMaterial.uniforms.uOpacity.value = 0.48 + reveal * 0.18;

    camera.position.set(
      easedPointer.x * 0.13 + Math.sin(progress * Math.PI) * 0.16,
      0.1 - easedPointer.y * 0.09,
      lerp(9.4, 8.3, smooth(0.15, 0.6, progress)) -
        smooth(0.8, 1, progress) * 0.3,
    );
    camera.lookAt(0, 0.05, 0);
  }

  function frame(timestamp) {
    if (disposed) return;
    animationFrame = requestAnimationFrame(frame);
    if (document.hidden) {
      previousTime = timestamp;
      return;
    }
    const delta = previousTime ? Math.min((timestamp - previousTime) / 1000, 0.05) : 0;
    previousTime = timestamp;
    if (!motionReduced) elapsed += delta;
    const target = clamp01(Number(getProgress()) || 0);
    currentProgress = motionReduced
      ? target
      : lerp(currentProgress, target, 1 - Math.exp(-delta * 7));
    if (Math.abs(target - currentProgress) < 0.00001) currentProgress = target;
    if (motionReduced) easedPointer.set(0, 0);
    else easedPointer.lerp(pointer, 1 - Math.exp(-delta * 3));
    if (
      motionReduced &&
      !forceRender &&
      Math.abs(currentProgress - lastRenderedProgress) < 0.00001
    ) {
      return;
    }
    updateComposition(currentProgress, motionReduced ? 0 : elapsed);
    renderer.render(scene, camera);
    lastRenderedProgress = currentProgress;
    forceRender = false;
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave, {
    passive: true,
  });
  resize();
  updateComposition(currentProgress, 0);
  renderer.render(scene, camera);
  animationFrame = requestAnimationFrame(frame);

  return {
    setReducedMotion(value) {
      motionReduced = Boolean(value);
      forceRender = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      renderer.dispose();
    },
  };
}
