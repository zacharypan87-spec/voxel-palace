/* ==========================================================================
   九重宫阙 · Voxel Palace
   voxel.js — 体素批处理引擎 + 全局色板 + 场景布局常量
   所有建筑、山石、树木均由轴对齐的方块拼合而成。
   ========================================================================== */
(function () {
  'use strict';

  const VP = (window.VP = window.VP || {});
  const THREE = window.THREE;

  /* ---------------- 色板（sRGB） ---------------- */
  const C = (VP.C = {
    /* 琉璃瓦 —— 黄 */
    gold: 0xe3aa3c,
    goldLite: 0xf1c45c,
    goldPale: 0xf7d98c,
    goldDeep: 0xd09534,
    goldEdge: 0xf6d37a,
    goldRidge: 0xb5751f,
    goldOrn: 0xf3c869,
    /* 琉璃瓦 —— 绿 */
    green: 0x3f7a62,
    greenLite: 0x5a967b,
    greenDeep: 0x2e5b49,
    greenEdge: 0x89c2a3,
    greenRidge: 0x244a3b,
    greenOrn: 0xd9b25e,
    /* 宫墙 / 木作 */
    wallRed: 0x9c2b26,
    wallRedDark: 0x7a1f1c,
    wallRedLite: 0xb33a30,
    column: 0xa8322a,
    columnDark: 0x82231f,
    doorRed: 0x6d1a18,
    doorStud: 0xd8aa4f,
    beamRed: 0x8c2822,
    woodDark: 0x40251d,
    woodMid: 0x5a3528,
    blackVoid: 0x171412,
    /* 彩画 / 斗拱 */
    paintBlue: 0x2c5a63,
    paintTeal: 0x3a7268,
    paintGreen: 0x406e55,
    paintWhite: 0xd9d2bd,
    /* 石作 */
    marble: 0xe9e3d5,
    marbleLite: 0xf4efe3,
    marbleMid: 0xd6cdb9,
    marbleDark: 0xaea58f,
    stone: 0x97907e,
    stoneDark: 0x726b5c,
    stoneWarm: 0xa89c84,
    /* 地面 */
    brick: 0xb5a88f,
    brickAlt: 0xaca087,
    brickDark: 0x938772,
    brickWarm: 0xc0b298,
    imperialPath: 0xd2c5a7,
    pathEdge: 0xa89b80,
    earth: 0x6f6047,
    earthDark: 0x5c4f3a,
    /* 草木 */
    grass: 0x627a45,
    grassDark: 0x50653a,
    grassLite: 0x738a52,
    pineDark: 0x2d4633,
    pine: 0x38563b,
    pineLite: 0x476747,
    leaf: 0x4f7143,
    leafLite: 0x648654,
    leafDeep: 0x3c5a37,
    trunk: 0x5a4230,
    trunkDark: 0x463225,
    rock: 0x7d7a6e,
    rockDark: 0x636156,
    rockLite: 0x969182,
    /* 金属 / 灯火 / 水 */
    bronze: 0x6e5d3e,
    bronzeLite: 0x8d7950,
    bronzeDark: 0x4c3f2a,
    metalGold: 0xe6bb68,
    lantern: 0xff7a38,
    lanternRed: 0xd8392a,
    lanternDark: 0x7c1c14,
    cloth: 0xc2412f,
    clothGold: 0xe0b055,
    water: 0x396b70,
    ice: 0x8fb6b4,
  });

  /* ---------------- 场景布局（供各模块共享） ---------------- */
  VP.LAYOUT = {
    unit: 1,
    groundY: 0.55,
    bounds: { minX: -118, maxX: 118, minZ: -142, maxZ: 120 },
    complex: { minX: -76, maxX: 76, minZ: -102, maxZ: 72 },
    courtyard: { minX: -62, maxX: 62, minZ: -44, maxZ: 63 },
    buildings: {
      main: { cx: 0, cz: -18, w: 44, d: 26, top: 46, platformW: 60, platformD: 44, rank: 1 },
      rear: { cx: 0, cz: -64, w: 26, d: 18, top: 30, platformW: 37, platformD: 28, rank: 2 },
      gate: { cx: 0, cz: 64, w: 44, d: 16, top: 34, rank: 2 },
      eastHall: { cx: 47, cz: 6, w: 15, d: 26, top: 17, rank: 3 },
      westHall: { cx: -47, cz: 6, w: 15, d: 26, top: 17, rank: 3 },
      bellTower: { cx: 47, cz: 38, w: 13, d: 13, top: 25, rank: 3 },
      drumTower: { cx: -47, cz: 38, w: 13, d: 13, top: 25, rank: 3 },
      gardenEast: { cx: 21, cz: -88, w: 9, d: 9, top: 20, rank: 4 },
      gardenWest: { cx: -21, cz: -88, w: 9, d: 9, top: 20, rank: 4 },
    },
    /* 允许自然点缀的区域（props 使用） */
    natureZones: {
      treesOuter: [
        [-104, 104, -136, -108],
        [-108, 108, 82, 116],
        [-116, -82, -100, 82],
        [82, 116, -100, 82],
        [-64, 64, -100, -80],
      ],
      courtyardPlanters: [
        [-56, -42, 22, 36],
        [42, 56, 22, 36],
      ],
      rocksGarden: [-58, 58, -98, -82],
    },
  };

  /* ---------------- 随机数 ---------------- */
  VP.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  VP.rng = VP.mulberry32(20260607);

  VP.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  VP.lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- 颜色工具 ---------------- */
  const _color = new THREE.Color();
  const linearCache = new Map();
  /** 十六进制 sRGB 转线性 RGB（three r160 顶点色需要线性值） */
  VP.linearRGB = function (hex) {
    let v = linearCache.get(hex);
    if (!v) {
      _color.setHex(hex);
      v = [_color.r, _color.g, _color.b];
      linearCache.set(hex, v);
    }
    return v;
  };
  /** 明暗微调，仍返回 sRGB HEX（用于需要色板的场合） */
  VP.shade = function (hex, f) {
    const r = Math.round(VP.clamp(((hex >> 16) & 255) * f, 0, 255));
    const g = Math.round(VP.clamp(((hex >> 8) & 255) * f, 0, 255));
    const b = Math.round(VP.clamp((hex & 255) * f, 0, 255));
    return (r << 16) | (g << 8) | b;
  };

  /* ---------------- 体素批次 ---------------- */
  const FACES = [
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  ];

  const MATERIAL_GROUPS = {
    solid: { roughness: 0.86, metalness: 0.03 },
    metal: { roughness: 0.34, metalness: 0.62 },
    glow: { basic: true },
  };

  class VoxelBatch {
    constructor() {
      this.buckets = new Map();
      this.count = 0;
      this._rng = VP.mulberry32(918273);
    }

    _bucket(group) {
      let b = this.buckets.get(group);
      if (!b) {
        b = { pos: [], nor: [], col: [], idx: [], count: 0 };
        this.buckets.set(group, b);
      }
      return b;
    }

    /**
     * 添加一个方块。
     * @param {number} cx 中心 x
     * @param {number} cy 中心 y
     * @param {number} cz 中心 z
     * @param {number} w 宽 (x)
     * @param {number} h 高 (y)
     * @param {number} d 深 (z)
     * @param {number} hex 颜色
     * @param {{group?:string, jitter?:number, shade?:number}} [opts]
     */
    addBox(cx, cy, cz, w, h, d, hex, opts) {
      if (w <= 0 || h <= 0 || d <= 0) return;
      opts = opts || {};
      const group = opts.group || 'solid';
      const b = this._bucket(group);
      const rgb = VP.linearRGB(hex);
      let shade = opts.shade === undefined ? 1 : opts.shade;
      if (opts.jitter) shade *= 1 + (this._rng() * 2 - 1) * opts.jitter;
      const r = Math.min(1, rgb[0] * shade);
      const g = Math.min(1, rgb[1] * shade);
      const bl = Math.min(1, rgb[2] * shade);
      const hx = w / 2,
        hy = h / 2,
        hz = d / 2;
      for (let f = 0; f < 6; f++) {
        const face = FACES[f];
        const n = face.n;
        const base = b.count;
        for (let k = 0; k < 4; k++) {
          const v = face.v[k];
          b.pos.push(cx + v[0] * hx, cy + v[1] * hy, cz + v[2] * hz);
          b.nor.push(n[0], n[1], n[2]);
          b.col.push(r, g, bl);
        }
        b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        b.count += 4;
      }
      this.count++;
    }

    /** 以最小角 + 尺寸添加（便于铺地） */
    addSlab(x0, y0, z0, w, h, d, hex, opts) {
      this.addBox(x0 + w / 2, y0 + h / 2, z0 + d / 2, w, h, d, hex, opts);
    }

    addVoxel(x, y, z, hex, opts) {
      this.addBox(x + 0.5, y + 0.5, z + 0.5, 1, 1, 1, hex, opts);
    }

    /** 生成合并网格并加入场景 */
    build(scene, opts) {
      opts = opts || {};
      const meshes = [];
      const castShadow = opts.castShadow !== false;
      const receiveShadow = opts.receiveShadow !== false;
      for (const [group, b] of this.buckets) {
        if (!b.count) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
        geo.setIndex(b.idx);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        let mat;
        if (MATERIAL_GROUPS[group].basic) {
          mat = new THREE.MeshBasicMaterial({ vertexColors: true });
        } else {
          const def = MATERIAL_GROUPS[group];
          mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: def.roughness,
            metalness: def.metalness,
          });
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'voxel-batch-' + group;
        mesh.castShadow = castShadow && group !== 'glow';
        mesh.receiveShadow = receiveShadow;
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
        meshes.push(mesh);
      }
      return meshes;
    }
  }

  VP.VoxelBatch = VoxelBatch;

  /* ---------------- 小工具 ---------------- */
  VP.fillPlate = function (V, x0, z0, x1, z1, y, h, hex, opts) {
    V.addSlab(Math.min(x0, x1), y, Math.min(z0, z1), Math.abs(x1 - x0), h, Math.abs(z1 - z0), hex, opts);
  };

  VP.buildStats = { boxes: 0 };
})();
