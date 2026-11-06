// The ghost hands' shadow: soft and faint, cast by a broad light a little above and behind the camera, so it falls a
// touch down and to the right of each hand and sits close under the fingertips (they touch the keys). Drawn on the
// GPU: the hands squashed flat onto the key tops along the light (each point slides as far as it is high), blurred
// twice (a separable Gaussian), then laid over the frame. The glass sees it too (ghost.ts), so the shadow shows through
// the hands as it would through frosted glass.
import * as THREE from 'three';

/** where the light comes from (toward it): the shadow slides LIGHT.x, LIGHT.y mm per mm of height (away from it) */
const LIGHT = { x: -0.12, y: 0.22 };

const flatVert = /* glsl */ `
varying float vH;
void main() {
  vec3 p = position;
  vH = p.z;
  p.xy -= vec2(${LIGHT.x.toFixed(3)}, ${LIGHT.y.toFixed(3)}) * p.z;
  p.z = 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// darker where the hand is close to the keys (the fingertips), lighter under the raised palm
const flatFrag = /* glsl */ `
varying float vH;
void main() { gl_FragColor = vec4(1.0 - 0.55 * smoothstep(4.0, 70.0, vH), 0.0, 0.0, 1.0); }`;

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const blurFrag = /* glsl */ `
uniform sampler2D src;
uniform vec2 step;
varying vec2 vUv;
void main() {
  float w[7]; w[0] = 0.1964825501511404; w[1] = 0.2969069646728344; w[2] = 0.09447039785044732; w[3] = 0.010381362401148057;
  float acc = texture2D(src, vUv).r * w[0];
  acc += (texture2D(src, vUv + step * 1.411764705882353).r + texture2D(src, vUv - step * 1.411764705882353).r) * w[1];
  acc += (texture2D(src, vUv + step * 3.2941176470588234).r + texture2D(src, vUv - step * 3.2941176470588234).r) * w[2];
  acc += (texture2D(src, vUv + step * 5.176470588235294).r + texture2D(src, vUv - step * 5.176470588235294).r) * w[3];
  gl_FragColor = vec4(acc, 0.0, 0.0, 1.0);
}`;
const layFrag = /* glsl */ `
uniform sampler2D src;
uniform float strength;
varying vec2 vUv;
void main() {
  float a = strength * texture2D(src, vUv).r;
  // a cool grey, as the room's ink
  gl_FragColor = vec4(vec3(0.118, 0.153, 0.2) * a, a);
}`;

export class HandShadow {
  private flat = new THREE.Scene();
  private quad = new THREE.Scene();
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private rt: THREE.WebGLRenderTarget[] = [];
  private blur: THREE.ShaderMaterial;
  private lay: THREE.ShaderMaterial;
  private plane: THREE.Mesh;
  /** the blurred shadow, for the glass to see */
  texture: THREE.Texture | null = null;

  constructor(geos: THREE.BufferGeometry[], readonly strength = 0.22, readonly softMm = 4) {
    const mat = new THREE.ShaderMaterial({ vertexShader: flatVert, fragmentShader: flatFrag, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    for (const g of geos) { const m = new THREE.Mesh(g, mat); m.frustumCulled = false; this.flat.add(m); }
    this.blur = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: blurFrag, uniforms: { src: { value: null }, step: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.lay = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: layFrag, uniforms: { src: { value: null }, strength: { value: strength } }, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blur);
    this.plane.frustumCulled = false;
    this.quad.add(this.plane);
  }

  /** draw the shadow into its targets (half the frame's size), for the camera the hands are seen through */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, W: number, H: number, PX: number) {
    const w = Math.ceil(W / 2), h = Math.ceil(H / 2);
    if (!this.rt.length || this.rt[0].width !== w || this.rt[0].height !== h) {
      this.rt.forEach((r) => r.dispose());
      this.rt = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.rt[0]); renderer.clear(); renderer.render(this.flat, camera);
    // two blurs of sigma ≈ softMm each way (the kernel above has a sigma of about 2.4 steps)
    const stepPx = (this.softMm * PX) / 2 / 2.4;
    this.plane.material = this.blur;
    const pass = (src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget, x: number, y: number) => {
      this.blur.uniforms.src.value = src.texture;
      this.blur.uniforms.step.value.set(x / w, y / h);
      renderer.setRenderTarget(dst); renderer.clear(); renderer.render(this.quad, this.ortho);
    };
    pass(this.rt[0], this.rt[1], stepPx, 0); pass(this.rt[1], this.rt[2], 0, stepPx);
    pass(this.rt[2], this.rt[1], stepPx * 0.6, 0); pass(this.rt[1], this.rt[2], 0, stepPx * 0.6);
    renderer.setRenderTarget(null);
    this.texture = this.rt[2].texture;
  }

  /** lay the shadow over what's on the canvas */
  layOver(renderer: THREE.WebGLRenderer) {
    this.lay.uniforms.src.value = this.texture;
    this.plane.material = this.lay;
    renderer.render(this.quad, this.ortho);
  }
}
