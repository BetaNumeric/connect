/* global planck, CONNECT_LEVEL_DATA */
const BASE_WIDTH = 1024;
const BASE_HEIGHT = 768;
const LEVEL_INDEX_PATH = "data/levels/index.json";
const LEVEL_DATA_PATH = "data/levels/levels.json";
const LEVEL_FILES_DIR = "data/levels";
const EDITOR_TEST_LEVEL_KEY = "connect_editor_test_level_v1";
const EDITOR_TEST_QUERY_PARAM = "editor_test";
const MAX_PLAYER_NAME_LENGTH = 10;
const SCORE_KEY = "connect_scores_v1";
const PREVIEW_KEY = "connect_level_preview_";
const ID_RANDOM_RANGE = 1e9;

const COLOR_BLACK = 0;
const COLOR_WHITE = 255;
const COLOR_GRAY_MID = 127;
const COLOR_GRAY_LIGHT = 200;
const COLOR_SUCCESS_RGB = [0, 255, 0];
const COLOR_ERROR_RGB = [255, 0, 0];
const COLOR_PLAYER_A_RGB = [255, 255, 0];
const COLOR_PLAYER_B_RGB = [0, 0, 255];

const ALPHA_OPAQUE = 255;
const ALPHA_DIM = 127;

const MENU_LEVEL_CARD_GAP_PX = 5;
const MENU_DRAG_THRESHOLD_PX = 3;
const MENU_SCROLL_STEP_PX = 100;
const MENU_SCROLLBAR_BOTTOM_AREA_MIDPOINT = 0.5;
const LEVEL_PREVIEW_RENDER_WIDTH = Math.round(BASE_WIDTH);
const LEVEL_PREVIEW_RENDER_HEIGHT = Math.round((LEVEL_PREVIEW_RENDER_WIDTH * BASE_HEIGHT) / BASE_WIDTH);

const PARTICLE_LIFE_FRAMES = 80;
const PARTICLE_DAMPING = 0.93;
const PARTICLES_ON_CONNECT = 40;
const PARTICLES_ON_FAIL = 70;

const BOX_FIXTURE_DEF = { density: 0.2, friction: 0.3, restitution: 0.1 };
const CIRCLE_FIXTURE_DEF = { density: 0.5, friction: 0.2, restitution: 0.1 };
const DRAWN_LINE_FIXTURE_DEF = { density: 3, friction: 0.2, restitution: 0.01 };
const CUSTOM_SHAPE_CIRCLE_FIXTURE_DEF = { density: 0.1, friction: 0.2, restitution: 0 };
const ARC_BOX_FIXTURE_DEF = { density: 0.2, friction: 0.3, restitution: 0.1 };
const RIGID_GROUP_FIXTURE_DEF = { density: 0.2, friction: 0.3, restitution: 0.1 };
const ARC_BOX_SEGMENTS = 28;
const ARC_BOX_MAX_CUT = 0.95;
const ARC_SIDE_TOP = "top";
const ARC_SIDE_RIGHT = "right";
const ARC_SIDE_BOTTOM = "bottom";
const ARC_SIDE_LEFT = "left";
const DEFAULT_ROTOR_MOTOR_SPEED_DEG = 180;
const DEFAULT_ROTOR_MOTOR_DIRECTION = 1;
const DEFAULT_ROTOR_MOTOR_TORQUE = 1000000000;

let box2d;
let canvasRenderer;
// Lists for game objects and effects.
let circles = [], boxes = [], arcBoxes = [], rigidGroups = [], lines = [], rotors = [], particles = [], cShapes = [];
// List with coordinates of the currently drawn line and collision test points.
let linePos = [], linePosTest = [];
// Toggle physics, drawing permission, level completion, and debug info.
let physics = false, drawPermit = false, levelUp = false, info = false;
// Width of the drawn line and diameter of the balls.
let d = 0, circleR = 0;
// Location and size of the current button.
let buttonX = 0, buttonY = 0, buttonW = 0;
// Current level and game mode.
let level = 0, gameMode = 4;
let imgX = 0, imgY = 0, imgW = 0, imgH = 0, imgScroll = 0;
let selectedLevel = -1;
let levelDefs = [];
let levelData = null;
let levelImg = [];
let timeStart = 0, time = 0, totalLines = 0;
let minTime = 0, minLines = 0;
let playerMinTime = null, playerMinLines = null;
let runSetGlobalTimeRecord = false, runSetGlobalLineRecord = false;
let player = null;
let viewportScale = 1;
let isTouchDevice = false;
let playerNameFieldRect = { x: 0, y: 0, w: 0, h: 0 };
let playerPrevButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let playerNextButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let playerDeleteButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let menuButtonRect = { x: 0, y: 0, w: 0, h: 0 };
let menuButtonArmed = false;
let resetButtonArmed = false;
let menuDragMode = "none"; // "none" | "levels" | "scrollbar"
let menuDragMoved = false;
let menuDragStartX = 0;
let menuDragStartY = 0;
let menuScrollbarGrabOffsetX = 0;
let scoreStore = { rows: [], activeRowId: null };
let editorTestMode = false;

class B2D {
  // Adapter to mimic Processing's Box2D helper API in p5.js.
  constructor() {
    this.scale = 10;
    this.world = null;
  }
  createWorld() { this.world = planck.World(planck.Vec2(0, -20)); }
  step() { if (this.world) this.world.step(1 / 60, 8, 3); }
  pxToW(v) { return v / this.scale; }
  wToPx(v) { return v * this.scale; }
  p2w(x, y) {
    if (typeof x === "object") return planck.Vec2(x.x / this.scale, -x.y / this.scale);
    return planck.Vec2(x / this.scale, -y / this.scale);
  }
  w2p(v) { return createVector(v.x * this.scale, -v.y * this.scale); }
  getBodyPos(body) { return this.w2p(body.getPosition()); }
  destroy(body) { if (body && this.world) this.world.destroyBody(body); }
}

class Box {
  constructor(x, y, w, h, st, a = 0) {
    // Coordinates, size, and static/dynamic mode for a box body.
    this.x = x; this.y = y; this.w = w; this.h = h; this.st = st;
    this.a = Number(a) || 0;
    this.c = st ? color(COLOR_GRAY_LIGHT) : color(COLOR_GRAY_MID);
    this.body = box2d.world.createBody({ type: st ? "static" : "dynamic", position: box2d.p2w(x, y), angle: -radians(this.a) });
    this.body.createFixture(planck.Box(box2d.pxToW(w / 2), box2d.pxToW(h / 2)), { ...BOX_FIXTURE_DEF });
    this.body.setUserData(this);
  }
  contains(x, y, dia) {
    // Checks if coordinates are inside this box.
    const p = box2d.p2w(x, y);
    for (let f = this.body.getFixtureList(); f; f = f.getNext()) if (f.testPoint(p)) return true;
    return false;
  }
  delete() { box2d.destroy(this.body); }
  done() {
    const p = box2d.getBodyPos(this.body);
    if (p.x < -this.w * 2 || p.x > width + this.w * 2 || p.y > height + this.h * 2) { this.delete(); return true; }
    return false;
  }
  draw() {
    const p = box2d.getBodyPos(this.body);
    push(); translate(p.x, p.y); rotate(-this.body.getAngle()); noStroke(); fill(this.c); rect(0, 0, this.w, this.h); pop();
  }
}

function normalizeArcSide(side) {
  const s = String(side || "").toLowerCase();
  if (s === ARC_SIDE_RIGHT) return ARC_SIDE_RIGHT;
  if (s === ARC_SIDE_BOTTOM) return ARC_SIDE_BOTTOM;
  if (s === ARC_SIDE_LEFT) return ARC_SIDE_LEFT;
  return ARC_SIDE_TOP;
}

function clampArcCut(value) {
  return Math.max(0, Math.min(ARC_BOX_MAX_CUT, Number(value) || 0));
}

function normalizeRotorMotorSpeedDeg(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_ROTOR_MOTOR_SPEED_DEG;
  return Math.max(0, Math.abs(raw));
}

function normalizeRotorMotorDirection(value) {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "-1" || v === "ccw" || v === "counterclockwise" || v === "counter-clockwise" || v === "left") return -1;
    if (v === "1" || v === "cw" || v === "clockwise" || v === "right") return 1;
  }
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_ROTOR_MOTOR_DIRECTION;
  return raw < 0 ? -1 : 1;
}

function normalizeRotorMotorTorque(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_ROTOR_MOTOR_TORQUE;
  return Math.max(0, raw);
}

function getArcNormalSpan(w, h, side) {
  const s = normalizeArcSide(side);
  return s === ARC_SIDE_TOP || s === ARC_SIDE_BOTTOM ? h : w;
}

function positiveAngleSpan(start, end) {
  let span = (end - start) % (Math.PI * 2);
  if (span < 0) span += Math.PI * 2;
  return span;
}

function sampleArcThroughPoint(center, radius, startPoint, endPoint, targetPoint, segments = ARC_BOX_SEGMENTS) {
  const a1 = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
  const a2 = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
  const ccwSpan = positiveAngleSpan(a1, a2);
  const cwSpan = ccwSpan - Math.PI * 2;
  const ccwMid = a1 + ccwSpan / 2;
  const cwMid = a1 + cwSpan / 2;
  const ccwPoint = { x: center.x + Math.cos(ccwMid) * radius, y: center.y + Math.sin(ccwMid) * radius };
  const cwPoint = { x: center.x + Math.cos(cwMid) * radius, y: center.y + Math.sin(cwMid) * radius };
  const useCCW = dist(ccwPoint.x, ccwPoint.y, targetPoint.x, targetPoint.y) <= dist(cwPoint.x, cwPoint.y, targetPoint.x, targetPoint.y);
  const span = useCCW ? ccwSpan : cwSpan;

  const steps = Math.max(6, Math.round(segments));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const a = a1 + (span * i) / steps;
    points.push({
      x: center.x + Math.cos(a) * radius,
      y: center.y + Math.sin(a) * radius,
    });
  }
  return points;
}

function buildArcBoxLocalPoints(w, h, cut, side, segments = ARC_BOX_SEGMENTS) {
  const width = Math.max(1, Number(w) || 1);
  const height = Math.max(1, Number(h) || 1);
  const s = normalizeArcSide(side);
  const halfW = width / 2;
  const halfH = height / 2;
  const tl = { x: -halfW, y: -halfH };
  const tr = { x: halfW, y: -halfH };
  const br = { x: halfW, y: halfH };
  const bl = { x: -halfW, y: halfH };

  const normalSpan = s === ARC_SIDE_TOP || s === ARC_SIDE_BOTTOM ? height : width;
  const depth = clampArcCut(cut) * normalSpan;
  if (depth <= 1e-6) return [tl, tr, br, bl];

  let p1;
  let p2;
  let inward;
  if (s === ARC_SIDE_TOP) {
    p1 = tl;
    p2 = tr;
    inward = { x: 0, y: 1 };
  } else if (s === ARC_SIDE_RIGHT) {
    p1 = tr;
    p2 = br;
    inward = { x: -1, y: 0 };
  } else if (s === ARC_SIDE_BOTTOM) {
    p1 = br;
    p2 = bl;
    inward = { x: 0, y: -1 };
  } else {
    p1 = bl;
    p2 = tl;
    inward = { x: 1, y: 0 };
  }

  const chord = dist(p1.x, p1.y, p2.x, p2.y);
  const notchDepth = Math.max(0.0001, Math.min(depth, normalSpan * ARC_BOX_MAX_CUT));
  const radius = (chord * chord) / (8 * notchDepth) + notchDepth / 2;
  const centerOffset = radius - notchDepth;
  const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const center = {
    x: midpoint.x - inward.x * centerOffset,
    y: midpoint.y - inward.y * centerOffset,
  };
  const target = {
    x: midpoint.x + inward.x * notchDepth,
    y: midpoint.y + inward.y * notchDepth,
  };
  const arcPoints = sampleArcThroughPoint(center, radius, p1, p2, target, segments);

  if (s === ARC_SIDE_TOP) return [...arcPoints, br, bl];
  if (s === ARC_SIDE_RIGHT) return [tl, ...arcPoints, bl];
  if (s === ARC_SIDE_BOTTOM) return [tl, tr, ...arcPoints];
  return [tl, tr, br, ...arcPoints.slice(0, -1)];
}

