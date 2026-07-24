export function GrenadeProjectileVisual() {
  return (
    <group>
      <mesh
        castShadow
        position={[0, 0, -0.118]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.057, 0.063, 0.078, 16]} />
        <meshStandardMaterial
          color="#323a31"
          metalness={0.56}
          roughness={0.42}
        />
      </mesh>
      <mesh
        castShadow
        position={[0, 0, -0.073]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.067, 0.067, 0.026, 18]} />
        <meshStandardMaterial
          color="#9d6339"
          metalness={0.82}
          roughness={0.27}
        />
      </mesh>
      <mesh
        castShadow
        position={[0, 0, 0.018]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.06, 0.067, 0.17, 16]} />
        <meshStandardMaterial
          color="#48543b"
          metalness={0.34}
          roughness={0.57}
        />
      </mesh>
      <mesh
        castShadow
        position={[0, 0, 0.046]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.068, 0.068, 0.021, 16]} />
        <meshStandardMaterial
          color="#b69236"
          metalness={0.38}
          roughness={0.5}
        />
      </mesh>
      {[-0.018, 0.078].map((z) => (
        <mesh key={z} position={[0, 0, z]} castShadow>
          <torusGeometry args={[0.063, 0.0035, 6, 18]} />
          <meshStandardMaterial
            color="#242a24"
            metalness={0.52}
            roughness={0.42}
          />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0, 0.105]} scale={[1, 1, 0.78]}>
        <sphereGeometry args={[0.061, 16, 10]} />
        <meshStandardMaterial
          color="#4c583e"
          metalness={0.33}
          roughness={0.55}
        />
      </mesh>
      <mesh
        castShadow
        position={[0, 0, 0.166]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.025, 0.031, 0.055, 12]} />
        <meshStandardMaterial
          color="#777b70"
          metalness={0.76}
          roughness={0.3}
        />
      </mesh>
      <mesh
        castShadow
        position={[0, 0, 0.211]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[0.027, 0.05, 12]} />
        <meshStandardMaterial
          color="#343936"
          metalness={0.68}
          roughness={0.34}
        />
      </mesh>
    </group>
  );
}
