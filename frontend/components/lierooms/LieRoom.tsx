"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useT } from "@/lib/i18n";

/**
 * Lie room: the showroom GLB slowly rotates on a turntable while the AI
 * analyst works. Auto-fitted to the stage from the model's bounding box —
 * standing shapes are scaled by height, car-like shapes by length.
 */

// The EV9 is a ~5 m SUV. The camera sat at z=4.4 with a 42° field of view,
// which frames roughly 3.4 world units at the origin — so a car scaled to 4.6
// ran off both edges. Fit the car smaller and pull the camera back.
const FIT_LENGTH = 4.0;
const FIT_HEIGHT = 2.4;
const GROUND_Y = -0.62;
const CAMERA = { position: [5.2, 1.85, 8.4] as [number, number, number], fov: 32 };

/** Kia EV9 GT-Line. Draco-compressed glTF converted from the supplied FBX. */
const MODEL_URL = "/models/kia-ev9-gt-line.glb";
const SPONSOR_CAR = "Kia EV9 GT-Line";

function Model() {
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => {
    // The EV9 is Draco-compressed; the previous showroom model was meshopt.
    // Both decoders are registered so either asset loads without a code change.
    loader.setMeshoptDecoder(MeshoptDecoder);
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");   // copied from three/examples at build time
    loader.setDRACOLoader(draco);
  });
  const ref = useRef<THREE.Group>(null);

  const { scale, yOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    void center;
    const standing = size.y > size.x * 1.5 && size.y > size.z * 1.5;
    const s = standing ? FIT_HEIGHT / size.y : FIT_LENGTH / Math.max(size.x, size.z);
    // Rest the model's LOWEST point on the floor. Offsetting by the centre put
    // the bounding box's midpoint at ground level, burying the wheels.
    return { scale: s, yOffset: -box.min.y * s };
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

/**
 * Image-based lighting from three's built-in room.
 *
 * The scene had ambient + two directionals, which lights a surface evenly and
 * leaves metallic paint looking like flat plastic — a car's whole read comes
 * from what its clearcoat reflects. A generated environment gives every PBR
 * material something to mirror.
 */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = env.texture;
    return () => {
      env.texture.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

/** Pull the camera back on narrow viewports.
 *
 *  Horizontal FOV follows the aspect ratio, so a distance framed against a
 *  1280px canvas cuts the car off on a 390px portrait one. */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    const pull = aspect < 1 ? 1.75 : aspect < 1.5 ? 1.25 : 1;
    camera.position.set(
      CAMERA.position[0] * pull,
      CAMERA.position[1] * (aspect < 1 ? 1.15 : 1),
      CAMERA.position[2] * pull,
    );
    camera.lookAt(0, aspect < 1 ? 0.1 : 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function Ground() {
  // Pine-deep, not the near-white #e8eef4 that filled the lower half of the
  // frame with a grey slab. Slightly reflective so the car sits ON something.
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#071a14",
        roughness: 0.92,
        metalness: 0.0,
        // Without this the stage mirrors the (bright) studio environment and
        // washes out to pale grey-green across half the frame.
        envMapIntensity: 0.12,
      }),
    []
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} material={mat} receiveShadow>
      <circleGeometry args={[6.5, 64]} />
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
    () => new THREE.PointsMaterial({ color: "#c97f10", size: 0.02, transparent: true, opacity: 0.35 }),
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
          camera={{ position: CAMERA.position, fov: CAMERA.fov }}
        >
          {/* Specimen under examination: one warm key from above-front, a cool
              rim to separate the roofline from the dark ground, and almost no
              ambient so the environment map does the modelling. */}
          <ResponsiveCamera />
          <ambientLight intensity={0.35} />
          <spotLight
            position={[3.5, 6.5, 4]}
            angle={0.55}
            penumbra={0.9}
            intensity={28}
            color="#fff4dd"
            castShadow
          />
          <directionalLight position={[-5, 2.5, -4]} intensity={0.7} color="#7fc9a4" />
          <Suspense fallback={null}>
            <Environment />
            <Model />
          </Suspense>
          <Ground />
          <RoomParticles />
        </Canvas>
      </div>


    </div>
  );
}