function polygonAreaSigned(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function pointInTriangle2D(p, a, b, c) {
  const v0x = c.x - a.x;
  const v0y = c.y - a.y;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = p.x - a.x;
  const v2y = p.y - a.y;
  const den = v0x * v1y - v1x * v0y;
  if (Math.abs(den) < 1e-9) return false;
  const u = (v2x * v1y - v1x * v2y) / den;
  const v = (v0x * v2y - v2x * v0y) / den;
  return u >= 1e-8 && v >= 1e-8 && u + v <= 1 - 1e-8;
}

function triangulateSimplePolygon(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const verts = points
    .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (verts.length < 3) return [];

  const area = polygonAreaSigned(verts);
  if (Math.abs(area) < 1e-8) return [];
  const orientation = area > 0 ? 1 : -1;
  const indices = verts.map((_v, i) => i);
  const triangles = [];
  let guard = 0;

  while (indices.length > 3 && guard < 4000) {
    guard++;
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const prevIdx = indices[(i - 1 + indices.length) % indices.length];
      const currIdx = indices[i];
      const nextIdx = indices[(i + 1) % indices.length];
      const a = verts[prevIdx];
      const b = verts[currIdx];
      const c = verts[nextIdx];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross * orientation <= 1e-8) continue;

      let hasInnerPoint = false;
      for (let j = 0; j < indices.length; j++) {
        const testIdx = indices[j];
        if (testIdx === prevIdx || testIdx === currIdx || testIdx === nextIdx) continue;
        if (pointInTriangle2D(verts[testIdx], a, b, c)) {
          hasInnerPoint = true;
          break;
        }
      }
      if (hasInnerPoint) continue;

      triangles.push([a, b, c]);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
  }

  if (indices.length === 3) {
    triangles.push([verts[indices[0]], verts[indices[1]], verts[indices[2]]]);
  }
  return triangles;
}

class ArcBox {
  constructor(x, y, w, h, cut, side, st, a = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.cut = clampArcCut(cut);
    this.side = normalizeArcSide(side);
    this.st = st;
    this.a = Number(a) || 0;
    this.c = st ? color(COLOR_GRAY_LIGHT) : color(COLOR_GRAY_MID);
    this.localPoints = buildArcBoxLocalPoints(w, h, this.cut, this.side);
    this.body = box2d.world.createBody({ type: st ? "static" : "dynamic", position: box2d.p2w(x, y), angle: -radians(this.a) });
    const triangles = triangulateSimplePolygon(this.localPoints);
    if (triangles.length > 0) {
      for (const tri of triangles) {
        const verts = tri.map((v) => box2d.p2w(v.x, v.y));
        this.body.createFixture(planck.Polygon(verts), { ...ARC_BOX_FIXTURE_DEF });
      }
    } else {
      this.body.createFixture(planck.Box(box2d.pxToW(w / 2), box2d.pxToW(h / 2)), { ...ARC_BOX_FIXTURE_DEF });
    }
    this.body.setUserData(this);
  }
  contains(x, y) {
    const p = box2d.p2w(x, y);
    for (let f = this.body.getFixtureList(); f; f = f.getNext()) if (f.testPoint(p)) return true;
    return false;
  }
  delete() { box2d.destroy(this.body); }
  done() {
    const p = box2d.getBodyPos(this.body);
    if (p.x < -this.w * 2 || p.x > width + this.w * 2 || p.y > height + this.h * 2) { this.delete(); return true; }
    return false;
  }
  draw() {
    const p = box2d.getBodyPos(this.body);
    push();
    translate(p.x, p.y);
    rotate(-this.body.getAngle());
    noStroke();
    fill(this.c);
    beginShape();
    for (const v of this.localPoints) vertex(v.x, v.y);
    endShape(CLOSE);
    pop();
  }
}

function normalizeRigidGroupPart(rawPart) {
  if (!rawPart || typeof rawPart !== "object") return null;
  const t = String(rawPart.type || "").toLowerCase();
  const rawW = Number(rawPart.w);
  const rawH = Number(rawPart.h);
  const w = Math.max(1e-6, Number.isFinite(rawW) ? Math.abs(rawW) : 0.2);
  const h = Math.max(1e-6, Number.isFinite(rawH) ? Math.abs(rawH) : 0.05);
  if (t === "box") {
    return {
      type: "box",
      x: Number.isFinite(rawPart.x) ? rawPart.x : 0,
      y: Number.isFinite(rawPart.y) ? rawPart.y : 0,
      w,
      h,
      angle: Number.isFinite(rawPart.angle) ? rawPart.angle : 0,
    };
  }
  if (t === "arcbox") {
    return {
      type: "arcbox",
      x: Number.isFinite(rawPart.x) ? rawPart.x : 0,
      y: Number.isFinite(rawPart.y) ? rawPart.y : 0,
      w,
      h,
      cut: clampArcCut(rawPart.cut),
      side: normalizeArcSide(rawPart.side),
      angle: Number.isFinite(rawPart.angle) ? rawPart.angle : 0,
    };
  }
  if (t === "shape") {
    return {
      type: "shape",
      x: Number.isFinite(rawPart.x) ? rawPart.x : 0,
      y: Number.isFinite(rawPart.y) ? rawPart.y : 0,
      w,
      h,
      edges: Math.max(3, Number(rawPart.edges) || 6),
      angle: Number.isFinite(rawPart.angle) ? rawPart.angle : 0,
    };
  }
  return null;
}

function rotatePointXY(x, y, angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: x * c - y * s, y: x * s + y * c };
}

function rigidGroupPartRadiusPx(part) {
  if (!part) return 0;
  const px = Number(part.x) || 0;
  const py = Number(part.y) || 0;
  let localR = 0;
  if (part.type === "box" || part.type === "arcbox") {
    localR = Math.hypot((Number(part.w) || 0) / 2, (Number(part.h) || 0) / 2);
  } else if (part.type === "shape") {
    const e = Math.max(3, Number(part.edges) || 6);
    if (e > 8) localR = (Number(part.w) + Number(part.h)) / 2;
    else localR = Math.hypot(Number(part.w) || 0, Number(part.h) || 0);
  }
  return Math.hypot(px, py) + localR;
}

function drawRigidGroupPart(part) {
  push();
  translate(part.x, part.y);
  rotate(radians(Number(part.angle) || 0));
  if (part.type === "box") {
    rect(0, 0, part.w, part.h);
    pop();
    return;
  }
  if (part.type === "arcbox") {
    const pts = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.side);
    beginShape();
    for (const p of pts) vertex(p.x, p.y);
    endShape(CLOSE);
    pop();
    return;
  }
  if (part.type === "shape") {
    const e = Math.max(3, Number(part.edges) || 6);
    if (e <= 8) {
      beginShape();
      for (let i = 0; i < e; i++) {
        const a = radians(i * (360 / e));
        vertex(cos(a) * part.w, sin(a) * part.h);
      }
      endShape(CLOSE);
    } else {
      ellipse(0, 0, part.w + part.h, part.w + part.h);
    }
  }
  pop();
}

class RigidGroup {
  constructor(x, y, parts, st, a = 0) {
    this.x = x;
    this.y = y;
    this.st = Boolean(st);
    this.a = Number(a) || 0;
    this.c = this.st ? color(COLOR_GRAY_LIGHT) : color(COLOR_GRAY_MID);
    this.parts = (Array.isArray(parts) ? parts : [])
      .map(normalizeRigidGroupPart)
      .filter(Boolean);
    this.boundR = 0;
    for (const part of this.parts) this.boundR = Math.max(this.boundR, rigidGroupPartRadiusPx(part));
    if (this.boundR <= 0) this.boundR = 20;

    this.body = box2d.world.createBody({ type: this.st ? "static" : "dynamic", position: box2d.p2w(x, y), angle: -radians(this.a) });

    for (const part of this.parts) {
      if (part.type === "box") {
        const center = box2d.p2w(part.x, part.y);
        this.body.createFixture(
          planck.Box(box2d.pxToW(part.w / 2), box2d.pxToW(part.h / 2), center, -radians(Number(part.angle) || 0)),
          { ...RIGID_GROUP_FIXTURE_DEF }
        );
        continue;
      }

      if (part.type === "arcbox") {
        const local = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.side);
        const partAngle = radians(Number(part.angle) || 0);
        const transformed = local.map((p) => {
          const r = rotatePointXY(p.x, p.y, partAngle);
          return { x: r.x + part.x, y: r.y + part.y };
        });
        const tris = triangulateSimplePolygon(transformed);
        if (tris.length > 0) {
          for (const tri of tris) {
            const verts = tri.map((v) => box2d.p2w(v.x, v.y));
            this.body.createFixture(planck.Polygon(verts), { ...RIGID_GROUP_FIXTURE_DEF });
          }
        }
        continue;
      }

      if (part.type === "shape") {
        const e = Math.max(3, Number(part.edges) || 6);
        if (e <= 8) {
          const verts = [];
          const partAngle = radians(Number(part.angle) || 0);
          for (let i = 0; i < e; i++) {
            const a = radians(i * (360 / e));
            const vx = cos(a) * part.w;
            const vy = sin(a) * part.h;
            const r = rotatePointXY(vx, vy, partAngle);
            verts.push(box2d.p2w(r.x + part.x, r.y + part.y));
          }
          this.body.createFixture(planck.Polygon(verts), { ...RIGID_GROUP_FIXTURE_DEF });
        } else {
          const center = box2d.p2w(part.x, part.y);
          this.body.createFixture(planck.Circle(center, box2d.pxToW((part.w + part.h) / 2)), { ...RIGID_GROUP_FIXTURE_DEF });
        }
      }
    }

    // Fallback in case fixtures failed to build.
    if (!this.body.getFixtureList()) {
      this.body.createFixture(planck.Box(box2d.pxToW(10), box2d.pxToW(10)), { ...RIGID_GROUP_FIXTURE_DEF });
    }

    this.body.setUserData(this);
  }
  contains(x, y) {
    const p = box2d.p2w(x, y);
    for (let f = this.body.getFixtureList(); f; f = f.getNext()) if (f.testPoint(p)) return true;
    return false;
  }
  delete() { box2d.destroy(this.body); }
  done() {
    const p = box2d.getBodyPos(this.body);
    if (p.x < -this.boundR * 2 || p.x > width + this.boundR * 2 || p.y > height + this.boundR * 2) { this.delete(); return true; }
    return false;
  }
  draw() {
    const p = box2d.getBodyPos(this.body);
    push();
    translate(p.x, p.y);
    rotate(-this.body.getAngle());
    noStroke();
    fill(this.c);
    for (const part of this.parts) drawRigidGroupPart(part);
    pop();
  }
}

class Circle {
  constructor(x, y, r, c) {
    // Coordinates, radius, and color for a dynamic circle body.
    this.x = x; this.y = y; this.r = r; this.c = c; this.pos = createVector(x, y);
    this.body = box2d.world.createBody({ type: "dynamic", position: box2d.p2w(x, y) });
    this.body.createFixture(planck.Circle(box2d.pxToW(r)), { ...CIRCLE_FIXTURE_DEF });
    this.body.setUserData(this);
  }
  delete() { box2d.destroy(this.body); }
  change() { this.c = color(...COLOR_SUCCESS_RGB); }
  contains(x, y, dia) {
    // Checks if coordinates are inside this circle.
    this.pos = box2d.getBodyPos(this.body);
    return dist(this.pos.x, this.pos.y, x, y) < this.r + dia / 2;
  }
  done() {
    const p = box2d.getBodyPos(this.body);
    if (p.x < -this.r * 2 || p.x > width + this.r * 2 || p.y > height + this.r * 2) { this.delete(); return true; }
    return false;
  }
  draw() {
    this.pos = box2d.getBodyPos(this.body);
    push(); translate(this.pos.x, this.pos.y); rotate(-this.body.getAngle()); if (info) fill(COLOR_GRAY_MID, ALPHA_DIM); else fill(this.c); noStroke(); ellipse(0, 0, this.r * 2, this.r * 2); if (info) { stroke(COLOR_BLACK); line(0, 0, this.r, 0); } pop();
  }
}

