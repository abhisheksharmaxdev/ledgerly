/**
 * Ambient WebGL depth layer: a few slow, softly-lit low-poly shapes drifting at the edges
 * of the viewport with gentle pointer/scroll parallax. Loaded lazily and only on capable devices.
 * Renders a single static frame when motion is reduced; pauses while the tab is hidden.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  theme: "dark" | "light";
  animate: boolean;
}

const PALETTE = {
  dark: { fog: 0x070a14, key: 0x8b93ff, rim: 0x5eead4, fill: 0xc084fc, shapes: [0x5b63d9, 0x7c3aed, 0x2dd4bf, 0x4f46e5, 0x818cf8], ambient: 0.35 },
  light: { fog: 0xeef1f8, key: 0x6366f1, rim: 0x14b8a6, fill: 0xa855f7, shapes: [0xa5b4fc, 0xc4b5fd, 0x99f6e4, 0xc7d2fe, 0xddd6fe], ambient: 0.9 },
};

export default function Background3D({ theme, animate }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // No WebGL: the CSS gradient background remains.
    }
    const colors = PALETTE[theme];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(colors.fog, 10, 26);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    camera.position.set(0, 0, 14);

    scene.add(new THREE.AmbientLight(0xffffff, colors.ambient));
    const key = new THREE.DirectionalLight(colors.key, 2.2);
    key.position.set(-6, 8, 6);
    scene.add(key);
    const rim = new THREE.PointLight(colors.rim, 40, 30);
    rim.position.set(8, -4, 4);
    scene.add(rim);
    const fill = new THREE.PointLight(colors.fill, 30, 30);
    fill.position.set(0, 6, -4);
    scene.add(fill);

    const geometries = [
      new THREE.IcosahedronGeometry(1.25, 0),
      new THREE.OctahedronGeometry(1, 0),
      new THREE.TorusGeometry(1.3, 0.16, 20, 80),
      new THREE.DodecahedronGeometry(0.9, 0),
      new THREE.TorusGeometry(0.8, 0.28, 18, 48),
      new THREE.IcosahedronGeometry(0.7, 0),
      new THREE.OctahedronGeometry(0.6, 0),
    ];
    // Positions hug the edges so content in the centre stays clean.
    const layout: [number, number, number][] = [
      [-8.5, 4.2, -3],
      [8.8, 3.6, -5],
      [7.6, -4.4, -2],
      [-7.4, -4.8, -4],
      [-2.5, 6.2, -8],
      [3.2, -6.4, -7],
      [10.5, 0.2, -9],
    ];
    const materials: THREE.Material[] = [];
    const meshes = geometries.map((geo, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: colors.shapes[i % colors.shapes.length],
        roughness: 0.28,
        metalness: 0.45,
        flatShading: true,
        transparent: true,
        opacity: theme === "dark" ? 0.78 : 0.7,
      });
      materials.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      const [x, y, z] = layout[i];
      mesh.position.set(x, y, z);
      mesh.rotation.set(i * 0.7, i * 1.3, i * 0.4);
      mesh.userData = { baseY: y, speed: 0.12 + (i % 3) * 0.05, phase: i * 1.7 };
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 20),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: theme === "dark" ? 0.12 : 0.35 }),
      );
      materials.push(edges.material as THREE.Material);
      mesh.add(edges);
      scene.add(mesh);
      return mesh;
    });

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Pull the camera back on narrow screens so shapes stay at the edges.
      camera.position.z = w < 900 ? 18 : 14;
      camera.updateProjectionMatrix();
    };
    resize();

    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 1.2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 0.8;
    };

    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      pointer.x += (target.x - pointer.x) * 0.04;
      pointer.y += (target.y - pointer.y) * 0.04;
      camera.position.x = pointer.x;
      camera.position.y = -pointer.y - window.scrollY * 0.0025;
      camera.lookAt(0, -window.scrollY * 0.0025, 0);
      for (const m of meshes) {
        const { baseY, speed, phase } = m.userData as { baseY: number; speed: number; phase: number };
        m.rotation.x += speed * 0.006;
        m.rotation.y += speed * 0.009;
        m.position.y = baseY + Math.sin(t * speed * 2 + phase) * 0.35;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!raf && animate && !document.hidden) {
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      resize();
      if (!animate) renderer.render(scene, camera);
    };

    window.addEventListener("resize", onResize);
    if (animate) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      start();
    } else {
      renderer.render(scene, camera);
    }

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      geometries.forEach((g) => g.dispose());
      meshes.forEach((m) => m.children.forEach((c) => (c as THREE.LineSegments).geometry.dispose()));
      materials.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, [theme, animate]);

  return <canvas ref={canvasRef} className="bg3d" aria-hidden="true" />;
}
