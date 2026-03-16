'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { useMetrics } from '@/lib/MetricsContext';
import { CPU, RAMCard, DiskDrive } from './HardwareModels';

export default function HardwareScene() {
  const { latest } = useMetrics();

  // Extract metrics or use defaults if not connected
  const cpuLoad = useMemo(() => latest?.cpu ? latest.cpu / 100 : 0.1, [latest]);
  const memUsage = useMemo(() => {
    if (!latest?.memTotal || !latest?.memUsed) return 0.2;
    return latest.memUsed / latest.memTotal;
  }, [latest]);
  
  // Calculate IO activity (pseudo activity from r_sec + w_sec)
  const ioActivity = useMemo(() => {
    if (!latest?.io) return 0.05;
    const total = latest.io.r_sec + latest.io.w_sec;
    return Math.min(1, total / 500); // Scale 500KB/s to 1
  }, [latest]);

  return (
    <div className="w-full h-[400px] bg-card rounded-xl border border-border/60 overflow-hidden relative group">
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          Digital Twin: LIVE
        </h3>
        <p className="text-[10px] text-muted-foreground">Interactive 3D Hardware Matrix</p>
      </div>

      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
        <OrbitControls 
          enablePan={false} 
          enableZoom={true} 
          minDistance={3} 
          maxDistance={12}
          autoRotate={true}
          autoRotateSpeed={0.5}
        />
        
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
        <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />

        <Suspense fallback={null}>
          <group position={[0, -0.5, 0]}>
            {/* CPU at center */}
            <CPU load={cpuLoad} />

            {/* RAM modules on the side */}
            <RAMCard position={[-1.5, 0.4, 0]} usage={memUsage} />
            <RAMCard position={[-1.7, 0.4, 0]} usage={memUsage} />
            <RAMCard position={[-1.9, 0.4, 0]} usage={memUsage} />
            <RAMCard position={[-2.1, 0.4, 0]} usage={memUsage} />

            {/* Disk drives */}
            <DiskDrive position={[0, 0, -2.5]} activity={ioActivity} />
            <DiskDrive position={[3, 0, -1]} activity={ioActivity} />
          </group>
          
          <ContactShadows position={[0, -1, 0]} opacity={0.4} scale={20} blur={2.4} far={4.5} />
          <Environment preset="city" />
        </Suspense>
      </Canvas>
      
      <div className="absolute bottom-4 right-4 text-[9px] text-muted-foreground font-mono bg-black/20 px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
        RENDERED VIA THREE.JS
      </div>
    </div>
  );
}
