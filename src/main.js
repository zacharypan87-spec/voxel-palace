/* ==========================================================================
   九重宫阙 · Voxel Palace
   main.js — 渲染器 / 天空 / 光照 / 相机 / 交互 / 昼夜 / 界面
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const THREE = window.THREE;

  if (!VP || !THREE) {
    document.body.innerHTML = '<div style="color:#e8d4ad;font-family:serif;padding:40px">Three.js 或体素引擎加载失败。</div>';
    return;
  }

  const canvas = document.getElementById('scene');
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loaderBar');
  const loaderCount = document.getElementById('loaderCount');
  const toastEl = document.getElementById('toast');
  const infoRank = document.getElementById('infoRank');
  const infoTitle = document.getElementById('infoTitle');
  const infoMeta = document.getElementById('infoMeta');
  const infoDesc = document.getElementById('infoDesc');
  const infoHint = document.getElementById('infoHint');
  const infoCard = document.getElementById('infoCard');
  const dockEl = document.getElementById('dock');
  const btnRotate = document.getElementById('btnRotate');
  const btnNight = document.getElementById('btnNight');
  const btnReset = document.getElementById('btnReset');

  /* ---------------------------------------------------------------------
     渲染器 / 场景 / 相机
     --------------------------------------------------------------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (err) {
    loader.innerHTML = '<div class="loader-inner"><p class="loader-title">无法启用 WebGL</p><p class="loader-sub">请使用支持 WebGL2 的现代浏览器</p></div>';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfc5a3, 300, 1150);

  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.6, 1600);
  camera.position.set(96, 75, 133);

  /* ---------------------------------------------------------------------
     天空穹顶（线性渐变 + 太阳）
     --------------------------------------------------------------------- */
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x24466e) },
    uHorizon: { value: new THREE.Color(0xefcd9c) },
    uHaze: { value: new THREE.Color(0xdcbb8f) },
    uSunColor: { value: new THREE.Color(0xffe2b4) },
    uSunDir: { value: new THREE.Vector3(-0.55, 0.12, -0.82).normalize() },
    uNight: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uHaze;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uNight;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        float up = pow(clamp(h, 0.0, 1.0), 0.14);
        vec3 col = mix(uHorizon, uTop, up);
        // 地平线暖色雾带
        float band = exp(-max(h, 0.0) * 22.0);
        col = mix(col, uHaze, band * 0.26);
        // 太阳 / 月亮
        float sd = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sd, 8.0) * mix(0.12, 0.05, uNight);
        col += uSunColor * pow(sd, 42.0) * mix(0.46, 0.16, uNight);
        float disk = smoothstep(0.9992, 0.99975, sd);
        col = mix(col, uSunColor * mix(1.6, 1.15, uNight), disk);
        // 地平线以下压暗
        float below = smoothstep(0.0, -0.2, h);
        col = mix(col, uHaze * 0.45, below * 0.75);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(760, 40, 24), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  scene.add(sky);

  /* 星空 */
  const starCount = 900;
  const starPos = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  const rngStars = VP.mulberry32(424242);
  for (let i = 0; i < starCount; i++) {
    const theta = rngStars() * Math.PI * 2;
    const phi = Math.acos(1 - rngStars() * 0.92);
    const r = 640;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starSize[i] = 0.7 + rngStars() * 2.2;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(starSize, 1));
  const starMat = new THREE.PointsMaterial({
    color: 0xdfe9ff,
    size: 2.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -90;
  stars.frustumCulled = false;
  scene.add(stars);

  /* ---------------------------------------------------------------------
     光照
     --------------------------------------------------------------------- */
  const hemi = new THREE.HemisphereLight(0xa9c4de, 0x5b4933, 0.58);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd7a6, 2.2);
  sun.position.set(-140, 100, 150);
  sun.target.position.set(0, 0, -16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -170;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 480;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 2.2;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x94b7dd, 0.32);
  fill.position.set(120, 62, -110);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(0xffc98d, 0.18);
  bounce.position.set(40, -20, 30);
  scene.add(bounce);

  /* 夜间灯笼暖光 */
  const lanternLights = [
    { pos: [0, 13, 5], intensity: 900, distance: 58 },
    { pos: [0, 12, 50], intensity: 760, distance: 54 },
    { pos: [44, 12, 32], intensity: 620, distance: 48 },
    { pos: [-44, 12, 32], intensity: 620, distance: 48 },
  ].map((def) => {
    const light = new THREE.PointLight(0xffa65c, 0, def.distance, 2);
    light.position.set(def.pos[0], def.pos[1], def.pos[2]);
    light.userData.nightIntensity = def.intensity;
    scene.add(light);
    return light;
  });

  /* ---------------------------------------------------------------------
     构建体素
     --------------------------------------------------------------------- */
  const voxels = new VP.VoxelBatch();
  let palaceResult = null;
  let propsResult = null;
  let pickTargets = [];
  let stats = { boxes: 0, buildings: 9 };

  function buildWorld() {
    palaceResult = VP.palace.build(scene, voxels);
    if (VP.props && typeof VP.props.build === 'function') {
      try {
        propsResult = VP.props.build(scene, voxels) || null;
      } catch (err) {
        console.error('props build failed:', err);
      }
    }
    const meshes = voxels.build(scene);
    pickTargets = (palaceResult && palaceResult.picks) || [];
    stats.boxes = voxels.count;
    return { meshes };
  }

  /* ---------------------------------------------------------------------
     相机控制（自带轻量 Orbit，不依赖 addons）
     --------------------------------------------------------------------- */
  class OrbitCamera {
    constructor(camera, dom) {
      this.camera = camera;
      this.dom = dom;
      this.target = new THREE.Vector3(0, 9, -4);
      this.cur = { r: 180, theta: 0.6, phi: 1.2 };
      this.goal = { r: 180, theta: 0.6, phi: 1.2 };
      this.goalTarget = this.target.clone();
      this.curTarget = this.target.clone();
      this.autoRotate = false;
      this.autoRotateSpeed = 0.075;
      this.enabled = true;
      this.flight = null;
      this.pointers = new Map();
      this.dragMode = null;
      this.downInfo = null;
      this.moved = 0;
      this._bind();
    }

    _syncFromCamera() {
      const off = this.camera.position.clone().sub(this.curTarget);
      const r = Math.max(2, off.length());
      this.cur.r = this.goal.r = r;
      this.cur.theta = this.goal.theta = Math.atan2(off.x, off.z);
      this.cur.phi = this.goal.phi = Math.acos(VP.clamp(off.y / r, -1, 1));
    }

    setView(pos, target, immediate) {
      const tgt = new THREE.Vector3(target[0], target[1], target[2]);
      const p = new THREE.Vector3(pos[0], pos[1], pos[2]);
      if (immediate) {
        this.camera.position.copy(p);
        this.curTarget.copy(tgt);
        this.goalTarget.copy(tgt);
        this.target.copy(tgt);
        this._syncFromCamera();
        this.camera.lookAt(tgt);
        this.flight = null;
      } else {
        this.flyTo(pos, target, 1.4);
      }
    }

    flyTo(pos, target, duration) {
      this.flight = {
        t: 0,
        dur: duration || 1.4,
        p0: this.camera.position.clone(),
        p1: new THREE.Vector3(pos[0], pos[1], pos[2]),
        t0: this.curTarget.clone(),
        t1: new THREE.Vector3(target[0], target[1], target[2]),
      };
    }

    _applyOrbit() {
      const t = this.curTarget;
      const sp = Math.sin(this.cur.phi);
      this.camera.position.set(
        t.x + this.cur.r * sp * Math.sin(this.cur.theta),
        t.y + this.cur.r * Math.cos(this.cur.phi),
        t.z + this.cur.r * sp * Math.cos(this.cur.theta)
      );
      this.camera.lookAt(t);
    }

    _bind() {
      const dom = this.dom;
      const onDown = (e) => {
        if (!this.enabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
        dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.flight = null;
        this._syncFromCamera();
        this.goalTarget.copy(this.curTarget);
        this.moved = 0;
        this.downInfo = { x: e.clientX, y: e.clientY, t: performance.now() };
        if (this.pointers.size === 1) {
          this.dragMode = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
        } else {
          this.dragMode = 'pinch';
          const pts = [...this.pointers.values()];
          this._pinch = {
            dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
            mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
          };
        }
        dom.style.cursor = 'grabbing';
      };

      const onMove = (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        const prev = this.pointers.get(e.pointerId);
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.moved += Math.abs(dx) + Math.abs(dy);
        if (this.pointers.size >= 2) {
          const pts = [...this.pointers.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          if (this._pinch) {
            this.goal.r = VP.clamp(this.goal.r * (this._pinch.dist / Math.max(30, dist)), 22, 330);
            this._pan(mid.x - this._pinch.mid.x, mid.y - this._pinch.mid.y, 2.2);
          }
          this._pinch = { dist, mid };
          return;
        }
        if (this.dragMode === 'pan' || e.buttons === 2) {
          this._pan(dx, dy, 1);
        } else {
          this.goal.theta -= dx * 0.0048;
          this.goal.phi = VP.clamp(this.goal.phi - dy * 0.0042, 0.16, 1.44);
        }
      };

      const onUp = (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.delete(e.pointerId);
        if (this.pointers.size === 0) {
          this.dragMode = null;
          dom.style.cursor = 'grab';
          const info = this.downInfo;
          this.downInfo = null;
          if (info && this.moved < 7 && performance.now() - info.t < 600) {
            const key = pickAt(e.clientX, e.clientY);
            if (key) focus(key);
          }
        } else if (this.pointers.size === 1) {
          this.dragMode = 'rotate';
        }
      };

      dom.addEventListener('pointerdown', onDown);
      dom.addEventListener('pointermove', onMove);
      dom.addEventListener('pointerup', onUp);
      dom.addEventListener('pointercancel', onUp);
      dom.addEventListener('contextmenu', (e) => e.preventDefault());
      dom.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.goal.r = VP.clamp(this.goal.r * Math.exp(e.deltaY * 0.0011), 22, 330);
        },
        { passive: false }
      );
      dom.style.cursor = 'grab';
    }

    _pan(dx, dy, mul) {
      const scale = this.cur.r * 0.00135 * mul;
      const forward = new THREE.Vector3().subVectors(this.curTarget, this.camera.position);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3(-forward.z, 0, forward.x); // 相机右方
      this.goalTarget.addScaledVector(right, -dx * scale);
      const up = new THREE.Vector3().crossVectors(right, forward).normalize();
      this.goalTarget.addScaledVector(up, dy * scale * 0.8);
      this.goalTarget.x = VP.clamp(this.goalTarget.x, -160, 160);
      this.goalTarget.z = VP.clamp(this.goalTarget.z, -190, 160);
      this.goalTarget.y = VP.clamp(this.goalTarget.y, -6, 90);
    }

    update(dt) {
      if (this.autoRotate && !this.flight && this.pointers.size === 0) {
        this.goal.theta += this.autoRotateSpeed * dt;
      }
      const rotK = 1 - Math.exp(-11 * dt);
      const zoomK = 1 - Math.exp(-8 * dt);
      this.cur.theta = VP.lerp(this.cur.theta, this.goal.theta, rotK);
      this.cur.phi = VP.lerp(this.cur.phi, this.goal.phi, rotK);
      this.cur.r = VP.lerp(this.cur.r, this.goal.r, zoomK);
      this.curTarget.lerp(this.goalTarget, zoomK);
      this.target.copy(this.curTarget);

      if (this.flight) {
        const fl = this.flight;
        fl.t += dt / fl.dur;
        const t = VP.clamp(fl.t, 0, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        this.camera.position.lerpVectors(fl.p0, fl.p1, e);
        this.curTarget.lerpVectors(fl.t0, fl.t1, e);
        this.goalTarget.copy(this.curTarget);
        this.target.copy(this.curTarget);
        this.camera.lookAt(this.curTarget);
        if (t >= 1) {
          this.flight = null;
          this._syncFromCamera();
        }
      } else {
        this._applyOrbit();
      }
    }
  }

  const controls = new OrbitCamera(camera, canvas);

  /* ---------------------------------------------------------------------
     昼夜主题
     --------------------------------------------------------------------- */
  const THEME = {
    dusk: {
      skyTop: 0x24466e,
      skyHorizon: 0xefcd9c,
      haze: 0xdcbb8f,
      sunColor: 0xffe2b4,
      sunDir: [-0.55, 0.12, -0.82],
      fog: 0xdfc5a3,
      fogNear: 300,
      fogFar: 1150,
      hemiSky: 0xa9c4de,
      hemiGround: 0x5b4933,
      hemiIntensity: 0.6,
      sunLight: 0xffd7a6,
      sunIntensity: 2.25,
      fillIntensity: 0.35,
      bounceIntensity: 0.1,
      exposure: 0.92,
      starOpacity: 0,
      lantern: 0,
      night: 0,
      glow: 1,
    },
    night: {
      skyTop: 0x060d1c,
      skyHorizon: 0x1a2740,
      haze: 0x2a3446,
      sunColor: 0xc9d9ff,
      sunDir: [-0.25, 0.42, -0.87],
      fog: 0x1a2434,
      fogNear: 240,
      fogFar: 1000,
      hemiSky: 0x38527c,
      hemiGround: 0x14110d,
      hemiIntensity: 0.9,
      sunLight: 0xb7cbff,
      sunIntensity: 0.85,
      fillIntensity: 0.34,
      bounceIntensity: 0.03,
      exposure: 1.32,
      starOpacity: 1,
      lantern: 1,
      night: 1,
      glow: 2.1,
    },
  };

  const theme = {
    current: { ...THEME.dusk },
    target: { ...THEME.dusk },
    mode: 'dusk',
    colors: {
      skyTop: new THREE.Color(THEME.dusk.skyTop),
      skyHorizon: new THREE.Color(THEME.dusk.skyHorizon),
      haze: new THREE.Color(THEME.dusk.haze),
      sunColor: new THREE.Color(THEME.dusk.sunColor),
      fog: new THREE.Color(THEME.dusk.fog),
      hemiSky: new THREE.Color(THEME.dusk.hemiSky),
      hemiGround: new THREE.Color(THEME.dusk.hemiGround),
      sunLight: new THREE.Color(THEME.dusk.sunLight),
      sunDir: new THREE.Vector3(...THEME.dusk.sunDir).normalize(),
    },
  };

  function syncPropsNight(night) {
    scene.traverse((o) => {
      if (o.name && o.name.indexOf('props-cloud-') === 0) {
        o.traverse((c) => {
          if (c.isMesh && c.material && c.material.color) {
            c.material.color.setScalar(1 - 0.72 * night);
          }
        });
      }
    });
  }

  function applyThemeInstant(cfg) {
    const c = theme.colors;
    c.skyTop.setHex(cfg.skyTop);
    c.skyHorizon.setHex(cfg.skyHorizon);
    c.haze.setHex(cfg.haze);
    c.sunColor.setHex(cfg.sunColor);
    c.fog.setHex(cfg.fog);
    c.hemiSky.setHex(cfg.hemiSky);
    c.hemiGround.setHex(cfg.hemiGround);
    c.sunLight.setHex(cfg.sunLight);
    c.sunDir.set(...cfg.sunDir).normalize();
    skyUniforms.uNight.value = cfg.night;
    starMat.opacity = cfg.starOpacity;
    renderer.toneMappingExposure = cfg.exposure;
    scene.fog.color.copy(c.fog);
    scene.fog.near = cfg.fogNear;
    scene.fog.far = cfg.fogFar;
    hemi.color.copy(c.hemiSky);
    hemi.groundColor.copy(c.hemiGround);
    hemi.intensity = cfg.hemiIntensity;
    sun.color.copy(c.sunLight);
    sun.intensity = cfg.sunIntensity;
    fill.intensity = cfg.fillIntensity;
    bounce.intensity = cfg.bounceIntensity;
    const glowMesh = scene.getObjectByName('voxel-batch-glow');
    if (glowMesh) glowMesh.material.color.setScalar(cfg.glow);
    lanternLights.forEach((l) => {
      l.intensity = l.userData.nightIntensity * cfg.lantern;
    });
  }

  function updateThemeColors() {
    const c = theme.colors;
    const tgt = theme.target;
    const cur = theme.current;
    cur.skyTop = tgt.skyTop;
    cur.fogNear = tgt.fogNear;
    cur.fogFar = tgt.fogFar;
    skyUniforms.uTop.value.copy(c.skyTop);
    skyUniforms.uHorizon.value.copy(c.skyHorizon);
    skyUniforms.uHaze.value.copy(c.haze);
    skyUniforms.uSunColor.value.copy(c.sunColor);
    skyUniforms.uSunDir.value.copy(c.sunDir);
    skyUniforms.uNight.value = cur.night;
    scene.fog.color.copy(c.fog);
    scene.fog.near = cur.fogNear;
    scene.fog.far = cur.fogFar;
    hemi.color.copy(c.hemiSky);
    hemi.groundColor.copy(c.hemiGround);
    hemi.intensity = cur.hemiIntensity;
    sun.color.copy(c.sunLight);
    sun.intensity = cur.sunIntensity;
    fill.intensity = cur.fillIntensity;
    bounce.intensity = cur.bounceIntensity;
    renderer.toneMappingExposure = cur.exposure;
    starMat.opacity = cur.starOpacity;
    lanternLights.forEach((l) => {
      l.intensity = l.userData.nightIntensity * cur.lantern;
    });
    const glowMesh = scene.getObjectByName('voxel-batch-glow');
    if (glowMesh) glowMesh.material.color.setScalar(cur.glow);
    syncPropsNight(cur.night);
  }

  function setMode(mode) {
    const cfg = THEME[mode] || THEME.dusk;
    theme.mode = mode === 'night' ? 'night' : 'dusk';
    theme.target = { ...cfg };
    // 颜色和标量都以每秒约 2.2 的速度插值
    const c = theme.colors;
    const speed = 2.4;
    theme._transition = {
      from: {
        colors: {
          skyTop: c.skyTop.clone(),
          skyHorizon: c.skyHorizon.clone(),
          haze: c.haze.clone(),
          sunColor: c.sunColor.clone(),
          fog: c.fog.clone(),
          hemiSky: c.hemiSky.clone(),
          hemiGround: c.hemiGround.clone(),
          sunLight: c.sunLight.clone(),
          sunDir: c.sunDir.clone(),
        },
        scalars: { ...theme.current },
      },
      to: {
        colors: {
          skyTop: new THREE.Color(cfg.skyTop),
          skyHorizon: new THREE.Color(cfg.skyHorizon),
          haze: new THREE.Color(cfg.haze),
          sunColor: new THREE.Color(cfg.sunColor),
          fog: new THREE.Color(cfg.fog),
          hemiSky: new THREE.Color(cfg.hemiSky),
          hemiGround: new THREE.Color(cfg.hemiGround),
          sunLight: new THREE.Color(cfg.sunLight),
          sunDir: new THREE.Vector3(...cfg.sunDir).normalize(),
        },
        scalars: { ...cfg },
      },
      t: 0,
      speed,
    };
    btnNight.classList.toggle('is-on', theme.mode === 'night');
    const label = btnNight.querySelector('span');
    if (label) label.textContent = theme.mode === 'night' ? '日暮' : '月夜';
  }

  function stepTransition(dt) {
    const tr = theme._transition;
    if (!tr) return;
    tr.t = Math.min(1, tr.t + dt * tr.speed);
    const e = tr.t * tr.t * (3 - 2 * tr.t);
    const c = theme.colors;
    for (const k of Object.keys(tr.from.colors)) {
      if (k === 'sunDir') c.sunDir.lerpVectors(tr.from.colors.sunDir, tr.to.colors.sunDir, e).normalize();
      else c[k].copy(tr.from.colors[k]).lerp(tr.to.colors[k], e);
    }
    for (const k of Object.keys(tr.from.scalars)) {
      if (typeof tr.from.scalars[k] === 'number') {
        theme.current[k] = VP.lerp(tr.from.scalars[k], tr.to.scalars[k], e);
      }
    }
    updateThemeColors();
    if (tr.t >= 1) {
      theme._transition = null;
    }
  }

  /* ---------------------------------------------------------------------
     拾取 / 聚焦
     --------------------------------------------------------------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickAt(clientX, clientY) {
    if (!pickTargets.length) return null;
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickTargets, false);
    return hits.length ? hits[0].object.userData.pickKey : null;
  }

  const DOCK_OF = {
    overview: 'overview',
    main: 'main',
    rear: 'rear',
    gate: 'gate',
    halls: 'halls',
    eastHall: 'halls',
    westHall: 'halls',
    towers: 'towers',
    bellTower: 'towers',
    drumTower: 'towers',
    garden: 'garden',
    gardenEast: 'garden',
    gardenWest: 'garden',
  };

  let toastTimer = null;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2300);
  }

  function getData(key) {
    if (key === 'overview') return VP.OVERVIEW_DATA;
    return VP.PALACE_DATA[key] || VP.PALACE_DATA[DOCK_OF[key]] || VP.PALACE_DATA[key];
  }

  function setDockActive(key) {
    const active = DOCK_OF[key] || key;
    [...dockEl.querySelectorAll('.dock-btn')].forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.target === active);
    });
  }

  let currentKey = 'overview';
  function updateInfo(data, key) {
    if (!data) return;
    infoRank.textContent = data.rank;
    infoTitle.textContent = data.name;
    infoMeta.textContent = data.meta;
    infoDesc.textContent = data.desc;
    infoCard.classList.remove('is-swap');
    // 触发一次淡入
    void infoCard.offsetWidth;
    infoCard.classList.add('is-swap');
    if (key) setDockActive(key);
  }

  /** 窄屏适配：把相机沿视线后撤，让建筑完整入画 */
  function fitView(view) {
    if (window.innerWidth >= 720) return view;
    const t = view.target;
    const p = view.pos;
    const k = 2.0;
    return {
      pos: [t[0] + (p[0] - t[0]) * k, t[1] + (p[1] - t[1]) * k, t[2] + (p[2] - t[2]) * k],
      target: t,
    };
  }

  function focus(key, opts) {
    const data = getData(key);
    if (!data || !data.view) return;
    currentKey = key;
    const v = fitView(data.view);
    controls.flyTo(v.pos, v.target, 1.55);
    updateInfo(data, DOCK_OF[key] || key);
    if (!opts || !opts.silent) {
      if (key === 'overview') toast('已回到总览视角');
      else toast(data.name + ' · 已聚焦');
    }
  }

  function toggleRotate(force) {
    controls.autoRotate = force === undefined ? !controls.autoRotate : !!force;
    btnRotate.classList.toggle('is-on', controls.autoRotate);
    toast(controls.autoRotate ? '自动巡游 · 已开启' : '自动巡游 · 已暂停');
  }

  /* ---------------------------------------------------------------------
     界面事件
     --------------------------------------------------------------------- */
  dockEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.dock-btn');
    if (!btn) return;
    focus(btn.dataset.target);
  });
  btnRotate.addEventListener('click', () => toggleRotate());
  btnReset.addEventListener('click', () => {
    focus('overview', { silent: true });
    toggleRotate(false);
  });
  btnNight.addEventListener('click', () => {
    setMode(theme.mode === 'night' ? 'dusk' : 'night');
    toast(theme.mode === 'night' ? '月夜 · 宫灯已点' : '暮色 · 金光满庭');
  });
  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'r' || e.key === 'R') {
      focus('overview', { silent: true });
      toast('视角已复位');
    } else if (e.key === 'n' || e.key === 'N') {
      btnNight.click();
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleRotate();
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  });

  /* ---------------------------------------------------------------------
     主循环
     --------------------------------------------------------------------- */
  const clock = new THREE.Clock();
  let elapsed = 0;
  let frames = 0;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());
    elapsed += dt;
    stepTransition(dt);
    controls.update(dt);
    if (VP.props && typeof VP.props.update === 'function') {
      try {
        VP.props.update(elapsed, dt);
      } catch (err) {
        // 避免单帧异常中断渲染
        if (!animate._propsErr) {
          animate._propsErr = true;
          console.error('props update failed:', err);
        }
      }
    }
    renderer.render(scene, camera);
    frames++;
  }

  /* ---------------------------------------------------------------------
     启动
     --------------------------------------------------------------------- */
  function boot() {
    try {
      loaderBar.style.width = '28%';
      loaderCount.textContent = '筑基 · 立柱 · 上梁';
      buildWorld();
      loaderBar.style.width = '78%';
      loaderCount.textContent = '铺瓦 · 点灯 · 成景';
      const initialView = fitView(VP.OVERVIEW_DATA.view);
      controls.setView(initialView.pos, initialView.target, true);
      applyThemeInstant(THEME.dusk);
      updateThemeColors();
      updateInfo(VP.OVERVIEW_DATA, 'overview');
      setDockActive('overview');
      // 首帧
      renderer.render(scene, camera);
      requestAnimationFrame(() => {
        loaderBar.style.width = '100%';
        loaderCount.textContent = '九重宫阙 · 已落成';
        animate();
        setTimeout(() => {
          loader.classList.add('is-done');
          toast('营造完成 · 拖拽环绕，点击殿宇聚焦');
        }, 620);
      });
      window.__PALACE = {
        ready: true,
        scene,
        camera,
        renderer,
        controls,
        views: VP.PALACE_DATA,
        overview: VP.OVERVIEW_DATA,
        focus,
        setMode,
        toggleRotate,
        stats,
        get themeMode() {
          return theme.mode;
        },
      };
      window.__PALACE_READY__ = true;
    } catch (err) {
      console.error(err);
      loader.innerHTML =
        '<div class="loader-inner"><p class="loader-title">营造中断</p><p class="loader-sub">' +
        String(err && err.message ? err.message : err).slice(0, 160) +
        '</p></div>';
    }
  }

  // 让加载动画先绘制一帧，再开始构建
  requestAnimationFrame(() => setTimeout(boot, 30));
})();
