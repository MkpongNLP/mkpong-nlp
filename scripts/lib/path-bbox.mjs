// Independent SVG path measurement, used by scripts/check-logo.mjs.
//
// Deliberately NOT shared with logo/src/runtime.js: the checker must be able to
// disagree with the renderer. This module parses absolute path data (M L Q C Z)
// and solves real curve extrema for the bounding box.

const CMD_RE = /([MLQCZ])([^MLQCZ]*)/gi;
const NUM_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

export function parsePath(d) {
  const cmds = [];
  let m;
  CMD_RE.lastIndex = 0;
  while ((m = CMD_RE.exec(d)) !== null) {
    const type = m[1].toUpperCase();
    if (type === 'Z') { cmds.push({ type: 'Z' }); continue; }
    const a = (m[2].match(NUM_RE) || []).map(Number);
    if (a.some(n => !Number.isFinite(n))) throw new Error(`bad path data: ${m[0]}`);
    if (type === 'M' || type === 'L') cmds.push({ type, x: a[0], y: a[1] });
    else if (type === 'Q') cmds.push({ type, x1: a[0], y1: a[1], x: a[2], y: a[3] });
    else if (type === 'C') cmds.push({ type, x1: a[0], y1: a[1], x2: a[2], y2: a[3], x: a[4], y: a[5] });
  }
  if (!cmds.length) throw new Error('no path commands parsed');
  return cmds;
}

function quadExtremaTs(p0, p1, p2) {
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) < 1e-12) return [];
  const t = (p0 - p1) / denom;
  return (t > 0 && t < 1) ? [t] : [];
}

function cubicExtremaTs(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter(t => t > 0 && t < 1);
}

const qAt = (p0, p1, p2, t) => { const u = 1 - t; return u * u * p0 + 2 * u * t * p1 + t * t * p2; };
const cAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** True bounding box of one path's `d` (curve extrema solved, not control hulls). */
export function pathBBox(d) {
  const cmds = parsePath(d);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let cx = 0, cy = 0, startX = 0, startY = 0;
  const hit = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const c of cmds) {
    if (c.type === 'M') {
      cx = startX = c.x; cy = startY = c.y;
      hit(cx, cy);
    } else if (c.type === 'L') {
      cx = c.x; cy = c.y;
      hit(cx, cy);
    } else if (c.type === 'Q') {
      hit(c.x, c.y);
      for (const t of [...quadExtremaTs(cx, c.x1, c.x), ...quadExtremaTs(cy, c.y1, c.y)]) {
        hit(qAt(cx, c.x1, c.x, t), qAt(cy, c.y1, c.y, t));
      }
      cx = c.x; cy = c.y;
    } else if (c.type === 'C') {
      hit(c.x, c.y);
      for (const t of [...cubicExtremaTs(cx, c.x1, c.x2, c.x), ...cubicExtremaTs(cy, c.y1, c.y2, c.y)]) {
        hit(cAt(cx, c.x1, c.x2, c.x, t), cAt(cy, c.y1, c.y2, c.y, t));
      }
      cx = c.x; cy = c.y;
    } else if (c.type === 'Z') {
      cx = startX; cy = startY;
    }
  }
  if (!Number.isFinite(minX)) throw new Error('empty path');
  return [minX, minY, maxX, maxY];
}

/** Union of the bounding boxes of every <path> inside a group's markup.
 *  Stroke is expanded PER PATH (a stroked path only widens the union where it
 *  actually reaches the extremes), matching how the renderer measures. */
export function groupBBox(groupMarkup) {
  const elements = [...groupMarkup.matchAll(/<path\b[^>]*\/>/g)].map(m => m[0]);
  if (!elements.length) throw new Error('group has no paths');
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const element of elements) {
    const d = /\sd="([^"]+)"/.exec(element);
    if (!d) throw new Error('path element without d attribute');
    const stroke = /stroke-width="([-\d.]+)"/.exec(element);
    const pad = stroke ? Number(stroke[1]) / 2 : 0;
    const b = pathBBox(d[1]);
    box = [
      Math.min(box[0], b[0] - pad),
      Math.min(box[1], b[1] - pad),
      Math.max(box[2], b[2] + pad),
      Math.max(box[3], b[3] + pad)
    ];
  }
  return box;
}

/** Pull the <g data-unit="...">...</g> blocks out of a rendered logo SVG. */
export function unitsOf(svg) {
  const out = {};
  const re = /<g class="mkpong-logo__([a-z]+)" data-unit="([a-z]+)" data-center-x="([-\d.]+)" data-bbox="([^"]+)">([\s\S]*?)<\/g>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    out[m[2]] = {
      kind: m[2],
      centerX: Number(m[3]),
      declaredBBox: m[4].split(/\s+/).map(Number),
      markup: m[5],
      paintRoles: [...m[5].matchAll(/data-role="([a-z]+)"/g)].map(x => x[1]),
    };
  }
  return out;
}

export function viewBoxOf(svg) {
  const m = /viewBox="([^"]+)"/.exec(svg);
  if (!m) throw new Error('no viewBox');
  return m[1].split(/\s+/).map(Number);
}

/** PNG pixel size straight from the IHDR chunk (no image library needed). */
export function pngSize(buffer) {
  const sig = buffer.slice(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
