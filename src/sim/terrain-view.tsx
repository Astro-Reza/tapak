import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { ProfileSample } from "@/engine";
import type { CameraPose } from "./fov/camera-rig";
import { TERRAIN_GLB } from "./load";

/** Vertical field of view, degrees. */
export const FOV_V = 50;

export type Projected = { x: number; y: number; visible: boolean };

/** Imperative handle: the FoV loop drives the camera every frame without React re-renders. */
export type TerrainApi = {
  /** Places the camera and renders one frame. */
  draw: (pose: CameraPose) => void;
  /** Screen position (CSS px in the view) of world points, from the last drawn pose. */
  project: (points: { x: number; y: number; z: number }[]) => Projected[];
};

/**
 * First-person renderer for the HiRISE DTM mesh (Draco GLB, x east, y up, z south: the engine's frame).
 * It only knows a CameraPose; where that pose comes from (route walk, free explore, later an AR device)
 * is decided by the caller. `route` is drawn once as a tube on the ground, using `heightAt` (the engine
 * DTM) rather than mesh raycasts, which cost ~6.5 ms each.
 */
export function TerrainView({
  route,
  heightAt,
  onReady,
  className,
}: {
  route: ProfileSample[];
  heightAt: (x: number, z: number) => number;
  onReady: (api: TerrainApi | null) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const setRouteRef = useRef<((r: ProfileSample[]) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setError("3D view unavailable: this device or browser has WebGL turned off.");
      return;
    }
    // ponytail: 2× cap keeps tablets smooth; add adaptive resolution if frame times get long
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    const scene = new THREE.Scene();
    const SKY = 0xcfa982; // display tint, as in MARSWALK/app
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 900, 4500);
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x5a3a26, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(-600, 500, -300);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(FOV_V, 1, 0.3, 9000);
    camera.rotation.order = "YXZ"; // yaw, then pitch: no roll creeps in while looking around
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);
    let terrainLoaded = false;
    let w = 0, h = 0;

    const fit = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (cw === w && ch === h) return;
      w = cw;
      h = ch;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h || 1;
      camera.updateProjectionMatrix();
    };
    const draw = (pose: CameraPose) => {
      if (!terrainLoaded || renderer.getContext().isContextLost()) return;
      fit();
      if (!w || !h) return;
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(pose.pitch, -pose.yaw, pose.roll); // three: +y rotation turns left; yaw is clockwise
      renderer.render(scene, camera);
    };
    const v = new THREE.Vector3();
    const project = (points: { x: number; y: number; z: number }[]) =>
      points.map((p) => {
        v.set(p.x, p.y, p.z).project(camera);
        return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
      });
    const setRoute = (r: ProfileSample[]) => {
      routeGroup.children.forEach((m) => (m as THREE.Mesh).geometry.dispose());
      routeGroup.clear();
      if (r.length < 2) return;
      // DTM heights are within ±0.13 m of the mesh, so the trail floats 0.35 m up to stay visible
      const curve = new THREE.CatmullRomCurve3(r.map((p) => new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.35, p.z)));
      // route-path token colour (#D9663A brand) for the trail
      routeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, r.length * 3, 0.15, 4), new THREE.MeshBasicMaterial({ color: 0xd9663a })));
    };
    setRouteRef.current = setRoute;

    // Context loss (GPU reset, tab backgrounded on iPad): pause drawing, say so, resume on restore.
    const onLost = (e: Event) => {
      e.preventDefault();
      setLost(true);
    };
    const onRestored = () => setLost(false);
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);

    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    new GLTFLoader()
      .setDRACOLoader(draco)
      .loadAsync(TERRAIN_GLB)
      .then((gltf) => {
        if (disposed) return;
        let terrain: THREE.Mesh | null = null;
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) terrain = o as THREE.Mesh;
        });
        if (!terrain) throw new Error("no mesh in terrain GLB");
        const mesh = terrain as THREE.Mesh;
        mesh.geometry.computeVertexNormals();
        // HiRISE ortho is greyscale; tinted toward Mars colour for display only
        ((mesh.material as THREE.MeshStandardMaterial).color ??= new THREE.Color()).set(0xf0b080);
        scene.add(gltf.scene);
        scene.updateMatrixWorld(true);
        terrainLoaded = true;
        setReady(true);
        onReady({ draw, project });
      })
      .catch((e: Error) => !disposed && setError(`3D terrain failed to load: ${e.message}. Map and telemetry still work.`));
    return () => {
      disposed = true;
      onReady(null);
      setRouteRef.current = null;
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      draco.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // heightAt and onReady are stable for the life of the view (the caller memoises them)
  }, []);

  useEffect(() => {
    if (ready) setRouteRef.current?.(route);
  }, [ready, route]);

  return (
    <div ref={host} className={className} role="img" aria-label="First-person 3D view of the HiRISE terrain along the planned route">
      {error ? <p role="alert" className="absolute inset-0 grid place-items-center p-xl text-center t-body-m text-danger">{error}</p> : null}
      {lost ? <p role="alert" className="absolute inset-0 grid place-items-center bg-scrim t-body-m text-caution">Graphics context lost · restoring the 3D view…</p> : null}
      {!ready && !error ? <p role="status" className="absolute inset-0 grid place-items-center t-body-m text-fg-secondary">Loading 3D terrain…</p> : null}
    </div>
  );
}
