"use client";

import { useFrame } from "@react-three/fiber";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  Vector3,
} from "three";
import type { SceneVector3 } from "./destructionScene.ts";
import {
  BASALT_FORCE_FIELD_CELLS,
  BASALT_FORCE_FIELD_CORE_GAIN,
  BASALT_FORCE_FIELD_CORE_SIGMA,
  BASALT_FORCE_FIELD_DISH_DEPTH,
  BASALT_FORCE_FIELD_IMPULSES,
  BASALT_FORCE_FIELD_MAX_IMPACTS,
  BASALT_FORCE_FIELD_MAX_PRESSES,
  BASALT_FORCE_FIELD_PRESS_DEPTH,
  BASALT_FORCE_FIELD_RINGING,
  basaltForceFieldBlocksSegment,
  basaltForceFieldDamageFraction,
  clearBasaltForceFieldImpacts,
  clearBasaltForceFieldPresses,
  createBasaltForceFieldImpactBuffer,
  createBasaltForceFieldPressBuffer,
  damageBasaltForceField,
  emptyBasaltForceFieldDamage,
  expireBasaltForceFieldImpacts,
  intersectBasaltForceField,
  nearestBasaltForceFieldPlate,
  recordBasaltForceFieldImpact,
  setBasaltForceFieldPress,
  type BasaltForceFieldHit,
  type BasaltForceFieldImpactKind,
  type BasaltForceFieldProximity,
} from "./basaltForceField.ts";

export interface BasaltForceFieldRuntime {
  intersectSegment(
    from: SceneVector3,
    to: SceneVector3,
    clearance?: number,
  ): BasaltForceFieldHit | null;
  blocksSegment(from: SceneVector3, to: SceneVector3): boolean;
  /** Nearest live plate the point stands in front of, for approach and press. */
  nearestPlate(
    from: SceneVector3,
    range: number,
  ): BasaltForceFieldProximity | null;
  /** Holds a sustained load in one slot; a null point releases it. */
  press(
    slot: number,
    point: SceneVector3 | null,
    load: number,
    reach?: number,
  ): void;
  /** Moves the membrane without spending any capacity: touch-down, release. */
  pulse(point: SceneVector3, strength: number, reach: number): void;
  /** The world point matters: the membrane is deformed from it, not from the
   *  cell centre, so the dish stays continuous across plate boundaries. */
  hitCell(
    cellIndex: number,
    kind: BasaltForceFieldImpactKind,
    point?: SceneVector3,
  ): void;
  damageFraction(cellIndex: number): number;
}

