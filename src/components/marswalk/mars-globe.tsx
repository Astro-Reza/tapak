import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { Button } from "@/components/ui/button";
import { elevationDeg, latLonToVec, orbitPoint, type RelayOrbit } from "@/lib/orbit";
import { cn } from "@/lib/utils";
import { Icon } from "./icons";
import { SatelliteMarker, WaypointMarker } from "./map";
import { Brackets } from "./primitives";
import { useToast } from "./toaster";

const texture = (file: string) => `${import.meta.env.BASE_URL}textures/${file}`;

/** Camera distance in Mars radii: home view and the zoom limits. */
const VIEW = { home: 4.4, min: 1.6, max: 7, fov: 32 };
const ORBIT_SEGMENTS = 256;

type GlobeSite = { latDeg: number; lonDeg: number; localSolarHour: number };

/**
 * Mars and its relay constellation in 3D (three.js). Drag to turn the globe,
 * pinch or scroll to zoom. The scene is a snapshot at the screen's mission
 * time, so nothing moves on its own and a frame is drawn only when the view
 * changes. Labels are DOM markers placed over the canvas each frame.
 */
export default function MarsGlobe({
  site,
  relays,
  siteLabel = "You",
  siteOpen = false,
  onToggleSite,
  sitePanel,
  className,
}: {
  site: GlobeSite;
  relays: RelayOrbit[];
  siteLabel?: string;
  siteOpen?: boolean;
  onToggleSite?: () => void;
  /** Panel born from the site marker while `siteOpen`. */
  sitePanel?: ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const siteRef = useRef<HTMLDivElement>(null);
  const relayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const view = useRef<{ reset: () => void; zoom: (factor: number) => void } | null>(null);
  const [failed, setFailed] = useState(false);

  const tracked = useMemo(() => {
    const list = relays.map((relay) => {
      const position = orbitPoint(relay);
      return { relay, position, elevation: elevationDeg(site, position) };
    });
    const best = list.reduce<(typeof list)[number] | null>(
      (top, item) => (item.elevation > 0 && (!top || item.elevation > top.elevation) ? item : top),
      null,
    );
    return list.map((item) => ({ ...item, inView: item.elevation > 0, live: item === best }));
  }, [relays, site]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setFailed(true);
      return;
    }

    let disposed = false;
    // A lost context (GPU reset, out of memory) cannot draw again: show the fallback instead of a dead canvas.
    const onContextLost = () => setFailed(true);
    canvas.addEventListener("webglcontextlost", onContextLost);
    const owned: { dispose: () => void }[] = [];
    const own = <T extends { dispose: () => void }>(item: T) => {
      owned.push(item);
      return item;
    };
    const css = getComputedStyle(host);
    const token = (name: string) => new THREE.Color(css.getPropertyValue(name).trim());
    const vec = (p: readonly [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2]);

    const scene = new THREE.Scene();
    scene.background = token("--surface-top-bar");
    const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 200);

    // Sun over the meridian where it is local noon, so the site's time of day reads on the globe.
    const sun = new THREE.DirectionalLight(token("--text-primary"), 3);
    sun.position.copy(vec(latLonToVec(0, site.lonDeg - (site.localSolarHour - 12) * 15, 10)));
    scene.add(sun, new THREE.AmbientLight(token("--text-primary"), 0.45));

    const marsMaterial = own(new THREE.MeshStandardMaterial({ color: token("--surface-inset"), roughness: 1 }));
    scene.add(new THREE.Mesh(own(new THREE.SphereGeometry(1, 128, 64)), marsMaterial));

    const starsMaterial = own(
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(0.5), side: THREE.BackSide, visible: false }),
    );
    scene.add(new THREE.Mesh(own(new THREE.SphereGeometry(90, 48, 24)), starsMaterial));

    // One line per orbital plane; the plane of the relay in view is the brightest.
    const planes = new Map<string, { orbit: RelayOrbit; live: boolean }>();
    for (const item of tracked) {
      const { relay } = item;
      const key = `${relay.altitudeKm}/${relay.inclinationDeg}/${relay.raanDeg}`;
      planes.set(key, { orbit: relay, live: item.live || (planes.get(key)?.live ?? false) });
    }
    for (const { orbit, live } of planes.values()) {
      const points = Array.from({ length: ORBIT_SEGMENTS }, (_, i) =>
        vec(orbitPoint(orbit, (i / ORBIT_SEGMENTS) * 360)),
      );
      const material = own(
        new THREE.LineBasicMaterial({ color: token("--text-primary"), transparent: true, opacity: live ? 0.85 : 0.35 }),
      );
      scene.add(new THREE.LineLoop(own(new THREE.BufferGeometry().setFromPoints(points)), material));
    }

    const sitePoint = vec(latLonToVec(site.latDeg, site.lonDeg));
    const relayPoints = tracked.map((item) => vec(item.position));
    const linkColor = token("--data-link-high");
    const dotGeometry = own(new THREE.SphereGeometry(0.012, 12, 8));
    const dotMaterial = own(new THREE.MeshBasicMaterial({ color: linkColor }));
    const linkMaterial = own(new THREE.LineBasicMaterial({ color: linkColor }));
    tracked.forEach((item, i) => {
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      dot.position.copy(relayPoints[i]);
      scene.add(dot);
      // Line of sight from the site to every relay above its horizon.
      if (item.inView) {
        const geometry = own(new THREE.BufferGeometry().setFromPoints([sitePoint, relayPoints[i]]));
        scene.add(new THREE.Line(geometry, linkMaterial));
      }
    });

    /* ----- labels: project to the canvas, hide behind the planet ----- */
    const projected = new THREE.Vector3();
    const ray = new THREE.Vector3();
    const hidden = (point: THREE.Vector3) => {
      const origin = camera.position;
      const distance = ray.copy(point).sub(origin).length();
      ray.divideScalar(distance);
      const b = origin.dot(ray);
      const disc = b * b - (origin.lengthSq() - 0.98);
      if (disc <= 0) return false;
      const hit = -b - Math.sqrt(disc);
      return hit > 0 && hit < distance;
    };
    const place = (point: THREE.Vector3, el: HTMLElement | null) => {
      if (!el) return;
      projected.copy(point).project(camera);
      const x = (projected.x * 0.5 + 0.5) * host.clientWidth;
      const y = (-projected.y * 0.5 + 0.5) * host.clientHeight;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = projected.z < 1 && !hidden(point) ? "visible" : "hidden";
    };
    const render = () => {
      if (disposed) return;
      renderer.render(scene, camera);
      place(sitePoint, siteRef.current);
      relayPoints.forEach((point, i) => place(point, relayRefs.current[i]));
    };

    /* ----- textures (8k equirectangular, shrunk to what the GPU takes) ----- */
    // Full 8k (about 170 MB on the GPU with mipmaps) only on desktop-class hardware; 4k elsewhere.
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const roomy = renderer.capabilities.maxTextureSize >= 16384 && memory >= 8;
    const load = (file: string, limit: number, apply: (map: THREE.Texture) => void) => {
      const image = new Image();
      image.onload = () => {
        if (disposed) return;
        const max = Math.min(limit, renderer.capabilities.maxTextureSize);
        let source: HTMLImageElement | HTMLCanvasElement = image;
        if (image.width > max) {
          source = document.createElement("canvas");
          source.width = max;
          source.height = Math.round((image.height * max) / image.width);
          source.getContext("2d")?.drawImage(image, 0, 0, source.width, source.height);
        }
        const map = own(new THREE.Texture(source));
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        map.needsUpdate = true;
        apply(map);
        render();
      };
      image.onerror = () => {
        if (!disposed) toast(`Texture missing · add public/textures/${file}`, { safety: true });
      };
      image.src = texture(file);
    };
    load("8k_mars.jpg", roomy ? 8192 : 4096, (map) => {
      marsMaterial.map = map;
      marsMaterial.color.set(token("--text-primary"));
      marsMaterial.needsUpdate = true;
    });
    load("8k_stars_milky_way.jpg", 4096, (map) => {
      starsMaterial.map = map;
      starsMaterial.visible = true;
      starsMaterial.needsUpdate = true;
    });

    /* ----- camera ----- */
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.minDistance = VIEW.min;
    controls.maxDistance = VIEW.max;
    controls.rotateSpeed = 0.6;
    controls.addEventListener("change", render);
    // Home: the site a little left of center, so its panel has room to open to the right.
    const home = vec(latLonToVec(site.latDeg - 6, site.lonDeg + 20, VIEW.home));
    const reset = () => {
      camera.position.copy(home);
      controls.target.set(0, 0, 0);
      controls.update();
      render();
    };
    view.current = {
      reset,
      zoom: (factor) => {
        const distance = THREE.MathUtils.clamp(camera.position.length() * factor, VIEW.min, VIEW.max);
        camera.position.setLength(distance);
        controls.update();
        render();
      },
    };

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Keep the whole globe in a narrow frame: the field of view is vertical.
      const half = Math.tan(THREE.MathUtils.degToRad(VIEW.fov / 2));
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half / Math.min(camera.aspect, 1)));
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    reset();
    resize();

    return () => {
      disposed = true;
      view.current = null;
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      owned.forEach((item) => item.dispose());
      renderer.dispose();
    };
  }, [site, tracked, toast]);

  if (failed)
    return (
      <div className={cn("relative flex items-center justify-center bg-inset p-xl", className)}>
        <p className="t-body-m text-fg-secondary">3D view unavailable · WebGL is off or the graphics context was lost</p>
      </div>
    );

  return (
    <div ref={hostRef} className={cn("relative overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Mars with the relay orbits. Drag to rotate, pinch or scroll to zoom."
        className="absolute inset-0 block size-full cursor-grab touch-none active:cursor-grabbing"
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {tracked.map((item, i) => (
          <div
            key={item.relay.id}
            ref={(el) => {
              relayRefs.current[i] = el;
            }}
            className="invisible absolute top-0 left-0"
          >
            <SatelliteMarker
              label={item.inView ? `${item.relay.name} · el ${Math.round(item.elevation)}°` : item.relay.name}
              className="-top-[14px] -left-[13px] mw-reveal"
            />
            {item.live ? <Brackets className="-top-[20px] -left-[20px] size-[40px]" /> : null}
          </div>
        ))}

        <div ref={siteRef} className="invisible absolute top-0 left-0">
          <div className="pointer-events-auto">
            <WaypointMarker label={siteLabel} x={0} y={0} selected={false} onSelect={onToggleSite} />
          </div>
          {siteOpen && sitePanel ? (
            <div className="pointer-events-auto absolute -top-[28px] left-[48px]">{sitePanel}</div>
          ) : null}
        </div>
      </div>

      <div className="absolute right-lg bottom-lg z-10 flex flex-col gap-sm md:right-xl">
        <Button variant="map" size="icon" aria-label="Center on site" onClick={() => view.current?.reset()}>
          <Icon name="locate" size={20} />
        </Button>
        <Button variant="map" size="icon" aria-label="Zoom in" onClick={() => view.current?.zoom(0.8)}>
          <Icon name="plus" size={20} />
        </Button>
        <Button variant="map" size="icon" aria-label="Zoom out" onClick={() => view.current?.zoom(1.25)}>
          <Icon name="minus" size={20} />
        </Button>
      </div>
    </div>
  );
}
