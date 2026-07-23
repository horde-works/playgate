"use client";

import { RoundedBox, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BoxGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  Texture,
  Vector3,
} from "three";

export interface SwingDefinition {
  readonly id: number;
  readonly reach: number;
}

const WOOD_TEXTURE_URL = "/games/make-a-mess/textures/wood.webp";
const STEEL_TEXTURE_URL = "/games/make-a-mess/textures/steel.webp";

useTexture.preload(WOOD_TEXTURE_URL);
useTexture.preload(STEEL_TEXTURE_URL);

function cloneWeaponTexture(
  source: Texture,
  repeat: readonly [number, number],
  rotation = 0,
): Texture {
  const texture = source.clone();
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.center.set(0.5, 0.5);
  texture.rotation = rotation;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function useWeaponTextures(): {
  readonly wood: Texture;
  readonly steel: Texture;
} {
  const [woodSource, steelSource] = useTexture([
    WOOD_TEXTURE_URL,
    STEEL_TEXTURE_URL,
  ]);
  const wood = useMemo(
    () => cloneWeaponTexture(woodSource, [1.4, 4.8], Math.PI / 2),
    [woodSource],
  );
  const steel = useMemo(
    () => cloneWeaponTexture(steelSource, [2.2, 2.2]),
    [steelSource],
  );

  useEffect(
    () => () => {
      wood.dispose();
      steel.dispose();
    },
    [steel, wood],
  );

  return { wood, steel };
}

function ViewmodelLighting() {
  return (
    <>
      <pointLight
        position={[-0.32, 0.5, 0.42]}
        color="#ffe5c0"
        intensity={2.1}
        distance={1.35}
        decay={2}
      />
      <pointLight
        position={[0.38, 0.18, -0.28]}
        color="#a9cfff"
        intensity={0.75}
        distance={0.9}
        decay={2}
      />
    </>
  );
}

function FlashBurst({
  flashRef,
  lightRef,
  rear = false,
  size = 1,
}: {
  flashRef: RefObject<Group | null>;
  lightRef?: RefObject<PointLight | null>;
  rear?: boolean;
  size?: number;
}) {
  return (
    <group ref={flashRef} visible={false} scale={size}>
      <mesh rotation={[rear ? Math.PI / 2 : -Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.085, 0.32, 8]} />
        <meshBasicMaterial
          color="#ffde86"
          toneMapped={false}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh
        position={[0, 0, rear ? 0.055 : -0.055]}
        rotation={[rear ? Math.PI / 2 : -Math.PI / 2, 0, Math.PI / 8]}
      >
        <coneGeometry args={[0.055, 0.22, 6]} />
        <meshBasicMaterial
          color="#ff7b34"
          toneMapped={false}
          transparent
          opacity={0.88}
        />
      </mesh>
      <mesh scale={[1, 0.38, 1]}>
        <octahedronGeometry args={[0.095, 0]} />
        <meshBasicMaterial
          color="#fff1bd"
          toneMapped={false}
          transparent
          opacity={0.92}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        color="#ffc46e"
        intensity={0}
        distance={5}
        decay={2}
      />
    </group>
  );
}

function SmokeCloud({
  smokeRef,
  color = "#a8aaa5",
}: {
  smokeRef: RefObject<Group | null>;
  color?: string;
}) {
  return (
    <group ref={smokeRef} visible={false}>
      {[
        [0, 0, 0],
        [0.045, 0.018, 0.025],
        [-0.038, 0.026, -0.014],
        [0.012, 0.055, 0.04],
      ].map((position, index) => (
        <mesh key={index} position={position as [number, number, number]}>
          <sphereGeometry args={[0.055 + index * 0.008, 8, 6]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function animateSmoke(
  group: Group | null,
  elapsed: number,
  lifetime: number,
  travelZ: number,
  rise: number,
  expansion = 1,
): void {
  if (!group) {
    return;
  }
  const visible = elapsed < lifetime;
  group.visible = visible;
  if (!visible) {
    return;
  }
  const progress = Math.min(1, elapsed / lifetime);
  group.position.set(0, rise * progress, travelZ * progress);
  group.rotation.z = progress * 0.55;
  group.scale.setScalar((0.5 + progress * 1.7) * expansion);
  const opacity = Math.sin(progress * Math.PI) * 0.24;
  for (const child of group.children) {
    if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) {
      child.material.opacity = opacity;
    }
  }
}

interface MachineGunCasingSlot {
  age: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly rotation: Vector3;
  readonly spin: Vector3;
}

const MACHINE_GUN_CASING_COUNT = 12;

function createMachineGunCasingSlots(): MachineGunCasingSlot[] {
  return Array.from({ length: MACHINE_GUN_CASING_COUNT }, () => ({
    age: 1,
    position: new Vector3(),
    velocity: new Vector3(),
    rotation: new Vector3(),
    spin: new Vector3(),
  }));
}

function HammerHand() {
  return (
    <group position={[0.012, -0.075, 0.035]} rotation={[0.04, -0.08, -0.03]}>
      <mesh
        position={[0.018, -0.23, 0.035]}
        rotation={[0.06, 0, 0.02]}
        castShadow
      >
        <cylinderGeometry args={[0.072, 0.105, 0.38, 14]} />
        <meshStandardMaterial color="#465044" roughness={0.98} />
      </mesh>
      <mesh position={[0.017, -0.055, 0.022]} castShadow>
        <cylinderGeometry args={[0.084, 0.076, 0.085, 14]} />
        <meshStandardMaterial color="#252a27" roughness={0.92} />
      </mesh>
      <RoundedBox
        args={[0.135, 0.145, 0.112]}
        radius={0.035}
        smoothness={3}
        position={[0, 0.04, 0]}
        castShadow
      >
        <meshStandardMaterial color="#303633" roughness={0.9} />
      </RoundedBox>
      {[-0.044, -0.014, 0.016, 0.046].map((x, index) => (
        <mesh
          key={x}
          position={[x, 0.065 - index * 0.004, -0.058]}
          rotation={[0.16, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.0165, 0.075, 3, 8]} />
          <meshStandardMaterial color="#1f2422" roughness={0.96} />
        </mesh>
      ))}
      <mesh
        position={[-0.074, 0.055, 0.018]}
        rotation={[0, 0.38, -0.92]}
        castShadow
      >
        <capsuleGeometry args={[0.022, 0.082, 3, 10]} />
        <meshStandardMaterial color="#2a302d" roughness={0.93} />
      </mesh>
      <RoundedBox
        args={[0.016, 0.11, 0.007]}
        radius={0.003}
        smoothness={2}
        position={[0.068, 0.035, 0.055]}
      >
        <meshStandardMaterial color="#737d6d" roughness={0.92} />
      </RoundedBox>
    </group>
  );
}

function GunHand({
  position,
  rotation = [0, 0, 0],
  scale = 1,
}: {
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh
        position={[0.025, -0.19, 0.045]}
        rotation={[0.08, 0, 0.02]}
        castShadow
      >
        <cylinderGeometry args={[0.068, 0.098, 0.34, 14]} />
        <meshStandardMaterial color="#4a5347" roughness={0.98} />
      </mesh>
      <mesh position={[0.012, -0.035, 0.025]} castShadow>
        <cylinderGeometry args={[0.08, 0.073, 0.075, 14]} />
        <meshStandardMaterial color="#202522" roughness={0.94} />
      </mesh>
      <RoundedBox
        args={[0.125, 0.13, 0.1]}
        radius={0.032}
        smoothness={3}
        position={[0, 0.045, 0]}
        castShadow
      >
        <meshStandardMaterial color="#2a302d" roughness={0.93} />
      </RoundedBox>
      {[-0.041, -0.013, 0.015, 0.043].map((x, index) => (
        <mesh
          key={x}
          position={[x, 0.06 - index * 0.003, -0.052]}
          rotation={[0.18, 0, 0]}
          castShadow
        >
          <capsuleGeometry args={[0.0155, 0.068, 3, 8]} />
          <meshStandardMaterial color="#191e1c" roughness={0.97} />
        </mesh>
      ))}
      <mesh
        position={[-0.066, 0.058, 0.018]}
        rotation={[0, 0.4, -0.9]}
        castShadow
      >
        <capsuleGeometry args={[0.021, 0.075, 3, 9]} />
        <meshStandardMaterial color="#242a27" roughness={0.95} />
      </mesh>
    </group>
  );
}

function TaperedReceiver({
  front,
  rear,
  depth,
  position,
  texture,
  color,
  metalness,
  roughness,
}: {
  front: readonly [number, number];
  rear: readonly [number, number];
  depth: number;
  position: readonly [number, number, number];
  texture: Texture;
  color: string;
  metalness: number;
  roughness: number;
}) {
  const geometry = useMemo(() => {
    const next = new BoxGeometry(front[0], front[1], depth);
    const positions = next.attributes.position;
    const widthScale = rear[0] / front[0];
    const heightScale = rear[1] / front[1];
    for (let index = 0; index < positions.count; index += 1) {
      if (positions.getZ(index) > 0) {
        positions.setX(index, positions.getX(index) * widthScale);
        positions.setY(index, positions.getY(index) * heightScale);
      }
    }
    positions.needsUpdate = true;
    next.computeVertexNormals();
    return next;
  }, [depth, front, rear]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={position} castShadow>
      <meshStandardMaterial
        map={texture}
        color={color}
        metalness={metalness}
        roughness={roughness}
      />
    </mesh>
  );
}

function BeveledStock({
  width,
  frontHeight,
  rearHeight,
  depth,
  position,
  texture,
}: {
  width: number;
  frontHeight: number;
  rearHeight: number;
  depth: number;
  position: readonly [number, number, number];
  texture: Texture;
}) {
  const geometry = useMemo(() => {
    const profile = new Shape();
    profile.moveTo(-depth / 2, -frontHeight / 2);
    profile.lineTo(-depth / 2, frontHeight / 2);
    profile.lineTo(depth / 2, rearHeight / 2);
    profile.lineTo(depth / 2, -rearHeight / 2);
    profile.closePath();

    const next = new ExtrudeGeometry(profile, {
      depth: width,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.011,
      bevelThickness: 0.011,
      curveSegments: 2,
    });
    next.translate(0, 0, -width / 2);
    next.rotateY(-Math.PI / 2);
    next.computeVertexNormals();
    return next;
  }, [depth, frontHeight, rearHeight, width]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={position} castShadow>
      <meshStandardMaterial
        map={texture}
        color="#604027"
        metalness={0.04}
        roughness={0.78}
      />
    </mesh>
  );
}

export function FirstPersonHammer({ swing }: { swing: SwingDefinition }) {
  const group = useRef<Group>(null);
  const { camera } = useThree();
  const textures = useWeaponTextures();
  const equipProgress = useRef(0);
  const swingProgress = useRef(1);
  const previousSwing = useRef(swing.id);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((state, delta) => {
    if (!group.current) {
      return;
    }

    if (previousSwing.current !== swing.id) {
      previousSwing.current = swing.id;
      swingProgress.current = 0;
    }

    equipProgress.current = Math.min(1, equipProgress.current + delta * 4.4);
    swingProgress.current = Math.min(1, swingProgress.current + delta * 4.6);
    const equip = 1 - Math.pow(1 - equipProgress.current, 3);
    const draw = 1 - equip;
    const progress = swingProgress.current;
    const impactArc = Math.sin(Math.pow(progress, 0.78) * Math.PI);
    const recoil = Math.sin(Math.min(1, progress * 1.7) * Math.PI);
    const idle = state.clock.elapsedTime;
    const idleX = Math.sin(idle * 1.45) * 0.007;
    const idleY = Math.sin(idle * 2.9 + 0.6) * 0.005;

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(
      0.5 - impactArc * 0.18 + idleX,
      -0.4 + recoil * 0.09 + idleY - draw * 0.24,
      -0.72 - impactArc * Math.max(0.18, swing.reach - 0.72) + draw * 0.16,
    );
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(
      -0.16 - impactArc * 0.9 + idleY * 0.7,
      0.06 + idleX * 0.4,
      0.3 + impactArc * 0.44 + idleX * 0.9 + draw * 0.32,
    );
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));
  });

  return (
    <group ref={group} renderOrder={20}>
      <ViewmodelLighting />
      <mesh position={[0, -0.055, 0]} castShadow>
        <cylinderGeometry args={[0.034, 0.047, 0.65, 16]} />
        <meshStandardMaterial
          map={textures.wood}
          color="#b6793f"
          roughness={0.72}
        />
      </mesh>
      <mesh position={[0, -0.31, 0]} castShadow>
        <cylinderGeometry args={[0.051, 0.054, 0.19, 16]} />
        <meshStandardMaterial color="#222724" roughness={0.95} />
      </mesh>
      {[-0.37, -0.33, -0.29, -0.25].map((y) => (
        <mesh
          key={y}
          position={[0, y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <torusGeometry args={[0.051, 0.0055, 6, 18]} />
          <meshStandardMaterial color="#5b3424" roughness={0.88} />
        </mesh>
      ))}
      <mesh position={[0, 0.238, -0.012]} castShadow>
        <cylinderGeometry args={[0.048, 0.04, 0.085, 14]} />
        <meshStandardMaterial
          color="#2d302f"
          metalness={0.72}
          roughness={0.35}
        />
      </mesh>
      <RoundedBox
        args={[0.17, 0.15, 0.34]}
        radius={0.025}
        smoothness={3}
        position={[0, 0.31, -0.018]}
        castShadow
      >
        <meshStandardMaterial
          map={textures.steel}
          color="#4b504f"
          metalness={0.78}
          roughness={0.32}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.15, 0.13, 0.018]}
        radius={0.008}
        smoothness={2}
        position={[0, 0.31, -0.196]}
        castShadow
      >
        <meshStandardMaterial
          map={textures.steel}
          color="#747873"
          metalness={0.9}
          roughness={0.22}
        />
      </RoundedBox>
      <HammerHand />
    </group>
  );
}

export function FirstPersonLauncher({ kick }: { kick: number }) {
  const group = useRef<Group>(null);
  const action = useRef<Group>(null);
  const flash = useRef<Group>(null);
  const flashLight = useRef<PointLight>(null);
  const smoke = useRef<Group>(null);
  const { camera } = useThree();
  const textures = useWeaponTextures();
  const equipProgress = useRef(0);
  const kickProgress = useRef(1);
  const flashTime = useRef(1);
  const smokeTime = useRef(1);
  const previousKick = useRef(kick);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((state, delta) => {
    if (!group.current) {
      return;
    }

    if (previousKick.current !== kick) {
      previousKick.current = kick;
      kickProgress.current = 0;
      flashTime.current = 0;
      smokeTime.current = 0;
    }

    equipProgress.current = Math.min(1, equipProgress.current + delta * 4.1);
    kickProgress.current = Math.min(1, kickProgress.current + delta * 3.2);
    flashTime.current += delta;
    smokeTime.current += delta;
    const equip = 1 - Math.pow(1 - equipProgress.current, 3);
    const draw = 1 - equip;
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);
    const idle = state.clock.elapsedTime;
    const idleX = Math.sin(idle * 1.35) * 0.005;
    const idleY = Math.sin(idle * 2.7 + 0.4) * 0.004;

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(
      0.42 + idleX,
      -0.32 + recoil * 0.05 + idleY - draw * 0.22,
      -0.84 + recoil * 0.17 + draw * 0.16,
    );
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(
      recoil * 0.3 + idleY,
      0.12 + idleX,
      0.045 + idleX + draw * 0.24,
    );
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));

    if (action.current) {
      action.current.position.z = recoil * 0.065;
      action.current.rotation.x = recoil * -0.08;
    }
    const flashVisible = flashTime.current < 0.09;
    if (flash.current) {
      flash.current.visible = flashVisible;
      flash.current.rotation.z = flashTime.current * 18;
    }
    if (flashLight.current) {
      flashLight.current.intensity = flashVisible
        ? 8 * (1 - flashTime.current / 0.09)
        : 0;
    }
    animateSmoke(smoke.current, smokeTime.current, 0.62, -0.34, 0.14, 1.05);
  });

  return (
    <group ref={group} renderOrder={20}>
      <ViewmodelLighting />
      <mesh
        position={[0, 0.015, -0.25]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.07, 0.074, 0.49, 20]} />
        <meshStandardMaterial
          map={textures.steel}
          color="#3e493d"
          metalness={0.54}
          roughness={0.42}
        />
      </mesh>
      <mesh
        position={[0, 0.015, -0.515]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.088, 0.078, 0.07, 20]} />
        <meshStandardMaterial
          color="#252c27"
          metalness={0.66}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, 0.015, -0.553]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.064, 0.064, 0.012, 20]} />
        <meshStandardMaterial color="#080b09" metalness={0.2} roughness={0.8} />
      </mesh>
      <mesh
        position={[0, -0.002, -0.17]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.086, 0.09, 0.225, 12]} />
        <meshStandardMaterial
          map={textures.steel}
          color="#303a32"
          metalness={0.48}
          roughness={0.5}
        />
      </mesh>
      {[-0.255, -0.085].map((z) => (
        <mesh
          key={z}
          position={[0, -0.002, z]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <torusGeometry args={[0.086, 0.009, 7, 20]} />
          <meshStandardMaterial
            color="#242925"
            metalness={0.64}
            roughness={0.34}
          />
        </mesh>
      ))}
      <group ref={action}>
        <mesh
          position={[0, 0.002, -0.078]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <torusGeometry args={[0.092, 0.012, 8, 22]} />
          <meshStandardMaterial
            color="#59615b"
            metalness={0.82}
            roughness={0.25}
          />
        </mesh>
        <RoundedBox
          args={[0.035, 0.03, 0.12]}
          radius={0.006}
          smoothness={2}
          position={[0.085, 0.048, -0.065]}
          rotation={[0, 0, -0.18]}
          castShadow
        >
          <meshStandardMaterial
            color="#252b27"
            metalness={0.75}
            roughness={0.3}
          />
        </RoundedBox>
      </group>
      <mesh
        position={[0, 0.002, 0.42]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.104, 0.103, 0.95, 12]} />
        <meshStandardMaterial
          map={textures.steel}
          color="#343d35"
          metalness={0.58}
          roughness={0.4}
        />
      </mesh>
      <RoundedBox
        args={[0.072, 0.19, 0.085]}
        radius={0.02}
        smoothness={3}
        position={[0, -0.15, 0.135]}
        rotation={[0.26, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#242824" roughness={0.92} />
      </RoundedBox>
      <mesh
        position={[0.082, -0.085, 0.06]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
      >
        <torusGeometry args={[0.047, 0.008, 7, 18]} />
        <meshStandardMaterial
          color="#202421"
          metalness={0.68}
          roughness={0.36}
        />
      </mesh>
      <mesh
        position={[0.073, -0.075, 0.06]}
        rotation={[0.05, 0, 0.18]}
        castShadow
      >
        <boxGeometry args={[0.012, 0.052, 0.012]} />
        <meshStandardMaterial
          color="#8b8067"
          metalness={0.7}
          roughness={0.34}
        />
      </mesh>
      <RoundedBox
        args={[0.025, 0.048, 0.12]}
        radius={0.006}
        smoothness={2}
        position={[0, 0.103, -0.24]}
        castShadow
      >
        <meshStandardMaterial
          color="#161b18"
          metalness={0.68}
          roughness={0.36}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.035, 0.035, 0.045]}
        radius={0.006}
        smoothness={2}
        position={[0, 0.115, 0.11]}
        castShadow
      >
        <meshStandardMaterial
          color="#171b18"
          metalness={0.7}
          roughness={0.34}
        />
      </RoundedBox>
      <GunHand
        position={[0.005, -0.17, 0.145]}
        rotation={[0.04, -0.03, -0.02]}
        scale={0.88}
      />
      <group position={[0, 0.015, -0.59]}>
        <FlashBurst flashRef={flash} lightRef={flashLight} size={0.78} />
        <SmokeCloud smokeRef={smoke} color="#aeb2a9" />
      </group>
    </group>
  );
}