class LineBody {
  constructor(points, h) {
    // Width and height of the rectangles that compose the drawn line.
    this.h = h;
    // List of drawn coordinates.
    this.lineDot = points.map((p) => createVector(p.x, p.y));
    // List of body-local offsets for each coordinate.
    this.offset = [planck.Vec2(0, 0)];
    // List of center coordinates used to draw the connecting rectangles.
    this.center = [planck.Vec2(0, 0)];
    // List of segment vectors and per-segment angles.
    this.l = [planck.Vec2(0, 0)];
    this.angle = [0];

    this.body = box2d.world.createBody({ type: "dynamic", position: box2d.p2w(this.lineDot[0].x, this.lineDot[0].y) });
    // Creates one circle shape at the first coordinate.
    this.body.createFixture(planck.Circle(box2d.pxToW(this.h / 2)), { ...DRAWN_LINE_FIXTURE_DEF });

    const origin = box2d.p2w(this.lineDot[0].x, this.lineDot[0].y);
    for (let i = 1; i < this.lineDot.length; i++) {
      const o = box2d.p2w(this.lineDot[i].x, this.lineDot[i].y);
      const local = planck.Vec2(o.x - origin.x, o.y - origin.y);
      this.offset.push(local);

      const p1 = createVector(this.offset[i - 1].x, this.offset[i - 1].y);
      const p2 = createVector(this.offset[i].x, this.offset[i].y);
      p1.sub(p2);
      this.angle.push(p1.heading());

      const lv = planck.Vec2(this.offset[i - 1].x - this.offset[i].x, this.offset[i - 1].y - this.offset[i].y);
      this.l.push(lv);
      const w = Math.sqrt(lv.x * lv.x + lv.y * lv.y);
      const c = planck.Vec2((this.offset[i - 1].x + this.offset[i].x) * 0.5, (this.offset[i - 1].y + this.offset[i].y) * 0.5);
      this.center.push(c);

      this.body.createFixture(planck.Circle(this.offset[i], box2d.pxToW(this.h / 2)), { ...DRAWN_LINE_FIXTURE_DEF });
      this.body.createFixture(planck.Box(w / 2, box2d.pxToW(this.h / 2), c, this.angle[i]), { ...DRAWN_LINE_FIXTURE_DEF });
    }
    this.body.setUserData(this);
  }
  contains() {
    // Original sketch intentionally returned false for line-overlap blocking.
    return false;
  }
  delete() { box2d.destroy(this.body); }
  done() {
    // Checks if the line is farther off-screen than its max span.
    const p = box2d.getBodyPos(this.body);
    if (p.x < -width || p.x > width * 2 || p.y > height * 2) { this.delete(); return true; }
    return false;
  }
  draw() {
    // Draws line circles/rectangles according to Box2D physics.
    const pos = box2d.getBodyPos(this.body);
    push(); translate(pos.x, pos.y); rotate(-this.body.getAngle()); noStroke(); if (info) fill(COLOR_GRAY_MID, ALPHA_DIM); else fill(COLOR_GRAY_MID);
    // Draw first point.
    ellipse(box2d.wToPx(this.offset[0].x), -box2d.wToPx(this.offset[0].y), this.h, this.h);
    for (let i = 1; i < this.lineDot.length; i++) {
      const x = box2d.wToPx(this.center[i].x);
      const y = -box2d.wToPx(this.center[i].y);
      const w = box2d.wToPx(Math.sqrt(this.l[i].x * this.l[i].x + this.l[i].y * this.l[i].y));
      push(); translate(x, y); rotate(-this.angle[i]); rect(0, 0, w, this.h); pop();
      ellipse(box2d.wToPx(this.offset[i].x), -box2d.wToPx(this.offset[i].y), this.h, this.h);
    }
    pop();
  }
}

class CustomShape {
  constructor(x, y, w, h, e, st, a = 0) {
    // Location, size, edges (<=8 polygon, >8 circle), and static/dynamic mode.
    this.x = x; this.y = y; this.w = w; this.h = h; this.e = max(3, e); this.st = st;
    this.c = st ? color(COLOR_GRAY_LIGHT) : color(COLOR_GRAY_MID);
    this.a = Number(a) || 0;
    this.body = box2d.world.createBody({ type: st ? "static" : "dynamic", position: box2d.p2w(x, y), angle: -radians(this.a) });
    if (this.e <= 8) {
      const verts = [];
      for (let i = 0; i < this.e; i++) {
        const a = radians(i * (360 / this.e));
        const v = p5.Vector.fromAngle(a);
        verts.push(box2d.p2w(v.x * w, v.y * h));
      }
      this.body.createFixture(planck.Polygon(verts), 1);
    } else {
      this.body.createFixture(planck.Circle(box2d.pxToW((w + h) / 2)), { ...CUSTOM_SHAPE_CIRCLE_FIXTURE_DEF });
    }
    this.body.setUserData(this);
  }
  contains(x, y) {
    // Checks if coordinates are inside this shape.
    const p = box2d.p2w(x, y);
    for (let f = this.body.getFixtureList(); f; f = f.getNext()) if (f.testPoint(p)) return true;
    return false;
  }
  delete() { box2d.destroy(this.body); }
  done() {
    const p = box2d.getBodyPos(this.body);
    if (p.x < -this.w * 2 || p.x > width + this.w * 2 || p.y > height + this.h * 2) { this.delete(); return true; }
    return false;
  }
  draw() {
    const p = box2d.getBodyPos(this.body);
    push(); translate(p.x, p.y); rotate(-this.body.getAngle()); noStroke(); fill(this.c);
    if (this.e <= 8) {
      const f = this.body.getFixtureList();
      if (f && f.getShape().getType() === "polygon") {
        beginShape();
        for (const v of f.getShape().m_vertices) { const pv = box2d.w2p(v); vertex(pv.x, pv.y); }
        endShape(CLOSE);
      }
    } else ellipse(0, 0, this.w + this.h, this.w + this.h);
    pop();
  }
}

class Rotor {
  constructor(
    x,
    y,
    w,
    h,
    e,
    motor,
    a = 0,
    parts = [],
    motorSpeedDeg = DEFAULT_ROTOR_MOTOR_SPEED_DEG,
    motorDirection = DEFAULT_ROTOR_MOTOR_DIRECTION,
    motorTorque = DEFAULT_ROTOR_MOTOR_TORQUE
  ) {
    // Coordinates and size of the rotating core plus optional attached parts.
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.e = max(3, Number(e) || 4);
    this.a = Number(a) || 0;
    this.motor = Boolean(motor);
    this.motorSpeedDeg = normalizeRotorMotorSpeedDeg(motorSpeedDeg);
    this.motorDirection = normalizeRotorMotorDirection(motorDirection);
    this.motorTorque = normalizeRotorMotorTorque(motorTorque);
    this.parts = (Array.isArray(parts) ? parts : [])
      .map(normalizeRigidGroupPart)
      .filter(Boolean);

    const initialAngle = -radians(this.a);
    this.fixture = new Box(x, y, h / 2, h / 2, true);
    this.body = box2d.world.createBody({ type: "dynamic", position: box2d.p2w(x, y), angle: initialAngle });

    this.addCoreFixture();
    for (const part of this.parts) this.addPartFixture(part);
    if (!this.body.getFixtureList()) {
      this.body.createFixture(planck.Box(box2d.pxToW(10), box2d.pxToW(10)), { ...RIGID_GROUP_FIXTURE_DEF });
    }

    box2d.world.createJoint(planck.RevoluteJoint(
      {
        // Box2D/Planck positive angular velocity appears opposite to our screen-space clockwise label.
        motorSpeed: -radians(this.motorSpeedDeg) * this.motorDirection,
        maxMotorTorque: this.motorTorque,
        enableMotor: this.motor
      },
      this.fixture.body,
      this.body,
      this.fixture.body.getWorldCenter()
    ));
  }

  addCoreFixture() {
    if (this.e === 4) {
      this.body.createFixture(planck.Box(box2d.pxToW(this.w / 2), box2d.pxToW(this.h / 2)), { ...RIGID_GROUP_FIXTURE_DEF });
      return;
    }
    if (this.e <= 8) {
      const verts = [];
      for (let i = 0; i < this.e; i++) {
        const a = radians(i * (360 / this.e));
        verts.push(box2d.p2w(cos(a) * this.w, sin(a) * this.h));
      }
      this.body.createFixture(planck.Polygon(verts), { ...RIGID_GROUP_FIXTURE_DEF });
      return;
    }
    this.body.createFixture(planck.Circle(box2d.pxToW((this.w + this.h) / 2)), { ...RIGID_GROUP_FIXTURE_DEF });
  }

  addPartFixture(part) {
    if (part.type === "box") {
      const center = box2d.p2w(part.x, part.y);
      this.body.createFixture(
        planck.Box(box2d.pxToW(part.w / 2), box2d.pxToW(part.h / 2), center, -radians(Number(part.angle) || 0)),
        { ...RIGID_GROUP_FIXTURE_DEF }
      );
      return;
    }

    if (part.type === "arcbox") {
      const local = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.side);
      const partAngle = radians(Number(part.angle) || 0);
      const transformed = local.map((p) => {
        const r = rotatePointXY(p.x, p.y, partAngle);
        return { x: r.x + part.x, y: r.y + part.y };
      });
      const tris = triangulateSimplePolygon(transformed);
      if (tris.length > 0) {
        for (const tri of tris) {
          const verts = tri.map((v) => box2d.p2w(v.x, v.y));
          this.body.createFixture(planck.Polygon(verts), { ...RIGID_GROUP_FIXTURE_DEF });
        }
      }
      return;
    }

    if (part.type === "shape") {
      const e = Math.max(3, Number(part.edges) || 6);
      if (e <= 8) {
        const verts = [];
        const partAngle = radians(Number(part.angle) || 0);
        for (let i = 0; i < e; i++) {
          const a = radians(i * (360 / e));
          const vx = cos(a) * part.w;
          const vy = sin(a) * part.h;
          const r = rotatePointXY(vx, vy, partAngle);
          verts.push(box2d.p2w(r.x + part.x, r.y + part.y));
        }
        this.body.createFixture(planck.Polygon(verts), { ...RIGID_GROUP_FIXTURE_DEF });
      } else {
        const center = box2d.p2w(part.x, part.y);
        this.body.createFixture(planck.Circle(center, box2d.pxToW((part.w + part.h) / 2)), { ...RIGID_GROUP_FIXTURE_DEF });
      }
    }
  }

  contains(x, y, dia) {
    // Checks if coordinates are inside this rotor's fixtures.
    const samples = [{ x, y }];
    const r = (Number(dia) || 0) / 2;
    if (r > 0) {
      const d = r * 0.7071;
      samples.push({ x: x - r, y }, { x: x + r, y }, { x, y: y - r }, { x, y: y + r });
      samples.push({ x: x - d, y: y - d }, { x: x + d, y: y - d }, { x: x - d, y: y + d }, { x: x + d, y: y + d });
    }
    for (const s of samples) {
      const p = box2d.p2w(s.x, s.y);
      for (let f = this.body.getFixtureList(); f; f = f.getNext()) if (f.testPoint(p)) return true;
    }
    return false;
  }

  delete() {
    if (this.fixture) this.fixture.delete();
    if (this.body) box2d.destroy(this.body);
  }
  done() { return false; }
  draw() {
    const p = box2d.getBodyPos(this.body);
    push();
    translate(p.x, p.y);
    rotate(-this.body.getAngle());
    noStroke();
    fill(COLOR_GRAY_MID);
    if (this.e === 4) {
      rect(0, 0, this.w, this.h);
    } else if (this.e <= 8) {
      beginShape();
      for (let i = 0; i < this.e; i++) {
        const a = radians(i * (360 / this.e));
        vertex(cos(a) * this.w, sin(a) * this.h);
      }
      endShape(CLOSE);
    } else {
      ellipse(0, 0, this.w + this.h, this.w + this.h);
    }

    for (const part of this.parts) drawRigidGroupPart(part);
    pop();

    const a = box2d.w2p(this.fixture.body.getWorldCenter());
    if (this.motor) {
      const spin = degrees(-this.body.getAngle());
      drawRotorHubGear(a.x, a.y, this.h / 4, spin);
    } else {
      drawRotorHubCircle(a.x, a.y, this.h / 4);
    }
  }
}

class Particle {
  constructor(x, y, size, c) {
    // Diameter, lifetime, color, and velocity.
    this.life = PARTICLE_LIFE_FRAMES;
    this.ttl = this.life;
    this.d = random(size / 2, size * 2);
    this.c = c;
    this.location = createVector(x, y);
    this.velocity = createVector(random(size), random(-1, 1));
    this.velocity.rotate(random(radians(360)));
    this.alive = true;
  }
  move() {
    // Moves particles.
    this.location.add(this.velocity);
    this.velocity.mult(PARTICLE_DAMPING);
  }
  draw() {
    // Draws particles and decreases opacity depending on remaining lifetime.
    noStroke();
    const o = map(this.ttl, 0, this.life, 0, ALPHA_OPAQUE);
    fill(red(this.c), green(this.c), blue(this.c), o);
    ellipse(this.location.x, this.location.y, this.d, this.d);
    if (this.ttl > 0) this.ttl--; else this.alive = false;
  }
}

function preload() {
  // For direct file:// usage, consume embedded fallback data.
  const useScriptFallback =
    typeof window !== "undefined" &&
    window.location &&
    window.location.protocol === "file:" &&
    typeof CONNECT_LEVEL_DATA === "object" &&
    CONNECT_LEVEL_DATA;

  if (useScriptFallback) levelData = CONNECT_LEVEL_DATA;
}