function cellVisualRelief(
  network: "wall" | "tower",
  q: number,
  r: number,
): number {
  // Visual relief only: keep the analytic shield perfectly stable while its
  // projection inherits the fortress's handmade, slightly uneven surface.
  const seed = Math.sin(
    q * 12.9898 + r * 78.233 + (network === "tower" ? 37.719 : 0),
  ) * 43_758.5453;
  const signedNoise = (seed - Math.floor(seed)) * 2 - 1;
  return signedNoise * 0.095;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uImpactPoint[MAX_IMPACTS];
  uniform vec4 uImpactData[MAX_IMPACTS];
  uniform vec3 uPressPoint[MAX_PRESSES];
  uniform vec4 uPressData[MAX_PRESSES];
  uniform float uDishDepth;
  uniform float uPressDepth;
  uniform float uRinging;

  attribute float aDamage;
  attribute float aHitTime;

  varying float vDamage;
  varying float vHitTime;
  varying vec2 vLocal;
  varying float vStrain;
  varying vec3 vWorld;

  // The dish springs back THROUGH its rest plane rather than merely relaxing:
  // a dent that only flattens reads as bent metal, the overshoot reads as a
  // field under tension.
  // Slow enough that the swing back through the rest plane is legible: at 3.1
  // the whole event was over inside a fifth of a second and read as a blink.
  const float DISH_DECAY = 2.3;
  const float DISH_OMEGA = 8.6;
  // The ringing is displacement only — it carries no colour of its own and
  // brightens the lattice solely through the strain it causes.
  const float RING_SPEED = 26.0;
  const float RING_OMEGA = 15.0;
  const float RING_DECAY = 1.3;
  const float RING_FALLOFF = 0.045;

  void main() {
    vDamage = aDamage;
    vHitTime = aHitTime;
    vLocal = position.xy;

    vec4 world = instanceMatrix * vec4(position, 1.0);
    // Only the first two basis columns carry the plate radius, so the third
    // one is still the unit face normal.
    vec3 faceNormal = normalize(vec3(instanceMatrix[2]));

    float deflection = 0.0;
    float strain = 0.0;

    for (int slot = 0; slot < MAX_IMPACTS; slot += 1) {
      vec4 data = uImpactData[slot];
      if (data.y <= 0.0) continue;
      float age = uTime - data.x;
      if (age < 0.0) continue;
      float reach = max(0.35, data.z);
      float radius = distance(world.xyz, uImpactPoint[slot]);

      float swing = exp(-age * DISH_DECAY) * cos(age * DISH_OMEGA);
      float shape = exp(-(radius * radius) / (2.0 * reach * reach));
      float travel = data.y * uDishDepth * swing;
      deflection += travel * shape;
      // Radial derivative of that same dish. The membrane is stretched hardest
      // on the slope between the crater floor and the untouched surface, not
      // at the point of impact — so that is where it must glow.
      strain += abs(travel) * shape * radius / (reach * reach);

      float ringAge = age - radius / RING_SPEED;
      if (ringAge <= 0.0) continue;
      float envelope = exp(-ringAge * RING_DECAY) * exp(-radius * RING_FALLOFF);
      float wave = data.y * uRinging * envelope;
      deflection += wave * sin(ringAge * RING_OMEGA);
      strain += abs(wave * cos(ringAge * RING_OMEGA)) * RING_OMEGA / RING_SPEED;
    }

    // Sustained load: no oscillation, no hot core. Presence leans on the
    // membrane, it does not strike it. A negative load is an approach and
    // bulges the surface outward, toward whatever is nearing it.
    for (int slot = 0; slot < MAX_PRESSES; slot += 1) {
      vec4 data = uPressData[slot];
      if (abs(data.x) <= 0.0001) continue;
      float reach = max(0.35, data.y);
      float radius = distance(world.xyz, uPressPoint[slot]);
      float shape = exp(-(radius * radius) / (2.0 * reach * reach));
      float travel = data.x * uPressDepth;
      deflection += travel * shape;
      strain += abs(travel) * shape * radius / (reach * reach);
    }

    // Inward is away from the attacker; the analytic surface never moves.
    world.xyz -= faceNormal * deflection;
    vWorld = world.xyz;
    vStrain = strain;
    gl_Position = projectionMatrix * modelViewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uImpactPoint[MAX_IMPACTS];
  uniform vec4 uImpactData[MAX_IMPACTS];
  uniform float uCoreGain;
  uniform float uCoreSigma;

  varying float vDamage;
  varying float vHitTime;
  varying vec2 vLocal;
  varying float vStrain;
  varying vec3 vWorld;

  const float APOTHEM = 0.8660254;
  const float SEAM_INNER = 0.55;
  const float STRAIN_GAIN = 11.0;
  const float CORE_DECAY = 3.8;

  void main() {
    // A spent cell is a real hole, in the projection as much as in the maths.
    if (vDamage >= 0.999) discard;

    // Distance to the hexagonal boundary: exactly 1.0 along the whole rim,
    // vertices included.
    float hex = max(
      max(abs(dot(vLocal, vec2(APOTHEM, 0.5))), abs(vLocal.y)),
      abs(dot(vLocal, vec2(-APOTHEM, 0.5)))
    ) / APOTHEM;
    float seam = smoothstep(SEAM_INNER, 1.0, hex);

    // Energy lives in the seams, not on the faces. Two neighbours across one
    // gap read almost the same strain, so their rims light together and what
    // the player sees is a strained lattice instead of a row of plates.
    float settling = 0.35 * vDamage * exp(-max(0.0, uTime - vHitTime) * 2.4);
    float held = vDamage * 0.55;
    // Nothing resolves at arm's length. Without this, leaning on the barrier
    // paints the whole view a flat red — the exact failure the lattice was
    // built to escape — while what should read is the bright rim of the bowl
    // out at the edge of vision, with a dark hole where the contact is.
    float nearFade = smoothstep(0.3, 0.78, distance(vWorld, cameraPosition));
    float seamEnergy = seam * nearFade
      * (vStrain * STRAIN_GAIN + settling + held);

    // The core is evaluated per fragment: a cell carries only seven vertices,
    // far too few to resolve something this small.
    float core = 0.0;
    for (int slot = 0; slot < MAX_IMPACTS; slot += 1) {
      vec4 data = uImpactData[slot];
      if (data.y <= 0.0) continue;
      float age = uTime - data.x;
      if (age < 0.0) continue;
      float radius = distance(vWorld, uImpactPoint[slot]);
      core += data.y
        * exp(-(radius * radius) / (2.0 * uCoreSigma * uCoreSigma))
        * exp(-age * CORE_DECAY);
    }
    core *= uCoreGain;

    float energy = seamEnergy + core;
    if (energy < 0.004) discard;

    float protectedSide = gl_FrontFacing ? 1.0 : 0.12;
    // Hot enough to cross the bloom threshold, and hot enough to lose its hue
    // where it is hottest: nothing that emits light stays saturated at its core.
    vec3 tint = mix(uColor, vec3(1.0), clamp(energy * 0.42, 0.0, 1.0));
    gl_FragColor = vec4(
      tint * energy * protectedSide,
      clamp(energy, 0.0, 1.0) * protectedSide
    );
  }
`;

/**
 * Rendered energy only. It deliberately owns no Rapier body and participates
 * in neither support solving nor vehicle mass: interception is an analytic
 * directed projection handled through the runtime ref.
 */
export const BasaltForceFieldSystem = forwardRef<
  BasaltForceFieldRuntime,
  { readonly resetVersion: number }
>(function BasaltForceFieldSystem({ resetVersion }, forwardedRef) {
  const mesh = useRef<InstancedMesh>(null);
  const damageRef = useRef(emptyBasaltForceFieldDamage());
  const hitTimes = useRef(
    Float32Array.from(BASALT_FORCE_FIELD_CELLS, () => -1_000),
  );
  const renderTime = useRef(0);
  const [damage, setDamage] = useState(() => damageRef.current);

  const geometry = useMemo(() => new CircleGeometry(1, 6), []);
  const damageAttribute = useMemo(
    () => new InstancedBufferAttribute(
      new Float32Array(BASALT_FORCE_FIELD_CELLS.length),
      1,
    ).setUsage(DynamicDrawUsage),
    [],
  );
  const hitTimeAttribute = useMemo(
    () => new InstancedBufferAttribute(
      Float32Array.from(BASALT_FORCE_FIELD_CELLS, () => -1_000),
      1,
    ).setUsage(DynamicDrawUsage),
    [],
  );
  const impacts = useMemo(() => createBasaltForceFieldImpactBuffer(), []);
  const presses = useMemo(() => createBasaltForceFieldPressBuffer(), []);
  const material = useMemo(() => new ShaderMaterial({
    defines: {
      MAX_IMPACTS: BASALT_FORCE_FIELD_MAX_IMPACTS,
      MAX_PRESSES: BASALT_FORCE_FIELD_MAX_PRESSES,
    },
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color("#ff2d18") },
      uImpactPoint: { value: impacts.points },
      uImpactData: { value: impacts.data },
      uPressPoint: { value: presses.points },
      uPressData: { value: presses.data },
      uDishDepth: { value: BASALT_FORCE_FIELD_DISH_DEPTH },
      uPressDepth: { value: BASALT_FORCE_FIELD_PRESS_DEPTH },
      uRinging: { value: BASALT_FORCE_FIELD_RINGING },
      uCoreGain: { value: BASALT_FORCE_FIELD_CORE_GAIN },
      uCoreSigma: { value: BASALT_FORCE_FIELD_CORE_SIGMA },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    toneMapped: false,
  }), [impacts, presses]);

  useEffect(() => {
    geometry.setAttribute("aDamage", damageAttribute);
    geometry.setAttribute("aHitTime", hitTimeAttribute);
  }, [damageAttribute, geometry, hitTimeAttribute]);

  useEffect(() => {
    const current = mesh.current;
    if (!current) return;
    const basis = new Matrix4();
    const scale = new Matrix4();
    const position = new Vector3();
    const u = new Vector3();
    const v = new Vector3();
    const normal = new Vector3();
    for (const cell of BASALT_FORCE_FIELD_CELLS) {
      const relief = cellVisualRelief(cell.network, cell.q, cell.r);
      basis.makeBasis(
        u.set(...cell.tangentU),
        v.set(...cell.tangentV),
        normal.set(...cell.normal),
      );
      scale.makeScale(cell.visualRadius, cell.visualRadius, 1);
      basis.multiply(scale);
      basis.setPosition(
        position
          .set(...cell.centre)
          .addScaledVector(normal, relief),
      );
      current.setMatrixAt(cell.index, basis);
    }
    current.instanceMatrix.needsUpdate = true;
  }, []);

  useEffect(() => {
    for (const cell of BASALT_FORCE_FIELD_CELLS) {
      damageAttribute.setX(
        cell.index,
        basaltForceFieldDamageFraction(damage, cell.index),
      );
      hitTimeAttribute.setX(cell.index, hitTimes.current[cell.index]);
    }
    damageAttribute.needsUpdate = true;
    hitTimeAttribute.needsUpdate = true;
  }, [damage, damageAttribute, hitTimeAttribute]);

  useEffect(() => {
    const empty = emptyBasaltForceFieldDamage();
    damageRef.current = empty;
    hitTimes.current.fill(-1_000);
    clearBasaltForceFieldImpacts(impacts);
    clearBasaltForceFieldPresses(presses);
    setDamage(empty);
  }, [impacts, presses, resetVersion]);

  const hitCell = useCallback((
    cellIndex: number,
    kind: BasaltForceFieldImpactKind,
    point?: SceneVector3,
  ) => {
    const previous = damageRef.current;
    const next = damageBasaltForceField(previous, cellIndex, kind);
    const now = renderTime.current;
    for (const cell of BASALT_FORCE_FIELD_CELLS) {
      if (next[cell.index] > previous[cell.index] + 1e-6) {
        hitTimes.current[cell.index] = now;
      }
    }
    // The membrane deforms even where nothing was damaged, so an absorbed
    // burst still moves the lattice.
    const struck = BASALT_FORCE_FIELD_CELLS[cellIndex];
    if (struck) {
      recordBasaltForceFieldImpact(
        impacts,
        point ?? struck.centre,
        BASALT_FORCE_FIELD_IMPULSES[kind],
        now,
      );
    }
    damageRef.current = next;
    setDamage(next);
  }, [impacts]);

  const pulse = useCallback((
    point: SceneVector3,
    strength: number,
    reach: number,
  ) => {
    recordBasaltForceFieldImpact(
      impacts,
      point,
      { strength, reach },
      renderTime.current,
    );
  }, [impacts]);

  useImperativeHandle(forwardedRef, () => ({
    intersectSegment: (from, to, clearance = 0) =>
      intersectBasaltForceField(from, to, damageRef.current, clearance),
    blocksSegment: (from, to) =>
      basaltForceFieldBlocksSegment(from, to, damageRef.current),
    nearestPlate: (from, range) =>
      nearestBasaltForceFieldPlate(from, damageRef.current, range),
    press: (slot, point, load, reach) =>
      setBasaltForceFieldPress(presses, slot, point, load, reach),
    pulse,
    hitCell,
    damageFraction: (cellIndex) =>
      basaltForceFieldDamageFraction(damageRef.current, cellIndex),
  }), [hitCell, presses, pulse]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    renderTime.current = time;
    material.uniforms.uTime.value = time;
    // Retiring spent impulses keeps both shader loops a no-op at rest.
    expireBasaltForceFieldImpacts(impacts, time);
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, BASALT_FORCE_FIELD_CELLS.length]}
      frustumCulled={false}
      renderOrder={18}
    />
  );
});
