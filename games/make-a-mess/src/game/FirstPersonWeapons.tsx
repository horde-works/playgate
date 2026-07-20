"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Euler, Group, PointLight, Quaternion, Vector3 } from "three";

export interface SwingDefinition {
  readonly id: number;
  readonly reach: number;
}

export function FirstPersonHammer({ swing }: { swing: SwingDefinition }) {
  const group = useRef<Group>(null);
  const { camera } = useThree();
  const swingProgress = useRef(1);
  const previousSwing = useRef(swing.id);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    if (previousSwing.current !== swing.id) {
      previousSwing.current = swing.id;
      swingProgress.current = 0;
    }

    swingProgress.current = Math.min(1, swingProgress.current + delta * 4.6);
    const progress = swingProgress.current;
    const impactArc = Math.sin(progress * Math.PI);
    const recoil = Math.sin(Math.min(1, progress * 1.7) * Math.PI);

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(
      0.52 - impactArc * 0.18,
      -0.42 + recoil * 0.09,
      -0.72 - impactArc * Math.max(0.18, swing.reach - 0.72),
    );
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(-0.18 - impactArc * 0.85, 0.08, 0.34 + impactArc * 0.42);
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));
  });

  return (
    <group ref={group} renderOrder={20}>
      <mesh position={[0, -0.06, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.042, 0.62, 10]} />
        <meshStandardMaterial color="#a9743f" roughness={0.86} />
      </mesh>
      <mesh position={[0, -0.3, 0]} castShadow>
        <cylinderGeometry args={[0.046, 0.05, 0.17, 10]} />
        <meshStandardMaterial color="#3a2c1e" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.245, -0.02]} castShadow>
        <boxGeometry args={[0.078, 0.06, 0.13]} />
        <meshStandardMaterial color="#8a5c32" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.3, -0.02]} castShadow>
        <boxGeometry args={[0.11, 0.11, 0.3]} />
        <meshStandardMaterial color="#454543" metalness={0.76} roughness={0.36} />
      </mesh>
      <mesh position={[0, 0.3, -0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.052, 0.06, 0.09, 12]} />
        <meshStandardMaterial color="#565654" metalness={0.82} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.3, 0.18]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.056, 0.16, 4]} />
        <meshStandardMaterial color="#383836" metalness={0.8} roughness={0.32} />
      </mesh>
    </group>
  );
}

export function FirstPersonLauncher({ kick }: { kick: number }) {
  const group = useRef<Group>(null);
  const { camera } = useThree();
  const kickProgress = useRef(1);
  const previousKick = useRef(kick);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    if (previousKick.current !== kick) {
      previousKick.current = kick;
      kickProgress.current = 0;
    }

    kickProgress.current = Math.min(1, kickProgress.current + delta * 3.2);
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(0.42, -0.34 + recoil * 0.05, -0.62 + recoil * 0.17);
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(recoil * 0.3, -0.06, 0.04);
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));
  });

  return (
    <group ref={group} renderOrder={20}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.058, 0.062, 0.64, 12]} />
        <meshStandardMaterial color="#43503f" metalness={0.42} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, -0.33]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.078, 0.07, 0.11, 12]} />
        <meshStandardMaterial color="#333d31" metalness={0.5} roughness={0.44} />
      </mesh>
      <mesh position={[0, 0, 0.26]} castShadow>
        <boxGeometry args={[0.1, 0.13, 0.16]} />
        <meshStandardMaterial color="#2f372d" metalness={0.36} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.11, 0.1]} rotation={[0.3, 0, 0]} castShadow>
        <boxGeometry args={[0.045, 0.15, 0.06]} />
        <meshStandardMaterial color="#241f18" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.085, -0.12]} castShadow>
        <boxGeometry args={[0.03, 0.05, 0.1]} />
        <meshStandardMaterial color="#20261f" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function FirstPersonRocketLauncher({ kick }: { kick: number }) {
  const group = useRef<Group>(null);
  const { camera } = useThree();
  const kickProgress = useRef(1);
  const previousKick = useRef(kick);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    if (previousKick.current !== kick) {
      previousKick.current = kick;
      kickProgress.current = 0;
    }

    kickProgress.current = Math.min(1, kickProgress.current + delta * 2.5);
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(0.47, -0.32 + recoil * 0.035, -0.72 + recoil * 0.26);
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(recoil * 0.42, -0.08, 0.025);
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));
  });

  return (
    <group ref={group} renderOrder={20}>
      <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.082, 0.098, 0.95, 14]} />
        <meshStandardMaterial color="#2f3934" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0, -0.58]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.115, 0.095, 0.16, 14]} />
        <meshStandardMaterial color="#1f2724" metalness={0.58} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0, 0.41]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 0.2, 14]} />
        <meshStandardMaterial color="#59615a" metalness={0.42} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.13, -0.02]} rotation={[0.22, 0, 0]} castShadow>
        <boxGeometry args={[0.052, 0.22, 0.075]} />
        <meshStandardMaterial color="#241f18" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.09, 0.35]} rotation={[0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.16, 0.08, 0.26]} />
        <meshStandardMaterial color="#2a231a" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.11, -0.18]} castShadow>
        <boxGeometry args={[0.045, 0.055, 0.22]} />
        <meshStandardMaterial color="#20261f" metalness={0.44} roughness={0.48} />
      </mesh>
      <mesh position={[0, 0.09, -0.46]} castShadow>
        <boxGeometry args={[0.12, 0.03, 0.1]} />
        <meshStandardMaterial color="#6a716a" metalness={0.36} roughness={0.52} />
      </mesh>
    </group>
  );
}