function setup() {
  // Initial canvas, physics world, persistence, and UI setup.
  pixelDensity(1);
  canvasRenderer = createCanvas(BASE_WIDTH, BASE_HEIGHT);
  fitCanvasToWindow();
  rectMode(CENTER);
  imageMode(CENTER);
  box2d = new B2D();
  box2d.createWorld();

  editorTestMode = isEditorTestRequested();
  if (editorTestMode) {
    const editorData = loadEditorTestLevelData();
    if (editorData) levelData = editorData;
    else {
      console.warn("Editor test mode requested, but no valid test level payload was found.");
      editorTestMode = false;
    }
  }

  const hasJsonLevels = levelData && Array.isArray(levelData.levels) && levelData.levels.length > 0;
  if (!hasJsonLevels && typeof CONNECT_LEVEL_DATA === "object" && CONNECT_LEVEL_DATA) {
    levelData = CONNECT_LEVEL_DATA;
  }
  applyLoadedLevelData(levelData);
  generateDefaultPreviews();

  loadScores();
  loadStoredPreviews();
  circleR = width / 50;
  d = width / 100;
  buttonX = width / 2;
  buttonY = height / 2;
  buttonW = height / 4;
  const row = getActiveRow();
  if (row) player = row.name;
  // Detect touch-capable devices to adapt hit targets without changing visuals
  try { isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0); } catch (e) { isTouchDevice = false; }

  if (editorTestMode) {
    if (!player) player = "Editor Test";
    gameMode = 1;
    level = 0;
    loadLevel(false);
  }

  const canFetch = typeof window !== "undefined" && window.location && window.location.protocol !== "file:";
  if (canFetch && !editorTestMode) {
    reloadLevelDataFromSources()
      .then((data) => {
        if (!data || !Array.isArray(data.levels) || data.levels.length < 1) return;
        levelData = data;
        applyLoadedLevelData(levelData);
        generateDefaultPreviews();
        loadStoredPreviews();
        scoreStore.rows = scoreStore.rows.map(normalizeRow);
        if (level > getMaxLevelIndex()) level = 0;
        console.info(`Loaded ${getLevelCount()} levels from manifest/data files.`);
      })
      .catch((err) => {
        console.warn("Failed to load levels from sources:", err);
      });
  }
}

function windowResized() {
  fitCanvasToWindow();
}

function fitCanvasToWindow() {
  if (!canvasRenderer || !canvasRenderer.elt) return;
  viewportScale = Math.max(0.1, Math.min(windowWidth / BASE_WIDTH, windowHeight / BASE_HEIGHT));
  canvasRenderer.elt.style.width = `${Math.round(BASE_WIDTH * viewportScale)}px`;
  canvasRenderer.elt.style.height = `${Math.round(BASE_HEIGHT * viewportScale)}px`;
}

async function fetchJsonNoStore(path) {
  const resp = await fetch(path, { cache: "no-store" });
  if (!resp.ok) throw new Error(`${path} -> HTTP ${resp.status}`);
  return resp.json();
}

function isEditorTestRequested() {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const params = new URLSearchParams(window.location.search || "");
    return params.get(EDITOR_TEST_QUERY_PARAM) === "1";
  } catch {
    return false;
  }
}

function loadEditorTestLevelData() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(EDITOR_TEST_LEVEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.objects)) return null;
    return {
      version: 1,
      base: { width: BASE_WIDTH, height: BASE_HEIGHT },
      levels: [{ id: 0, objects: parsed.objects }],
    };
  } catch (err) {
    console.warn("Failed to parse editor test level payload:", err);
    return null;
  }
}

function resolveLevelFilePath(entry) {
  if (typeof entry !== "string") return null;
  if (entry.startsWith("http://") || entry.startsWith("https://") || entry.startsWith("/")) return entry;
  return `${LEVEL_FILES_DIR}/${entry}`;
}

async function loadLevelDataFromIndex() {
  const indexData = await fetchJsonNoStore(LEVEL_INDEX_PATH);
  const refs = Array.isArray(indexData?.levels) ? indexData.levels : [];
  if (refs.length < 1) throw new Error("index.json has no levels entries");

  const loadedLevels = await Promise.all(refs.map(async (ref, idx) => {
    let fileRef = "";
    let fallbackId = idx;
    if (typeof ref === "string") fileRef = ref;
    else if (ref && typeof ref === "object") {
      fileRef = String(ref.file ?? ref.path ?? ref.name ?? "");
      if (Number.isInteger(ref.id)) fallbackId = ref.id;
    }
    const filePath = resolveLevelFilePath(fileRef);
    if (!filePath) throw new Error(`Invalid level reference at index ${idx}`);
    const levelFile = await fetchJsonNoStore(filePath);
    return {
      id: Number.isInteger(levelFile?.id) ? levelFile.id : fallbackId,
      objects: Array.isArray(levelFile?.objects) ? levelFile.objects : [],
    };
  }));

  return {
    version: Number(indexData?.version) || 1,
    base: { width: BASE_WIDTH, height: BASE_HEIGHT },
    levels: loadedLevels,
  };
}

async function reloadLevelDataFromSources() {
  try {
    return await loadLevelDataFromIndex();
  } catch (err) {
    console.warn(`Failed to load ${LEVEL_INDEX_PATH}:`, err);
  }

  try {
    const legacy = await fetchJsonNoStore(LEVEL_DATA_PATH);
    if (legacy && Array.isArray(legacy.levels) && legacy.levels.length > 0) return legacy;
    throw new Error("Missing levels array");
  } catch (err) {
    console.warn(`Failed to load ${LEVEL_DATA_PATH}:`, err);
  }

  if (typeof CONNECT_LEVEL_DATA === "object" && CONNECT_LEVEL_DATA) return CONNECT_LEVEL_DATA;
  return null;
}

function getLevelCount() { return levelDefs.length; }
function getMaxLevelIndex() { return Math.max(0, getLevelCount() - 1); }

function applyLoadedLevelData(rawData) {
  levelDefs = normalizeLevelDefinitions(rawData);
  if (levelDefs.length < 1) levelDefs = [{ id: 0, objects: [] }];
  levelImg = new Array(levelDefs.length).fill(null);
  level = constrain(level, 0, getMaxLevelIndex());
}

function normalizeLevelDefinitions(rawData) {
  const sourceLevels = Array.isArray(rawData?.levels) ? rawData.levels : [];
  const indexed = [];
  for (let i = 0; i < sourceLevels.length; i++) {
    const srcLevel = sourceLevels[i];
    const id = Number.isInteger(srcLevel?.id) && srcLevel.id >= 0 ? srcLevel.id : i;
    const srcObjects = Array.isArray(srcLevel?.objects) ? srcLevel.objects : [];
    const objects = [];
    for (const rawObject of srcObjects) {
      const obj = normalizeLevelObject(rawObject);
      if (obj) objects.push(obj);
    }
    indexed[id] = { id, objects };
  }
  const out = [];
  for (let i = 0; i < indexed.length; i++) out.push(indexed[i] || { id: i, objects: [] });
  return out;
}

function normalizeLevelObject(rawObject) {
  if (!rawObject || typeof rawObject !== "object") return null;
  const t = String(rawObject.type || "").toLowerCase();
  if (t === "circle") {
    return {
      type: "circle",
      x: Number.isFinite(rawObject.x) ? rawObject.x : 0.5,
      y: Number.isFinite(rawObject.y) ? rawObject.y : 0.5,
      rScale: Number.isFinite(rawObject.rScale) ? rawObject.rScale : 1,
      color: rawObject.color === "B" ? "B" : "A",
    };
  }
  if (t === "box") {
    return {
      type: "box",
      x: Number.isFinite(rawObject.x) ? rawObject.x : 0.5,
      y: Number.isFinite(rawObject.y) ? rawObject.y : 0.5,
      w: Number.isFinite(rawObject.w) ? rawObject.w : 0.2,
      h: Number.isFinite(rawObject.h) ? rawObject.h : 0.05,
      angle: Number.isFinite(rawObject.angle) ? rawObject.angle : 0,
      static: Boolean(rawObject.static),
    };
  }
  if (t === "arcbox") {
    return {
      type: "arcbox",
      x: Number.isFinite(rawObject.x) ? rawObject.x : 0.5,
      y: Number.isFinite(rawObject.y) ? rawObject.y : 0.5,
      w: Number.isFinite(rawObject.w) ? rawObject.w : 0.2,
      h: Number.isFinite(rawObject.h) ? rawObject.h : 0.2,
      cut: clampArcCut(rawObject.cut),
      side: normalizeArcSide(rawObject.side),
      angle: Number.isFinite(rawObject.angle) ? rawObject.angle : 0,
      static: Boolean(rawObject.static),
    };
  }
  if (t === "rigid_group") {
    const rawParts = Array.isArray(rawObject.parts) ? rawObject.parts : [];
    const parts = [];
    for (const rawPart of rawParts) {
      const part = normalizeRigidGroupPart(rawPart);
      if (part) parts.push(part);
    }
    return {
      type: "rigid_group",
      x: Number.isFinite(rawObject.x) ? rawObject.x : 0.5,
      y: Number.isFinite(rawObject.y) ? rawObject.y : 0.5,
      angle: Number.isFinite(rawObject.angle) ? rawObject.angle : 0,
      static: Boolean(rawObject.static),
      parts,
    };
  }
  if (t === "shape") {
    return {
      type: "shape",
      x: Number.isFinite(rawObject.x) ? rawObject.x : 0.5,
      y: Number.isFinite(rawObject.y) ? rawObject.y : 0.5,
      w: Number.isFinite(rawObject.w) ? rawObject.w : 0.05,
      h: Number.isFinite(rawObject.h) ? rawObject.h : 0.05,
      edges: Math.max(3, Number(rawObject.edges) || 6),
      angle: Number.isFinite(rawObject.angle) ? rawObject.angle : 0,
      static: Boolean(rawObject.static),
    };
  }
  if (t === "rotor") {
    const rawParts = Array.isArray(rawObject.parts) ? rawObject.parts : [];
    const parts = [];
    for (const rawPart of rawParts) {
      const part = normalizeRigidGroupPart(rawPart);
      if (part) parts.push(part);
    }
    return {
      type: "rotor",
      x: Number.isFinite(rawObject.x) ? rawObject.x : 0.5,
      y: Number.isFinite(rawObject.y) ? rawObject.y : 0.5,
      w: Number.isFinite(rawObject.w) ? rawObject.w : 0.3,
      h: Number.isFinite(rawObject.h) ? rawObject.h : 0.05,
      edges: Math.max(3, Number(rawObject.edges) || 4),
      angle: Number.isFinite(rawObject.angle) ? rawObject.angle : 0,
      motor: Boolean(rawObject.motor),
      motorSpeed: normalizeRotorMotorSpeedDeg(rawObject.motorSpeed),
      motorDirection: normalizeRotorMotorDirection(rawObject.motorDirection),
      motorTorque: normalizeRotorMotorTorque(rawObject.motorTorque),
      parts,
    };
  }
  return null;
}

function generateDefaultPreviews() {
  // Draw default level previews directly from level geometry.
  for (let i = 0; i < levelImg.length; i++) {
    levelImg[i] = renderLevelPreview(levelDefs[i], i);
  }
}

function renderLevelPreview(def, index) {
  const g = createGraphics(LEVEL_PREVIEW_RENDER_WIDTH, LEVEL_PREVIEW_RENDER_HEIGHT);
  g.pixelDensity(1);
  g.rectMode(CENTER);
  g.background(COLOR_WHITE);

  const objects = Array.isArray(def?.objects) ? def.objects : [];
  const circlesLocal = objects.filter((o) => o.type === "circle");
  const boxesLocal = objects.filter((o) => o.type === "box");
  const arcBoxesLocal = objects.filter((o) => o.type === "arcbox");
  const rigidGroupsLocal = objects.filter((o) => o.type === "rigid_group");
  const shapesLocal = objects.filter((o) => o.type === "shape");
  const rotorsLocal = objects.filter((o) => o.type === "rotor");

  for (const obj of boxesLocal) drawPreviewBox(g, obj);
  for (const obj of arcBoxesLocal) drawPreviewArcBox(g, obj);
  for (const obj of rigidGroupsLocal) drawPreviewRigidGroup(g, obj);
  for (const obj of shapesLocal) drawPreviewShape(g, obj);
  for (const obj of rotorsLocal) drawPreviewRotor(g, obj);
  for (const obj of circlesLocal) drawPreviewCircle(g, obj);

  // Level label.
  g.noStroke();
  g.fill(COLOR_BLACK, 160);
  g.textAlign(LEFT, TOP);
  g.textSize(12);
  g.text(`L${index + 1}`, 6, 4);
  return g;
}

