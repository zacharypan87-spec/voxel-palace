/* ==========================================================================
   九重宫阙 · Voxel Palace
   props.js — 宫苑之外：天地平野、远山、林木、仪仗、香火、云鸟与浮尘
   ---------------------------------------------------------------------------
   约定：
   · 宫苑建筑与庭院由 palace.js 负责，本模块只在宫墙之外造景，
     并在庭院指定位置放置禁军、铜鼎、宫旗、花池；
   · 静态方块写入传入的 VoxelBatch（V）；动态物体（云/鸟/旗/粒子）
     自建 THREE 对象并加入 scene；
   · 地形只用整块平板，防止相邻地块高差产生暗缝。
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const THREE = window.THREE;
  const C = VP.C;
  const L = VP.LAYOUT;
  const Y = L.groundY;

  /* 宫苑边界（宫墙中线 ±76 / -100~72，午门城台外沿到 z=72） */
  const CMP = { minX: -80, maxX: 80, minZ: -104, maxZ: 76 };
  const GARDEN_TOP = 0.62;

  const PAL = {
    grassA: 0x64794a,
    grassB: 0x586e42,
    grassC: 0x738653,
    grassDusk: 0x7b8050,
    earth: 0x76624a,
    earthDark: 0x5f513c,
    road: 0xbdae90,
    roadDark: 0x9f9076,
    curb: 0xcec3a9,
    mtnFarA: 0x6f7f8c,
    mtnFarB: 0x7e8d97,
    mtnFarC: 0x8f9ba3,
    mtnMidA: 0x546b6a,
    mtnMidB: 0x607674,
    mtnMidC: 0x6e8380,
    mtnNearA: 0x405b47,
    mtnNearB: 0x4c6751,
    mtnNearC: 0x5b745a,
    cloudWarmA: 0xf8ecda,
    cloudWarmB: 0xe8d2b6,
    cloudCoolA: 0xeef3f8,
    cloudCoolB: 0xd2dde8,
    birdDark: 0x282728,
    birdWing: 0x3a3734,
    flagRed: 0xc5412d,
    flagRedDark: 0x9e2f21,
    flagGold: 0xe0b35a,
    bronze: 0x7a6442,
    bronzeLite: 0x9a8054,
    bronzeDark: 0x4f412c,
    smoke: 0xcfc4b2,
    dust: 0xffdca4,
    ember: 0xffb066,
    skin: 0xc99b74,
    hat: 0x211b17,
    blueRobe: 0x2f5568,
    blueRobeDark: 0x223f4d,
  };

  let ST = null;
  const rng = VP.mulberry32(20261017);

  function add(V, cx, cy, cz, w, h, d, hex, opts) {
    if (!(w > 0 && h > 0 && d > 0)) return;
    V.addBox(cx, cy, cz, w, h, d, hex, opts);
    ST.boxes++;
  }
  function slab(V, x0, y0, z0, w, h, d, hex, opts) {
    add(V, x0 + w / 2, y0 + h / 2, z0 + d / 2, w, h, d, hex, opts);
  }

  function outsideComplex(x, z, pad) {
    const p = pad || 0;
    return !(x > CMP.minX - p && x < CMP.maxX + p && z > CMP.minZ - p && z < CMP.maxZ + p);
  }
  function inGarden(x, z) {
    return x > -68 && x < 68 && z > -99 && z < -81;
  }
  function onApproachRoad(x, z) {
    return z > 100 && Math.abs(x) < 8.5;
  }
  function segDist(px, pz, x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    let t = l2 ? ((px - x1) * dx + (pz - z1) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
  }
  const CAM = { x: 168, z: 238 };
  function sightClearance(x, z) {
    return Math.min(
      segDist(x, z, CAM.x, CAM.z, 0, 64),
      segDist(x, z, CAM.x, CAM.z, 0, -18)
    );
  }

  /* ==========================================================================
     一、天地：整块大平野 + 御道 + 草色斑块
     ========================================================================== */
  function buildGround(V) {
    /* 大地基底：顶面 y=0 */
    add(V, 0, -1.2, 0, 1500, 2.4, 1500, PAL.earthDark, { jitter: 0.02 });

    /* 四块互不重叠的草野平板，顶面同为 0.12，拼缝处不产生高差 */
    const T = 0.12;
    add(V, 0, T / 2, -283, 920, T, 354, PAL.grassA, { jitter: 0.025 }); // 北
    add(V, 0, T / 2, 288, 920, T, 372, PAL.grassA, { jitter: 0.025 }); // 南
    add(V, -271, T / 2, -1, 382, T, 204, PAL.grassB, { jitter: 0.025 }); // 西
    add(V, 271, T / 2, -1, 382, T, 204, PAL.grassB, { jitter: 0.025 }); // 东

    /* 宫墙外一圈细窄土带，压住宫墙基脚的视觉接缝 */
    const D = 0.16;
    add(V, -79, D / 2, -13, 4, D, 184, PAL.earth, { jitter: 0.04 });
    add(V, 79, D / 2, -13, 4, D, 184, PAL.earth, { jitter: 0.04 });
    add(V, 0, D / 2, -103, 164, D, 4, PAL.earth, { jitter: 0.04 });
    add(V, 0, D / 2, 77, 164, D, 4, PAL.earth, { jitter: 0.04 });

    /* 草色斑块：略高于草地、高度彼此错开，避免共面 */
    const rr = VP.mulberry32(9091);
    for (let i = 0; i < 150; i++) {
      const x = -230 + rr() * 460;
      const z = -250 + rr() * 430;
      if (!outsideComplex(x, z, 4)) continue;
      if (onApproachRoad(x, z)) continue;
      const top = 0.13 + (i % 6) * 0.012;
      const col = [PAL.grassB, PAL.grassC, PAL.grassDusk, PAL.grassA][i % 4];
      add(V, x, top - 0.02, z, 3 + rr() * 7, 0.06, 2.2 + rr() * 5.2, col, { jitter: 0.05 });
    }
    /* 稀疏裸土斑 */
    for (let i = 0; i < 46; i++) {
      const x = -220 + rr() * 440;
      const z = -235 + rr() * 420;
      if (!outsideComplex(x, z, 6) || onApproachRoad(x, z)) continue;
      add(V, x, 0.163, z, 3.5 + rr() * 6, 0.04, 2.6 + rr() * 4.8, PAL.earth, { jitter: 0.05 });
    }
    /* 草丛与碎石 */
    for (let i = 0; i < 70; i++) {
      const x = -190 + rr() * 380;
      const z = -200 + rr() * 360;
      if (!outsideComplex(x, z, 6) || onApproachRoad(x, z)) continue;
      if (sightClearance(x, z) < 9 && z > -110) continue;
      if (i % 3 === 0) {
        add(V, x, 0.28, z, 0.8 + rr() * 1.2, 0.4 + rr() * 0.7, 0.7 + rr() * 1.1,
          C.rockDark || PAL.earthDark, { jitter: 0.1 });
      } else {
        add(V, x, 0.3, z, 0.7 + rr() * 1.3, 0.5 + rr() * 0.9, 0.7 + rr() * 1.2,
          [C.grassDark, C.grassLite, PAL.grassC][i % 3], { jitter: 0.1 });
      }
    }

    /* 南向御道：从午门广场台阶下延伸到远方 */
    const roadZ0 = 101, roadZ1 = 420;
    for (let z = roadZ0; z < roadZ1; z += 12) {
      const top = 0.08;
      add(V, 0, top / 2, z + 6, 14, top, 12.05, PAL.road, { jitter: 0.035 });
      add(V, 0, top + 0.012, z + 6, 8.4, 0.03, 12.02, C.imperialPath || PAL.road, { jitter: 0.03 });
    }
    /* 御道两侧路缘与石界 */
    for (const sx of [-1, 1]) {
      add(V, sx * 8.0, 0.16, (roadZ0 + roadZ1) / 2, 1.3, 0.32, roadZ1 - roadZ0, PAL.curb, { jitter: 0.035 });
      add(V, sx * 10.6, 0.15, (roadZ0 + roadZ1) / 2, 4.2, 0.3, roadZ1 - roadZ0, PAL.earth, { jitter: 0.04 });
      for (let z = roadZ0 + 10; z < roadZ1; z += 26) {
        add(V, sx * 8.0, 0.45, z, 1.0, 0.9, 1.0, PAL.curb, { jitter: 0.04 });
        add(V, sx * 8.0, 1.02, z, 1.3, 0.28, 1.3, PAL.roadDark, { jitter: 0.04 });
      }
    }
  }

  /* ==========================================================================
     二、远山：北面三层 + 东西两翼，体素阶梯山，交给雾
     ========================================================================== */
  function mountainMassif(V, cx, cz, W, D, H, colors, seed) {
    const r = VP.mulberry32(seed);
    let y = 0;
    const frac = [0.28, 0.21, 0.17, 0.14, 0.11];
    for (let i = 0; i < 5; i++) {
      const h = H * frac[i];
      const w = W * (1 - i * 0.2) * (0.94 + r() * 0.12);
      const d = D * (1 - i * 0.17) * (0.92 + r() * 0.14);
      const ox = (r() - 0.5) * W * 0.13 * i;
      const oz = (r() - 0.5) * D * 0.12 * i;
      add(V, cx + ox, y + h / 2, cz + oz, w, h, d, colors[Math.min(i, colors.length - 1)], { jitter: 0.045 });
      /* 山脊碎峰：每一层都加几处小峰，打破平台感 */
      if (i >= 1) {
        const spikes = 3;
        for (let k = 0; k < spikes; k++) {
          const ph = H * (0.04 + r() * 0.09);
          add(V, cx + ox + (r() - 0.5) * w * 0.78, y + h + ph / 2, cz + oz + (r() - 0.5) * d * 0.72,
            w * (0.1 + r() * 0.16), ph, d * (0.1 + r() * 0.16), colors[Math.min(i + 1, colors.length - 1)], { jitter: 0.05 });
        }
      }
      y += h;
    }
    /* 峰尖 */
    for (let k = 0; k < 2; k++) {
      const ph = H * (0.08 + r() * 0.09);
      add(V, cx + (r() - 0.5) * W * 0.3, y + ph / 2, cz + (r() - 0.5) * D * 0.24,
        W * (0.08 + r() * 0.06), ph, D * (0.08 + r() * 0.06), colors[colors.length - 1], { jitter: 0.05 });
    }
  }

  function buildMountains(V) {
    const far = [0x6d8092, 0x7d8e9c, 0x8e9da7];
    const mid = [0x4d646b, 0x5a7073, 0x677d7b];
    const near = [0x3c5744, 0x48644e, 0x567256];
    /* 北 · 远（最淡最高） */
    const farDefs = [
      [-500, -610, 300, 150, 66, 11], [-210, -650, 330, 165, 74, 12],
      [100, -640, 320, 160, 70, 13], [400, -600, 290, 145, 60, 14],
    ];
    for (const d of farDefs) mountainMassif(V, d[0], d[1], d[2], d[3], d[4], far, d[5]);
    /* 北 · 中 */
    const midDefs = [
      [-380, -480, 230, 120, 42, 21], [-130, -500, 250, 125, 48, 22],
      [150, -490, 230, 118, 40, 23], [390, -460, 210, 110, 34, 24],
    ];
    for (const d of midDefs) mountainMassif(V, d[0], d[1], d[2], d[3], d[4], mid, d[5]);
    /* 北 · 近丘 */
    const nearDefs = [
      [-220, -315, 150, 78, 15, 31], [10, -330, 170, 86, 18, 32], [240, -310, 140, 74, 13, 33],
    ];
    for (const d of nearDefs) mountainMassif(V, d[0], d[1], d[2], d[3], d[4], near, d[5]);
    /* 东西两翼（远） */
    const westDefs = [
      [-540, -300, 210, 280, 40, 41], [-570, 40, 210, 300, 34, 42],
    ];
    for (const d of westDefs) mountainMassif(V, d[0], d[1], d[2], d[3], d[4], far, d[5]);
    const eastDefs = [
      [540, -300, 210, 280, 38, 51], [570, 40, 210, 300, 32, 52],
    ];
    for (const d of eastDefs) mountainMassif(V, d[0], d[1], d[2], d[3], d[4], far, d[5]);
    /* 宫墙后的低缓山包：丰富屋脊后的轮廓 */
    const moundDefs = [
      [-170, -205, 120, 50, 8], [-20, -225, 140, 58, 10], [150, -200, 110, 46, 7],
    ];
    for (const d of moundDefs) mountainMassif(V, d[0], d[1], d[2], d[3], d[4], near, d[3] + 700);
  }

  /* ==========================================================================
     三、体素树：油松 / 侧柏 / 阔叶（少量秋色）
     ========================================================================== */
  function buildPine(V, x, z, baseY, s, seed) {
    const r = VP.mulberry32(seed);
    const H = (6.4 + r() * 2.2) * s;
    const tw = (1.15 + r() * 0.35) * s;
    add(V, x, baseY + H * 0.16, z, tw * 1.9, H * 0.36, tw * 1.7, C.trunkDark, { jitter: 0.06 });
    add(V, x + (r() - 0.5) * 0.4 * s, baseY + H * 0.5, z, tw * 1.1, H * 0.4, tw * 1.05, C.trunk, { jitter: 0.06 });
    for (let i = 0; i < 3; i++) {
      const dir = i % 2 ? -1 : 1;
      add(V, x + dir * (1.0 + r() * 1.1) * s, baseY + H * (0.52 + r() * 0.3), z + (r() - 0.5) * 1.2 * s,
        (1.5 + r() * 1.1) * s, 0.32 * s, 0.45 * s, C.trunkDark, { jitter: 0.08 });
    }
    const pads = 5 + Math.floor(r() * 2);
    for (let i = 0; i < pads; i++) {
      const t = i / (pads - 1);
      const py = baseY + H * (0.76 + t * 0.52);
      const pw = (7.6 - t * 2.6 + r() * 1.2) * s;
      const pd = (5.8 - t * 1.9 + r() * 0.9) * s;
      add(V, x + (r() - 0.5) * 2.0 * s, py, z + (r() - 0.5) * 1.6 * s, pw, (1.0 + r() * 0.5) * s, pd,
        [C.pine, C.pineDark, C.pineLite][i % 3], { jitter: 0.08 });
      if (i < 3) {
        add(V, x + (r() - 0.5) * 2.4 * s, py + 0.75 * s, z + (r() - 0.5) * 1.6 * s,
          pw * 0.5, 0.7 * s, pd * 0.5, C.pineLite, { jitter: 0.1 });
      }
    }
  }

  function buildCypress(V, x, z, baseY, s, seed) {
    const r = VP.mulberry32(seed);
    const H = (7.4 + r() * 2.2) * s;
    add(V, x, baseY + H * 0.12, z, 1.5 * s, H * 0.3, 1.4 * s, C.trunkDark, { jitter: 0.06 });
    const layers = 8 + Math.floor(r() * 2);
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const w = (4.6 - t * 3.4 + r() * 0.5) * s;
      const h = (1.15 + r() * 0.4) * s;
      add(V, x + (r() - 0.5) * 0.5 * s, baseY + H * (0.3 + t * 0.66), z + (r() - 0.5) * 0.5 * s,
        w, h, w * 0.86, [C.pineDark, C.pine, C.pineLite, C.greenDeep][i % 4], { jitter: 0.07 });
    }
    add(V, x, baseY + H * 0.99, z, 1.3 * s, 2.0 * s, 1.25 * s, C.pineDark, { jitter: 0.08 });
  }

  function buildBroadleaf(V, x, z, baseY, s, seed, autumn) {
    const r = VP.mulberry32(seed);
    const H = (4.8 + r() * 1.8) * s;
    add(V, x, baseY + H * 0.26, z, 1.6 * s, H * 0.52, 1.5 * s, C.trunkDark, { jitter: 0.06 });
    add(V, x + (r() - 0.5) * 0.5 * s, baseY + H * 0.62, z, 1.1 * s, H * 0.45, 1.05 * s, C.trunk, { jitter: 0.06 });
    const leaf = autumn
      ? [C.goldLite, C.goldPale, C.gold, C.goldDeep]
      : [C.leaf, C.leafLite, C.leafDeep, C.pineLite];
    const blobs = 5 + Math.floor(r() * 3);
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * Math.PI * 2 + r() * 0.5;
      const rad = (1.2 + r() * 2.0) * s;
      add(V, x + Math.cos(a) * rad, baseY + H * (0.78 + r() * 0.3), z + Math.sin(a) * rad,
        (2.6 + r() * 1.8) * s, (1.8 + r() * 1.4) * s, (2.5 + r() * 1.7) * s,
        leaf[i % leaf.length], { jitter: 0.09 });
    }
    add(V, x + (r() - 0.5) * s, baseY + H * 1.03, z + (r() - 0.5) * s,
      3.2 * s, 1.7 * s, 3.0 * s, leaf[0], { jitter: 0.08 });
  }

  function buildTrees(V) {
    const spots = [
      /* 北墙外 */
      [-100, -126, 'pine', 1.3], [-70, -133, 'cypress', 1.15], [-34, -119, 'broad', 1.2],
      [20, -130, 'pine', 1.35], [62, -121, 'cypress', 1.1], [102, -132, 'broad', 1.25], [132, -116, 'pine', 1.2],
      /* 西墙外 */
      [-106, -76, 'pine', 1.25], [-118, -26, 'cypress', 1.3], [-101, 30, 'broad', 1.15],
      [-124, 86, 'pine', 1.35], [-106, 142, 'cypress', 1.2],
      /* 东墙外 */
      [106, -80, 'cypress', 1.2], [120, -30, 'pine', 1.3], [101, 26, 'broad', 1.1],
      [126, 92, 'cypress', 1.25], [110, 150, 'pine', 1.3],
      /* 宫墙外近景：让树冠露出墙头 */
      [-90, 32, 'pine', 1.35], [90, 26, 'pine', 1.3], [-88, -42, 'cypress', 1.25], [88, -52, 'pine', 1.25],
      [-96, 96, 'broad', 1.15], [96, 92, 'broad', 1.15],
      /* 御道两侧 */
      [-24, 112, 'cypress', 0.95], [24, 112, 'cypress', 0.95],
      [-24, 144, 'pine', 1.0], [24, 144, 'pine', 1.0],
      [-24, 178, 'cypress', 0.95], [24, 178, 'cypress', 0.95],
      [-24, 212, 'pine', 1.0], [24, 212, 'pine', 1.0],
      /* 御花园 */
      [54, -92, 'pine', 0.85], [-54, -93, 'broad', 0.8], [63, -84, 'cypress', 0.78],
      [-63, -85, 'pine', 0.8], [38, -96, 'broad', 0.72, true], [-38, -96, 'broad', 0.72, true],
      /* 南方远景 */
      [-155, 190, 'pine', 1.35], [168, 205, 'pine', 1.25],
      /* 近景画框与宫墙外点景 */
      [-52, 150, 'pine', 1.25], [132, 158, 'pine', 1.2], [-92, 108, 'cypress', 1.1], [96, 112, 'pine', 1.1],
      /* 南向远景林带：拉开画框 */
      [-120, 150, 'pine', 1.3], [-160, 120, 'broad', 1.15], [-95, 190, 'cypress', 1.2],
      [175, 160, 'pine', 1.3], [190, 120, 'broad', 1.1], [135, 195, 'cypress', 1.2],
    ];
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      let x = sp[0], z = sp[1], type = sp[2], s = sp[3], autumn = !!sp[4];
      x += (rng() - 0.5) * 1.8;
      z += (rng() - 0.5) * 1.8;
      const garden = inGarden(x, z);
      let baseY;
      if (garden) {
        if (Math.abs(Math.abs(x) - 21) < 8 && z > -97.5 && z < -80.5) continue;
        baseY = GARDEN_TOP;
      } else {
        if (!outsideComplex(x, z, 9)) continue;
        if (z > 95 && sightClearance(x, z) < 20) continue;
        baseY = 0.12;
        add(V, x + (rng() - 0.5) * 1.4, baseY + 0.16, z + (rng() - 0.5) * 1.2, 2.1 * s, 0.4, 1.9 * s, C.rockDark, { jitter: 0.1 });
      }
      const seed = 1000 + i * 37;
      if (type === 'pine') buildPine(V, x, z, baseY, s, seed);
      else if (type === 'cypress') buildCypress(V, x, z, baseY, s, seed);
      else buildBroadleaf(V, x, z, baseY, s, seed, autumn);
      ST.trees++;
    }
  }

  /* ==========================================================================
     四、庭院花池 / 御花园石景
     ========================================================================== */
  function rockCluster(V, x, z, baseY, s, seed) {
    const r = VP.mulberry32(seed);
    let y = baseY;
    const layers = 2 + Math.floor(r() * 3);
    for (let i = 0; i < layers; i++) {
      const w = (1.8 + r() * 2.0) * s;
      const h = (1.1 + r() * 1.3) * s;
      add(V, x + (r() - 0.5) * 1.4 * s, y + h / 2, z + (r() - 0.5) * 1.2 * s,
        w, h, w * (0.7 + r() * 0.4), [C.rock, C.rockDark, C.rockLite][i % 3], { jitter: 0.1 });
      y += h * 0.8;
    }
    add(V, x + 0.8 * s, baseY + 0.25, z - 0.6 * s, 1.4 * s, 0.5, 1.2 * s, C.grassLite, { jitter: 0.1 });
  }

  function buildPlanters(V) {
    const gardens = [
      { cx: -33.5, cz: 30.5, w: 10, d: 5.4 },
      { cx: 33.5, cz: 30.5, w: 10, d: 5.4 },
    ];
    for (let gi = 0; gi < gardens.length; gi++) {
      const g = gardens[gi];
      const x0 = g.cx - g.w / 2, x1 = g.cx + g.w / 2;
      const z0 = g.cz - g.d / 2, z1 = g.cz + g.d / 2;
      const rimH = 0.9, rimT = 0.9;
      const y = Y;
      add(V, g.cx, y + rimH / 2, z0 + rimT / 2, g.w, rimH, rimT, C.marbleMid, { jitter: 0.04 });
      add(V, g.cx, y + rimH / 2, z1 - rimT / 2, g.w, rimH, rimT, C.marbleMid, { jitter: 0.04 });
      add(V, x0 + rimT / 2, y + rimH / 2, g.cz, rimT, rimH, g.d - rimT * 2, C.marble, { jitter: 0.04 });
      add(V, x1 - rimT / 2, y + rimH / 2, g.cz, rimT, rimH, g.d - rimT * 2, C.marble, { jitter: 0.04 });
      add(V, g.cx, y + rimH - 0.2, g.cz, g.w - rimT * 2 - 0.1, 0.28, g.d - rimT * 2 - 0.1, PAL.earthDark, { jitter: 0.05 });
      const soil = y + rimH - 0.05;
      const rr = VP.mulberry32(5000 + gi * 79);
      buildPine(V, g.cx + (gi ? 2.6 : -2.6), g.cz, soil, 0.34, 400 + gi);
      for (let i = 0; i < 5; i++) {
        add(V, x0 + 2.0 + rr() * (g.w - 4.0), soil + 0.3, g.cz + (rr() - 0.5) * (g.d - 2.6),
          1.0 + rr() * 1.3, 0.5 + rr() * 0.5, 0.9 + rr() * 1.0,
          [C.leafLite, C.grassLite, C.pineLite, 0xe9b7c4, 0xf0d7ad][i % 5], { jitter: 0.1 });
      }
      rockCluster(V, g.cx + (gi ? -2.4 : 2.4), g.cz + 0.6, soil, 0.42, 700 + gi);
    }
  }

  function buildGardenRocks(V) {
    const spots = [[-54, -93], [-44, -86], [-11, -97], [-5, -87], [18, -98], [47, -92], [60, -88]];
    for (let i = 0; i < spots.length; i++) {
      if (Math.abs(Math.abs(spots[i][0]) - 21) < 7 && Math.abs(spots[i][1] + 89) < 8) continue;
      rockCluster(V, spots[i][0], spots[i][1], GARDEN_TOP, 0.85 + (i % 3) * 0.25, 300 + i * 13);
    }
  }

  /* ==========================================================================
     五、禁军 / 青铜鼎 / 宫旗
     ========================================================================== */
  function buildGuard(V, x, z, robe, robeDark, side, seed) {
    const r = VP.mulberry32(seed);
    const y = Y;
    add(V, x - 0.28, y + 0.2, z, 0.42, 0.42, 0.55, 0x1c1916);
    add(V, x + 0.28, y + 0.2, z, 0.42, 0.42, 0.55, 0x1c1916);
    add(V, x, y + 1.0, z, 1.02, 1.15, 0.7, robeDark, { jitter: 0.05 });
    add(V, x, y + 1.58, z, 1.1, 0.2, 0.76, C.goldDeep, { group: 'metal' });
    add(V, x, y + 1.94, z, 0.96, 0.78, 0.64, robe, { jitter: 0.05 });
    add(V, x, y + 1.96, z + 0.34, 0.62, 0.4, 0.07, C.metalGold, { group: 'metal' });
    add(V, x - 0.6, y + 2.2, z, 0.38, 0.24, 0.5, C.goldDeep, { group: 'metal' });
    add(V, x + 0.6, y + 2.2, z, 0.38, 0.24, 0.5, C.goldDeep, { group: 'metal' });
    add(V, x - 0.65, y + 1.82, z + 0.05, 0.28, 0.85, 0.3, robeDark);
    add(V, x + 0.65, y + 1.82, z + 0.05, 0.28, 0.85, 0.3, robeDark);
    add(V, x, y + 2.5, z, 0.54, 0.5, 0.54, PAL.skin);
    add(V, x, y + 2.82, z, 0.84, 0.22, 0.84, PAL.hat);
    add(V, x, y + 3.02, z, 0.5, 0.26, 0.5, PAL.hat);
    add(V, x, y + 3.2, z, 0.16, 0.16, 0.16, C.cloth);
    const px = x + side * 0.94;
    add(V, px, y + 2.25, z + 0.16, 0.11, 4.2, 0.11, C.woodDark);
    add(V, px, y + 4.4, z + 0.16, 0.5, 0.7, 0.1, C.marbleLite, { group: 'metal' });
    add(V, px + side * 0.38, y + 4.1, z + 0.16, 0.4, 0.16, 0.12, C.metalGold, { group: 'metal' });
    if (r() > 0.5) add(V, px, y + 3.9, z + 0.16, 0.28, 0.4, 0.26, C.cloth);
  }

  function buildGuards(V) {
    const zs = [22, 27.5, 33, 38.5, 44];
    for (const side of [-1, 1]) {
      for (let i = 0; i < zs.length; i++) {
        const robe = i % 2 === 0 ? C.cloth : PAL.blueRobe;
        const robeDark = i % 2 === 0 ? C.lanternDark : PAL.blueRobeDark;
        buildGuard(V, side * 10.6, zs[i], robe, robeDark, side, 900 + i * 17 + (side > 0 ? 5 : 0));
        ST.guards++;
      }
    }
  }

  function buildCenser(V, scene, x, z, tag) {
    const y = Y;
    const r = VP.mulberry32(6100 + tag * 31);
    /* 三足 */
    add(V, x - 1.15, y + 0.95, z + 0.95, 0.62, 1.9, 0.62, PAL.bronzeDark);
    add(V, x + 1.15, y + 0.95, z + 0.95, 0.62, 1.9, 0.62, PAL.bronzeDark);
    add(V, x, y + 0.95, z - 1.05, 0.62, 1.9, 0.62, PAL.bronzeDark);
    /* 鼎腹 */
    add(V, x, y + 2.24, z, 3.3, 1.7, 2.7, PAL.bronze, { jitter: 0.04 });
    add(V, x, y + 3.34, z, 3.6, 0.64, 2.95, PAL.bronzeLite, { jitter: 0.04 });
    add(V, x, y + 3.8, z, 3.85, 0.3, 3.1, PAL.bronzeDark);
    add(V, x, y + 2.24, z + 1.38, 2.7, 0.5, 0.07, C.metalGold, { group: 'metal' });
    add(V, x - 1.66, y + 2.24, z, 0.07, 0.5, 2.1, C.metalGold, { group: 'metal' });
    add(V, x + 1.66, y + 2.24, z, 0.07, 0.5, 2.1, C.metalGold, { group: 'metal' });
    add(V, x - 1.55, y + 4.5, z, 0.55, 1.3, 0.55, PAL.bronze);
    add(V, x + 1.55, y + 4.5, z, 0.55, 1.3, 0.55, PAL.bronze);
    add(V, x - 1.55, y + 5.1, z, 0.75, 0.22, 0.75, PAL.bronzeLite);
    add(V, x + 1.55, y + 5.1, z, 0.75, 0.22, 0.75, PAL.bronzeLite);
    /* 香灰与火光 */
    add(V, x, y + 4.02, z, 2.4, 0.14, 1.9, PAL.bronzeDark);
    add(V, x, y + 4.12, z, 1.35, 0.14, 1.1, 0xff8a3c, { group: 'glow' });
    add(V, x - 0.5, y + 4.22, z + 0.3, 0.4, 0.16, 0.4, C.lanternRed, { group: 'glow' });
    add(V, x + 0.45, y + 4.2, z - 0.25, 0.34, 0.16, 0.34, C.lantern, { group: 'glow' });

    /* 香烟 */
    const N = 34;
    const pos = new Float32Array(N * 3);
    const data = [];
    for (let i = 0; i < N; i++) {
      const k = i / N;
      pos[i * 3] = x + (r() - 0.5) * 1.4;
      pos[i * 3 + 1] = y + 4.2 + k * 11;
      pos[i * 3 + 2] = z + (r() - 0.5) * 1.2;
      data.push(y + 4.2 + k * 11, r() * Math.PI * 2, 0.4 + r() * 1.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: PAL.smoke,
      size: 1.05,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.name = 'props-incense-smoke-' + tag;
    points.frustumCulled = false;
    scene.add(points);
    ST.smoke.push({ points, pos, data, ox: x, oy: y + 4.2, oz: z });
    /* 火星 */
    const NE = 12;
    const epos = new Float32Array(NE * 3);
    const edata = [];
    for (let i = 0; i < NE; i++) {
      epos[i * 3] = x + (r() - 0.5) * 0.9;
      epos[i * 3 + 1] = y + 4.3 + r() * 1.5;
      epos[i * 3 + 2] = z + (r() - 0.5) * 0.8;
      edata.push(0.5 + r() * 1.2, r() * 6.28, r());
    }
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const emat = new THREE.PointsMaterial({
      color: PAL.ember,
      size: 0.45,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const epoints = new THREE.Points(egeo, emat);
    epoints.frustumCulled = false;
    epoints.name = 'props-incense-embers-' + tag;
    scene.add(epoints);
    ST.embers.push({ points: epoints, pos: epos, data: edata });
  }

  function buildCensers(V, scene) {
    buildCenser(V, scene, -18, 20.5, 0);
    buildCenser(V, scene, 18, 20.5, 1);
    ST.dings = 2;
  }

  function buildFlags(V, scene) {
    for (const sx of [-1, 1]) {
      const x = sx * 31, z = 44;
      const y0 = Y;
      add(V, x, y0 + 0.5, z, 3.0, 1.0, 3.0, C.marbleMid, { jitter: 0.03 });
      add(V, x, y0 + 1.4, z, 1.9, 0.8, 1.9, C.marble);
      add(V, x, y0 + 8.2, z, 0.34, 14.0, 0.34, C.woodDark);
      add(V, x, y0 + 15.3, z, 0.7, 0.5, 0.7, C.metalGold, { group: 'metal' });
      add(V, x + sx * 1.7, y0 + 14.1, z, 3.4, 0.28, 0.34, C.metalGold, { group: 'metal' });
      add(V, x, y0 + 15.9, z, 0.3, 0.7, 0.3, C.metalGold, { group: 'metal' });
      const group = new THREE.Group();
      group.position.set(x + sx * 1.0, y0 + 13.7, z);
      scene.add(group);
      const planks = [];
      const matA = new THREE.MeshStandardMaterial({ color: PAL.flagRed, roughness: 0.86, metalness: 0.03 });
      const matB = new THREE.MeshStandardMaterial({ color: PAL.flagRedDark, roughness: 0.9, metalness: 0.02 });
      const matGold = new THREE.MeshStandardMaterial({ color: PAL.flagGold, roughness: 0.6, metalness: 0.25 });
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 3; col++) {
          const geo = new THREE.BoxGeometry(0.92, 0.72, 0.14);
          const m = new THREE.Mesh(geo, (row + col) % 2 ? matB : matA);
          m.position.set(sx * (col * 0.96), -row * 0.74, 0);
          m.castShadow = false;
          m.receiveShadow = false;
          group.add(m);
          planks.push({ mesh: m, row, col, baseZ: 0 });
        }
      }
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.18), matGold);
      trim.position.set(sx * 0.96, 0.14, 0);
      group.add(trim);
      ST.flags.push({ group, planks, sx, phase: sx > 0 ? 0.6 : 2.1 });
    }
    ST.flagPoles = 2;
  }

  /* ==========================================================================
     六、云 / 鸟 / 尘埃
     ========================================================================== */
  function localBatchMesh(buildFn, opts) {
    const b = new VP.VoxelBatch();
    buildFn(b);
    const group = new THREE.Group();
    b.build({ add: (m) => group.add(m) }, { castShadow: false, receiveShadow: false });
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        if (opts && opts.basic) {
          o.material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
        }
      }
    });
    return group;
  }

  function buildClouds(scene) {
    const defs = [
      [-330, 132, -480, 1.25, 0.0], [-70, 150, -530, 1.5, 1.2], [250, 136, -500, 1.2, 2.0],
      [430, 128, -380, 1.05, 0.7], [-420, 144, -360, 1.0, 1.6], [300, 142, 300, 0.95, 2.8],
    ];
    const rr = VP.mulberry32(8181);
    for (let ci = 0; ci < defs.length; ci++) {
      const d = defs[ci];
      const parts = [];
      const n = 8 + Math.floor(rr() * 4);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        parts.push({
          x: (rr() - 0.5) * 30,
          y: (rr() - 0.5) * 5 + (i % 3) * 1.6,
          z: (rr() - 0.5) * 14,
          w: 9 + rr() * 17,
          h: 4 + rr() * 5,
          d: 7 + rr() * 11,
          warm: i % 4 !== 3,
          light: i % 2 === 0,
        });
      }
      const group = localBatchMesh((b) => {
        for (const p of parts) {
          b.addBox(p.x, p.y, p.z, p.w, p.h, p.d, p.warm ? PAL.cloudWarmA : PAL.cloudCoolA, { jitter: 0.02 });
          b.addBox(p.x + p.w * 0.08, p.y + p.h * 0.38, p.z + 0.5, p.w * 0.66, p.h * 0.52, p.d * 0.7,
            p.light ? 0xfff4e2 : (p.warm ? PAL.cloudWarmB : PAL.cloudCoolB), { jitter: 0.02 });
        }
      }, { basic: true });
      group.position.set(d[0], d[1], d[2]);
      group.scale.setScalar(d[3]);
      group.name = 'props-cloud-' + ci;
      scene.add(group);
      ST.clouds.push({ group, baseX: d[0], baseY: d[1], speed: 0.5 + rr() * 0.8, phase: d[4] });
    }
    ST.cloudStats = defs.length;
  }

  function buildBirds(scene) {
    const rr = VP.mulberry32(7272);
    const matBody = new THREE.MeshStandardMaterial({ color: PAL.birdDark, roughness: 0.85, metalness: 0.02 });
    const matWing = new THREE.MeshStandardMaterial({ color: PAL.birdWing, roughness: 0.9, metalness: 0.02 });
    for (let i = 0; i < 7; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 1.5), matBody);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.48), matWing);
      head.position.z = 0.88;
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.64), matWing);
      wingR.position.x = 1.0;
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.64), matWing);
      wingL.position.x = -1.0;
      group.add(body, head, wingR, wingL);
      group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
      scene.add(group);
      ST.birds.push({
        group, wingR, wingL,
        cx: (rr() - 0.5) * 20, cz: -16 + (rr() - 0.5) * 30,
        rx: 55 + rr() * 55, rz: 45 + rr() * 55,
        height: 46 + rr() * 30,
        phase: rr() * Math.PI * 2,
        speed: 0.06 + rr() * 0.05,
        dir: rr() > 0.5 ? 1 : -1,
        flap: 5 + rr() * 4,
      });
    }
    ST.birdCount = ST.birds.length;
  }

  function buildDust(scene) {
    const N = 280;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const data = [];
    const rr = VP.mulberry32(6363);
    const base = VP.linearRGB(PAL.dust);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = -72 + rr() * 144;
      pos[i * 3 + 1] = 2 + rr() * 38;
      pos[i * 3 + 2] = -92 + rr() * 166;
      const c = 0.65 + rr() * 0.35;
      col[i * 3] = base[0] * c;
      col[i * 3 + 1] = base[1] * c;
      col[i * 3 + 2] = base[2] * c;
      data.push(0.25 + rr() * 0.75, rr() * 6.28, 0.4 + rr() * 1.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.62,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.name = 'props-dust';
    points.frustumCulled = false;
    scene.add(points);
    ST.dust = { points, pos, data, mat };
    ST.dustCount = N;
  }

  /* ==========================================================================
     七、逐帧动画
     ========================================================================== */
  function update(time, dt) {
    if (!ST || !ST.built) return;
    const t = typeof time === 'number' && isFinite(time) ? time : 0;
    const d = typeof dt === 'number' && isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0.016;

    for (const c of ST.clouds) {
      c.group.position.x += c.speed * d;
      if (c.group.position.x > 500) c.group.position.x = -500;
      c.group.position.y = c.baseY + Math.sin(t * 0.16 + c.phase) * 1.4;
    }

    for (const b of ST.birds) {
      const a = b.phase + t * b.speed * b.dir;
      const ca = Math.cos(a), sa = Math.sin(a);
      b.group.position.set(b.cx + ca * b.rx, b.height + Math.sin(t * 0.32 + b.phase) * 2.4, b.cz + sa * b.rz);
      b.group.rotation.y = Math.atan2(-sa * b.dir, ca * b.dir);
      b.group.rotation.z = Math.sin(t * 0.8 + b.phase) * 0.1;
      const flap = Math.sin(t * b.flap + b.phase) * 0.55;
      b.wingR.rotation.z = flap;
      b.wingL.rotation.z = -flap;
    }

    for (const f of ST.flags) {
      const wave = Math.sin(t * 1.15 + f.phase);
      f.group.rotation.y = f.sx * (0.08 + wave * 0.1);
      for (const p of f.planks) {
        const sway = Math.sin(t * 1.8 + p.row * 0.62 + p.col * 0.9 + f.phase);
        p.mesh.position.z = sway * (0.1 + p.col * 0.13);
        p.mesh.position.y = -p.row * 0.74 + Math.sin(t * 2.2 + p.row * 0.5 + p.col) * 0.02;
      }
    }

    if (ST.dust) {
      const pos = ST.dust.pos;
      const data = ST.dust.data;
      for (let i = 0; i < ST.dustCount; i++) {
        const i3 = i * 3, i4 = i * 3;
        const speed = data[i4], phase = data[i4 + 1], sway = data[i4 + 2];
        pos[i3] += Math.sin(t * 0.5 + phase) * sway * d * 0.5;
        pos[i3 + 1] -= speed * d;
        pos[i3 + 2] += Math.cos(t * 0.43 + phase) * sway * d * 0.35;
        if (pos[i3 + 1] < 1.2) {
          pos[i3 + 1] = 26 + ((i * 37) % 20);
          pos[i3] = -72 + ((i * 53) % 144);
          pos[i3 + 2] = -92 + ((i * 71) % 166);
        }
        if (pos[i3] > 74) pos[i3] = -74;
        else if (pos[i3] < -74) pos[i3] = 74;
      }
      ST.dust.points.geometry.attributes.position.needsUpdate = true;
      ST.dust.mat.opacity = 0.45 + Math.sin(t * 0.6) * 0.1;
    }

    for (const s of ST.smoke) {
      const pos = s.pos, data = s.data;
      for (let k = 0; k < s.data.length / 3; k++) {
        const k3 = k * 3, k4 = k * 3;
        const baseY = data[k4], phase = data[k4 + 1], rad = data[k4 + 2];
        let y = pos[k3 + 1] + 0.55 * d;
        if (y > s.oy + 13) y = s.oy + 0.2;
        const h = y - s.oy;
        pos[k3 + 1] = y;
        pos[k3] = s.ox + Math.sin(h * 0.35 + t * 0.35 + phase) * (0.25 + rad * 0.5) + (baseY - s.oy) * 0.02;
        pos[k3 + 2] = s.oz + Math.cos(h * 0.28 + t * 0.27 + phase) * (0.2 + rad * 0.45);
      }
      s.points.geometry.attributes.position.needsUpdate = true;
    }

    for (const e of ST.embers) {
      const pos = e.pos, data = e.data;
      for (let k = 0; k < e.data.length / 3; k++) {
        const k3 = k * 3, k4 = k * 3;
        pos[k3 + 1] += data[k4] * d;
        pos[k3] += Math.sin(t * 1.7 + data[k4 + 1]) * 0.35 * d;
        pos[k3 + 2] += Math.cos(t * 1.4 + data[k4 + 1]) * 0.25 * d;
        if (pos[k3 + 1] > Y + 9) {
          pos[k3 + 1] = Y + 4.3;
          pos[k3] += (data[k4 + 2] - 0.5) * 1.2;
        }
      }
      e.points.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ==========================================================================
     对外接口
     ========================================================================== */
  window.VP.props = {
    build(scene, V) {
      if (ST && ST.built) return ST.stats;
      ST = {
        built: false,
        boxes: 0,
        trees: 0,
        guards: 0,
        dings: 0,
        clouds: [],
        birds: [],
        flags: [],
        smoke: [],
        embers: [],
        dust: null,
        dustCount: 0,
        stats: null,
      };
      buildGround(V);
      buildMountains(V);
      buildTrees(V);
      buildPlanters(V);
      buildGardenRocks(V);
      buildGuards(V);
      buildCensers(V, scene);
      buildFlags(V, scene);
      buildClouds(scene);
      buildBirds(scene);
      buildDust(scene);
      const stats = {
        boxes: ST.boxes,
        trees: ST.trees,
        guards: ST.guards,
        dings: ST.dings,
        clouds: ST.clouds.length,
        birds: ST.birds.length,
        flags: 2,
        particles: ST.dustCount + ST.smoke.length * 34 + ST.embers.length * 12,
      };
      ST.stats = stats;
      ST.built = true;
      VP.props.stats = stats;
      return stats;
    },
    update,
    stats: null,
  };
})();
