// Drawing the hands: three.js on a WebGL canvas laid over the 2D frame, seen from straight above the frame's centre
// through a slightly long lens (so the knuckles, nearer the camera, read a little larger than the fingertips, as in a
// photo from above a desk). The key tops are the z = 0 plane, mapped exactly onto the keyboard in the frame.
// The looks: 'clay' (plain, opaque, to judge the shape), and the glass ones (ghost.ts LOOKS): 'ghost' (liquid and
// frost), 'frost' (fog), 'smoke' (graphite), 'outline' (a hairline) and 'shadow' (the hands' shadow alone).
export type HandLook = 'clay' | GhostName;
import * as THREE from 'three';
import type { HandModel, Side } from './glb';
import { surfaceOf, type HandSurface } from './mesh';
import { rigOf, type Pose, type Rig } from './rig';
import { depthMaterial, ghostMaterial, LOOKS, type GhostLook, type GhostName } from './ghost';
import { HandShadow } from './shadow';

export interface Frame {
  /** each hand's pose */
  poses: Record<Side, Pose>;
  /** frame px per mm, and the frame point of the world's origin */
  PX: number; ox: number; oy: number;
  /** what's under the hands (the frame as drawn so far), for the ghost to see through */
  under?: HTMLCanvasElement;
  /** how pressed each fingertip contact is, for the touch glow: world mm points with a strength 0..1 */
  touches?: { x: number; y: number; s: number }[];
}

/** the camera's height over the key tops, mm (about a forearm's length up: a phone held over a desk) */
const CAM_H = 620;

export class HandsView {
  readonly rigs: Record<Side, Rig>;
  private surf: Record<Side, HandSurface>;
  private geo: Record<Side, THREE.BufferGeometry>;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 10, 2000);
  private ghost?: ReturnType<typeof ghostMaterial>;
  private shadow?: HandShadow;
  private under?: THREE.CanvasTexture;
  private underBlur?: THREE.CanvasTexture;
  private blurCanvas?: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, models: Record<Side, HandModel>, readonly look: HandLook, ghostLook?: Partial<GhostLook>) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, premultipliedAlpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.rigs = { L: rigOf(models.L), R: rigOf(models.R) };
    this.surf = { L: surfaceOf(models.L, this.rigs.L), R: surfaceOf(models.R, this.rigs.R) };
    const mat = look === 'clay'
      ? new THREE.MeshStandardMaterial({ color: '#d9cfc3', roughness: 0.72, metalness: 0 })
      : (this.ghost = ghostMaterial({ ...LOOKS[look], ...ghostLook }));
    this.geo = {} as Record<Side, THREE.BufferGeometry>;
    for (const side of ['L', 'R'] as const) {
      const s = this.surf[side];
      const g = new THREE.BufferGeometry();
      g.setIndex(new THREE.BufferAttribute(s.index, 1));
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * s.count), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3 * s.count), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('fade', new THREE.BufferAttribute(s.fade, 1));
      this.geo[side] = g;
      const mesh = new THREE.Mesh(g, mat as THREE.Material);
      mesh.frustumCulled = false;
      mesh.castShadow = look === 'clay';
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      if (look !== 'clay') {
        // the glass shows only its nearest surface: the hands' depth first, then the glass where it's frontmost
        const depth = new THREE.Mesh(g, depthMaterial());
        depth.frustumCulled = false;
        depth.renderOrder = 0;
        this.scene.add(depth);
      }
    }
    if (look !== 'clay') this.shadow = new HandShadow([this.geo.L, this.geo.R], look === 'shadow' ? 0.42 : look === 'outline' ? 0.12 : undefined);
    if (look === 'clay') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene.add(new THREE.HemisphereLight('#ffffff', '#b9b2a8', 0.9));
      const sun = new THREE.DirectionalLight('#ffffff', 2.2);
      sun.position.set(-260, 300, 560);
      sun.castShadow = true;
      Object.assign(sun.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 10, far: 1500 });
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0005;
      this.scene.add(sun, sun.target);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.28 }));
      ground.position.z = -0.5;
      ground.receiveShadow = true;
      this.scene.add(ground);
    }
  }

  render(f: Frame) {
    const canvas = this.renderer.domElement;
    const W = canvas.width, H = canvas.height;
    this.renderer.setSize(W, H, false);
    // the camera over the frame's centre, its field of view fitted so the z = 0 plane lands at PX px per mm
    const cx = (W / 2 - f.ox) / f.PX, cy = (f.oy - H / 2) / f.PX;
    this.camera.position.set(cx, cy, CAM_H);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(cx, cy, 0);
    this.camera.fov = (2 * Math.atan(H / f.PX / 2 / CAM_H) * 180) / Math.PI;
    this.camera.aspect = W / H;
    this.camera.near = 50; this.camera.far = CAM_H + 200;
    this.camera.updateProjectionMatrix();
    for (const side of ['L', 'R'] as const) {
      const g = this.geo[side];
      const pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute;
      this.surf[side].pose(f.poses[side], pos.array as Float32Array, nor.array as Float32Array);
      pos.needsUpdate = true; nor.needsUpdate = true;
    }
    const r = this.renderer;
    r.autoClear = false;
    if (this.ghost && f.under) {
      this.shadow!.render(r, this.camera, W, H, f.PX);
      this.feedGhost(f, W, H);
    }
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    if (this.shadow) this.shadow.layOver(r);
    r.render(this.scene, this.camera);
  }

  private feedGhost(f: Frame, W: number, H: number) {
    const g = this.ghost!;
    // what's under the hands, sharp and frosted (blurred once per frame on the 2D canvas)
    this.under ??= new THREE.CanvasTexture(f.under!);
    this.under.image = f.under!;
    this.under.needsUpdate = true;
    this.blurCanvas ??= document.createElement('canvas');
    const b = this.blurCanvas;
    if (b.width !== W || b.height !== H) { b.width = W; b.height = H; }
    const bx = b.getContext('2d')!;
    bx.filter = `blur(${g.look.frost * f.PX}px)`;
    bx.drawImage(f.under!, 0, 0);
    bx.filter = 'none';
    this.underBlur ??= new THREE.CanvasTexture(b);
    this.underBlur.needsUpdate = true;
    g.uniforms.under.value = this.under;
    g.uniforms.underBlur.value = this.underBlur;
    g.uniforms.res.value.set(W, H);
    g.uniforms.pxPerMm.value = f.PX;
    // the fog's band at the bottom of the frame: from its edge up some 36 mm (of the keyboard)
    g.uniforms.fogPx.value = 36 * f.PX;
    g.uniforms.fogFrom.value = 0;
    g.uniforms.camPos.value.copy(this.camera.position);
    g.uniforms.shade.value = this.shadow!.texture;
    g.uniforms.shadeK.value = this.shadow!.strength;
  }

  dispose() { this.renderer.dispose(); }
}