function drawPreviewCircle(g, obj) {
  const x = obj.x * g.width;
  const y = obj.y * g.height;
  const r = Math.max(1, obj.rScale * (g.width / 50));
  g.noStroke();
  if (obj.color === "B") g.fill(...COLOR_PLAYER_B_RGB);
  else g.fill(...COLOR_PLAYER_A_RGB);
  g.ellipse(x, y, r * 2, r * 2);
}

function drawPreviewBox(g, obj) {
  const x = obj.x * g.width;
  const y = obj.y * g.height;
  const w = obj.w * g.width;
  const h = obj.h * g.height;
  const angle = radians(Number(obj.angle) || 0);
  g.push();
  g.translate(x, y);
  g.rotate(angle);
  g.noStroke();
  if (obj.static) g.fill(COLOR_GRAY_LIGHT);
  else g.fill(COLOR_GRAY_MID);
  g.rect(0, 0, w, h);
  g.pop();
}

function drawPreviewShape(g, obj) {
  const x = obj.x * g.width;
  const y = obj.y * g.height;
  const w = obj.w * g.width;
  const h = obj.h * g.height;
  const edges = Math.max(3, Number(obj.edges) || 6);
  const angle = radians(Number(obj.angle) || 0);
  g.push();
  g.translate(x, y);
  g.rotate(angle);
  g.noStroke();
  if (obj.static) g.fill(COLOR_GRAY_LIGHT);
  else g.fill(COLOR_GRAY_MID);
  drawPreviewCustomShapePath(g, 0, 0, w, h, edges, false);
  g.pop();
}

function drawPreviewArcBox(g, obj) {
  const x = obj.x * g.width;
  const y = obj.y * g.height;
  const w = obj.w * g.width;
  const h = obj.h * g.height;
  const cut = clampArcCut(obj.cut);
  const side = normalizeArcSide(obj.side);
  const angle = radians(Number(obj.angle) || 0);
  const points = buildArcBoxLocalPoints(w, h, cut, side);

  g.push();
  g.translate(x, y);
  g.rotate(angle);
  g.noStroke();
  if (obj.static) g.fill(COLOR_GRAY_LIGHT);
  else g.fill(COLOR_GRAY_MID);
  g.beginShape();
  for (const p of points) g.vertex(p.x, p.y);
  g.endShape(CLOSE);
  g.pop();
}

function drawPreviewRigidGroup(g, obj) {
  const x = obj.x * g.width;
  const y = obj.y * g.height;
  const angle = radians(Number(obj.angle) || 0);
  const parts = Array.isArray(obj.parts) ? obj.parts : [];

  g.push();
  g.translate(x, y);
  g.rotate(angle);
  g.noStroke();
  if (obj.static) g.fill(COLOR_GRAY_LIGHT);
  else g.fill(COLOR_GRAY_MID);

  for (const rawPart of parts) {
    const part = normalizeRigidGroupPart(rawPart);
    if (!part) continue;
    const px = part.x * g.width;
    const py = part.y * g.height;
    const pw = part.w * g.width;
    const ph = part.h * g.height;
    const pa = radians(Number(part.angle) || 0);

    g.push();
    g.translate(px, py);
    g.rotate(pa);
    if (part.type === "box") {
      g.rect(0, 0, pw, ph);
    } else if (part.type === "arcbox") {
      const pts = buildArcBoxLocalPoints(pw, ph, part.cut, part.side);
      g.beginShape();
      for (const p of pts) g.vertex(p.x, p.y);
      g.endShape(CLOSE);
    } else if (part.type === "shape") {
      drawPreviewCustomShapePath(g, 0, 0, pw, ph, Math.max(3, Number(part.edges) || 6), false);
    }
    g.pop();
  }

  g.pop();
}

function drawPreviewRotor(g, obj) {
  const x = obj.x * g.width;
  const y = obj.y * g.height;
  const w = obj.w * g.width;
  const h = obj.h * g.height;
  const edges = Math.max(3, Number(obj.edges) || 4);
  const angle = radians(Number(obj.angle) || 0);
  const parts = Array.isArray(obj.parts) ? obj.parts : [];

  g.push();
  g.translate(x, y);
  g.rotate(angle);
  g.noStroke();
  g.fill(COLOR_GRAY_MID);
  drawPreviewCustomShapePath(g, 0, 0, w, h, edges, true);

  for (const rawPart of parts) {
    const part = normalizeRigidGroupPart(rawPart);
    if (!part) continue;
    const px = part.x * g.width;
    const py = part.y * g.height;
    const pw = part.w * g.width;
    const ph = part.h * g.height;
    const pa = radians(Number(part.angle) || 0);
    g.push();
    g.translate(px, py);
    g.rotate(pa);
    if (part.type === "box") {
      g.rect(0, 0, pw, ph);
    } else if (part.type === "arcbox") {
      const pts = buildArcBoxLocalPoints(pw, ph, part.cut, part.side);
      g.beginShape();
      for (const p of pts) g.vertex(p.x, p.y);
      g.endShape(CLOSE);
    } else if (part.type === "shape") {
      drawPreviewCustomShapePath(g, 0, 0, pw, ph, Math.max(3, Number(part.edges) || 6), false);
    }
    g.pop();
  }
  g.pop();

  if (Boolean(obj.motor)) {
    drawPreviewRotorHubGear(g, x, y, h / 4, Number(obj.angle) || 0);
  } else {
    drawPreviewRotorHubCircle(g, x, y, h / 4);
  }
}

function drawPreviewCustomShapePath(g, x, y, w, h, edges, forceBoxOnFour) {
  if (forceBoxOnFour && edges === 4) {
    g.rect(x, y, w, h);
    return;
  }
  if (edges <= 8) {
    g.beginShape();
    for (let i = 0; i < edges; i++) {
      const a = radians(i * (360 / edges));
      g.vertex(x + cos(a) * w, y + sin(a) * h);
    }
    g.endShape(CLOSE);
    return;
  }
  const d = w + h;
  g.ellipse(x, y, d, d);
}

function drawRotorHubCircle(x, y, radius) {
  noFill();
  strokeWeight(5);
  stroke(COLOR_GRAY_LIGHT);
  ellipse(x, y, radius * 2, radius * 2);
}

function drawRotorHubGear(x, y, radius, spinDeg = 0) {
  const outerR = max(4, radius * 1.03);
  const innerR = outerR * 0.78;
  const coreR = outerR * 0.45;
  const teeth = 9;

  push();
  translate(x, y);
  rotate(radians(spinDeg));
  noFill();
  stroke(COLOR_GRAY_LIGHT);
  strokeWeight(max(2, outerR * 0.22));
  beginShape();
  for (let i = 0; i < teeth * 2; i++) {
    const a = radians((360 / (teeth * 2)) * i);
    const rr = i % 2 === 0 ? outerR : innerR;
    vertex(cos(a) * rr, sin(a) * rr);
  }
  endShape(CLOSE);
  strokeWeight(max(1.5, outerR * 0.15));
  ellipse(0, 0, coreR * 2, coreR * 2);
  pop();
}

function drawPreviewRotorHubCircle(g, x, y, radius) {
  g.noFill();
  g.stroke(COLOR_GRAY_LIGHT);
  g.strokeWeight(2);
  g.ellipse(x, y, radius * 2, radius * 2);
}

function drawPreviewRotorHubGear(g, x, y, radius, spinDeg = 0) {
  const outerR = Math.max(2.5, radius * 1.03);
  const innerR = outerR * 0.78;
  const coreR = outerR * 0.45;
  const teeth = 9;

  g.push();
  g.translate(x, y);
  g.rotate(radians(spinDeg));
  g.noFill();
  g.stroke(COLOR_GRAY_LIGHT);
  g.strokeWeight(Math.max(1.2, outerR * 0.2));
  g.beginShape();
  for (let i = 0; i < teeth * 2; i++) {
    const a = radians((360 / (teeth * 2)) * i);
    const rr = i % 2 === 0 ? outerR : innerR;
    g.vertex(cos(a) * rr, sin(a) * rr);
  }
  g.endShape(CLOSE);
  g.strokeWeight(Math.max(1, outerR * 0.14));
  g.ellipse(0, 0, coreR * 2, coreR * 2);
  g.pop();
}

function draw() {
  // Main game loop.
  background(COLOR_WHITE);
  fill(COLOR_BLACK);
  if (info) {
    textSize(12);
    textAlign(LEFT);
    text(`fps: ${frameRate().toFixed(3)}, Box: ${boxes.length}, ArcB: ${arcBoxes.length}, Group: ${rigidGroups.length}, balls: ${circles.length}, lPos: ${linePos.length}, partic.: ${particles.length}, Rotor: ${rotors.length}, Line: ${lines.length}, all lines: ${totalLines}, test: ${linePosTest.length}, mode: ${gameMode}, Level: ${level + 1}`, 100, 20);
  }

  drawPermit = true;
  // Prohibits drawing lines outside of the screen.
  if (mouseX < d / 2 || mouseX > width - d / 2 || mouseY < d / 2 || mouseY > height - d / 2) drawPermit = false;
  if (gameMode !== 4) {
    if (physics) box2d.step();
    drawObjects();
  }

  if (gameMode === 0) drawStartMode();
  if (gameMode === 1) drawPlayMode(); else cursor(ARROW);
  if (gameMode === 2) drawResultMode();
  if ((gameMode === 1 && physics) || (gameMode === 2 && levelUp)) drawResetButton();
  if (gameMode === 0 || gameMode === 1 || gameMode === 2) drawGlobalMenuButton();
  if (gameMode === 4) drawLevelMenu();
  if (gameMode === 5) {
    if (editorTestMode) {
      level = 0;
    } else {
      saveLevelPreview(level);
      if (level < getMaxLevelIndex()) level++; else { level = 0; gameMode = 0; }
    }
    loadLevel(false);
  }
}

function drawStartMode() {
  // Draw level info and play button before entering drawing mode.
  noStroke();
  fill(COLOR_WHITE, ALPHA_DIM); noStroke(); rect(width / 2, height / 2, width, height);
  buttonX = width / 2; buttonY = height / 2; buttonW = height / 4;
  textAlign(CENTER); textSize(width / 20); fill(COLOR_BLACK); text(`Level: ${level + 1}`, width / 2, height / 5);
  textAlign(LEFT); textSize(width / 30);
  calcScore(level);
  const startScoreLines = [];
  if (playerMinLines !== null && minLines !== 0) startScoreLines.push(formatFewestScore(playerMinLines, minLines));
  if (playerMinTime !== null && minTime !== 0) startScoreLines.push(formatFastestScore(playerMinTime, minTime));
  drawCenteredLeftAlignedTextLines(width / 2, height - height / 4, startScoreLines, height / 12);
  drawPlayIcon(buttonX, buttonY, buttonW, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? COLOR_BLACK : COLOR_GRAY_MID);
}

function drawPlayMode() {
  // Active gameplay mode with drawing cursor and timer.
  if (!physics) timeStart = millis();
  // Always update the current time first so tests use an up-to-date value
  time = millis() - timeStart;
  if (physics) testConnection();
  noStroke();
  textAlign(CENTER); textSize(height / 30); fill(COLOR_BLACK); text(`${fmtSecs(time)}s`, width / 2, height / 25);

  if(!isTouchDevice)
    {
      if (!pointInRect(mouseX, mouseY, getMenuButtonRect(true))) noCursor();
      noStroke(); fill(COLOR_GRAY_MID); ellipse(mouseX, mouseY, d, d);
    }
  strokeWeight(d); stroke(COLOR_GRAY_MID, ALPHA_DIM);
  if (mouseIsPressed && linePos.length > 0) {
    const l = linePos[linePos.length - 1];
    line(mouseX, mouseY, l.x, l.y);
    if (info) {
      let dis = dist(l.x, l.y, mouseX, mouseY) / 10;
      noStroke(); fill(...COLOR_SUCCESS_RGB); ellipse(mouseX, mouseY, d, d); ellipse(l.x, l.y, d, d); fill(...COLOR_ERROR_RGB);
      for (let j = 0; j < dis - 1; j++) {
        const tx = l.x - ((l.x - mouseX) / dis) - ((l.x - mouseX) / dis) * j;
        const ty = l.y - ((l.y - mouseY) / dis) - ((l.y - mouseY) / dis) * j;
        ellipse(tx, ty, d / 2, d / 2);
      }
    }
  }
}

