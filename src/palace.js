/* ==========================================================================
   九重宫阙 · Voxel Palace
   palace.js — 建筑群营造：三台主殿 / 后寝 / 午门 / 配殿 / 钟鼓楼 / 双亭
               以及宫墙、庭院、金水河、丹陛、华表等
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const THREE = window.THREE;
  const C = VP.C;
  const L = VP.LAYOUT;
  const Y = L.groundY; // 庭院铺装顶面

  /* ======================================================================
     基础工具
     ====================================================================== */

  /** 局部坐标系：把「面向 +z」的建筑放到世界 (ox, oz)，yaw 为 0/90/180/270 */
  function makeFrame(V, ox, oz, yaw) {
    const r = ((yaw % 360) + 360) % 360;
    const map = (lx, lz) => {
      if (r === 90) return [ox + lz, oz - lx];
      if (r === 180) return [ox - lx, oz - lz];
      if (r === 270) return [ox - lz, oz + lx];
      return [ox + lx, oz + lz];
    };
    return {
      V,
      ox,
      oz,
      yaw: (r * Math.PI) / 180,
      r,
      box(lx, ly, lz, w, h, d, color, opts) {
        const [wx, wz] = map(lx, lz);
        const swap = r === 90 || r === 270;
        V.addBox(wx, ly, wz, swap ? d : w, h, swap ? w : d, color, opts);
      },
      point(lx, ly, lz) {
        const [wx, wz] = map(lx, lz);
        return new THREE.Vector3(wx, ly, wz);
      },
    };
  }

  function addBlock(V, x, y, z, w, h, d, color, opts) {
    V.addBox(x, y, z, w, h, d, color, opts);
  }

  function mirrorPair(f, lx, ly, lz, w, h, d, color, opts) {
    f.box(lx, ly, lz, w, h, d, color, opts);
    f.box(-lx, ly, lz, w, h, d, color, opts);
  }

  /* ======================================================================
     匾额（Canvas 像素字）
     ====================================================================== */
  const plaqueTexCache = new Map();
  function plaqueTexture(text, opts) {
    opts = opts || {};
    const key = text + '|' + (opts.tone || '');
    if (plaqueTexCache.has(key)) return plaqueTexCache.get(key);
    const W = 384;
    const H = 132;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    // 底：深青蓝
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, opts.tone === 'green' ? '#123c34' : '#123a44');
    grad.addColorStop(0.55, opts.tone === 'green' ? '#0d2f29' : '#0c2b33');
    grad.addColorStop(1, opts.tone === 'green' ? '#0a241f' : '#081f25');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 外框
    ctx.strokeStyle = '#c9a35a';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.strokeStyle = 'rgba(242,212,149,.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, W - 40, H - 40);
    // 四角小饰
    ctx.fillStyle = '#d9b56e';
    const corner = 7;
    [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]].forEach(([x, y]) => {
      ctx.fillRect(x - corner / 2, y - corner / 2, corner, corner);
    });
    // 文字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 66px "STKaiti", "KaiTi", "Songti SC", "SimSun", serif';
    ctx.shadowColor = 'rgba(0,0,0,.65)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ecc873';
    ctx.fillText(text, W / 2, H / 2 + 3);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(98,58,16,.5)';
    ctx.lineWidth = 1;
    ctx.strokeText(text, W / 2, H / 2 + 3);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    plaqueTexCache.set(key, tex);
    return tex;
  }

  /** 在局部坐标 (lx,ly,lz) 朝 +z 挂一块匾 */
  function addPlaque(scene, f, o) {
    const w = o.w || 7;
    const h = o.h || 2.5;
    // 匾框（体素）
    f.box(o.lx, o.ly, o.lz - 0.3, w + 1.4, h + 1.3, 0.5, C.paintBlue, { shade: 0.85 });
    f.box(o.lx, o.ly + h / 2 + 0.55, o.lz - 0.15, w + 1.6, 0.36, 0.7, C.metalGold, { group: 'metal' });
    f.box(o.lx, o.ly - h / 2 - 0.55, o.lz - 0.15, w + 1.6, 0.36, 0.7, C.metalGold, { group: 'metal' });
    f.box(o.lx - w / 2 - 0.6, o.ly, o.lz - 0.15, 0.36, h + 1.3, 0.7, C.metalGold, { group: 'metal' });
    f.box(o.lx + w / 2 + 0.6, o.ly, o.lz - 0.15, 0.36, h + 1.3, 0.7, C.metalGold, { group: 'metal' });
    // 文字面片
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      map: plaqueTexture(o.text, { tone: o.tone }),
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(f.point(o.lx, o.ly, o.lz + 0.02));
    mesh.rotation.y = f.yaw;
    mesh.userData.plaque = o.text;
    scene.add(mesh);
    return mesh;
  }

  /* ======================================================================
     栏杆 / 台基 / 台阶
     ====================================================================== */
  function railRunX(f, x0, x1, z, y, o) {
    o = o || {};
    const len = x1 - x0;
    if (len < 0.8) return;
    const h = o.h || 2.4;
    const color = o.color || C.marbleLite;
    f.box((x0 + x1) / 2, y + h * 0.82, z, len, 0.34, 0.62, color);
    f.box((x0 + x1) / 2, y + h * 0.46, z, len, 0.2, 0.45, VP.shade(color, 0.92));
    const n = Math.max(2, Math.round(len / 3.2) + 1);
    for (let i = 0; i < n; i++) {
      const px = x0 + (len * i) / (n - 1);
      f.box(px, y + h / 2, z, 0.82, h, 0.82, color);
      f.box(px, y + h + 0.22, z, 1.16, 0.44, 1.16, VP.shade(color, 0.97));
    }
  }

  function railRunZ(f, z0, z1, x, y, o) {
    o = o || {};
    const len = z1 - z0;
    if (len < 0.8) return;
    const h = o.h || 2.4;
    const color = o.color || C.marbleLite;
    f.box(x, y + h * 0.82, (z0 + z1) / 2, 0.62, 0.34, len, color);
    f.box(x, y + h * 0.46, (z0 + z1) / 2, 0.45, 0.2, len, VP.shade(color, 0.92));
    const n = Math.max(2, Math.round(len / 3.2) + 1);
    for (let i = 0; i < n; i++) {
      const pz = z0 + (len * i) / (n - 1);
      f.box(x, y + h / 2, pz, 0.82, h, 0.82, color);
      f.box(x, y + h + 0.22, pz, 1.16, 0.44, 1.16, VP.shade(color, 0.97));
    }
  }

  function platformRailing(f, y, w, d, gapFront) {
    const inset = 0.75;
    // 前（留出踏道口）
    const half = Math.min(w / 2 - inset, Math.max(0, (gapFront || 0) / 2));
    railRunX(f, -w / 2 + inset, -half - 0.5, d / 2 - inset, y, {});
    railRunX(f, half + 0.5, w / 2 - inset, d / 2 - inset, y, {});
    // 后
    railRunX(f, -w / 2 + inset, w / 2 - inset, -d / 2 + inset, y, {});
    // 两侧
    railRunZ(f, -d / 2 + inset + 0.8, d / 2 - inset - 0.8, -w / 2 + inset, y, {});
    railRunZ(f, -d / 2 + inset + 0.8, d / 2 - inset - 0.8, w / 2 - inset, y, {});
  }

  function stoneJoints(f, cy, h, w, d) {
    const color = C.marbleMid;
    const stepX = 4.6;
    const stepZ = 4.6;
    const nx = Math.floor(w / stepX);
    for (let i = 1; i < nx; i++) {
      const x = -w / 2 + (i * w) / nx;
      f.box(x, cy + h / 2, d / 2 + 0.06, 0.16, h - 1.0, 0.12, color);
      f.box(x, cy + h / 2, -d / 2 - 0.06, 0.16, h - 1.0, 0.12, VP.shade(color, 0.9));
    }
    const nz = Math.floor(d / stepZ);
    for (let i = 1; i < nz; i++) {
      const z = -d / 2 + (i * d) / nz;
      f.box(w / 2 + 0.06, cy + h / 2, z, 0.12, h - 1.0, 0.16, color);
      f.box(-w / 2 - 0.06, cy + h / 2, z, 0.12, h - 1.0, 0.16, VP.shade(color, 0.9));
    }
  }

  /**
   * 层层台基
   * tiers: [{w,d,h}], stair 参数见 buildStairs
   */
  function buildPlatform(f, o) {
    const tiers = o.tiers;
    const baseY = o.baseY === undefined ? Y : o.baseY;
    const gap = o.gapFront || 24;
    let cy = baseY;
    tiers.forEach((t, i) => {
      const h = t.h;
      f.box(0, cy + h / 2, 0, t.w, h, t.d, C.marble, { jitter: 0.012 });
      // 台面压边（略低于台面，避免共面闪烁）
      f.box(0, cy + h - 0.34, 0, t.w + 0.7, 0.56, t.d + 0.7, C.marbleMid);
      // 底脚
      f.box(0, cy + 0.3, 0, t.w + 0.36, 0.6, t.d + 0.36, C.marbleMid);
      stoneJoints(f, cy, h, t.w, t.d);
      // 螭首（正面滴水兽）
      if (o.spouts !== false) {
        const sx = Math.floor(t.w / 8);
        for (let k = 1; k < sx; k++) {
          const px = -t.w / 2 + (k * t.w) / sx;
          f.box(px, cy + h - 0.5, t.d / 2 + 0.85, 0.9, 0.8, 1.6, C.marbleDark);
        }
      }
      cy += h;
      if (o.railing !== false) platformRailing(f, cy, t.w, t.d, gap);
    });
    return cy;
  }

  /** 大台阶：从 topY 下到 baseY，向 +z 伸出 */
  function buildStairs(f, o) {
    const baseY = o.baseY === undefined ? Y : o.baseY;
    const topY = o.topY;
    const steps = o.steps || 10;
    const tread = o.tread || 1.5;
    const width = o.width || 18;
    const rampW = o.rampWidth || 0;
    const z0 = o.z0;
    const rise = (topY - baseY) / steps;
    for (let k = 0; k < steps; k++) {
      const top = topY - rise * (k + 1);
      const h = top - baseY;
      const zc = z0 + tread * (k + 0.5);
      if (h > 0.05) {
        f.box(0, baseY + h / 2, zc, width, h, tread, C.marble, { jitter: 0.01 });
      }
      // 侧垂带
      if (o.sideRails !== false) {
        const sh = Math.max(0.6, h);
        f.box(width / 2 + 0.55, baseY + sh / 2 + 0.25, zc, 1.1, sh + 0.5, tread, C.marbleMid);
        f.box(-width / 2 - 0.55, baseY + sh / 2 + 0.25, zc, 1.1, sh + 0.5, tread, C.marbleMid);
      }
      if (rampW > 0) {
        const rt = Math.max(0.07, top - baseY + 0.14);
        f.box(0, baseY + rt / 2, zc, rampW, rt, tread, C.marbleLite, { jitter: 0.01 });
        // 丹陛石上简化的云龙纹
        if (k % 2 === 0) {
          f.box(0, baseY + rt + 0.06, zc, rampW * 0.72, 0.12, 0.36, C.metalGold, { group: 'metal' });
        }
        if (k === Math.floor(steps / 2) || k === Math.floor(steps / 2) + 1) {
          mirrorPair(f, 1.5, baseY + rt + 0.08, zc + 0.3, 1.4, 0.14, 0.7, C.metalGold, { group: 'metal' });
        }
      }
    }
    // 顶部望柱
    if (o.sideRails !== false) {
      mirrorPair(f, width / 2 + 0.55, topY + 1.1, z0 - 0.6, 1.0, 2.2, 1.0, C.marbleLite);
      mirrorPair(f, width / 2 + 0.55, topY + 2.25, z0 - 0.6, 1.3, 0.4, 1.3, C.marbleLite);
    }
    // 两侧石栏（阶梯状）
    if (o.stepRail) {
      for (let k = 1; k < steps; k += 3) {
        const top = topY - rise * k;
        const zc = z0 + tread * (k + 0.5);
        mirrorPair(f, width / 2 + 1.35, Math.max(baseY, top) + 1.0, zc, 0.7, 2.0, 0.7, C.marbleLite);
      }
    }
  }

  /* ======================================================================
     屋面（庑殿 / 攒尖 / 重檐下檐）
     ====================================================================== */

  function roofPalette(kind) {
    if (kind === 'green') {
      return { base: C.green, alt: C.greenDeep, edge: C.greenEdge, ridge: C.greenRidge, orn: C.greenOrn, trim: C.greenLite };
    }
    return { base: C.gold, alt: C.goldDeep, edge: C.goldEdge, ridge: C.goldRidge, orn: C.goldOrn, trim: C.goldLite };
  }

  /**
   * 庑殿顶（四坡顶）
   * ridgeAxis: 'x' 正脊沿 x；'z' 沿 z
   */
  function buildHipRoof(f, o) {
    const pal = roofPalette(o.kind);
    const ew = o.ew;
    const ed = o.ed;
    const height = o.height;
    const targetLayerH = o.layerH || 0.75;
    const nLayers = Math.max(4, Math.ceil(height / targetLayerH));
    const layerH = height / nLayers;
    const ridge = Math.max(1.2, o.ridge);
    const ridgeAxis = o.ridgeAxis || 'x';
    const y0 = o.y0;
    const tile = o.tile || 2.4;
    const exp = o.curve || 1.5;
    const cx = o.cx || 0;
    const cz = o.cz || 0;

    for (let li = 1; li <= nLayers; li++) {
      const t = li / nLayers;
      const ease = Math.pow(t, exp);
      const w = ridgeAxis === 'x' ? ew + (ridge - ew) * ease : o.w || edgeDim(ew, ed, ridge, ease, 'w', ridgeAxis);
      const d = ridgeAxis === 'x' ? ed + (3 - ed) * ease : ed + (ridge - ed) * ease;
      const ww = ridgeAxis === 'x' ? ew + (ridge - ew) * ease : ew + (3 - ew) * ease;
      const dd = ridgeAxis === 'x' ? ed + (3 - ed) * ease : ed + (ridge - ed) * ease;
      const yc = y0 + (li - 0.5) * layerH;
      // 瓦垄：沿脊方向切成条带
      if (ridgeAxis === 'x') {
        const nStrips = Math.max(1, Math.round(ww / tile));
        for (let s = 0; s < nStrips; s++) {
          const sw = ww / nStrips;
          const sx = -ww / 2 + sw * (s + 0.5);
          const col = s % 2 === 0 ? pal.base : pal.alt;
          f.box(cx + sx, yc, cz, sw, layerH, dd, col, {
            jitter: 0.035,
            shade: li === 1 ? 1.04 : 1,
          });
        }
      } else {
        const nStrips = Math.max(1, Math.round(dd / tile));
        for (let s = 0; s < nStrips; s++) {
          const sd = dd / nStrips;
          const sz = -dd / 2 + sd * (s + 0.5);
          const col = s % 2 === 0 ? pal.base : pal.alt;
          f.box(cx, yc, cz + sz, ww, layerH, sd, col, {
            jitter: 0.035,
            shade: li === 1 ? 1.04 : 1,
          });
        }
      }
    }

    // 檐口压边
    const eaveY = y0 + 0.1;
    f.box(cx, eaveY, cz + ed / 2 + 0.5, ew + 2.4, 0.55, 1.2, pal.edge, { jitter: 0.02 });
    f.box(cx, eaveY, cz - ed / 2 - 0.5, ew + 2.4, 0.55, 1.2, pal.edge, { jitter: 0.02 });
    f.box(cx + ew / 2 + 0.5, eaveY, cz, 1.2, 0.55, ed + 2.4, pal.edge, { jitter: 0.02 });
    f.box(cx - ew / 2 - 0.5, eaveY, cz, 1.2, 0.55, ed + 2.4, pal.edge, { jitter: 0.02 });
    // 檐下阴影线
    f.box(cx, y0 - 0.5, cz + ed / 2 + 0.2, ew + 3.2, 0.5, 0.7, C.woodDark);
    f.box(cx, y0 - 0.5, cz - ed / 2 - 0.2, ew + 3.2, 0.5, 0.7, C.woodDark);
    f.box(cx + ew / 2 + 0.2, y0 - 0.5, cz, 0.7, 0.5, ed + 3.2, C.woodDark);
    f.box(cx - ew / 2 - 0.2, y0 - 0.5, cz, 0.7, 0.5, ed + 3.2, C.woodDark);

    // 翼角起翘（四角）
    const up = o.upturn === false ? 0 : 3;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let k = 0; k < up; k++) {
          const off = 1.0 + k * 1.05;
          const size = 2.7 - k * 0.55;
          f.box(
            cx + sx * (ew / 2 + off),
            y0 + 0.55 + k * 1.05,
            cz + sz * (ed / 2 + off),
            size,
            1.0,
            size,
            k === up - 1 ? pal.ridge : pal.edge,
            { jitter: 0.02 }
          );
        }
        // 角端小脊兽
        f.box(cx + sx * (ew / 2 + up * 1.05), y0 + 0.7 + up * 1.05, cz + sz * (ed / 2 + up * 1.05), 1.0, 1.5, 1.0, C.metalGold, { group: 'metal' });
      }
    }

    // 垂脊
    const topY = y0 + nLayers * layerH;
    const hipSteps = Math.max(7, Math.round(nLayers * 1.4));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let j = 0; j <= hipSteps; j++) {
          const t = j / hipSteps;
          const hx = sx * (ridge / 2 + (ew / 2 - ridge / 2) * t);
          const hz = sz * (1.5 + (ed / 2 - 1.5) * t);
          const hy = topY - (topY - y0) * t + 0.55;
          f.box(cx + hx, hy, cz + hz, 2.0, 1.15, 2.0, pal.ridge, { jitter: 0.05 });
          if (j === hipSteps - 1) {
            f.box(cx + hx, hy + 1.0, cz + hz, 1.1, 1.2, 1.1, C.metalGold, { group: 'metal' });
          }
        }
      }
    }

    // 正脊
    const ridgeLen = ridgeAxis === 'x' ? ridge : 3;
    const rW = ridgeAxis === 'x' ? ridge + (o.ridgeExtend || 3.5) : 2.8;
    const rD = ridgeAxis === 'x' ? 2.8 : ridge + (o.ridgeExtend || 3.5);
    f.box(cx, topY + 1.0, cz, rW, 2.0, rD, pal.ridge, { jitter: 0.02 });
    f.box(cx, topY + 2.2, cz, rW * 0.94, 0.6, rD * 0.94, pal.trim, { jitter: 0.02 });
    // 鸱吻
    if (o.ridgeAxis !== 'z') {
      for (const sx of [-1, 1]) {
        const ox = sx * (ridgeLen / 2 + (o.ridgeExtend || 3.5) / 2);
        f.box(cx + ox, topY + 2.6, cz, 2.6, 3.4, 2.6, pal.orn, { jitter: 0.02, group: 'metal' });
        f.box(cx + ox + sx * 0.9, topY + 4.4, cz, 1.5, 2.4, 1.7, C.metalGold, { group: 'metal' });
        f.box(cx + ox + sx * 1.7, topY + 5.4, cz, 1.8, 0.9, 1.2, C.metalGold, { group: 'metal' });
      }
    } else {
      for (const sz of [-1, 1]) {
        const oz = sz * (ridgeLen / 2 + (o.ridgeExtend || 3.5) / 2);
        f.box(cx, topY + 2.6, cz + oz, 2.6, 3.4, 2.6, pal.orn, { group: 'metal' });
        f.box(cx, topY + 4.4, cz + oz + sz * 0.9, 1.7, 2.4, 1.5, C.metalGold, { group: 'metal' });
      }
    }

    // 攒尖顶宝顶
    if (o.finial) {
      f.box(cx, topY + 1.2, cz, 3.6, 1.6, 3.6, pal.ridge, { group: 'metal' });
      f.box(cx, topY + 2.5, cz, 2.4, 1.6, 2.4, C.metalGold, { group: 'metal' });
      f.box(cx, topY + 3.9, cz, 1.2, 2.0, 1.2, C.gold, { group: 'metal' });
      f.box(cx, topY + 5.1, cz, 1.9, 0.6, 1.9, C.metalGold, { group: 'metal' });
    }
    return topY;
  }

  function edgeDim() { return 3; }

  /** 重檐下檐：环形坡屋面 */
  function buildSkirtRoof(f, o) {
    const pal = roofPalette(o.kind);
    const layers = o.layers || 4;
    const holeW = o.holeW;
    const holeD = o.holeD;
    const ew = o.ew;
    const ed = o.ed;
    const y0 = o.y0;
    const layerH = o.layerH || 1;
    const exp = o.curve || 1.25;
    for (let li = 1; li <= layers; li++) {
      const t = li / layers;
      const ease = Math.pow(t, exp);
      const w = ew + (holeW + 3 - ew) * ease;
      const d = ed + (holeD + 3 - ed) * ease;
      const yc = y0 + (li - 0.5) * layerH;
      const sideW = Math.max(0.8, (w - holeW) / 2);
      const sideD = Math.max(0.8, (d - holeD) / 2);
      const col = li % 2 === 0 ? pal.base : pal.alt;
      // 左右坡
      f.box(-(holeW / 2 + sideW / 2), yc, 0, sideW, layerH, d, col, { jitter: 0.035 });
      f.box(holeW / 2 + sideW / 2, yc, 0, sideW, layerH, d, col, { jitter: 0.035 });
      // 前后坡（只填洞口宽度，避免重叠）
      f.box(0, yc, -(holeD / 2 + sideD / 2), holeW, layerH, sideD, li % 2 ? pal.alt : pal.base, { jitter: 0.035 });
      f.box(0, yc, holeD / 2 + sideD / 2, holeW, layerH, sideD, li % 2 ? pal.alt : pal.base, { jitter: 0.035 });
    }
    // 檐口
    f.box(0, y0 + 0.05, ed / 2 + 0.4, ew + 2.2, 0.6, 1.2, pal.edge, { jitter: 0.02 });
    f.box(0, y0 + 0.05, -ed / 2 - 0.4, ew + 2.2, 0.6, 1.2, pal.edge, { jitter: 0.02 });
    f.box(ew / 2 + 0.4, y0 + 0.05, 0, 1.2, 0.6, ed + 2.2, pal.edge, { jitter: 0.02 });
    f.box(-ew / 2 - 0.4, y0 + 0.05, 0, 1.2, 0.6, ed + 2.2, pal.edge, { jitter: 0.02 });
    // 檐下阴影
    f.box(0, y0 - 0.45, ed / 2 + 0.1, ew + 3, 0.45, 0.7, C.woodDark);
    f.box(0, y0 - 0.45, -ed / 2 - 0.1, ew + 3, 0.45, 0.7, C.woodDark);
    f.box(ew / 2 + 0.1, y0 - 0.45, 0, 0.7, 0.45, ed + 3, C.woodDark);
    f.box(-ew / 2 - 0.1, y0 - 0.45, 0, 0.7, 0.45, ed + 3, C.woodDark);
    // 四角起翘
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const off = 0.8 + k * 1.0;
          const size = 2.5 - k * 0.5;
          f.box(sx * (ew / 2 + off), y0 + 0.55 + k * 1.0, sz * (ed / 2 + off), size, 0.95, size, k === 2 ? pal.ridge : pal.edge, { jitter: 0.02 });
        }
      }
    }
    // 顶部金边
    const topY = y0 + layers * layerH;
    f.box(0, topY + 0.1, holeD / 2 + 1.4, holeW + 3, 0.5, 0.8, C.metalGold, { group: 'metal' });
    f.box(0, topY + 0.1, -holeD / 2 - 1.4, holeW + 3, 0.5, 0.8, C.metalGold, { group: 'metal' });
    f.box(holeW / 2 + 1.4, topY + 0.1, 0, 0.8, 0.5, holeD + 3, C.metalGold, { group: 'metal' });
    f.box(-holeW / 2 - 1.4, topY + 0.1, 0, 0.8, 0.5, holeD + 3, C.metalGold, { group: 'metal' });
    return topY;
  }

  /** 斗拱彩画带 */
  function buildDougong(f, o) {
    const w = o.w;
    const d = o.d;
    const y = o.y;
    const a = o.a || C.paintBlue;
    const b = o.b || C.goldOrn;
    const g = C.paintTeal;
    // 额枋
    f.box(0, y + 0.35, d / 2 + 0.25, w + 1.2, 0.7, 1.5, C.beamRed);
    f.box(0, y + 0.35, -d / 2 - 0.25, w + 1.2, 0.7, 1.5, C.beamRed);
    f.box(w / 2 + 0.25, y + 0.35, 0, 1.5, 0.7, d + 1.2, C.beamRed);
    f.box(-w / 2 - 0.25, y + 0.35, 0, 1.5, 0.7, d + 1.2, C.beamRed);
    // 斗拱层：前后两排
    const spacing = 2.1;
    const n = Math.max(3, Math.round(w / spacing));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i * w) / (n - 1);
      const c1 = i % 2 ? a : b;
      f.box(x, y + 1.05, d / 2 + 0.9, 1.15, 1.0, 1.3, c1, { jitter: 0.03 });
      f.box(x, y + 1.05, -d / 2 - 0.9, 1.15, 1.0, 1.3, c1, { jitter: 0.03 });
      f.box(x, y + 1.7, d / 2 + 0.7, 0.8, 0.55, 0.9, g);
      f.box(x, y + 1.7, -d / 2 - 0.7, 0.8, 0.55, 0.9, g);
    }
    const m = Math.max(3, Math.round(d / spacing));
    for (let i = 0; i < m; i++) {
      const z = -d / 2 + (i * d) / (m - 1);
      const c1 = i % 2 ? b : a;
      f.box(w / 2 + 0.9, y + 1.05, z, 1.3, 1.0, 1.15, c1, { jitter: 0.03 });
      f.box(-w / 2 - 0.9, y + 1.05, z, 1.3, 1.0, 1.15, c1, { jitter: 0.03 });
    }
    // 上部金线
    f.box(0, y + 1.95, d / 2 + 0.65, w + 1.6, 0.35, 0.7, C.metalGold, { group: 'metal' });
    f.box(0, y + 1.95, -d / 2 - 0.65, w + 1.6, 0.35, 0.7, C.metalGold, { group: 'metal' });
    f.box(w / 2 + 0.65, y + 1.95, 0, 0.7, 0.35, d + 1.6, C.metalGold, { group: 'metal' });
    f.box(-w / 2 - 0.65, y + 1.95, 0, 0.7, 0.35, d + 1.6, C.metalGold, { group: 'metal' });
  }

  /* ======================================================================
     门窗 / 柱列 / 墙体
     ====================================================================== */
  function addDoor(f, x, y0, z, w, h, o) {
    o = o || {};
    f.box(x, y0 + h / 2, z, w, h, 0.45, C.doorRed);
    // 金色门框
    f.box(x, y0 + h + 0.18, z + 0.12, w + 0.7, 0.36, 0.55, C.metalGold, { group: 'metal' });
    f.box(x - w / 2 - 0.2, y0 + h / 2, z + 0.12, 0.36, h, 0.55, C.metalGold, { group: 'metal' });
    f.box(x + w / 2 + 0.2, y0 + h / 2, z + 0.12, 0.36, h, 0.55, C.metalGold, { group: 'metal' });
    // 门钉
    const cols = o.studs || 3;
    const rows = o.studs || 3;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const px = x - w / 2 + (w * (i + 0.5)) / cols;
        const py = y0 + h * 0.18 + (h * 0.6 * (j + 0.5)) / rows;
        f.box(px, py, z + 0.35, 0.34, 0.34, 0.18, C.doorStud, { group: 'metal' });
      }
    }
    // 中缝
    f.box(x, y0 + h / 2, z + 0.3, 0.12, h, 0.14, VP.shade(C.doorRed, 0.65));
  }

  function addLatticeWindow(f, x, y0, z, w, h, o) {
    o = o || {};
    const grid = o.grid || C.doorStud;
    f.box(x, y0 + h / 2, z, w, h, 0.32, C.blackVoid);
    f.box(x, y0 + h / 2, z - 0.15, w + 0.4, h + 0.4, 0.2, C.paintBlue);
    const step = o.step || 1.65;
    const nv = Math.max(2, Math.round(w / step));
    for (let i = 0; i < nv; i++) {
      const px = x - w / 2 + (w * (i + 0.5)) / nv;
      f.box(px, y0 + h / 2, z + 0.2, 0.2, h, 0.16, grid, { group: 'metal' });
    }
    const nh = Math.max(2, Math.round(h / step));
    for (let i = 0; i < nh; i++) {
      const py = y0 + (h * (i + 0.5)) / nh;
      f.box(x, py, z + 0.2, w, 0.2, 0.16, grid, { group: 'metal' });
    }
    // 窗框
    f.box(x, y0 + h + 0.16, z + 0.2, w + 0.7, 0.3, 0.4, C.beamRed);
    f.box(x, y0 - 0.14, z + 0.2, w + 0.7, 0.3, 0.4, C.beamRed);
  }

  function addColumns(f, o) {
    const y0 = o.y0;
    const h = o.h;
    const z = o.z;
    const n = o.n;
    const span = o.span;
    const color = o.color || C.column;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + (span * i) / (n - 1);
      f.box(x, y0 + h / 2 + 0.5, z, 1.5, h, 1.5, color, { jitter: 0.02 });
      f.box(x, y0 + 0.35, z, 2.1, 0.7, 2.1, C.marbleMid);
      f.box(x, y0 + 0.75, z, 1.8, 0.6, 1.8, C.metalGold, { group: 'metal' });
      f.box(x, y0 + h + 0.55, z, 2.2, 0.7, 2.2, C.metalGold, { group: 'metal' });
      if (o.lantern) {
        // 檐下宫灯
        f.box(x, y0 + h * 0.88, z + 1.1, 1.0, 1.4, 1.0, C.lantern, { group: 'glow' });
        f.box(x, y0 + h * 0.88 + 0.82, z + 1.1, 1.3, 0.26, 1.3, C.metalGold, { group: 'metal' });
        f.box(x, y0 + h * 0.88 - 0.82, z + 1.1, 0.34, 0.72, 0.34, C.clothGold);
      }
    }
  }

  function wallBand(f, w, d, y, o) {
    // 额枋彩画（四周）
    f.box(0, y, d / 2 + 0.35, w + 0.8, 1.15, 0.9, C.paintBlue);
    f.box(0, y, -d / 2 - 0.35, w + 0.8, 1.15, 0.9, C.paintBlue);
    f.box(w / 2 + 0.35, y, 0, 0.9, 1.15, d + 0.8, C.paintBlue);
    f.box(-w / 2 - 0.35, y, 0, 0.9, 1.15, d + 0.8, C.paintBlue);
    f.box(0, y + 0.28, d / 2 + 0.85, w + 1.2, 0.18, 0.14, C.metalGold, { group: 'metal' });
    f.box(0, y - 0.28, d / 2 + 0.85, w + 1.2, 0.18, 0.14, C.metalGold, { group: 'metal' });
    // 彩画分格
    const n = Math.max(4, Math.round(w / 3.4));
    for (let i = 1; i < n; i++) {
      const x = -w / 2 + (i * w) / n;
      f.box(x, y, d / 2 + 0.82, 0.18, 1.0, 0.12, i % 2 ? C.paintTeal : C.goldOrn);
    }
    // 檐下红色木枋
    f.box(0, y + 0.85, d / 2 + 0.2, w + 0.6, 0.55, 1.2, C.beamRed);
    f.box(0, y + 0.85, -d / 2 - 0.2, w + 0.6, 0.55, 1.2, C.beamRed);
    f.box(w / 2 + 0.2, y + 0.85, 0, 1.2, 0.55, d + 0.6, C.beamRed);
    f.box(-w / 2 - 0.2, y + 0.85, 0, 1.2, 0.55, d + 0.6, C.beamRed);
  }

  /** 殿身：墙、柱、门、窗；返回殿身顶面 y */
  function buildHallBody(f, o) {
    const w = o.w;
    const d = o.d;
    const h = o.h;
    const y0 = o.y0;
    const colN = o.colN || 8;
    const doorN = o.doorN || 3;
    // 台明
    f.box(0, y0 + 0.25, 0, w + 2.4, 0.5, d + 2.4, C.marbleMid);
    // 后墙 / 侧墙
    f.box(0, y0 + h / 2, -d / 2 + 0.7, w, h, 1.4, C.wallRed, { jitter: 0.02 });
    f.box(w / 2 - 0.7, y0 + h / 2, 0, 1.4, h, d, C.wallRed, { jitter: 0.02 });
    f.box(-w / 2 + 0.7, y0 + h / 2, 0, 1.4, h, d, C.wallRed, { jitter: 0.02 });
    // 前檐墙
    f.box(0, y0 + h / 2, d / 2 - 0.55, w, h, 1.1, C.wallRed, { jitter: 0.02 });
    // 墙基 / 墙顶金线
    f.box(0, y0 + 0.2, d / 2 + 0.05, w + 1.6, 0.4, 1.3, C.marbleMid);
    f.box(0, y0 + h - 0.2, d / 2 + 0.05, w + 1.6, 0.4, 1.3, C.metalGold, { group: 'metal' });
    // 柱子
    addColumns(f, { y0, h: h - 1.4, z: d / 2 + 0.55, n: colN, span: w - 2.6, lantern: o.lantern });
    // 门（中间三间或 doorN 间）
    const dw = w / (colN - 1);
    const doorW = Math.min(3.3, dw * 0.78);
    const gap = doorW + 0.55;
    for (let i = 0; i < doorN; i++) {
      const x = (i - (doorN - 1) / 2) * gap;
      addDoor(f, x, y0 + 0.55, d / 2 + 0.22, doorW, h * 0.47, { studs: o.studs || 3 });
    }
    // 窗（门两侧）
    const winW = Math.min(3.0, dw * 0.72);
    const winH = h * 0.4;
    const winY = y0 + h * 0.48;
    const winOffsets = [];
    for (let i = 1; i <= 2; i++) {
      winOffsets.push(-(doorN * gap) / 2 - 0.8 - (i - 1) * (winW + 1.2));
      winOffsets.push((doorN * gap) / 2 + 0.8 + (i - 1) * (winW + 1.2));
    }
    winOffsets.forEach((x) => {
      if (Math.abs(x) < w / 2 - 1) addLatticeWindow(f, x, winY, d / 2 + 0.2, winW, winH);
    });
    // 侧墙高窗
    for (let i = 0; i < 3; i++) {
      const z = -d / 4 + (i * d) / 5;
      f.box(w / 2 + 0.03, y0 + h * 0.62, z, 0.3, h * 0.26, 2.4, C.blackVoid);
      f.box(w / 2 + 0.1, y0 + h * 0.62, z, 0.18, h * 0.26, 0.22, C.doorStud, { group: 'metal' });
      f.box(-w / 2 - 0.03, y0 + h * 0.62, z, 0.3, h * 0.26, 2.4, C.blackVoid);
    }
    // 彩画额枋
    wallBand(f, w, d, y0 + h - 1.15);
    return y0 + h;
  }

  /* ======================================================================
     主殿 · 太和殿（重檐庑殿 · 三台）
     ====================================================================== */
  function buildMainHall(scene, V) {
    const f = makeFrame(V, L.buildings.main.cx, L.buildings.main.cz, 0);
    const tiers = [
      { w: 60, d: 46, h: 2.0 },
      { w: 54, d: 40, h: 2.0 },
      { w: 48, d: 34, h: 2.0 },
    ];
    const top = buildPlatform(f, { tiers, gapFront: 24, baseY: Y });
    buildStairs(f, {
      z0: 17,
      topY: top,
      baseY: Y,
      width: 20,
      steps: 12,
      tread: 1.55,
      rampWidth: 6,
      stepRail: true,
    });

    const y0 = top; // 6.55
    const lowerH = 11.6;
    const lowerW = 38;
    const lowerD = 22;
    const lowerTop = buildHallBody(f, {
      w: lowerW,
      d: lowerD,
      h: lowerH,
      y0,
      colN: 10,
      doorN: 3,
      lantern: true,
    });
    // 下檐斗拱
    buildDougong(f, { w: lowerW, d: lowerD, y: lowerTop - 0.1, h: 1.2 });
    // 下檐（重檐）
    const skirtTop = buildSkirtRoof(f, {
      y0: lowerTop + 1.75,
      ew: 50,
      ed: 34,
      holeW: 34,
      holeD: 20,
      layers: 6,
      layerH: 0.7,
      kind: 'gold',
    });
    // 主殿下檐匾额
    addPlaque(scene, f, { text: '太和殿', lx: 0, ly: y0 + lowerH * 0.74, lz: 11.85, w: 7.6, h: 2.7 });
    // 檐下宫灯
    for (let i = -3; i <= 3; i++) {
      const lx = i * 4.1;
      f.box(lx, lowerTop + 0.8, 14.6, 1.1, 1.5, 1.1, C.lantern, { group: 'glow' });
      f.box(lx, lowerTop + 1.7, 14.6, 1.5, 0.3, 1.5, C.metalGold, { group: 'metal' });
      f.box(lx, lowerTop + 0.05, 14.6, 0.3, 0.3, 0.3, C.metalGold, { group: 'metal' });
    }

    // 上层殿身
    const upperY = skirtTop + 0.2;
    const upperW = 32;
    const upperD = 18;
    const upperH = 6.0;
    // 上层平台/平座
    f.box(0, upperY + 0.2, 0, upperW + 4, 0.55, upperD + 4, C.marbleMid);
    // 上层墙体
    f.box(0, upperY + upperH / 2, -upperD / 2 + 0.6, upperW, upperH, 1.2, C.wallRed);
    f.box(upperW / 2 - 0.6, upperY + upperH / 2, 0, 1.2, upperH, upperD, C.wallRed);
    f.box(-upperW / 2 + 0.6, upperY + upperH / 2, 0, 1.2, upperH, upperD, C.wallRed);
    f.box(0, upperY + upperH / 2, upperD / 2 - 0.5, upperW, upperH, 0.9, C.wallRed);
    // 上层柱列
    addColumns(f, { y0: upperY + 0.3, h: upperH - 1.2, z: upperD / 2 + 0.25, n: 8, span: upperW - 2.4, lantern: false });
    // 上层窗与门
    for (let i = -2; i <= 2; i++) {
      const x = i * 5.2;
      if (i === 0) addDoor(f, x, upperY + 0.5, upperD / 2 + 0.15, 3.4, upperH * 0.55, { studs: 3 });
      else addLatticeWindow(f, x, upperY + upperH * 0.32, upperD / 2 + 0.12, 3.4, upperH * 0.42);
    }
    addPlaque(scene, f, { text: '太和殿', lx: 0, ly: upperY + upperH * 0.7, lz: upperD / 2 + 0.85, w: 5.8, h: 2.1 });
    // 平座栏杆
    const railY = upperY + 0.65;
    f.box(0, railY + 1.5, upperD / 2 + 2.2, upperW + 4, 0.3, 0.5, C.metalGold, { group: 'metal' });
    for (let i = 0; i <= 8; i++) {
      const x = -(upperW + 2) / 2 + (i * (upperW + 2)) / 8;
      f.box(x, railY + 0.8, upperD / 2 + 2.2, 0.6, 1.6, 0.6, C.marbleLite);
    }
    // 上层斗拱
    const upperBodyTop = upperY + upperH;
    buildDougong(f, { w: upperW, d: upperD, y: upperBodyTop - 0.2, h: 1.2 });
    // 上檐
    const roofY = upperBodyTop + 1.35;
    buildHipRoof(f, {
      y0: roofY,
      ew: 52,
      ed: 34,
      height: 8.8,
      ridge: 24,
      kind: 'gold',
      tile: 2.3,
      curve: 1.5,
      ridgeExtend: 3.2,
    });
    return f;
  }

  /* ======================================================================
     后寝 · 乾清宫（单檐庑殿 · 二重台）
     ====================================================================== */
  function buildRearHall(scene, V) {
    const f = makeFrame(V, 0, -66, 0);
    const tiers = [
      { w: 38, d: 29, h: 1.6 },
      { w: 32, d: 24, h: 1.6 },
    ];
    const top = buildPlatform(f, { tiers, gapFront: 16, baseY: Y });
    buildStairs(f, { z0: 12, topY: top, baseY: Y, width: 12, steps: 8, tread: 1.4, rampWidth: 4 });
    const y0 = top;
    const bodyH = 10.6;
    const bodyTop = buildHallBody(f, {
      w: 26,
      d: 18,
      h: bodyH,
      y0,
      colN: 8,
      doorN: 3,
      lantern: true,
    });
    addPlaque(scene, f, { text: '乾清宫', lx: 0, ly: y0 + bodyH * 0.78, lz: 9.7, w: 6.2, h: 2.3 });
    buildDougong(f, { w: 26, d: 18, y: bodyTop - 1.5, h: 1.2, a: C.paintTeal });
    buildHipRoof(f, {
      y0: bodyTop + 0.85,
      ew: 36,
      ed: 27,
      height: 7.4,
      ridge: 15,
      kind: 'gold',
      tile: 2.3,
      curve: 1.5,
      ridgeExtend: 2.8,
    });
    // 脊中宝匣
    f.box(0, bodyTop + 0.85 + 9.0, 0, 2.2, 1.4, 1.4, C.metalGold, { group: 'metal' });
    return f;
  }

  /* ======================================================================
     午门（城台三阙 + 五凤楼式门楼）
     ====================================================================== */
  function buildGate(scene, V) {
    const f = makeFrame(V, 0, 64, 0);
    const baseY = Y;
    // 城台基座
    f.box(0, baseY + 0.45, 0, 54, 0.9, 22, C.marbleMid);
    const wallH = 11;
    const wallY0 = baseY + 0.9;
    f.box(0, wallY0 + 0.55, 0, 48, 1.1, 17, C.marble);
    f.box(0, wallY0 + 1.1 + (wallH - 1.1) / 2, 0, 48, wallH - 1.1, 16, C.wallRed, { jitter: 0.02 });
    // 城台竖向砌缝
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const x = i * 4.1;
      f.box(x, wallY0 + wallH * 0.55, 8.05, 0.2, wallH - 2.2, 0.12, VP.shade(C.wallRedDark, 0.95));
      f.box(x, wallY0 + wallH * 0.55, -8.05, 0.2, wallH - 2.2, 0.12, VP.shade(C.wallRedDark, 0.95));
    }
    // 门洞（前、后）：中央高阙 + 两侧阙
    const openings = [
      { x: 0, w: 8.4, h: 8.8 },
      { x: -13.5, w: 5.6, h: 7.2 },
      { x: 13.5, w: 5.6, h: 7.2 },
    ];
    openings.forEach((op) => {
      [1, -1].forEach((side) => {
        const z = side * (8 + 0.02);
        f.box(op.x, wallY0 + op.h * 0.4, z, op.w, op.h * 0.8, 0.24, C.blackVoid);
        f.box(op.x, wallY0 + op.h * 0.8 + op.h * 0.1, z, op.w * 0.66, op.h * 0.2, 0.24, C.blackVoid);
        // 拱券金边
        f.box(op.x, wallY0 + op.h * 0.9, z + 0.18, op.w + 0.8, 0.34, 0.3, C.metalGold, { group: 'metal' });
        f.box(op.x - op.w / 2 - 0.25, wallY0 + op.h * 0.45, z + 0.18, 0.4, op.h * 0.9, 0.3, C.marbleDark);
        f.box(op.x + op.w / 2 + 0.25, wallY0 + op.h * 0.45, z + 0.18, 0.4, op.h * 0.9, 0.3, C.marbleDark);
      });
      // 门槛
      f.box(op.x, wallY0 + 0.18, 0, op.w + 0.6, 0.36, 17.6, C.marbleDark);
    });
    // 城台顶部压边 / 栏杆
    f.box(0, wallY0 + wallH - 0.25, 0, 49.4, 0.7, 17.4, C.marbleMid);
    f.box(0, wallY0 + wallH + 0.2, 8.2, 50, 0.6, 2.2, C.metalGold, { group: 'metal' });
    f.box(0, wallY0 + wallH + 0.2, -8.2, 50, 0.6, 2.2, C.metalGold, { group: 'metal' });
    // 顶上栏杆
    const railY = wallY0 + wallH;
    railRunX(f, -23.6, -12, 7.8, railY + 0.6, { h: 2.0 });
    railRunX(f, 12, 23.6, 7.8, railY + 0.6, { h: 2.0 });
    railRunX(f, -23.6, 23.6, -7.8, railY + 0.6, { h: 2.0 });

    // 门额：城台正中
    addPlaque(scene, f, { text: '午门', lx: 0, ly: wallY0 + 9.75, lz: 8.16, w: 5.8, h: 2.1, tone: 'green' });

    const pavY = railY + 0.9;
    // 中央门楼：重檐
    f.box(0, pavY + 0.3, 0, 32, 0.6, 15, C.marbleMid);
    const pH = 6.4;
    const pW = 27;
    const pD = 11;
    const pTop = buildHallBody(f, { w: pW, d: pD, h: pH, y0: pavY + 0.6, colN: 8, doorN: 3, lantern: false });
    addPlaque(scene, f, { text: '午门', lx: 0, ly: pavY + 0.6 + pH * 0.76, lz: 6.1, w: 5.6, h: 2.1, tone: 'green' });
    buildDougong(f, { w: pW, d: pD, y: pavY + pH - 0.7, h: 1.1, a: C.paintTeal });
    const skirtY = pavY + 0.6 + pH + 0.5;
    const st = buildSkirtRoof(f, {
      y0: skirtY,
      ew: 37,
      ed: 20,
      holeW: 21,
      holeD: 9.2,
      layers: 4,
      layerH: 0.9,
      kind: 'gold',
    });
    const upY = st + 0.15;
    const upW = 20;
    const upD = 9;
    const upH = 3.2;
    f.box(0, upY + upH / 2, 0, upW, upH, upD, C.wallRed);
    for (let i = -3; i <= 3; i++) {
      const x = i * 2.7;
      f.box(x, upY + upH / 2, upD / 2 + 0.25, 1.1, upH - 1.0, 1.1, C.column);
      f.box(x, upY + upH * 0.55, upD / 2 + 0.1, 2.0, 1.2, 0.2, C.blackVoid);
    }
    buildDougong(f, { w: upW, d: upD, y: upY + upH - 0.15, h: 0.9, a: C.paintTeal });
    buildHipRoof(f, {
      y0: upY + upH + 1.0,
      ew: 30,
      ed: 17,
      height: 5.2,
      ridge: 12,
      kind: 'gold',
      tile: 2.2,
      curve: 1.45,
      ridgeExtend: 2.6,
    });

    // 两侧阙楼
    for (const sx of [-1, 1]) {
      const bx = sx * 19.5;
      f.box(bx, pavY + 0.25, 0, 13, 0.5, 13, C.marbleMid);
      const bh = 5.0;
      f.box(bx, pavY + 0.5 + bh / 2, 0, 9.5, bh, 9.5, C.wallRed, { jitter: 0.02 });
      // 柱与窗
      for (let i = -1; i <= 1; i++) {
        f.box(bx + i * 2.7, pavY + 0.5 + bh / 2, 4.9, 0.9, bh - 0.8, 0.9, C.column);
      }
      f.box(bx, pavY + 0.5 + bh * 0.62, 4.78, 6.0, 1.7, 0.25, C.blackVoid);
      buildDougong(f, { w: 9.5, d: 9.5, y: pavY + 0.5 + bh - 0.2, h: 0.8, a: C.paintTeal });
      buildHipRoof(f, {
        y0: pavY + 0.5 + bh + 1.0,
        ew: 14.5,
        ed: 14.5,
        height: 4.2,
        ridge: 1.4,
        kind: 'gold',
        tile: 2.1,
        curve: 1.4,
        finial: true,
      });
    }
    return f;
  }

  /* ======================================================================
     东西配殿（单檐庑殿 · 绿琉璃）
     ====================================================================== */
  function buildSideHall(scene, V, isEast) {
    const cx = isEast ? 47 : -47;
    const yaw = isEast ? 270 : 90;
    const f = makeFrame(V, cx, 6, yaw);
    const top = buildPlatform(f, {
      tiers: [{ w: 33, d: 21, h: 1.5 }],
      gapFront: 13,
      baseY: Y,
      spouts: false,
    });
    buildStairs(f, { z0: 10.5, topY: top, baseY: Y, width: 9, steps: 4, tread: 1.3, rampWidth: 0, sideRails: true });
    const y0 = top;
    const bodyH = 8.8;
    const bodyTop = buildHallBody(f, {
      w: 27,
      d: 15,
      h: bodyH,
      y0,
      colN: 8,
      doorN: 3,
      lantern: true,
    });
    addPlaque(scene, f, { text: isEast ? '东配殿' : '西配殿', lx: 0, ly: y0 + bodyH * 0.76, lz: 8.2, w: 5.2, h: 2.0, tone: 'green' });
    buildDougong(f, { w: 27, d: 15, y: bodyTop - 1.4, h: 1.0, a: C.paintGreen, b: C.goldOrn });
    buildHipRoof(f, {
      y0: bodyTop + 0.75,
      ew: 35,
      ed: 23,
      height: 6.2,
      ridge: 15,
      kind: 'green',
      tile: 2.2,
      curve: 1.45,
      ridgeExtend: 2.4,
    });
    return f;
  }

  /* ======================================================================
     钟楼 / 鼓楼（两层 · 攒尖顶）
     ====================================================================== */
  function buildTower(scene, V, isBell) {
    const cx = isBell ? 47 : -47;
    const f = makeFrame(V, cx, 38, 0);
    const top = buildPlatform(f, {
      tiers: [{ w: 16, d: 16, h: 1.4 }],
      gapFront: 7,
      baseY: Y,
      spouts: false,
    });
    buildStairs(f, { z0: 8, topY: top, baseY: Y, width: 6, steps: 3, tread: 1.2, rampWidth: 0, sideRails: true });
    // 一层
    const y0 = top;
    const h1 = 7.4;
    f.box(0, y0 + 0.2, 0, 12.4, 0.4, 12.4, C.marbleMid);
    f.box(0, y0 + h1 / 2, 0, 11, h1, 11, C.wallRed, { jitter: 0.02 });
    // 一层门洞
    f.box(0, y0 + 2.9, 5.56, 4.2, 5.4, 0.28, C.blackVoid);
    f.box(0, y0 + 5.9, 5.56, 3.0, 1.2, 0.3, C.blackVoid);
    f.box(0, y0 + 5.55, 5.8, 4.8, 0.3, 0.4, C.metalGold, { group: 'metal' });
    f.box(0, y0 + 2.9, 5.8, 1.0, 3.4, 0.35, C.doorRed);
    for (const sx of [-1, 1]) {
      f.box(sx * 3.4, y0 + 3.2, 5.62, 2.0, 2.6, 0.3, C.blackVoid);
      f.box(sx * 3.4, y0 + 3.2, 5.8, 0.2, 2.6, 0.2, C.doorStud, { group: 'metal' });
      f.box(sx * 3.4, y0 + 4.5, 5.8, 2.0, 0.2, 0.2, C.doorStud, { group: 'metal' });
    }
    // 一层斗拱 + 腰檐
    buildDougong(f, { w: 11, d: 11, y: y0 + h1 - 1.4, h: 1.0, a: C.paintTeal });
    const skirtY = y0 + h1 + 0.2;
    const st = buildSkirtRoof(f, {
      y0: skirtY,
      ew: 15.6,
      ed: 15.6,
      holeW: 9.4,
      holeD: 9.4,
      layers: 3,
      layerH: 0.9,
      kind: 'green',
    });
    // 二层
    const y2 = st + 0.3;
    f.box(0, y2 + 0.2, 0, 10.4, 0.4, 10.4, C.marbleMid);
    const h2 = 4.8;
    // 开敞亭身：四角柱 + 背板
    f.box(0, y2 + h2 / 2, -4.2, 9.0, h2, 1.1, C.wallRed);
    f.box(4.1, y2 + h2 / 2, 0, 1.1, h2, 8.4, C.wallRed);
    f.box(-4.1, y2 + h2 / 2, 0, 1.1, h2, 8.4, C.wallRed);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        f.box(sx * 4.1, y2 + h2 / 2, sz * 4.1, 1.3, h2, 1.3, C.column);
      }
    }
    f.box(0, y2 + h2 - 0.25, 4.2, 8.6, 0.5, 1.2, C.beamRed);
    // 钟 / 鼓
    if (isBell) {
      f.box(0, y2 + h2 - 0.2, 0, 0.4, 1.8, 0.4, C.bronzeDark);
      f.box(0, y2 + h2 * 0.58, 0, 2.6, 2.8, 2.6, C.bronze, { jitter: 0.03 });
      f.box(0, y2 + h2 * 0.58 - 1.7, 0, 3.3, 0.7, 3.3, C.bronzeDark);
      f.box(0, y2 + h2 * 0.58 + 1.45, 0, 3.2, 0.5, 3.2, C.bronzeLite);
      f.box(0, y2 + h2 * 0.58 - 0.4, 1.35, 1.4, 0.35, 0.12, C.bronzeLite);
    } else {
      // 鼓架
      f.box(0, y2 + 0.6, 0, 3.8, 1.2, 2.4, C.woodDark);
      f.box(0, y2 + h2 * 0.55, 0, 4.4, 3.0, 2.6, C.cloth);
      f.box(0, y2 + h2 * 0.55, 1.35, 3.6, 2.4, 0.25, C.clothGold);
      f.box(0, y2 + h2 * 0.55, -1.35, 3.6, 2.4, 0.25, C.woodMid);
      f.box(0, y2 + h2 * 0.55 + 1.55, 0, 4.6, 0.3, 2.8, C.woodDark);
    }
    // 二层平座栏杆
    railRunX(f, -4.8, 4.8, 4.8, y2 + 0.1, { h: 1.8 });
    railRunX(f, -4.8, 4.8, -4.8, y2 + 0.1, { h: 1.8 });
    railRunZ(f, -4.8, 4.8, -4.8, y2 + 0.1, { h: 1.8 });
    railRunZ(f, -4.8, 4.8, 4.8, y2 + 0.1, { h: 1.8 });
    // 匾
    addPlaque(scene, f, { text: isBell ? '钟楼' : '鼓楼', lx: 0, ly: y2 + h2 * 0.8, lz: 5.0, w: 3.4, h: 1.5, tone: 'green' });
    // 顶
    buildDougong(f, { w: 9, d: 9, y: y2 + h2 - 0.1, h: 0.9, a: C.paintGreen });
    buildHipRoof(f, {
      y0: y2 + h2 + 0.95,
      ew: 14.4,
      ed: 14.4,
      height: 5.4,
      ridge: 1.4,
      kind: 'green',
      tile: 2.1,
      curve: 1.45,
      finial: true,
    });
    return f;
  }

  /* ======================================================================
     御花园 · 万春亭 / 千秋亭
     ====================================================================== */
  function buildPavilion(scene, V, isEast) {
    const cx = isEast ? 21 : -21;
    const f = makeFrame(V, cx, -89, 0);
    const tier = [{ w: 13, d: 13, h: 1.2 }];
    const top = buildPlatform(f, { tiers: tier, gapFront: 6, baseY: Y, spouts: false });
    buildStairs(f, { z0: 6.5, topY: top, baseY: Y, width: 5, steps: 3, tread: 1.2, rampWidth: 0, sideRails: true });
    const y0 = top;
    f.box(0, y0 + 0.25, 0, 10.4, 0.5, 10.4, C.marbleMid);
    const h = 5.8;
    // 四角柱 + 后墙
    f.box(0, y0 + h / 2, -4.3, 8.8, h, 0.9, C.wallRed);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        f.box(sx * 3.9, y0 + h / 2, sz * 3.9, 1.1, h, 1.1, C.column);
        f.box(sx * 3.9, y0 + 0.5, sz * 3.9, 1.6, 0.5, 1.6, C.metalGold, { group: 'metal' });
      }
    }
    // 桌案
    f.box(0, y0 + 1.5, 0, 3.2, 0.5, 2.2, C.marbleLite);
    f.box(0, y0 + 0.8, 0, 1.4, 1.2, 1.2, C.marbleDark);
    // 坐凳栏杆
    for (const sz of [-1, 1]) {
      f.box(0, y0 + 0.8, sz * 4.65, 7.6, 0.35, 0.7, C.marbleLite);
    }
    for (const sx of [-1, 1]) {
      f.box(sx * 4.65, y0 + 0.8, 0, 0.7, 0.35, 7.6, C.marbleLite);
    }
    // 挂落
    for (let i = -2; i <= 2; i++) {
      f.box(i * 1.7, y0 + h - 0.6, 4.4, 0.18, 0.8, 0.18, C.metalGold, { group: 'metal' });
    }
    f.box(0, y0 + h - 0.2, 4.45, 8.4, 0.4, 0.5, C.metalGold, { group: 'metal' });
    // 匾
    addPlaque(scene, f, { text: isEast ? '万春亭' : '千秋亭', lx: 0, ly: y0 + h * 0.82, lz: 4.55, w: 3.0, h: 1.3, tone: 'green' });
    // 斗拱 + 攒尖顶
    buildDougong(f, { w: 9, d: 9, y: y0 + h - 0.1, h: 0.85, a: C.paintTeal });
    buildHipRoof(f, {
      y0: y0 + h + 0.75,
      ew: 12.8,
      ed: 12.8,
      height: 4.6,
      ridge: 1.2,
      kind: 'green',
      tile: 1.9,
      curve: 1.4,
      finial: true,
    });
    return f;
  }

  /* ======================================================================
     宫墙 / 角楼 / 华表 / 前广场
     ====================================================================== */
  /**
   * 宫墙段
   * horizontal=true: 沿 x 从 x0 到 x1，z 固定；否则沿 z 从 z0 到 z1，x 固定
   */
  function buildWallSegment(V, x0, z0, x1, z1, horizontal) {
    const h = 9.0;
    const t = 4.0;
    const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = horizontal ? (x0 + x1) / 2 : x0;
    const cz = horizontal ? z0 : (z0 + z1) / 2;
    if (horizontal) {
      V.addBox(cx, Y + 0.5, cz, len, 1.0, t + 1.2, C.marbleMid);
      V.addBox(cx, Y + 1.0 + (h - 1.0) / 2, cz, len, h - 1.0, t, C.wallRed, { jitter: 0.015 });
      V.addBox(cx, Y + h + 0.35, cz, len + 0.5, 0.7, t + 2.2, C.goldDeep);
      V.addBox(cx, Y + h + 1.15, cz, len + 0.2, 0.8, t + 1.0, C.gold);
      V.addBox(cx, Y + h + 1.8, cz, len + 0.4, 0.35, t + 0.3, C.goldRidge);
      const n = Math.max(1, Math.round(len / 7));
      for (let i = 1; i < n; i++) {
        const px = Math.min(x0, x1) + (len * i) / n;
        V.addBox(px, Y + h * 0.55, cz + t / 2 + 0.1, 0.5, h * 0.75, 0.2, C.wallRedDark);
        V.addBox(px, Y + h * 0.55, cz - t / 2 - 0.1, 0.5, h * 0.75, 0.2, C.wallRedDark);
      }
    } else {
      V.addBox(cx, Y + 0.5, cz, t + 1.2, 1.0, len, C.marbleMid);
      V.addBox(cx, Y + 1.0 + (h - 1.0) / 2, cz, t, h - 1.0, len, C.wallRed, { jitter: 0.015 });
      V.addBox(cx, Y + h + 0.35, cz, t + 2.2, 0.7, len + 0.5, C.goldDeep);
      V.addBox(cx, Y + h + 1.15, cz, t + 1.0, 0.8, len + 0.2, C.gold);
      V.addBox(cx, Y + h + 1.8, cz, t + 0.3, 0.35, len + 0.4, C.goldRidge);
      const n = Math.max(1, Math.round(len / 7));
      for (let i = 1; i < n; i++) {
        const pz = Math.min(z0, z1) + (len * i) / n;
        V.addBox(cx + t / 2 + 0.1, Y + h * 0.55, pz, 0.2, h * 0.75, 0.5, C.wallRedDark);
        V.addBox(cx - t / 2 - 0.1, Y + h * 0.55, pz, 0.2, h * 0.75, 0.5, C.wallRedDark);
      }
    }
  }

  function buildCornerTower(scene, V, x, z) {
    const f = makeFrame(V, x, z, 0);
    const y0 = Y + 10.8;
    f.box(0, y0 + 0.6, 0, 9, 1.2, 9, C.marbleMid);
    f.box(0, y0 + 2.0, 0, 6.6, 3.0, 6.6, C.wallRed);
    buildDougong(f, { w: 6.6, d: 6.6, y: y0 + 3.4, h: 0.7, a: C.paintTeal });
    buildHipRoof(f, {
      y0: y0 + 4.4,
      ew: 10,
      ed: 10,
      height: 3.6,
      ridge: 1.2,
      kind: 'green',
      tile: 1.9,
      curve: 1.4,
      finial: true,
    });
  }

  function buildHuabiao(V, x, z) {
    V.addBox(x, Y + 0.7, z, 4.2, 1.4, 4.2, C.marbleMid);
    V.addBox(x, Y + 2.0, z, 3.2, 1.2, 3.2, C.marble);
    V.addBox(x, Y + 9.0, z, 1.4, 13.2, 1.4, C.marbleLite, { jitter: 0.01 });
    V.addBox(x, Y + 12.4, z, 6.4, 0.8, 1.3, C.marble);
    V.addBox(x, Y + 14.2, z, 4.4, 0.7, 1.1, C.marble);
    V.addBox(x, Y + 16.0, z, 2.4, 1.0, 2.4, C.marbleLite);
    V.addBox(x, Y + 17.0, z, 1.5, 1.4, 1.6, C.marble);
    V.addBox(x + 0.7, Y + 17.9, z, 1.2, 0.9, 1.1, C.marbleDark);
  }

  /* ======================================================================
     庭院 / 金水河 / 广场
     ====================================================================== */
  function buildCourtyard(scene, V) {
    // 宫内基础（顶面压到铺装之下，避免与砖面共面闪烁）
    V.addBox(0, -0.2, -19, 152, 1.0, 168, C.stone, { jitter: 0.01 });
    // 前广场基础
    V.addBox(0, -0.2, 84.5, 132, 1.0, 31, C.stone, { jitter: 0.01 });
    // 中央庭院铺砖
    const X0 = -62, X1 = 62, Z0 = -44, Z1 = 54;
    const inCanal = (x, z) => z > 46.5 && z < 55 && x > -53 && x < 53;
    for (let x = X0; x < X1; x += 2) {
      for (let z = Z0; z < Z1; z += 2) {
        if (inCanal(x + 1, z + 1)) continue;
        let col = (Math.floor((x + 62) / 2) + Math.floor((z + 44) / 2)) % 2 ? C.brick : C.brickAlt;
        let h = 0.2;
        // 御道
        if (Math.abs(x + 1) <= 6) col = C.imperialPath;
        if (Math.abs(x + 1) <= 6.0 && Math.abs(x + 1) > 4.6) col = C.pathEdge;
        // 横向石带
        if (Math.abs(((z + 44) % 12) - 6) < 0.7) col = C.brickDark;
        V.addBox(x + 1, Y - 0.1, z + 1, 2, h, 2, col, { jitter: 0.04 });
      }
    }
    // 御道边金线
    for (let z = -44; z < 46; z += 4) {
      mirrorPairWorld(V, 6.6, Y + 0.02, z + 2, 0.25, 0.06, 3.0, C.stoneDark);
    }
    // 庭院外缘压边
    V.addBox(0, Y - 0.2, 54, 128, 0.6, 2.0, C.stoneWarm);
    V.addBox(0, Y - 0.2, -45, 128, 0.6, 2.0, C.stoneWarm);
    for (const sx of [-1, 1]) {
      V.addBox(sx * 63, Y - 0.2, 5, 2.0, 0.6, 100, C.stoneWarm);
    }
    // 其余宫内地坪（4x4 粗砖）
    const fills = [
      [-74, 74, -99, -45],
      [-74, -62, -45, 54],
      [62, 74, -45, 54],
    ];
    fills.forEach(([xa, xb, za, zb]) => {
      for (let x = xa; x < xb; x += 4) {
        for (let z = za; z < zb; z += 4) {
          const col = (Math.floor(x / 4) + Math.floor(z / 4)) % 2 ? C.brickAlt : C.brickDark;
          V.addBox(x + 2, Y - 0.15, z + 2, 4, 0.3, 4, col, { jitter: 0.03 });
        }
      }
    });

    // 金水河
    const cz = 51;
    const halfW = 52;
    // 河床
    V.addBox(0, 0.0, cz, halfW * 2 + 4, 0.7, 9.8, C.stoneDark);
    // 驳岸
    for (const sz of [-1, 1]) {
      V.addBox(0, Y - 0.15, cz + sz * 4.6, halfW * 2 + 4, 0.9, 1.0, C.marbleDark);
      V.addBox(0, Y + 0.25, cz + sz * 5.0, halfW * 2 + 4, 1.3, 1.4, C.marble);
      V.addBox(0, Y + 0.95, cz + sz * 5.15, halfW * 2 + 4, 0.35, 1.7, C.marbleMid);
    }
    // 端头
    for (const sx of [-1, 1]) {
      V.addBox(sx * (halfW + 2.2), Y + 0.3, cz, 2.4, 1.5, 11, C.marble);
    }
    // 水面（低于庭院铺装）
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 2, 8.2, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x3f727a,
        roughness: 0.14,
        metalness: 0.12,
        transparent: true,
        opacity: 0.94,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.36, cz);
    water.receiveShadow = true;
    water.name = 'jinshui-water';
    scene.add(water);

    // 三座金水桥
    [{ x: 0, w: 14 }, { x: -24, w: 9 }, { x: 24, w: 9 }].forEach((br, bi) => {
      const zStart = cz - 5.6;
      const segs = 5;
      const segD = 11.2 / segs;
      for (let s = 0; s < segs; s++) {
        const t = (s + 0.5) / segs;
        const rise = 0.55 + Math.sin(t * Math.PI) * 0.62;
        const top = Y + rise;
        const zc = zStart + segD * (s + 0.5);
        V.addBox(br.x, (Y - 0.1 + top) / 2, zc, br.w, top - Y + 0.1, segD, s === 2 ? C.marbleLite : C.marble, { jitter: 0.015 });
        V.addBox(br.x, top + 0.08, zc, br.w + 0.5, 0.18, segD, C.marbleMid);
      }
      // 桥栏
      for (const sx of [-1, 1]) {
        const bx = br.x + (sx * (br.w / 2 + 0.45));
        for (let s = 0; s < segs; s++) {
          const t = (s + 0.5) / segs;
          const rise = 0.55 + Math.sin(t * Math.PI) * 0.62;
          const zc = zStart + segD * (s + 0.5);
          V.addBox(bx, Y + rise + 1.1, zc, 0.62, 1.8, segD * 0.85, C.marbleLite);
          if (s % 2 === 0) V.addBox(bx, Y + rise + 2.1, zc, 1.0, 0.35, 1.0, C.marbleLite);
        }
      }
      // 桥头望柱
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          V.addBox(br.x + sx * (br.w / 2 + 0.5), Y + 1.5, cz + sz * 5.4, 0.9, 2.4, 0.9, C.marbleLite);
          V.addBox(br.x + sx * (br.w / 2 + 0.5), Y + 2.85, cz + sz * 5.4, 1.2, 0.4, 1.2, C.marbleLite);
        }
      }
    });

    // 前广场（午门外）
    const az0 = 73;
    const az1 = 96;
    for (let x = -58; x < 58; x += 4) {
      for (let z = az0; z < az1; z += 4) {
        const col = Math.abs(x + 2) < 7 ? C.imperialPath : (Math.floor(x / 4) + Math.floor(z / 4)) % 2 ? C.brick : C.brickAlt;
        V.addBox(x + 2, Y - 0.15, z + 2, 4, 0.3, 4, col, { jitter: 0.03 });
      }
    }
    // 广场台阶（下到外围地面）
    for (let k = 0; k < 4; k++) {
      V.addBox(0, Y - 0.1 - (k + 1) * 0.14, az1 + 1.0 + k * 1.2, 120 + k * 4, 0.28, 1.25, C.marbleMid);
    }
    // 华表
    buildHuabiao(V, -27, 84);
    buildHuabiao(V, 27, 84);
    // 石狮
    for (const sx of [-1, 1]) {
      const lx = sx * 13;
      V.addBox(lx, Y + 1.0, 78.5, 4.2, 2.0, 4.2, C.marble);
      V.addBox(lx, Y + 2.4, 78.5, 3.0, 1.0, 3.0, C.stoneDark);
      V.addBox(lx, Y + 3.6, 78.5, 2.6, 1.8, 3.2, C.stone);
      V.addBox(lx, Y + 4.9, 79.2, 2.4, 1.6, 2.2, C.stoneDark);
      V.addBox(lx, Y + 5.9, 79.2, 1.7, 0.7, 1.6, C.stoneDark);
      V.addBox(lx + 1.5, Y + 5.0, 79.0, 0.6, 0.6, 0.6, C.goldDeep, { group: 'metal' });
      V.addBox(lx - 1.5, Y + 5.0, 79.0, 0.6, 0.6, 0.6, C.goldDeep, { group: 'metal' });
    }
  }

  function mirrorPairWorld(V, x, y, z, w, h, d, color) {
    V.addBox(x, y, z, w, h, d, color);
    V.addBox(-x, y, z, w, h, d, color);
  }

  function buildGardens(V) {
    // 御花园地坪
    V.addBox(0, Y - 0.45, -90, 144, 0.9, 18, C.earth, { jitter: 0.02 });
    // 卵石 / 草皮拼块
    const rng = VP.mulberry32(707);
    for (let i = 0; i < 220; i++) {
      const x = -68 + rng() * 136;
      const z = -98 + rng() * 14;
      // 避开双亭
      if (Math.abs(x - 21) < 9 && Math.abs(z + 89) < 9) continue;
      if (Math.abs(x + 21) < 9 && Math.abs(z + 89) < 9) continue;
      const col = rng() > 0.5 ? C.grassDark : C.grass;
      V.addBox(x, Y - 0.02, z, 1.6 + rng() * 2.6, 0.18, 1.6 + rng() * 2.6, col, { jitter: 0.04 });
    }
    // 花径
    V.addBox(0, Y - 0.03, -90, 5, 0.15, 16, C.stoneWarm);
    V.addBox(0, Y - 0.02, -81.5, 60, 0.15, 4, C.stoneWarm);
    // 花圃矮墙
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        V.addBox(sx * 38, Y + 0.25, -90 + sz * 5.5, 14, 0.5, 1.0, C.marbleMid);
        V.addBox(sx * 38, Y + 0.25, -90 + sz * 5.5 - 0.8, 0.2, 0.4, 0.2, C.stoneDark);
      }
    }
  }

  function buildWalls(V) {
    // 前墙（宫门两侧）
    buildWallSegment(V, 24, 64, 76, 64, true);
    buildWallSegment(V, -76, 64, -24, 64, true);
    // 东西墙
    buildWallSegment(V, 76, 64, 76, -100, false);
    buildWallSegment(V, -76, 64, -76, -100, false);
    // 后墙
    buildWallSegment(V, -76, -100, 76, -100, true);
    // 角楼
    buildCornerTower(null, V, 76, 64);
    buildCornerTower(null, V, -76, 64);
    buildCornerTower(null, V, 76, -100);
    buildCornerTower(null, V, -76, -100);
  }

  /* ======================================================================
     建筑登记 / 视角
     ====================================================================== */
  const BUILDINGS = {
    main: {
      name: '太和殿',
      rank: '主殿 · 第一重',
      meta: '面阔九间 · 重檐庑殿顶 · 三台九阶',
      desc: '整座宫苑的视觉核心。三层汉白玉台基托起重檐大殿，金瓦朱柱、正脊鸱吻，四角飞檐起翘。东西配殿、钟鼓楼与宫门的高度被层层压低，只为此殿让出天际线。',
      key: 'main',
      view: { pos: [78, 47, 86], target: [0, 20, -18] },
    },
    rear: {
      name: '乾清宫',
      rank: '后寝 · 第二重',
      meta: '单檐庑殿顶 · 二重台基',
      desc: '前朝之后的内廷正殿，体量约为太和殿的六成。金色屋面在主轴尽头收束，台基退为两层，暗示从“朝”到“寝”的等级递降。',
      key: 'rear',
      view: { pos: [110, 45, -10], target: [0, 10, -66] },
    },
    gate: {
      name: '午门',
      rank: '宫门 · 第二重',
      meta: '城台三阙 · 五凤楼',
      desc: '宫苑的南向门户。高大的朱红城台开三座拱阙，城上中央门楼为重檐、两翼阙楼为攒尖，形成“五凤”之势；它是主轴序列的第一声鼓点。',
      key: 'gate',
      view: { pos: [36, 34, 175], target: [0, 15, 64] },
    },
    halls: {
      name: '东西配殿',
      rank: '从属 · 第三重',
      meta: '单檐庑殿顶 · 绿琉璃瓦',
      desc: '分列主殿两厢，各面阔七间，檐口高度刻意压至主殿一半以下。绿琉璃与金瓦形成清晰的等级对比，也让中央庭院获得围合与对称。',
      key: 'eastHall',
      view: { pos: [0, 82, 148], target: [0, 8, 10] },
    },
    towers: {
      name: '钟鼓楼',
      rank: '从属 · 第三重',
      meta: '二层楼阁 · 攒尖绿顶',
      desc: '钟楼在东、鼓楼在西，二层开敞，内悬铜钟、置红鼓。细长的楼身与攒尖顶在主轴两侧形成节奏，却始终不越过主殿的屋脊。',
      key: 'bellTower',
      view: { pos: [0, 36, 0], target: [47, 14, 38] },
    },
    garden: {
      name: '御花园 · 双亭',
      rank: '收束 · 第四重',
      meta: '万春亭 · 千秋亭',
      desc: '轴线尽端的后苑。万春、千秋二亭以绿琉璃攒尖顶对望，体量最小，林木与山石填补了宫墙与亭台之间的空隙。',
      key: 'gardenEast',
      view: { pos: [0, 55, -140], target: [0, 3, -88] },
    },
    eastHall: {
      name: '东配殿',
      rank: '从属 · 第三重',
      meta: '单檐庑殿顶 · 绿琉璃瓦',
      desc: '东厢配殿，面向庭院，绿瓦朱墙。它和西配殿一起把主殿的隆重从中轴扩散到庭院四周。',
      key: 'eastHall',
      view: { pos: [8, 24, 42], target: [45, 8, 6] },
    },
    westHall: {
      name: '西配殿',
      rank: '从属 · 第三重',
      meta: '单檐庑殿顶 · 绿琉璃瓦',
      desc: '西厢配殿，与东配殿左右相望。低矮的单檐屋顶衬托着主殿的重檐轮廓。',
      key: 'westHall',
      view: { pos: [-76, 22, 30], target: [-45, 8, 6] },
    },
    bellTower: {
      name: '钟楼',
      rank: '从属 · 第三重',
      meta: '东侧 · 二层攒尖顶',
      desc: '二层开敞，内悬铜钟。楼身收分，攒尖顶置宝顶，是宫苑里最纤细的一座建筑。',
      key: 'bellTower',
      view: { pos: [0, 36, 0], target: [47, 14, 38] },
    },
    drumTower: {
      name: '鼓楼',
      rank: '从属 · 第三重',
      meta: '西侧 · 二层攒尖顶',
      desc: '与钟楼对称而立的西侧楼阁，二层置鼓。晨钟暮鼓，构成宫苑的时间秩序。',
      key: 'drumTower',
      view: { pos: [0, 36, 0], target: [-47, 14, 38] },
    },
    gardenEast: {
      name: '万春亭',
      rank: '收束 · 第四重',
      meta: '御花园东 · 攒尖顶',
      desc: '后苑东亭，四角开敞，绿瓦攒尖，内置石桌。是整条主轴最后的轻盈句点。',
      key: 'gardenEast',
      view: { pos: [0, 55, -140], target: [21, 3, -88] },
    },
    gardenWest: {
      name: '千秋亭',
      rank: '收束 · 第四重',
      meta: '御花园西 · 攒尖顶',
      desc: '后苑西亭，与万春亭对峙，林木环抱，为宫苑收束出静谧的后场。',
      key: 'gardenWest',
      view: { pos: [0, 55, -140], target: [-21, 3, -88] },
    },
  };

  const OVERVIEW = {
    name: '九重宫阙',
    rank: '总览',
    meta: '中轴对称 · 前朝后寝 · 主次分明',
    desc: '九座体素殿宇依中轴铺展：金瓦重檐的太和殿居于三台之上，东西配殿、钟鼓楼与午门层层拱卫，御花园双亭收束于轴线末端。所有建筑以同一套体素尺度与材质语言营造，等级通过台基、开间、屋檐层数与屋面色彩被清晰写出。',
    view: { pos: [145, 68, 220], target: [0, 18, -4] },
  };

  /* ======================================================================
     拾取代理
     ====================================================================== */
  function addPick(scene, key, center, size) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center[0], center[1], center[2]);
    mesh.userData.pickKey = key;
    mesh.renderOrder = -1;
    scene.add(mesh);
    return mesh;
  }

  /* ======================================================================
     总装
     ====================================================================== */
  VP.PALACE_DATA = BUILDINGS;
  VP.OVERVIEW_DATA = OVERVIEW;

  VP.palace = {
    stats: { boxes: 0 },
    build(scene, V) {
      const before = V.count;
      buildMainHall(scene, V);
      buildRearHall(scene, V);
      buildGate(scene, V);
      buildSideHall(scene, V, true);
      buildSideHall(scene, V, false);
      buildTower(scene, V, true);
      buildTower(scene, V, false);
      buildPavilion(scene, V, true);
      buildPavilion(scene, V, false);
      buildWalls(V);
      buildCourtyard(scene, V);
      buildGardens(V);

      const picks = [];
      picks.push(addPick(scene, 'main', [0, 24, -18], [60, 48, 52]));
      picks.push(addPick(scene, 'rear', [0, 14, -66], [42, 28, 34]));
      picks.push(addPick(scene, 'gate', [0, 17, 64], [56, 36, 24]));
      picks.push(addPick(scene, 'eastHall', [47, 10, 6], [24, 22, 37]));
      picks.push(addPick(scene, 'westHall', [-47, 10, 6], [24, 22, 37]));
      picks.push(addPick(scene, 'bellTower', [47, 14, 38], [19, 26, 19]));
      picks.push(addPick(scene, 'drumTower', [-47, 14, 38], [19, 26, 19]));
      picks.push(addPick(scene, 'gardenEast', [21, 8, -89], [15, 18, 15]));
      picks.push(addPick(scene, 'gardenWest', [-21, 8, -89], [15, 18, 15]));

      this.stats.boxes = V.count - before;
      return { picks };
    },
  };
})();
