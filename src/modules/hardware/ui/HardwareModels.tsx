import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text, MeshDistortMaterial } from '@react-three/drei';

export function CPU({ load }: { load: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((_state) => {
    if (!meshRef.current) return;
    const time = _state.clock.getElapsedTime();
    // Pulse speed based on load
    const pulse = 1 + Math.sin(time * (1 + load * 5)) * 0.05 * load;
    meshRef.current.scale.set(pulse, pulse, pulse);
  });

  return (
    <group position={[0, 0, 0]}>
      <mesh ref={meshRef}>
        <boxGeometry args={[2, 0.2, 2]} />
        <meshStandardMaterial 
          color={load > 0.8 ? '#ef4444' : load > 0.5 ? '#f59e0b' : '#3b82f6'} 
          emissive={load > 0.8 ? '#ef4444' : load > 0.5 ? '#f59e0b' : '#3b82f6'}
          emissiveIntensity={0.5 + load * 2}
        />
      </mesh>
      {/* Detail lines on CPU */}
      <gridHelper args={[1.8, 10, '#000', '#111']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.11, 0]} />
      <Text
        position={[0, 0.25, 0]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`CPU: ${(load * 100).toFixed(0)}%`}
      </Text>
    </group>
  );
}

export function RAMCard({ position, usage }: { position: [number, number, number], usage: number }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.1, 1, 3]} />
        <MeshDistortMaterial
          color="#10b981"
          emissive="#10b981"
          emissiveIntensity={0.2 + usage}
          speed={1 + usage * 5}
          distort={0.1 + usage * 0.3}
        />
      </mesh>
      {/* Memory chips */}
      {[...Array(4)].map((_, i) => (
        <mesh key={i} position={[0.06, 0.2 - i * 0.3, 0]}>
          <boxGeometry args={[0.02, 0.2, 0.4]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </group>
  );
}

export function DiskDrive({ position, activity }: { position: [number, number, number], activity: number }) {
  const diskRef = useRef<THREE.Mesh>(null);

  useFrame((_state) => {
    if (!diskRef.current) return;
    // Rotation represents activity
    diskRef.current.rotation.y += 0.05 + activity * 0.5;
  });

  return (
    <group position={position}>
      {/* Drive Case */}
      <mesh>
        <boxGeometry args={[2, 0.5, 3]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* Interior Platter (visible through "casing") */}
      <mesh ref={diskRef} position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.05, 32]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Indicator light */}
      <mesh position={[0.8, 0, 1.4]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial 
          color={activity > 0.1 ? '#3b82f6' : '#1e293b'} 
          emissive="#3b82f6" 
          emissiveIntensity={activity > 0.1 ? 2 : 0} 
        />
      </mesh>
    </group>
  );
}