function drawResetButton() {
  // Draw reset button while in drawing mode with active physics.
  // Use visual rect for drawing, do not change global button variables
  const r = getResetButtonRect(false);
  const rx = r.x + r.w / 2;
  const ry = r.y + r.h / 2;
  const rw = r.w;
  if (gameMode === 1) testConnection();
  drawRetryIcon(rx, ry, rw, dist(mouseX, mouseY, rx, ry) < rw / 2 ? COLOR_BLACK : COLOR_GRAY_MID);
}

function getResetButtonRect(expand = false) {
  // Center used historically at (width - height/10, height/10) with diameter height/10
  const centerX = width - height / 10;
  const centerY = height / 10;
  const dia = height / 10;
  const rect = { x: centerX - dia / 2, y: centerY - dia / 2, w: dia, h: dia };
  if (!expand) return rect;
  if (isTouchDevice) {
    const pad = Math.max(20, width * 0.02);
    return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  }
  return rect;
}

function drawResultMode() {
  // Draw replay/next UI and level results after finish/failure.
  fill(COLOR_WHITE, ALPHA_DIM); noStroke(); rect(width / 2, height / 2, width, height);
  buttonX = width / 2; buttonY = height / 2; buttonW = height / 4;

  textAlign(CENTER); textSize(width / 20); fill(COLOR_BLACK);
  text(`Level: ${level + 1}`, width / 2, height / 5);
  text(levelUp ? "Complete!" : "Failed!", width / 2, height / 3);

  textAlign(LEFT); textSize(width / 30); calcScore(level);
  if (levelUp) {
    const bestLine = runSetGlobalLineRecord;
    const bestTime = runSetGlobalTimeRecord;
    const completeFewestLine = `${totalLines} ${totalLines > 1 ? "lines" : "line"}${bestLine ? ` (new record by ${player}!)` : ` (${formatFewestScore(playerMinLines, minLines)})`}`;
    const completeFastestLine = `${fmtSecs(time)}s${bestTime ? ` (new record by ${player}!)` : ` (${formatFastestScore(playerMinTime, minTime)})`}`;
    const completeScoreLeftX = getCenteredLeftAlignedBlockX(width / 2, [completeFewestLine, completeFastestLine]);
    fill(bestLine ? color(...COLOR_SUCCESS_RGB) : color(COLOR_BLACK));
    text(completeFewestLine, completeScoreLeftX, height - height / 4);
    fill(bestTime ? color(...COLOR_SUCCESS_RGB) : color(COLOR_BLACK));
    text(completeFastestLine, completeScoreLeftX, height - height / 6);
    drawNextIcon(buttonX, buttonY, buttonW, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? COLOR_BLACK : COLOR_GRAY_MID);
  } else {
    const failScoreLines = [];
    if (minLines !== 0 && playerMinLines !== null) failScoreLines.push(formatFewestScore(playerMinLines, minLines));
    if (minTime !== 0 && playerMinTime !== null) failScoreLines.push(formatFastestScore(playerMinTime, minTime));
    drawCenteredLeftAlignedTextLines(width / 2, height - height / 4, failScoreLines, height / 12);
    drawRetryIcon(buttonX, buttonY, buttonW, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? COLOR_BLACK : COLOR_GRAY_MID);
  }
}

function drawPlayTriangle(cx, cy, side) {
  const h = side * Math.sqrt(3) / 2;
  triangle(
    cx - h / 3, cy - side / 2,
    cx - h / 3, cy + side / 2,
    cx + (2 * h) / 3, cy
  );
}

function drawPlayIcon(x, y, size, shade) {
  push();
  translate(x, y);
  noStroke();
  fill(shade);
  const side = size * 0.62;
  drawPlayTriangle(0, 0, side);
  pop();
}

function drawRetryIcon(x, y, size, shade) {
  push();
  translate(x, y);
  rotate(radians(145));
  noFill();
  stroke(shade);
  strokeWeight(Math.max(2, size * 0.08));
  strokeCap(ROUND);
  const r = size * 0.3;
  const a0 = radians(75);
  const a1 = radians(360);
  arc(0, 0, r * 2, r * 2, a0, a1);
  const tipX = cos(a0) * r;
  const tipY = sin(a0) * r;
  const ah = size * 0.12;
  line(tipX, tipY, tipX - ah, tipY - ah );
  line(tipX, tipY, tipX - ah , tipY + ah);
  pop();
}

function drawNextIcon(x, y, size, shade) {
  push();
  translate(x, y);
  noStroke();
  fill(shade);
  const side = size * 0.56;
  drawPlayTriangle(-size * 0.1, 0, side);
  drawPlayTriangle(size * 0.2, 0, side);
  pop();
}

function drawLevelMenu() {
  // Draw scrollable level selection menu with player controls.
  background(COLOR_GRAY_LIGHT);
  drawMenuTopPlayerBar();
  strokeWeight(1);
  noStroke();
  imgW = width / 3; imgH = height / 3; imgX = imgScroll; imgY = height / 2;
  const levelPitch = getLevelCardPitch();
  const leadingGap = getLevelCardGap()/2;
  imgScroll = clampLevelScroll(imgScroll);
  if (menuDragMode !== "none") cursor(MOVE);
  else cursor(ARROW);

  selectedLevel = -1;
  tint(COLOR_WHITE, ALPHA_OPAQUE);
  for (let i = 0; i < levelImg.length; i++) {
    const cardLeft = imgX + leadingGap + levelPitch * i;
    const cardX = cardLeft + imgW / 2;
    const cardHover = (
      mouseX > cardLeft &&
      mouseX < cardLeft + imgW &&
      mouseY > imgY - imgH &&
      mouseY < imgY + imgH
    );
    if (cardHover) selectedLevel = i;

    fill(COLOR_WHITE);
    if (levelImg[i]) image(levelImg[i], cardX, imgY - imgH / 2, imgW, imgH);
    else rect(cardX, imgY - imgH / 2, imgW, imgH);
    fill(COLOR_GRAY_MID); rect(cardX, imgY + imgH / 2, imgW, imgH);
    calcScore(i);
    noStroke();
    textSize(imgW / 15); textAlign(LEFT); fill(COLOR_BLACK); text(`Level: ${i + 1}`, 3 + cardX, 2 + imgY - imgH + imgH / 20, imgW, imgH);
    textSize(imgW / 12); fill(COLOR_WHITE);
    if (minLines > 0 && minTime > 0 && playerMinLines && playerMinTime) {
      text(`${formatFewestScore(playerMinLines, minLines)}\n${formatFastestScore(playerMinTime, minTime)}`, 5 + cardX, 5 + imgY + imgH / 2, imgW - 5, imgH);
    } else text("fewest: -\nfastest: -", 5 + cardX, 5 + imgY + imgH / 2, imgW - 5, imgH);

    noFill();
    stroke(COLOR_BLACK);
    strokeWeight(cardHover ? 3 : 1);
    rect(cardX, imgY, imgW, imgH * 2);
    noStroke();
  }

  const scrollbar = getLevelScrollbarGeometry();
  noStroke();
  fill(COLOR_WHITE);
  rect(width / 2, scrollbar.trackY, width, scrollbar.track.h);
  fill(COLOR_GRAY_MID);
  rect(scrollbar.handle.x + scrollbar.handle.w / 2, scrollbar.trackY, scrollbar.handle.w, scrollbar.handle.h);
}

function drawMenuTopPlayerBar() {
  const names = getPlayerNames();
  const hasPlayer = player !== null;
  const canSwitch = names.length > 1;
  // Position the player controls centered within the top area of the menu
  const topAreaH = height / 6;
  const barH = height / 16;
  const barY = topAreaH / 2;
  const fieldW = canSwitch ? width * 0.42 : width * 0.5;
  const chevW = width * 0.06;
  const delW = width * 0.075;
  const gap = width * 0.012;
  const centerX = width / 2;
  const labelText = hasPlayer ? player : "Set Player Name";

  const fieldCx = centerX;
  const prevCx = fieldCx - fieldW / 2 - gap - chevW / 2;
  const nextCx = fieldCx + fieldW / 2 + gap + chevW / 2;
  const deleteCx = canSwitch
    ? nextCx + chevW / 2 + gap + delW / 2
    : fieldCx + fieldW / 2 + gap + delW / 2;

  playerNameFieldRect = {
    x: fieldCx - fieldW / 2,
    y: barY - barH / 2,
    w: fieldW,
    h: barH,
  };
  playerPrevButtonRect = canSwitch
    ? { x: prevCx - chevW / 2, y: barY - barH / 2, w: chevW, h: barH }
    : { x: -1, y: -1, w: 0, h: 0 };
  playerNextButtonRect = canSwitch
    ? { x: nextCx - chevW / 2, y: barY - barH / 2, w: chevW, h: barH }
    : { x: -1, y: -1, w: 0, h: 0 };
  playerDeleteButtonRect = hasPlayer
    ? { x: deleteCx - delW / 2, y: barY - barH / 2, w: delW, h: barH }
    : { x: -1, y: -1, w: 0, h: 0 };

  noStroke();
  const fieldHover = pointInRect(mouseX, mouseY, playerNameFieldRect);
  fill(255);
  strokeWeight(fieldHover ? 2 : 0);
  stroke(color(0));
  rect(fieldCx, barY, fieldW, barH, barH * 0.2);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(height / 34);
  fill(hasPlayer ? COLOR_BLACK : color(COLOR_GRAY_MID));
  text(labelText, fieldCx, barY);

  if (canSwitch) {
    const prevHover = pointInRect(mouseX, mouseY, playerPrevButtonRect);
    fill(prevHover ? color(COLOR_BLACK) : color(COLOR_GRAY_MID));
    rect(prevCx, barY, chevW, barH, barH * 0.2);
    stroke(COLOR_WHITE);
    strokeWeight(Math.max(2, barH * 0.09));
    noFill();
    const chevronHalfW = chevW * 0.14;
    const chevronHalfH = barH * 0.22;
    line(prevCx + chevronHalfW, barY - chevronHalfH, prevCx - chevronHalfW, barY);
    line(prevCx - chevronHalfW, barY, prevCx + chevronHalfW, barY + chevronHalfH);
    noStroke();

    const nextHover = pointInRect(mouseX, mouseY, playerNextButtonRect);
    fill(nextHover ? color(COLOR_BLACK) : color(COLOR_GRAY_MID));
    rect(nextCx, barY, chevW, barH, barH * 0.2);
    stroke(COLOR_WHITE);
    strokeWeight(Math.max(2, barH * 0.09));
    noFill();
    line(nextCx - chevronHalfW, barY - chevronHalfH, nextCx + chevronHalfW, barY);
    line(nextCx + chevronHalfW, barY, nextCx - chevronHalfW, barY + chevronHalfH);
    noStroke();
  }

  if (hasPlayer) {
    const deleteHover = pointInRect(mouseX, mouseY, playerDeleteButtonRect);
    fill(deleteHover ? color(COLOR_BLACK) : color(COLOR_GRAY_MID));
    rect(deleteCx, barY, delW, barH, barH * 0.2);
    stroke(COLOR_WHITE);
    strokeWeight(Math.max(2, barH * 0.09));
    noFill();
    const xHalfW = delW * 0.12;
    const xHalfH = barH * 0.2;
    line(deleteCx - xHalfW, barY - xHalfH, deleteCx + xHalfW, barY + xHalfH);
    line(deleteCx + xHalfW, barY - xHalfH, deleteCx - xHalfW, barY + xHalfH);
    noStroke();
  }
}

function pointInRect(px, py, rectData) {
  return (
    px >= rectData.x &&
    px <= rectData.x + rectData.w &&
    py >= rectData.y &&
    py <= rectData.y + rectData.h
  );
}

function getLevelCardGap() {
  return MENU_LEVEL_CARD_GAP_PX;
}

function getLevelCardPitch() {
  return imgW + getLevelCardGap();
}

function getLevelStripMinScroll() {
  const stripW = getLevelCardPitch() * getLevelCount();
  return Math.min(0, width - stripW);
}

function clampLevelScroll(value) {
  const minScroll = getLevelStripMinScroll();
  return constrain(value, minScroll, 0);
}

function getLevelScrollbarGeometry() {
  const menuBottomStartY = imgY + imgH;
  const bottomAreaHeight = height - menuBottomStartY;
  const trackY = menuBottomStartY + bottomAreaHeight * MENU_SCROLLBAR_BOTTOM_AREA_MIDPOINT;
  const trackH = height / 20;
  const trackPadding = height / 20;
  const minScroll = getLevelStripMinScroll();
  const handleW = height / 10;
  const handleH = height / 20;
  const handleCenterX = minScroll === 0 ? trackPadding : map(imgScroll, 0, minScroll, trackPadding, width - trackPadding);
  return {
    track: { x: 0, y: trackY - trackH / 2, w: width, h: trackH },
    handle: { x: handleCenterX - handleW / 2, y: trackY - handleH / 2, w: handleW, h: handleH },
    trackPadding,
    trackY,
    minScroll,
  };
}