export function FirstPersonMachineGun({
  shotsRef,
}: {
  shotsRef: { current: number };
}) {
  const group = useRef<Group>(null);
  const flash = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const { camera } = useThree();
  const kickProgress = useRef(1);
  const flashTime = useRef(1);
  const seenShots = useRef(0);
  const localOffset = useMemo(() => new Vector3(), []);
  const cameraQuaternion = useMemo(() => new Quaternion(), []);
  const toolEuler = useMemo(() => new Euler(), []);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    if (seenShots.current !== shotsRef.current) {
      seenShots.current = shotsRef.current;
      kickProgress.current = 0;
      flashTime.current = 0;
    }

    kickProgress.current = Math.min(1, kickProgress.current + delta * 11);
    flashTime.current += delta;
    const recoil = Math.sin(Math.min(1, kickProgress.current) * Math.PI);

    group.current.position.copy(camera.position);
    group.current.quaternion.copy(camera.getWorldQuaternion(cameraQuaternion));

    localOffset.set(0.36, -0.3 + recoil * 0.014, -0.58 + recoil * 0.075);
    localOffset.applyQuaternion(group.current.quaternion);
    group.current.position.add(localOffset);

    toolEuler.set(recoil * 0.09, -0.045, 0.02);
    group.current.quaternion.multiply(new Quaternion().setFromEuler(toolEuler));

    const flashVisible = flashTime.current < 0.05;
    if (flash.current) {
      flash.current.visible = flashVisible;
      flash.current.rotation.z += delta * 40;
    }
    if (light.current) {
      light.current.intensity = flashVisible ? 9 : 0;
    }
  });

  return (
    <group ref={group} renderOrder={20}>
      <mesh position={[0, 0, -0.42]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.034, 0.56, 10]} />
        <meshStandardMaterial color="#33383b" metalness={0.72} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0, -0.24]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.3, 10]} />
        <meshStandardMaterial color="#42484c" metalness={0.6} roughness={0.42} />
      </mesh>
      <mesh position={[0, -0.005, 0.06]} castShadow>
        <boxGeometry args={[0.13, 0.15, 0.36]} />
        <meshStandardMaterial color="#3a3f42" metalness={0.55} roughness={0.46} />
      </mesh>
      <mesh position={[0.1, -0.02, 0.05]} castShadow>
        <boxGeometry args={[0.08, 0.11, 0.16]} />
        <meshStandardMaterial color="#4c5233" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.13, 0.14]} rotation={[0.32, 0, 0]} castShadow>
        <boxGeometry args={[0.045, 0.16, 0.06]} />
        <meshStandardMaterial color="#241f18" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, -0.02]} castShadow>
        <boxGeometry args={[0.028, 0.05, 0.09]} />
        <meshStandardMaterial color="#20261f" metalness={0.4} roughness={0.5} />
      </mesh>
      <group ref={flash} position={[0, 0, -0.74]} visible={false}>
        <mesh>
          <boxGeometry args={[0.16, 0.05, 0.05]} />
          <meshBasicMaterial color="#ffe9a8" toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.16, 0.05, 0.05]} />
          <meshBasicMaterial color="#ffce6e" toneMapped={false} />
        </mesh>
        <pointLight ref={light} color="#ffc46e" distance={5} decay={2} />
      </group>
    </group>
  );
}