export function FirstPersonRocketLauncher({ kick }: { kick: number }) {
  const group = useRef<Group>(null);
  const sight = useRef<Group>(null);
  const frontFlash = useRef<Group>(null);
  const frontLight = useRef<PointLight>(null);
  const frontSmoke = useRef<Group>(null);
  const rearFlash = useRef<Group>(null);
  const rearLight = useRef<PointLight>(null);
  const rearSmoke = useRef<Group>(null);
  const { camera } = useThree();
  const textures = useWeaponTextures();
  const equipProgress = useRef(0);
  const kickProgress = useRef(1);
  const flashTime = useRef(1);
  const smokeTime = useRef(1);
  const previousKick = useRef(kick);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((state, delta) => {
    if (!group.current) {
      return;
    }

    if (previousKick.current !== kick) {
      previousKick.current = kick;
      kickProgress.current = 0;
      flashTime.current = 0;
      smokeTime.current = 0;
    }

    equipProgress.current = Math.min(1, equipProgress.current + delta * 3.8);
    kickProgress.current = Math.min(1, kickProgress.current + delta * 2.5);
    flashTime.current += delta;
    smokeTime.current += delta;
    const equip = 1 - Math.pow(1 - equipProgress.current, 3);
    const draw = 1 - equip;
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);
    const idle = state.clock.elapsedTime;
    const idleX = Math.sin(idle * 1.18) * 0.005;
    const idleY = Math.sin(idle * 2.36 + 0.9) * 0.004;

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(
      0.47 + idleX,
      -0.33 + recoil * 0.035 + idleY - draw * 0.25,
      -0.94 + recoil * 0.26 + draw * 0.2,
    );
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(
      recoil * 0.42 + idleY,
      -0.075 + idleX,
      0.025 + idleX + draw * 0.25,
    );
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));

    if (sight.current) {
      sight.current.position.z = recoil * 0.04;
      sight.current.rotation.x = recoil * -0.12;
    }
    const frontVisible = flashTime.current < 0.1;
    const rearVisible = flashTime.current < 0.14;
    if (frontFlash.current) {
      frontFlash.current.visible = frontVisible;
      frontFlash.current.rotation.z = flashTime.current * 13;
    }
    if (rearFlash.current) {
      rearFlash.current.visible = rearVisible;
      rearFlash.current.rotation.z = -flashTime.current * 10;
    }
    if (frontLight.current) {
      frontLight.current.intensity = frontVisible
        ? 7 * (1 - flashTime.current / 0.1)
        : 0;
    }
    if (rearLight.current) {
      rearLight.current.intensity = rearVisible
        ? 11 * (1 - flashTime.current / 0.14)
        : 0;
    }
    animateSmoke(frontSmoke.current, smokeTime.current, 0.72, -0.42, 0.16, 1.2);
    animateSmoke(rearSmoke.current, smokeTime.current, 0.86, 0.58, 0.1, 1.55);
  });

  return (
    <group ref={group} renderOrder={20}>
      <ViewmodelLighting />
      <mesh
        position={[0, 0.015, -0.08]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.096, 0.102, 1.02, 22]} />
        <meshStandardMaterial
          map={textures.steel}
          color="#313b34"
          metalness={0.58}
          roughness={0.39}
        />
      </mesh>
      <mesh
        position={[0, 0.015, -0.635]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.135, 0.103, 0.13, 22]} />
        <meshStandardMaterial
          color="#202722"
          metalness={0.68}
          roughness={0.31}
        />
      </mesh>
      <mesh position={[0, 0.015, -0.705]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.102, 0.102, 0.014, 22]} />
        <meshStandardMaterial
          color="#070a08"
          metalness={0.18}
          roughness={0.82}
        />
      </mesh>
      <mesh
        position={[0, 0.015, 0.45]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.104, 0.098, 0.13, 22]} />
        <meshStandardMaterial
          color="#252d28"
          metalness={0.6}
          roughness={0.36}
        />
      </mesh>
      <mesh position={[0, 0.015, 0.522]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.096, 0.096, 0.014, 22]} />
        <meshStandardMaterial
          color="#111512"
          metalness={0.5}
          roughness={0.46}
        />
      </mesh>
      {[-0.46, -0.18, 0.18, 0.37].map((z) => (
        <mesh
          key={z}
          position={[0, 0.015, z]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <torusGeometry args={[0.101, 0.011, 7, 22]} />
          <meshStandardMaterial
            color="#1d231f"
            metalness={0.7}
            roughness={0.32}
          />
        </mesh>
      ))}
      <mesh
        position={[0, 0.015, 0.115]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.1035, 0.1035, 0.042, 22]} />
        <meshStandardMaterial
          color="#b1842b"
          metalness={0.32}
          roughness={0.54}
        />
      </mesh>
      <RoundedBox
        args={[0.185, 0.055, 0.44]}
        radius={0.015}
        smoothness={3}
        position={[0, -0.092, 0.12]}
        castShadow
      >
        <meshStandardMaterial
          color="#242823"
          metalness={0.42}
          roughness={0.54}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.17, 0.092, 0.23]}
        radius={0.025}
        smoothness={3}
        position={[0, -0.125, 0.35]}
        rotation={[0.1, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          map={textures.wood}
          color="#463321"
          roughness={0.84}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.075, 0.22, 0.09]}
        radius={0.02}
        smoothness={3}
        position={[0, -0.17, -0.02]}
        rotation={[0.22, 0, 0]}
        castShadow
      >
        <meshStandardMaterial color="#26251f" roughness={0.9} />
      </RoundedBox>
      <mesh
        position={[0.095, -0.09, -0.045]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
      >
        <torusGeometry args={[0.047, 0.008, 7, 18]} />
        <meshStandardMaterial
          color="#171b18"
          metalness={0.64}
          roughness={0.38}
        />
      </mesh>
      <group ref={sight}>
        <RoundedBox
          args={[0.042, 0.042, 0.25]}
          radius={0.01}
          smoothness={3}
          position={[0, 0.122, -0.12]}
          castShadow
        >
          <meshStandardMaterial
            color="#1b211d"
            metalness={0.62}
            roughness={0.36}
          />
        </RoundedBox>
        <RoundedBox
          args={[0.078, 0.068, 0.145]}
          radius={0.017}
          smoothness={3}
          position={[0, 0.17, -0.13]}
          castShadow
        >
          <meshStandardMaterial
            color="#343b36"
            metalness={0.52}
            roughness={0.44}
          />
        </RoundedBox>
        <mesh
          position={[0, 0.157, -0.215]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.029, 0.029, 0.022, 18]} />
          <meshStandardMaterial
            color="#203130"
            metalness={0.74}
            roughness={0.2}
          />
        </mesh>
        <mesh position={[0, 0.157, -0.228]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.007, 18]} />
          <meshStandardMaterial
            color="#74a8a0"
            metalness={0.18}
            roughness={0.12}
          />
        </mesh>
      </group>
      <GunHand
        position={[0.006, -0.185, -0.005]}
        rotation={[0.03, -0.02, -0.015]}
        scale={0.9}
      />
      <group position={[0, 0.015, -0.745]}>
        <FlashBurst flashRef={frontFlash} lightRef={frontLight} size={0.9} />
        <SmokeCloud smokeRef={frontSmoke} color="#b6b7af" />
      </group>
      <group position={[0, 0.015, 0.57]}>
        <FlashBurst
          flashRef={rearFlash}
          lightRef={rearLight}
          rear
          size={1.35}
        />
        <SmokeCloud smokeRef={rearSmoke} color="#989d94" />
      </group>
    </group>
  );
}