function getMenuButtonRect(expand = false) {
  const w = width / 8;
  const h = height / 16;
  const x = width / 40;
  const y = height / 30;
  const rect = { x, y, w, h };
  if (!expand) return rect;
  // On touch devices, enlarge only the hit area (not visuals)
  if (isTouchDevice) {
    const padX = Math.max(20, width * 0.02);
    const padY = Math.max(20, height * 0.02);
    return { x: rect.x - padX, y: rect.y - padY, w: rect.w + padX * 2, h: rect.h + padY * 2 };
  }
  return rect;
}

function drawGlobalMenuButton() {
  // Use visual rect for drawing, don't expand visuals for touch devices
  menuButtonRect = getMenuButtonRect(false);
  const { x, y, w, h } = menuButtonRect;
  // For hover/hit detection use expanded rect on touch devices
  const hover = pointInRect(mouseX, mouseY, getMenuButtonRect(true));
  if (hover) cursor(HAND);
  noStroke();
  fill(COLOR_BLACK, hover ? ALPHA_OPAQUE : ALPHA_DIM);
  rect(x + w / 2, y + h / 2, w, h, h * 0.25);
  fill(COLOR_WHITE);
  textAlign(CENTER, CENTER);
  textSize(h * 0.52);
  text("Menu", x + w / 2, y + h / 2);
}

function enterMenu() {
  physics = false;
  linePos = [];
  linePosTest = [];
  gameMode = 4;
}

function getPlayerNames() {
  return Array.from(
    new Set(scoreStore.rows.map((row) => row.name).filter((name) => name && name.trim().length > 0))
  ).sort((a, b) => a.localeCompare(b));
}

function promptForPlayerName() {
  let seed = sanitizePlayerName(player || "");
  while (true) {
    const raw = window.prompt(`Enter player name (existing or new, max ${MAX_PLAYER_NAME_LENGTH} chars):`, seed);
    if (raw === null) return false;

    const trimmed = String(raw).trim();
    if (trimmed.length < 1) return false;
    if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
      window.alert(`Name too long. Use at most ${MAX_PLAYER_NAME_LENGTH} characters.`);
      seed = trimmed.slice(0, MAX_PLAYER_NAME_LENGTH);
      continue;
    }

    const name = trimmed;
    if (selectExistingPlayer(name)) return true;
    player = name;
    createScoreRow(name);
    return true;
  }
}

function cyclePlayer(direction = 1) {
  const names = getPlayerNames();
  if (names.length < 1) {
    promptForPlayerName();
    return;
  }

  const idx = names.indexOf(player);
  const nextIndex = idx >= 0 ? (idx + direction + names.length) % names.length : 0;
  selectExistingPlayer(names[nextIndex]);
}

function deleteCurrentPlayer() {
  if (!player) return false;
  if (!window.confirm(`Delete player "${player}" and all saved scores?`)) return false;

  scoreStore.rows = scoreStore.rows.filter((row) => row.name !== player);
  if (scoreStore.rows.length < 1) {
    scoreStore.activeRowId = null;
    player = null;
    saveScores();
    return true;
  }

  const remainingNames = getPlayerNames();
  if (remainingNames.length > 0) {
    selectExistingPlayer(remainingNames[0]);
  } else {
    scoreStore.activeRowId = scoreStore.rows[0].id;
    player = scoreStore.rows[0].name;
    saveScores();
  }
  return true;
}

function selectExistingPlayer(name) {
  for (let i = scoreStore.rows.length - 1; i >= 0; i--) {
    if (scoreStore.rows[i].name === name) {
      scoreStore.activeRowId = scoreStore.rows[i].id;
      saveScores();
      player = name;
      return true;
    }
  }
  return false;
}

function normalizeRow(row) {
  const scoreLen = Math.max(1, getLevelCount());
  const out = { id: String(row?.id ?? `${Date.now()}_${Math.floor(Math.random() * ID_RANDOM_RANGE)}`), name: sanitizePlayerName(String(row?.name ?? "Player")), timeScores: new Array(scoreLen).fill(0), lineScores: new Array(scoreLen).fill(0) };
  if (Array.isArray(row?.timeScores)) for (let i = 0; i < scoreLen; i++) out.timeScores[i] = Number(row.timeScores[i]) || 0;
  if (Array.isArray(row?.lineScores)) for (let i = 0; i < scoreLen; i++) out.lineScores[i] = Number(row.lineScores[i]) || 0;
  return out;
}

function loadScores() {
  // Load score table replacement from localStorage.
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    scoreStore.rows = Array.isArray(p.rows) ? p.rows.map(normalizeRow) : [];
    scoreStore.activeRowId = p.activeRowId ? String(p.activeRowId) : null;
    if (scoreStore.activeRowId && !scoreStore.rows.some((r) => r.id === scoreStore.activeRowId)) scoreStore.activeRowId = null;
  } catch {
    scoreStore = { rows: [], activeRowId: null };
  }
}

function saveScores() { localStorage.setItem(SCORE_KEY, JSON.stringify(scoreStore)); }
function createScoreRow(name) {
  // Add a new player session row.
  const scoreLen = Math.max(1, getLevelCount());
  const row = { id: `${Date.now()}_${Math.floor(Math.random() * ID_RANDOM_RANGE)}`, name: sanitizePlayerName(name), timeScores: new Array(scoreLen).fill(0), lineScores: new Array(scoreLen).fill(0) };
  scoreStore.rows.push(row); scoreStore.activeRowId = row.id; saveScores();
}
function getActiveRow() { return scoreStore.rows.find((r) => r.id === scoreStore.activeRowId) || null; }
function updateCurrentScore(lv, ms, lineCount) {
  // Save current level time and line count for the active row.
  const row = getActiveRow();
  if (!row) return;

  while (row.timeScores.length <= lv) row.timeScores.push(0);
  while (row.lineScores.length <= lv) row.lineScores.push(0);

  const prevTime = Number(row.timeScores[lv]) || 0;
  const prevLines = Number(row.lineScores[lv]) || 0;

  if (Number(ms) > 0 && (prevTime === 0 || ms < prevTime)) row.timeScores[lv] = ms;
  if (Number(lineCount) > 0 && (prevLines === 0 || lineCount < prevLines)) row.lineScores[lv] = lineCount;
  saveScores();
}
function calcScore(lv) {
  // Calculate best time and best line count for one level across all rows.
  lv = constrain(lv, 0, getMaxLevelIndex());
  minTime = 0; minLines = 0; playerMinTime = null; playerMinLines = null;
  let t = Infinity, l = Infinity;
  for (const row of scoreStore.rows) {
    const rt = Number(row.timeScores[lv]) || 0;
    const rl = Number(row.lineScores[lv]) || 0;
    if (rt > 0 && rt < t) { t = rt; playerMinTime = row.name; }
    if (rl > 0 && rl < l) { l = rl; playerMinLines = row.name; }
  }
  minTime = Number.isFinite(t) ? t : 0;
  minLines = Number.isFinite(l) ? l : 0;
}

function previewKey(i) { return `${PREVIEW_KEY}${i}`; }
function loadStoredPreviews() {
  // Load persisted level thumbnails from localStorage.
  for (let i = 0; i <= getMaxLevelIndex(); i++) {
    const data = localStorage.getItem(previewKey(i));
    if (data) loadImage(data, (img) => { levelImg[i] = img; }, () => {});
  }
}
function saveLevelPreview(i) {
  // Snapshot the current canvas as the level's preview image.
  if (!canvasRenderer) return;
  try {
    const data = canvasRenderer.elt.toDataURL("image/png");
    localStorage.setItem(previewKey(i), data);
    loadImage(data, (img) => { levelImg[i] = img; }, () => {});
  } catch {}
}

function fmtSecs(ms) { return (Number(ms) / 1000).toFixed(2); }

function sanitizePlayerName(value) {
  return String(value ?? "").trim().slice(0, MAX_PLAYER_NAME_LENGTH);
}

function formatFewestScore(playerName, lineCount) {
  return `fewest: ${playerName} [${lineCount} ${lineCount === 1 ? "line" : "lines"}]`;
}

function formatFastestScore(playerName, ms) {
  const sec = Number(fmtSecs(ms));
  return `fastest: ${playerName} [${fmtSecs(ms)}s]`;
}

function getCenteredLeftAlignedBlockX(centerX, lines) {
  if (!lines || lines.length < 1) return centerX;
  let maxWidth = 0;
  for (const line of lines) maxWidth = Math.max(maxWidth, textWidth(line));
  return centerX - maxWidth / 2;
}

function drawCenteredLeftAlignedTextLines(centerX, startY, lines, lineGap) {
  if (!lines || lines.length < 1) return;
  let maxWidth = 0;
  for (const line of lines) maxWidth = Math.max(maxWidth, textWidth(line));
  const leftX = centerX - maxWidth / 2;
  textAlign(LEFT);
  for (let i = 0; i < lines.length; i++) text(lines[i], leftX, startY + i * lineGap);
}

function testConnection() {
  /*
    Checks if the two balls have contact. On success it changes both to green,
    computes the midpoint, and spawns a green particle explosion.
  */
  if (circles.length <= 1) return;
  const a = box2d.getBodyPos(circles[0].body);
  const b = box2d.getBodyPos(circles[1].body);
  circles[0].pos = a.copy(); circles[1].pos = b.copy();
  if (p5.Vector.sub(b, a).mag() <= circleR * 2) {
    if (editorTestMode) {
      // Editor test runs should not update persistent records or previews.
      runSetGlobalLineRecord = true;
      runSetGlobalTimeRecord = true;
    } else {
      // Compare against pre-run global records, then persist personal bests.
      calcScore(level);
      runSetGlobalLineRecord = (minLines === 0 || totalLines < minLines);
      runSetGlobalTimeRecord = (minTime === 0 || time < minTime);
      updateCurrentScore(level, time, totalLines);
      saveLevelPreview(level);
    }
    circles[0].change(); circles[1].change();
    physics = false;
    const x = a.x - (a.x - b.x) / 2;
    const y = a.y - (a.y - b.y) / 2;
    for (let i = 0; i < PARTICLES_ON_CONNECT; i++) particles.push(new Particle(x, y, circleR / 2, circles[0].c));
    gameMode = 2;
    levelUp = true;
  }
}

function keyPressed() {
  // Toggles debug info and handles mode hotkeys.
  if (player !== null) {
    if (key === "I" || key === "i") info = !info;
    if (keyCode === ENTER) gameMode = 5;
    if (keyCode === ESCAPE) { enterMenu(); return false; }
  }
  return true;
}

function mousePressed() {
  // Adds first coordinate to linePos when the mouse is pressed.
  const menuRect = getMenuButtonRect(true);
  menuButtonArmed = (gameMode === 0 || gameMode === 1 || gameMode === 2) && pointInRect(mouseX, mouseY, menuRect);
  const resetRect = getResetButtonRect(true);
  resetButtonArmed = (gameMode === 1 || (gameMode === 2 && levelUp)) && pointInRect(mouseX, mouseY, resetRect);
  if (gameMode === 1 && (menuButtonArmed || resetButtonArmed)) return;
  if (gameMode === 2 && (menuButtonArmed || resetButtonArmed)) return;

  checkEdge();
  if (drawPermit && gameMode === 1) linePos.push(createVector(mouseX, mouseY));
  if (gameMode === 4) {
    menuDragMode = "none";
    menuDragMoved = false;
    menuDragStartX = mouseX;
    menuDragStartY = mouseY;
    menuScrollbarGrabOffsetX = 0;

    const scrollbar = getLevelScrollbarGeometry();
    const inTrack = pointInRect(mouseX, mouseY, scrollbar.track);
    if (inTrack) {
      menuDragMode = "scrollbar";
      const handleCenterX = scrollbar.handle.x + scrollbar.handle.w / 2;
      if (pointInRect(mouseX, mouseY, scrollbar.handle)) {
        menuScrollbarGrabOffsetX = mouseX - handleCenterX;
      }
      const clampedCenterX = constrain(mouseX - menuScrollbarGrabOffsetX, scrollbar.trackPadding, width - scrollbar.trackPadding);
      imgScroll = map(clampedCenterX, scrollbar.trackPadding, width - scrollbar.trackPadding, 0, scrollbar.minScroll);
      imgScroll = clampLevelScroll(imgScroll);
      return;
    }

    const inLevelStrip = mouseY <= imgY + imgH && mouseY >= imgY - imgH;
    if (inLevelStrip) {
      menuDragMode = "levels";
    }
  }
}

