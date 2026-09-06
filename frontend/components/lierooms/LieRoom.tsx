"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { useT } from "@/lib/i18n";

/**
 * Lie room: the showroom GLB slowly rotates on a turntable while the AI
 * analyst works. Auto-fitted to the stage from the model's bounding box —
 * standing shapes are scaled by height, car-like shapes by length.
 */

const FIT_LENGTH = 4.6;
const FIT_HEIGHT = 2.8;
const GROUND_Y = -0.45;

function Model() {
  const gltf = useLoader(
    GLTFLoader,
    "/models/showroom-car.glb",
    (loader) => loader.setMeshoptDecoder(MeshoptDecoder)
  );
  const ref = useRef<THREE.Group>(null);

  const { scale, yOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const standing = size.y > size.x * 1.5 && size.y > size.z * 1.5;
    const s = standing ? FIT_HEIGHT / size.y : FIT_LENGTH / Math.max(size.x, size.z);
    return { scale: s, yOffset: -center.y * s };
  }, [gltf]);

  useEffect(() => {
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });
  }, [gltf]);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.4;
      ref.current.position.y = GROUND_Y + yOffset + Math.sin(state.clock.elapsedTime * 1.1) * 0.02;
    }
  });

  return (
    <group ref={ref} position={[0, GROUND_Y + yOffset, 0]}>
      <primitive object={gltf.scene} scale={scale} />
    </group>
  );
}

function Ground() {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e8eef4", roughness: 1 }),
    []
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]} material={mat}>
      <circleGeometry args={[5.5, 32]} />
    </mesh>
  );
}

function RoomParticles() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const n = 40;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = Math.random() * 2.6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);
  const mat = useMemo(
    () => new THREE.PointsMaterial({ color: "#00a6a6", size: 0.035, transparent: true, opacity: 0.6 }),
    []
  );
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.02;
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}

export default function LieRoom() {
  const t = useT();
  const [ready, setReady] = useState(false);
  const introRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gsap: typeof import("gsap") | null = null;
    let ctx: ReturnType<typeof import("gsap").gsap.context> | null = null;
    import("gsap").then((g) => {
      gsap = g;
      ctx = g.gsap.context(() => {
        g.gsap.fromTo(
          ".lie-room-scene",
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 1.4, ease: "power3.out", delay: 0.15 }
        );
        g.gsap.fromTo(
          ".lie-room-caption",
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.9, ease: "power2.out", delay: 0.8 }
        );
      }, introRef);
      setReady(true);
    });
    return () => ctx?.revert();
  }, []);

  return (
    <div className="relative h-[100svh] w-full overflow-hidden" ref={introRef}>
      <div className="lie-room-scene absolute inset-0 opacity-0">
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          camera={{ position: [2.6, 1.6, 4.4], fov: 42 }}
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 5, 2]} intensity={1.5} color="#fff8e8" />
          <directionalLight position={[-4, 2, -3]} intensity={0.45} color="#8ecbff" />
          <Suspense fallback={null}>
            <Model />
          </Suspense>
          <Ground />
          <RoomParticles />
        </Canvas>
      </div>

      <div className="lie-room-caption pointer-events-none absolute inset-x-0 bottom-[22vh] z-10 px-6 text-center opacity-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
          {t("lie.sponsor")}
        </p>
        <p className="mt-1 text-xl font-bold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.4)]">
          Proton eMas 5
        </p>
        <p className="mx-auto mt-1 max-w-[240px] text-[13px] leading-snug text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
          {t("lie.tagline")}
        </p>
      </div>
    </div>
  );
}