export function FirstPersonMachineGun({
  shotsRef,
}: {
  shotsRef: { current: number };
}) {
  const group = useRef<Group>(null);
  const bolt = useRef<Group>(null);
  const flash = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const smoke = useRef<Group>(null);
  const casingGroup = useRef<Group>(null);
  const { camera } = useThree();
  const textures = useWeaponTextures();
  const equipProgress = useRef(0);
  const kickProgress = useRef(1);
  const flashTime = useRef(1);
  const smokeTime = useRef(1);
  const seenShots = useRef<number | null>(null);
  const nextCasing = useRef(0);
  const casingSlots = useRef(createMachineGunCasingSlots());
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((state, delta) => {
    if (!group.current) {
      return;
    }

    if (seenShots.current === null) {
      seenShots.current = shotsRef.current;
    } else if (seenShots.current !== shotsRef.current) {
      const shotDelta = shotsRef.current - seenShots.current;
      seenShots.current = shotsRef.current;
      if (shotDelta > 0) {
        kickProgress.current = 0;
        flashTime.current = 0;
        smokeTime.current = 0;

        const casingCount = Math.min(3, shotDelta);
        for (let index = 0; index < casingCount; index += 1) {
          const slotIndex = nextCasing.current;
          nextCasing.current =
            (nextCasing.current + 1) % MACHINE_GUN_CASING_COUNT;
          const slot = casingSlots.current[slotIndex];
          const variant = (shotsRef.current + index) % 5;
          slot.age = 0;
          slot.position.set(0.135, 0.05, -0.015);
          slot.velocity.set(
            0.46 + variant * 0.045,
            0.42 + (variant % 3) * 0.07,
            0.06 + (variant % 2) * 0.09,
          );
          slot.rotation.set(0, 0, Math.PI / 2);
          slot.spin.set(9 + variant, 12 + variant * 1.4, 17 - variant);
        }
      }
    }

    equipProgress.current = Math.min(1, equipProgress.current + delta * 4.8);
    kickProgress.current = Math.min(1, kickProgress.current + delta * 11);
    flashTime.current += delta;
    smokeTime.current += delta;
    const equip = 1 - Math.pow(1 - equipProgress.current, 3);
    const draw = 1 - equip;
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);
    const idle = state.clock.elapsedTime;
    const idleX = Math.sin(idle * 1.55) * 0.004;
    const idleY = Math.sin(idle * 3.1 + 0.7) * 0.003;

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(
      0.34 + idleX,
      -0.27 + recoil * 0.014 + idleY - draw * 0.2,
      -0.88 + recoil * 0.075 + draw * 0.14,
    );
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(
      recoil * 0.09 + idleY,
      0.085 + idleX,
      0.018 + idleX + draw * 0.2,
    );
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));

    if (bolt.current) {
      bolt.current.position.z = recoil * 0.055;
      bolt.current.rotation.x = recoil * -0.06;
    }
    const flashVisible = flashTime.current < 0.065;
    if (flash.current) {
      flash.current.visible = flashVisible;
      flash.current.rotation.z = flashTime.current * 46;
    }
    if (light.current) {
      light.current.intensity = flashVisible
        ? 9 * (1 - flashTime.current / 0.065)
        : 0;
    }
    animateSmoke(smoke.current, smokeTime.current, 0.48, -0.28, 0.11, 0.8);

    for (let index = 0; index < casingSlots.current.length; index += 1) {
      const slot = casingSlots.current[index];
      const casing = casingGroup.current?.children[index];
      if (!(casing instanceof Mesh)) {
        continue;
      }
      slot.age += delta;
      const visible = slot.age < 0.82;
      casing.visible = visible;
      if (!visible) {
        continue;
      }
      slot.velocity.y -= delta * 2.45;
      slot.position.addScaledVector(slot.velocity, delta);
      slot.rotation.addScaledVector(slot.spin, delta);
      casing.position.copy(slot.position);
      casing.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z);
    }
  });

  return (
    <group ref={group} renderOrder={20}>
      <ViewmodelLighting />
      <mesh
        position={[0, 0.015, -0.64]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.026, 0.031, 0.78, 18]} />
        <meshStandardMaterial
          map={textures.steel}
          color="#343a3b"
          metalness={0.78}
          roughness={0.3}
        />
      </mesh>
      <mesh
        position={[0, 0.015, -1.075]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.046, 0.034, 0.16, 18]} />
        <meshStandardMaterial
          color="#202526"
          metalness={0.82}
          roughness={0.27}
        />
      </mesh>
      <mesh position={[0, 0.015, -1.162]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.029, 0.029, 0.016, 18]} />
        <meshStandardMaterial
          color="#090b0b"
          metalness={0.26}
          roughness={0.72}
        />
      </mesh>
      <mesh
        position={[0, 0.014, -0.47]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <cylinderGeometry args={[0.055, 0.058, 0.48, 18]} />
        <meshStandardMaterial
          color="#292f30"
          metalness={0.7}
          roughness={0.36}
        />
      </mesh>
      {[-0.65, -0.53, -0.41, -0.29].map((z) => (
        <mesh
          key={z}
          position={[0.057, 0.02, z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.012, 0.012, 0.007, 10]} />
          <meshStandardMaterial
            color="#0e1212"
            metalness={0.45}
            roughness={0.55}
          />
        </mesh>
      ))}
      {[-0.038, 0.038].map((x) => (
        <mesh
          key={x}
          position={[x, -0.052, -0.7]}
          rotation={[Math.PI / 2, 0, x < 0 ? -0.035 : 0.035]}
          castShadow
        >
          <cylinderGeometry args={[0.008, 0.009, 0.42, 10]} />
          <meshStandardMaterial
            color="#1a1f1f"
            metalness={0.76}
            roughness={0.32}
          />
        </mesh>
      ))}
      <RoundedBox
        args={[0.018, 0.11, 0.024]}
        radius={0.005}
        smoothness={2}
        position={[0.065, 0.105, -0.55]}
        rotation={[-0.18, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          color="#1a1f1e"
          metalness={0.7}
          roughness={0.36}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.018, 0.11, 0.024]}
        radius={0.005}
        smoothness={2}
        position={[0.065, 0.11, -0.31]}
        rotation={[0.18, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          color="#1a1f1e"
          metalness={0.7}
          roughness={0.36}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.02, 0.025, 0.25]}
        radius={0.006}
        smoothness={2}
        position={[0.065, 0.163, -0.43]}
        castShadow
      >
        <meshStandardMaterial
          color="#202625"
          metalness={0.68}
          roughness={0.38}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.135, 0.07, 0.32]}
        radius={0.018}
        smoothness={3}
        position={[0, -0.052, -0.43]}
        castShadow
      >
        <meshStandardMaterial
          map={textures.wood}
          color="#5a3a25"
          roughness={0.78}
        />
      </RoundedBox>
      <TaperedReceiver
        front={[0.165, 0.15]}
        rear={[0.125, 0.115]}
        depth={0.44}
        position={[0, 0, -0.015]}
        texture={textures.steel}
        color="#343a3b"
        metalness={0.66}
        roughness={0.36}
      />
      <RoundedBox
        args={[0.15, 0.048, 0.4]}
        radius={0.012}
        smoothness={3}
        position={[0, 0.095, -0.02]}
        castShadow
      >
        <meshStandardMaterial
          color="#252b2c"
          metalness={0.78}
          roughness={0.3}
        />
      </RoundedBox>
      <group ref={bolt}>
        <mesh
          position={[0.105, 0.025, -0.015]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.016, 0.016, 0.072, 12]} />
          <meshStandardMaterial
            color="#777d79"
            metalness={0.88}
            roughness={0.22}
          />
        </mesh>
        <mesh
          position={[0.143, 0.025, -0.015]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[0.024, 0.024, 0.025, 12]} />
          <meshStandardMaterial
            color="#252a29"
            metalness={0.76}
            roughness={0.31}
          />
        </mesh>
      </group>
      <mesh
        position={[0, -0.135, -0.055]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.108, 0.108, 0.135, 22]} />
        <meshStandardMaterial
          color="#30372f"
          metalness={0.48}
          roughness={0.5}
        />
      </mesh>
      <mesh
        position={[0.071, -0.135, -0.055]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.087, 0.087, 0.012, 22]} />
        <meshStandardMaterial
          map={textures.steel}
          color="#555b53"
          metalness={0.66}
          roughness={0.35}
        />
      </mesh>
      <RoundedBox
        args={[0.078, 0.19, 0.09]}
        radius={0.02}
        smoothness={3}
        position={[0, -0.15, 0.18]}
        rotation={[0.27, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          map={textures.wood}
          color="#50311f"
          roughness={0.8}
        />
      </RoundedBox>
      <BeveledStock
        width={0.135}
        frontHeight={0.09}
        rearHeight={0.15}
        depth={0.34}
        position={[0, 0.012, 0.365]}
        texture={textures.wood}
      />
      <RoundedBox
        args={[0.142, 0.158, 0.038]}
        radius={0.012}
        smoothness={2}
        position={[0, 0.018, 0.552]}
        castShadow
      >
        <meshStandardMaterial color="#252521" roughness={0.92} />
      </RoundedBox>
      <mesh
        position={[0.1, -0.075, 0.11]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
      >
        <torusGeometry args={[0.046, 0.008, 7, 18]} />
        <meshStandardMaterial
          color="#1d2221"
          metalness={0.7}
          roughness={0.35}
        />
      </mesh>
      <RoundedBox
        args={[0.026, 0.048, 0.16]}
        radius={0.006}
        smoothness={2}
        position={[0, 0.127, -0.43]}
        castShadow
      >
        <meshStandardMaterial
          color="#151a19"
          metalness={0.72}
          roughness={0.32}
        />
      </RoundedBox>
      <RoundedBox
        args={[0.035, 0.062, 0.04]}
        radius={0.006}
        smoothness={2}
        position={[0, 0.14, 0.135]}
        castShadow
      >
        <meshStandardMaterial
          color="#171c1b"
          metalness={0.74}
          roughness={0.31}
        />
      </RoundedBox>
      <GunHand
        position={[-0.004, -0.09, -0.43]}
        rotation={[-1.02, 0.02, 0.035]}
        scale={0.78}
      />
      <GunHand
        position={[0.005, -0.17, 0.185]}
        rotation={[0.04, -0.03, -0.02]}
        scale={0.87}
      />
      <group ref={casingGroup}>
        {Array.from({ length: MACHINE_GUN_CASING_COUNT }, (_, index) => (
          <mesh key={index} visible={false} castShadow>
            <cylinderGeometry args={[0.008, 0.0095, 0.035, 10]} />
            <meshStandardMaterial
              color="#b98c45"
              metalness={0.84}
              roughness={0.28}
            />
          </mesh>
        ))}
      </group>
      <group position={[0, 0.015, -1.205]}>
        <FlashBurst flashRef={flash} lightRef={light} size={0.92} />
        <SmokeCloud smokeRef={smoke} color="#a9aca7" />
      </group>
    </group>
  );
}
