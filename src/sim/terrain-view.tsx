import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { ProfileSample } from "@/engine";
import { TERRAIN_GLB } from "./load";

/** Astronaut eye height above ground, m (MARSWALK/app main.js EYE). */
const EYE = 1.7;
/** Vertical field of view, degrees. */
export const FOV_V = 50;

export type Projected = { x: number; y: number; visible: boolean };

/**
 * First-person view on the HiRISE DTM mesh (Draco GLB, x east, y up, z south: the engine's frame).
 * The camera stands at `eye` and looks at `look`; `route` is drawn as a tube on the ground.
 * `onProject` reports screen positions of `marks` (e.g. the next stop) after each render.
 */
export function TerrainView({
  eye,
  look,
  route,
  marks,
  onProject,
  className,
}: {
  eye: { x: number; z: number };
  look: { x: number; z: number };
  route: ProfileSample[];
  marks: { x: number; z: number }[];
  onProject?: (p: Projected[]) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ render: () => void; ground: (x: number, z: number) => number; setRoute: (r: ProfileSample[]) => void; camera: THREE.PerspectiveCamera; size: () => { w: number; h: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
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
    const routeGroup = new THREE.Group();
    scene.add(routeGroup);
    let terrain: THREE.Mesh | null = null;
    const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0);
    const ground = (x: number, z: number) => {
      if (!terrain) return 0;
      ray.set(new THREE.Vector3(x, 1000, z), DOWN);
      return ray.intersectObject(terrain, false)[0]?.point.y ?? 0;
    };
    const size = () => ({ w: el.clientWidth, h: el.clientHeight });
    const render = () => {
      const { w, h } = size();
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const setRoute = (r: ProfileSample[]) => {
      routeGroup.children.forEach((m) => (m as THREE.Mesh).geometry.dispose());
      routeGroup.clear();
      if (r.length < 2 || !terrain) return;
      const curve = new THREE.CatmullRomCurve3(r.map((p) => new THREE.Vector3(p.x, ground(p.x, p.z) + 0.25, p.z)));
      // route-path token colour (#D9663A brand) for the trail
      routeGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, r.length * 3, 0.15, 4), new THREE.MeshBasicMaterial({ color: 0xd9663a })));
    };
    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    new GLTFLoader()
      .setDRACOLoader(draco)
      .loadAsync(TERRAIN_GLB)
      .then((gltf) => {
        if (disposed) return;
        scene.add(gltf.scene);
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) terrain = o as THREE.Mesh;
        });
        if (!terrain) throw new Error("no mesh in terrain GLB");
        terrain.geometry.computeVertexNormals();
        // HiRISE ortho is greyscale; tinted toward Mars colour for display only
        ((terrain.material as THREE.MeshStandardMaterial).color ??= new THREE.Color()).set(0xf0b080);
        scene.updateMatrixWorld(true);
        api.current = { render, ground, setRoute, camera, size };
        setReady(true);
      })
      .catch((e: Error) => !disposed && setError(`3D terrain failed to load: ${e.message}`));
    const ro = new ResizeObserver(() => api.current?.render());
    ro.observe(el);
    return () => {
      disposed = true;
      ro.disconnect();
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    if (ready) api.current!.setRoute(route);
  }, [ready, route]);

  useEffect(() => {
    const a = api.current;
    if (!ready || !a) return;
    a.camera.position.set(eye.x, a.ground(eye.x, eye.z) + EYE, eye.z);
    a.camera.lookAt(look.x, a.ground(look.x, look.z) + EYE, look.z);
    a.render();
    if (onProject) {
      const { w, h } = a.size();
      onProject(
        marks.map((m) => {
          const v = new THREE.Vector3(m.x, a.ground(m.x, m.z) + 1, m.z).project(a.camera);
          return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
        }),
      );
    }
  }, [ready, eye.x, eye.z, look.x, look.z, marks, onProject]);

  return (
    <div ref={host} className={className} role="img" aria-label="First-person 3D view of the HiRISE terrain along the planned route">
      {error ? <p role="alert" className="absolute inset-0 grid place-items-center t-body-m text-danger">{error}</p> : null}
      {!ready && !error ? <p role="status" className="absolute inset-0 grid place-items-center t-body-m text-fg-secondary">Loading 3D terrain…</p> : null}
    </div>
  );
}