function mouseDragged() {
  // Adds coordinates to linePos while dragging.
  checkEdge();
  if (drawPermit && gameMode === 1) {
    if (linePos.length > 0) {
      const l = linePos[linePos.length - 1];
      if (dist(mouseX, mouseY, l.x, l.y) > d) linePos.push(createVector(mouseX, mouseY));
    } else linePos.push(createVector(mouseX, mouseY));
  }
  if (gameMode === 4) {
    if (menuDragMode === "levels") {
      imgScroll = clampLevelScroll(imgScroll + (mouseX - pmouseX));
    } else if (menuDragMode === "scrollbar") {
      const scrollbar = getLevelScrollbarGeometry();
      const clampedCenterX = constrain(mouseX - menuScrollbarGrabOffsetX, scrollbar.trackPadding, width - scrollbar.trackPadding);
      imgScroll = map(clampedCenterX, scrollbar.trackPadding, width - scrollbar.trackPadding, 0, scrollbar.minScroll);
      imgScroll = clampLevelScroll(imgScroll);
    }
    if (!menuDragMoved && dist(mouseX, mouseY, menuDragStartX, menuDragStartY) > MENU_DRAG_THRESHOLD_PX) menuDragMoved = true;
  }
}

function mouseWheel(e) {
  const c = e.deltaY === 0 ? 0 : Math.sign(e.deltaY);
  if (gameMode === 4 && c !== 0) imgScroll = clampLevelScroll(imgScroll + c * MENU_SCROLL_STEP_PX);
  return false;
}

function mouseClicked() {
  /*
    Checks if a button is clicked and reloads/selects level. This avoids
    accidental reset while drawing because release is handled separately.
  */
  if (gameMode === 4) {
    if (menuDragMoved) {
      menuDragMoved = false;
      return;
    }
    if (pointInRect(mouseX, mouseY, playerNameFieldRect)) {
      promptForPlayerName();
      return;
    }
    if (pointInRect(mouseX, mouseY, playerPrevButtonRect) && getPlayerNames().length > 1) {
      cyclePlayer(-1);
      return;
    }
    if (pointInRect(mouseX, mouseY, playerNextButtonRect) && getPlayerNames().length > 1) {
      cyclePlayer(1);
      return;
    }
    if (pointInRect(mouseX, mouseY, playerDeleteButtonRect) && player !== null) {
      deleteCurrentPlayer();
      return;
    }
  }

  if (mouseY < imgY + imgH && mouseY > imgY - imgH && gameMode === 4 && selectedLevel !== -1) {
    if (player === null && !promptForPlayerName()) return;
    level = selectedLevel;
    loadLevel(false);
    gameMode = 0;
  }
}

function mouseReleased() {
  /*
    If gameMode is 1, convert drawn coordinates into a physical line.
    Otherwise handle button clicks to reset/load level.
  */
  if (gameMode === 4) {
    menuDragMode = "none";
    menuScrollbarGrabOffsetX = 0;
  }

  if (
    (gameMode === 0 || gameMode === 1 || gameMode === 2) &&
    menuButtonArmed &&
    pointInRect(mouseX, mouseY, getMenuButtonRect(true))
  ) {
    enterMenu();
    menuButtonArmed = false;
    resetButtonArmed = false;
    return;
  }

  if (gameMode === 1) {
    let drewLine = false;
    if (linePos.length > 0) {
      lines.push(new LineBody(linePos, d));
      totalLines++;
      linePos = [];
      physics = true;
      drewLine = true;
    }
    if (
      !drewLine &&
      physics &&
      resetButtonArmed &&
      pointInRect(mouseX, mouseY, getResetButtonRect(true))
    ) {
      loadLevel(false);
    }
  } else if (gameMode === 2 && levelUp && resetButtonArmed && pointInRect(mouseX, mouseY, getResetButtonRect(true))) {
    loadLevel(false);
  } else if ((gameMode === 0 || gameMode === 2) && player !== null && dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2) loadLevel();
  resetButtonArmed = false;
  menuButtonArmed = false;
}

function touchStarted() {
  if (gameMode === 0 || gameMode === 1 || gameMode === 2 || gameMode === 4) {
    mousePressed();
    return false;
  }
}

function touchEnded() {
  if (gameMode === 0 || gameMode === 1 || gameMode === 2) {
    mouseReleased();
    return false;
  }
  if (gameMode === 4) {
    mouseClicked();
    return false;
  }
}

function checkEdge() {
  /*
    Checks if mouse or the segment to the last line coordinate goes inside
    or through another object.
  */
  linePosTest = [];
  if (linePos.length > 0) {
    const l = linePos[linePos.length - 1];
    linePosTest.push(l.copy());
    let dis = dist(l.x, l.y, mouseX, mouseY) / 10;
    for (let j = 0; j < dis - 1; j++) {
      const tx = l.x - ((l.x - mouseX) / dis) - ((l.x - mouseX) / dis) * j;
      const ty = l.y - ((l.y - mouseY) / dis) - ((l.y - mouseY) / dis) * j;
      linePosTest.push(createVector(tx, ty));
    }
  }
  for (const b of boxes) {
    if (b.contains(mouseX, mouseY, d)) drawPermit = false;
    for (const t of linePosTest) if (b.contains(t.x, t.y, d)) drawPermit = false;
  }
  for (const a of arcBoxes) {
    if (a.contains(mouseX, mouseY, d)) drawPermit = false;
    for (const t of linePosTest) if (a.contains(t.x, t.y, d)) drawPermit = false;
  }
  for (const g of rigidGroups) {
    if (g.contains(mouseX, mouseY, d)) drawPermit = false;
    for (const t of linePosTest) if (g.contains(t.x, t.y, d)) drawPermit = false;
  }
  for (const c of circles) {
    if (c.contains(mouseX, mouseY, d)) drawPermit = false;
    for (const t of linePosTest) if (c.contains(t.x, t.y, d)) drawPermit = false;
  }
  for (const r of rotors) {
    if (r.contains(mouseX, mouseY, d)) drawPermit = false;
    for (const t of linePosTest) if (r.contains(t.x, t.y, d)) drawPermit = false;
  }
  for (const s of cShapes) {
    if (s.contains(mouseX, mouseY)) drawPermit = false;
    for (const t of linePosTest) if (s.contains(t.x, t.y)) drawPermit = false;
  }
}

function loadLevel(advance = true) {
  // Deletes all level objects, resets variables, and (re)loads level content.
  if (advance && gameMode !== 4 && levelUp && !editorTestMode) level++;
  if (level > getMaxLevelIndex()) { if (player && !editorTestMode) createScoreRow(player); level = 0; }

  for (const o of circles) o.delete(); circles = [];
  for (const o of boxes) o.delete(); boxes = [];
  for (const o of arcBoxes) o.delete(); arcBoxes = [];
  for (const o of rigidGroups) o.delete(); rigidGroups = [];
  for (const o of cShapes) o.delete(); cShapes = [];
  for (const o of rotors) o.delete(); rotors = [];
  for (const o of lines) o.delete(); lines = [];

  linePos = []; linePosTest = []; totalLines = 0;
  runSetGlobalTimeRecord = false;
  runSetGlobalLineRecord = false;
  if (gameMode !== 4) gameMode = 1;
  buildLevel();
  physics = false;
  levelUp = false;
}

function drawObjects() {
  /*
    Draw boxes, circles, drawn coordinate line, physical lines, rotors, and
    explosion particles. Remove objects when deleted/out of bounds.
  */
  for (let i = boxes.length - 1; i >= 0; i--) { boxes[i].draw(); if (boxes[i].done()) boxes.splice(i, 1); }
  for (let i = arcBoxes.length - 1; i >= 0; i--) { arcBoxes[i].draw(); if (arcBoxes[i].done()) arcBoxes.splice(i, 1); }
  for (let i = rigidGroups.length - 1; i >= 0; i--) { rigidGroups[i].draw(); if (rigidGroups[i].done()) rigidGroups.splice(i, 1); }
  for (let i = circles.length - 1; i >= 0; i--) {
    circles[i].draw();
    if (circles[i].done()) {
      for (let j = 0; j < PARTICLES_ON_FAIL; j++) particles.push(new Particle(circles[i].pos.x, circles[i].pos.y, circleR, circles[i].c));
      circles.splice(i, 1);
      gameMode = 2;
    }
  }
  for (let i = cShapes.length - 1; i >= 0; i--) { cShapes[i].draw(); if (cShapes[i].done()) cShapes.splice(i, 1); }
  for (let i = 1; i < linePos.length; i++) { stroke(COLOR_GRAY_MID); strokeWeight(d); line(linePos[i].x, linePos[i].y, linePos[i - 1].x, linePos[i - 1].y); strokeWeight(1); }
  for (let i = lines.length - 1; i >= 0; i--) {
    lines[i].draw();
    if (lines[i].contains(mouseX, mouseY, d)) drawPermit = false;
    for (const t of linePosTest) if (lines[i].contains(t.x, t.y, d)) drawPermit = false;
    if (lines[i].done()) lines.splice(i, 1);
  }
  for (let i = rotors.length - 1; i >= 0; i--) { rotors[i].draw(); if (rotors[i].done()) rotors.splice(i, 1); }
  for (let i = particles.length - 1; i >= 0; i--) { particles[i].move(); particles[i].draw(); if (!particles[i].alive) particles.splice(i, 1); }
}
function buildLevel() {
  // Builds the current level from JSON definitions.
  const def = levelDefs[level];
  if (!def) {
    gameMode = 4;
    return;
  }

  for (const obj of def.objects) spawnLevelObject(obj);
}

function spawnLevelObject(obj) {
  if (!obj || typeof obj !== "object") return;
  if (obj.type === "circle") {
    const x = obj.x * width;
    const y = obj.y * height;
    const r = Math.max(1, obj.rScale * circleR);
    const c = obj.color === "B" ? color(...COLOR_PLAYER_B_RGB) : color(...COLOR_PLAYER_A_RGB);
    circles.push(new Circle(x, y, r, c));
    return;
  }

  if (obj.type === "box") {
    boxes.push(new Box(obj.x * width, obj.y * height, obj.w * width, obj.h * height, Boolean(obj.static), Number(obj.angle) || 0));
    return;
  }

  if (obj.type === "arcbox") {
    arcBoxes.push(new ArcBox(
      obj.x * width,
      obj.y * height,
      obj.w * width,
      obj.h * height,
      clampArcCut(obj.cut),
      normalizeArcSide(obj.side),
      Boolean(obj.static),
      Number(obj.angle) || 0
    ));
    return;
  }

  if (obj.type === "rigid_group") {
    const partsPx = [];
    const parts = Array.isArray(obj.parts) ? obj.parts : [];
    for (const rawPart of parts) {
      const part = normalizeRigidGroupPart(rawPart);
      if (!part) continue;
      partsPx.push({
        type: part.type,
        x: part.x * width,
        y: part.y * height,
        w: part.w * width,
        h: part.h * height,
        edges: Number(part.edges) || 6,
        cut: clampArcCut(part.cut),
        side: normalizeArcSide(part.side),
        angle: Number(part.angle) || 0,
      });
    }
    rigidGroups.push(new RigidGroup(
      obj.x * width,
      obj.y * height,
      partsPx,
      Boolean(obj.static),
      Number(obj.angle) || 0
    ));
    return;
  }

  if (obj.type === "shape") {
    cShapes.push(new CustomShape(obj.x * width, obj.y * height, obj.w * width, obj.h * height, obj.edges, Boolean(obj.static), Number(obj.angle) || 0));
    return;
  }

  if (obj.type === "rotor") {
    const partsPx = [];
    const parts = Array.isArray(obj.parts) ? obj.parts : [];
    for (const rawPart of parts) {
      const part = normalizeRigidGroupPart(rawPart);
      if (!part) continue;
      partsPx.push({
        type: part.type,
        x: part.x * width,
        y: part.y * height,
        w: part.w * width,
        h: part.h * height,
        edges: Number(part.edges) || 6,
        cut: clampArcCut(part.cut),
        side: normalizeArcSide(part.side),
        angle: Number(part.angle) || 0,
      });
    }
    rotors.push(new Rotor(
      obj.x * width,
      obj.y * height,
      obj.w * width,
      obj.h * height,
      obj.edges,
      Boolean(obj.motor),
      Number(obj.angle) || 0,
      partsPx,
      normalizeRotorMotorSpeedDeg(obj.motorSpeed),
      normalizeRotorMotorDirection(obj.motorDirection),
      normalizeRotorMotorTorque(obj.motorTorque)
    ));
  }
}

