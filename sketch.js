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
const ARC_SIDE_ORDER = [ARC_SIDE_TOP, ARC_SIDE_RIGHT, ARC_SIDE_BOTTOM, ARC_SIDE_LEFT];
const DRAW_COLLISION_STEP_FACTOR = 0.35;
const ROTOR_GEAR_TEETH = 9;
const ROTOR_GEAR_OUTER_SCALE = 1.03;
const ROTOR_GEAR_INNER_RATIO = 0.78;
const ROTOR_GEAR_CORE_RATIO = 0.45;
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
let levelDefaultImg = [];
let levelsLoadingFromSources = false;
let menuOpenPending = false;
let timeStart = 0, time = 0, totalLines = 0;
let minTime = 0, minLines = 0;
let playerMinTime = null, playerMinLines = null;
let runSetGlobalTimeRecord = false, runSetGlobalLineRecord = false;
let player = null;
let viewportScale = 1;
let isTouchDevice = false;
let touchInteractionInProgress = false;
let multiTouchBlockActive = false;
let activeTouchUiButton = null;
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
let htmlMenuUi = null;
let htmlMenuVisible = false;

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

function normalizeArcSideMaybe(side) {
  const s = String(side || "").toLowerCase();
  if (s === ARC_SIDE_TOP) return ARC_SIDE_TOP;
  if (s === ARC_SIDE_RIGHT) return ARC_SIDE_RIGHT;
  if (s === ARC_SIDE_BOTTOM) return ARC_SIDE_BOTTOM;
  if (s === ARC_SIDE_LEFT) return ARC_SIDE_LEFT;
  return null;
}

function normalizeArcSide(side) {
  return normalizeArcSideMaybe(side) || ARC_SIDE_TOP;
}

function normalizeArcSides(value, fallbackSide = ARC_SIDE_TOP) {
  const out = [];
  const seen = new Set();
  const pushSide = (raw) => {
    const side = normalizeArcSideMaybe(raw);
    if (!side || seen.has(side)) return;
    seen.add(side);
    out.push(side);
  };

  if (Array.isArray(value)) {
    for (const side of value) pushSide(side);
    return ARC_SIDE_ORDER.filter((side) => seen.has(side));
  }

  if (typeof value === "string") {
    const tokens = value.split(/[\s,|/]+/).filter(Boolean);
    if (tokens.length > 1) {
      for (const token of tokens) pushSide(token);
    } else {
      pushSide(value);
    }
    const ordered = ARC_SIDE_ORDER.filter((side) => seen.has(side));
    if (ordered.length > 0) return ordered;
    return fallbackSide == null ? [] : [normalizeArcSide(fallbackSide)];
  }

  if (value != null) {
    pushSide(value);
    const ordered = ARC_SIDE_ORDER.filter((side) => seen.has(side));
    if (ordered.length > 0) return ordered;
  }

  return fallbackSide == null ? [] : [normalizeArcSide(fallbackSide)];
}

function clampArcCut(value) {
  const raw = Number(value) || 0;
  return Math.max(-ARC_BOX_MAX_CUT, Math.min(ARC_BOX_MAX_CUT, raw));
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

function buildArcSidePoints(width, height, cut, side, segments = ARC_BOX_SEGMENTS) {
  const s = normalizeArcSide(side);
  const halfW = width / 2;
  const halfH = height / 2;
  const tl = { x: -halfW, y: -halfH };
  const tr = { x: halfW, y: -halfH };
  const br = { x: halfW, y: halfH };
  const bl = { x: -halfW, y: halfH };

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

  const depthAbs = Math.abs(clampArcCut(cut)) * getArcNormalSpan(width, height, s);
  if (depthAbs <= 1e-6) return [p1, p2];

  const chord = dist(p1.x, p1.y, p2.x, p2.y);
  // Keep sagitta under half the side length to avoid >180deg arcs that bulge outside the box.
  const maxByChord = Math.max(0.0001, chord * 0.4999);
  const notchDepth = Math.max(0.0001, Math.min(depthAbs, getArcNormalSpan(width, height, s) * ARC_BOX_MAX_CUT, maxByChord));
  const radius = (chord * chord) / (8 * notchDepth) + notchDepth / 2;
  const centerOffset = radius - notchDepth;
  const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const sign = clampArcCut(cut) >= 0 ? 1 : -1;
  const bulge = { x: inward.x * sign, y: inward.y * sign };
  const center = {
    x: midpoint.x - bulge.x * centerOffset,
    y: midpoint.y - bulge.y * centerOffset,
  };
  const target = {
    x: midpoint.x + bulge.x * notchDepth,
    y: midpoint.y + bulge.y * notchDepth,
  };
  return sampleArcThroughPoint(center, radius, p1, p2, target, segments);
}

function buildArcBoxLocalPoints(w, h, cut, sides, segments = ARC_BOX_SEGMENTS) {
  const width = Math.max(1, Number(w) || 1);
  const height = Math.max(1, Number(h) || 1);
  const sideList = normalizeArcSides(sides, ARC_SIDE_TOP);
  const activeSides = new Set(sideList);
  const halfW = width / 2;
  const halfH = height / 2;
  const tl = { x: -halfW, y: -halfH };
  const tr = { x: halfW, y: -halfH };
  const br = { x: halfW, y: halfH };
  const bl = { x: -halfW, y: halfH };

  const depth = clampArcCut(cut);
  if (Math.abs(depth) <= 1e-6 || activeSides.size < 1) return [tl, tr, br, bl];

  const out = [tl];
  const edges = [
    { side: ARC_SIDE_TOP, end: tr },
    { side: ARC_SIDE_RIGHT, end: br },
    { side: ARC_SIDE_BOTTOM, end: bl },
    { side: ARC_SIDE_LEFT, end: tl },
  ];
  for (const edge of edges) {
    if (!activeSides.has(edge.side)) {
      out.push(edge.end);
      continue;
    }
    const arcPoints = buildArcSidePoints(width, height, depth, edge.side, segments);
    for (let i = 1; i < arcPoints.length; i++) out.push(arcPoints[i]);
  }
  if (out.length > 1) {
    const last = out[out.length - 1];
    if (dist(last.x, last.y, tl.x, tl.y) < 1e-6) out.pop();
  }
  return out;
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
  constructor(x, y, w, h, cut, sides, st, a = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.cut = clampArcCut(cut);
    this.sides = normalizeArcSides(sides, ARC_SIDE_TOP);
    this.side = this.sides[0];
    this.st = st;
    this.a = Number(a) || 0;
    this.c = st ? color(COLOR_GRAY_LIGHT) : color(COLOR_GRAY_MID);
    this.localPoints = buildArcBoxLocalPoints(w, h, this.cut, this.sides);
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
    const sides = normalizeArcSides(rawPart.sides ?? rawPart.side, ARC_SIDE_TOP);
    return {
      type: "arcbox",
      x: Number.isFinite(rawPart.x) ? rawPart.x : 0,
      y: Number.isFinite(rawPart.y) ? rawPart.y : 0,
      w,
      h,
      cut: clampArcCut(rawPart.cut),
      sides,
      side: sides[0],
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
    const pts = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.sides ?? part.side);
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
        const local = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.sides ?? part.side);
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
    // Broad-phase radius around the body's origin for quick rejection.
    this.boundR = this.h / 2;
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
      this.boundR = Math.max(this.boundR, box2d.wToPx(Math.hypot(local.x, local.y)) + this.h / 2);

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
  containsPoint(x, y) {
    const p = box2d.p2w(x, y);
    for (let f = this.body.getFixtureList(); f; f = f.getNext()) if (f.testPoint(p)) return true;
    return false;
  }
  contains(x, y, dia = 0) {
    // Checks whether the point/brush overlaps this drawn line body.
    const brushR = Math.max(0, Number(dia) || 0) / 2;
    const pos = box2d.getBodyPos(this.body);
    const maxR = this.boundR + brushR;
    const dx = x - pos.x;
    const dy = y - pos.y;
    if (dx * dx + dy * dy > maxR * maxR) return false;

    if (this.containsPoint(x, y)) return true;
    if (brushR <= 0) return false;

    const dxy = brushR * 0.7071;
    if (this.containsPoint(x - brushR, y)) return true;
    if (this.containsPoint(x + brushR, y)) return true;
    if (this.containsPoint(x, y - brushR)) return true;
    if (this.containsPoint(x, y + brushR)) return true;
    if (this.containsPoint(x - dxy, y - dxy)) return true;
    if (this.containsPoint(x + dxy, y - dxy)) return true;
    if (this.containsPoint(x - dxy, y + dxy)) return true;
    if (this.containsPoint(x + dxy, y + dxy)) return true;
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
      const local = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.sides ?? part.side);
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
  if (canvasRenderer && canvasRenderer.elt) {
    // Prevent browser right/middle-click behavior from affecting gameplay input.
    canvasRenderer.elt.addEventListener("contextmenu", (e) => e.preventDefault());
    canvasRenderer.elt.addEventListener("mousedown", (e) => {
      if (e.button !== 0) e.preventDefault();
    });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("contextmenu", (e) => e.preventDefault());
  }
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

  const canFetch = typeof window !== "undefined" && window.location && window.location.protocol !== "file:";
  const hasJsonLevels = levelData && Array.isArray(levelData.levels) && levelData.levels.length > 0;
  if (!editorTestMode && !canFetch && !hasJsonLevels && typeof CONNECT_LEVEL_DATA === "object" && CONNECT_LEVEL_DATA) {
    levelData = CONNECT_LEVEL_DATA;
  }
  levelsLoadingFromSources = canFetch && !editorTestMode;
  applyLoadedLevelData(levelData);
  if (!levelsLoadingFromSources) generateDefaultPreviews();

  loadScores();
  if (!levelsLoadingFromSources) loadStoredPreviews();
  circleR = width / 50;
  d = width / 100;
  buttonX = width / 2;
  buttonY = height / 2;
  buttonW = height / 4;
  const row = getActiveRow();
  if (row) player = row.name;
  // Detect touch-capable devices to adapt hit targets without changing visuals
  try { isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0); } catch (e) { isTouchDevice = false; }
  getHtmlMenuUi();

  if (editorTestMode) {
    if (!player) player = "Editor Test";
    gameMode = 1;
    level = 0;
    loadLevel(false);
  }

  if (canFetch && !editorTestMode) {
    reloadLevelDataFromSources()
      .then((data) => {
        const hasFetchedLevels = data && Array.isArray(data.levels) && data.levels.length > 0;
        if (hasFetchedLevels) {
          levelData = data;
        } else if (typeof CONNECT_LEVEL_DATA === "object" && CONNECT_LEVEL_DATA) {
          // Last-resort fallback for environments where fetch is blocked.
          levelData = CONNECT_LEVEL_DATA;
        }
        applyLoadedLevelData(levelData);
        generateDefaultPreviews();
        loadStoredPreviews();
        scoreStore.rows = scoreStore.rows.map(normalizeRow);
        if (level > getMaxLevelIndex()) level = 0;
        levelsLoadingFromSources = false;
        if (gameMode === 4) refreshHtmlLevelMenu(false);
        if (hasFetchedLevels) console.info(`Loaded ${getLevelCount()} levels from manifest/data files.`);
        else console.warn("Using CONNECT_LEVEL_DATA fallback because manifest/data files were unavailable.");
      })
      .catch((err) => {
        if (typeof CONNECT_LEVEL_DATA === "object" && CONNECT_LEVEL_DATA) {
          levelData = CONNECT_LEVEL_DATA;
          applyLoadedLevelData(levelData);
          generateDefaultPreviews();
          loadStoredPreviews();
          scoreStore.rows = scoreStore.rows.map(normalizeRow);
          if (level > getMaxLevelIndex()) level = 0;
          levelsLoadingFromSources = false;
          if (gameMode === 4) refreshHtmlLevelMenu(false);
        } else {
          levelsLoadingFromSources = false;
        }
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

function deriveLevelIdFromFileRef(fileRef, fallbackIndex = 0) {
  const raw = String(fileRef ?? "").trim();
  if (!raw) return `level_${fallbackIndex}`;
  const clean = raw.split("#")[0].split("?")[0];
  const parts = clean.split("/");
  const baseName = parts[parts.length - 1] || clean;
  const id = baseName.replace(/\.[^/.]+$/, "").trim();
  return id || `level_${fallbackIndex}`;
}

async function loadLevelDataFromIndex() {
  const indexData = await fetchJsonNoStore(LEVEL_INDEX_PATH);
  const refs = Array.isArray(indexData?.levels) ? indexData.levels : [];
  if (refs.length < 1) throw new Error("index.json has no levels entries");

  const loadedLevels = await Promise.all(refs.map(async (ref, idx) => {
    let fileRef = "";
    if (typeof ref === "string") fileRef = ref;
    else if (ref && typeof ref === "object") {
      fileRef = String(ref.file ?? ref.path ?? ref.name ?? "");
    }
    const filePath = resolveLevelFilePath(fileRef);
    if (!filePath) throw new Error(`Invalid level reference at index ${idx}`);
    const levelFile = await fetchJsonNoStore(filePath);
    const derivedId = deriveLevelIdFromFileRef(fileRef, idx);
    return {
      id: derivedId,
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
  if (levelDefs.length < 1) levelDefs = [{ id: "level_0", objects: [] }];
  levelImg = new Array(levelDefs.length).fill(null);
  levelDefaultImg = new Array(levelDefs.length).fill(null);
  level = constrain(level, 0, getMaxLevelIndex());
}

function normalizeLevelDefinitions(rawData) {
  const sourceLevels = Array.isArray(rawData?.levels) ? rawData.levels : [];
  const out = [];
  for (let i = 0; i < sourceLevels.length; i++) {
    const srcLevel = sourceLevels[i];
    const rawId = srcLevel?.id;
    let id = "";
    if (typeof rawId === "string" && rawId.trim().length > 0) id = rawId.trim();
    else if (Number.isInteger(rawId)) id = String(rawId);
    else id = `level_${i}`;
    const srcObjects = Array.isArray(srcLevel?.objects) ? srcLevel.objects : [];
    const objects = [];
    for (const rawObject of srcObjects) {
      const obj = normalizeLevelObject(rawObject);
      if (obj) objects.push(obj);
    }
    out.push({ id, objects });
  }
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
    const sides = normalizeArcSides(rawObject.sides ?? rawObject.side, ARC_SIDE_TOP);
    return {
      type: "arcbox",
      x: Number.isFinite(rawObject.x) ? rawObject.x : 0.5,
      y: Number.isFinite(rawObject.y) ? rawObject.y : 0.5,
      w: Number.isFinite(rawObject.w) ? rawObject.w : 0.2,
      h: Number.isFinite(rawObject.h) ? rawObject.h : 0.2,
      cut: clampArcCut(rawObject.cut),
      sides,
      side: sides[0],
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
    const preview = renderLevelPreview(levelDefs[i], i);
    levelDefaultImg[i] = preview;
    levelImg[i] = preview;
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
  const sides = normalizeArcSides(obj.sides ?? obj.side, ARC_SIDE_TOP);
  const angle = radians(Number(obj.angle) || 0);
  const points = buildArcBoxLocalPoints(w, h, cut, sides);

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
      const pts = buildArcBoxLocalPoints(pw, ph, part.cut, part.sides ?? part.side);
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
      const pts = buildArcBoxLocalPoints(pw, ph, part.cut, part.sides ?? part.side);
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

function getRotorGearMetrics(radius, minOuterRadius = 0) {
  const baseRadius = Number(radius) || 0;
  const outerR = Math.max(minOuterRadius, baseRadius * ROTOR_GEAR_OUTER_SCALE);
  return {
    outerR,
    innerR: outerR * ROTOR_GEAR_INNER_RATIO,
    coreR: outerR * ROTOR_GEAR_CORE_RATIO,
    teeth: ROTOR_GEAR_TEETH,
  };
}

function buildRotorGearVertices(outerR, innerR, teeth = ROTOR_GEAR_TEETH) {
  const toothCount = Math.max(3, Math.round(teeth));
  const points = [];
  for (let i = 0; i < toothCount * 2; i++) {
    const angle = (Math.PI * 2 * i) / (toothCount * 2);
    const rr = i % 2 === 0 ? outerR : innerR;
    points.push({ x: Math.cos(angle) * rr, y: Math.sin(angle) * rr });
  }
  return points;
}

function buildSvgClosedPath(points, offsetX = 0, offsetY = 0) {
  if (!Array.isArray(points) || points.length < 1) return "";
  const fmt = (value) => String(Math.round(value * 1000) / 1000);
  const commands = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = fmt((Number(p.x) || 0) + offsetX);
    const y = fmt((Number(p.y) || 0) + offsetY);
    commands.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
  }
  commands.push("Z");
  return commands.join(" ");
}

function renderMenuSettingsGearIcon(svgElement) {
  if (!svgElement || typeof document === "undefined") return;
  const NS = "http://www.w3.org/2000/svg";
  const iconRadius = 7.2;
  const center = 12;
  const { outerR, innerR, coreR, teeth } = getRotorGearMetrics(iconRadius, 2.5);
  const gearPath = buildSvgClosedPath(buildRotorGearVertices(outerR, innerR, teeth), center, center);
  if (!gearPath) return;

  while (svgElement.firstChild) svgElement.removeChild(svgElement.firstChild);

  const rim = document.createElementNS(NS, "path");
  rim.setAttribute("d", gearPath);
  rim.setAttribute("fill", "none");
  rim.setAttribute("stroke", "currentColor");
  rim.setAttribute("stroke-width", String(Math.max(1.2, outerR * 0.2)));
  rim.setAttribute("stroke-linejoin", "miter");
  svgElement.appendChild(rim);

  const core = document.createElementNS(NS, "circle");
  core.setAttribute("cx", String(center));
  core.setAttribute("cy", String(center));
  core.setAttribute("r", String(Math.round(coreR * 1000) / 1000));
  core.setAttribute("fill", "none");
  core.setAttribute("stroke", "currentColor");
  core.setAttribute("stroke-width", String(Math.max(1, outerR * 0.14)));
  svgElement.appendChild(core);
}

function drawRotorHubGear(x, y, radius, spinDeg = 0) {
  const { outerR, innerR, coreR, teeth } = getRotorGearMetrics(radius, 4);
  const points = buildRotorGearVertices(outerR, innerR, teeth);

  push();
  translate(x, y);
  rotate(radians(spinDeg));
  noFill();
  stroke(COLOR_GRAY_LIGHT);
  strokeWeight(Math.max(2, outerR * 0.22));
  beginShape();
  for (const point of points) vertex(point.x, point.y);
  endShape(CLOSE);
  strokeWeight(Math.max(1.5, outerR * 0.15));
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
  const { outerR, innerR, coreR, teeth } = getRotorGearMetrics(radius, 2.5);
  const points = buildRotorGearVertices(outerR, innerR, teeth);

  g.push();
  g.translate(x, y);
  g.rotate(radians(spinDeg));
  g.noFill();
  g.stroke(COLOR_GRAY_LIGHT);
  g.strokeWeight(Math.max(1.2, outerR * 0.2));
  g.beginShape();
  for (const point of points) g.vertex(point.x, point.y);
  g.endShape(CLOSE);
  g.strokeWeight(Math.max(1, outerR * 0.14));
  g.ellipse(0, 0, coreR * 2, coreR * 2);
  g.pop();
}

function draw() {
  // Main game loop.
  const htmlMenuDrawn = syncHtmlLevelMenuVisibility();
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
  if (gameMode === 4 && (levelsLoadingFromSources || menuOpenPending)) drawLevelMenuLoading(menuOpenPending ? "Opening menu..." : "Loading levels...");
  else if (gameMode === 4 && !htmlMenuDrawn) drawLevelMenu();
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
    const pad = Math.max(28, width * 0.03);
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

function getHtmlMenuUi() {
  if (htmlMenuUi) return htmlMenuUi;
  if (typeof document === "undefined") return null;

  const overlay = document.getElementById("level-menu-overlay");
  const levelList = document.getElementById("level-menu-list");
  const scrollbarTrack = document.getElementById("level-menu-scrollbar");
  const scrollbarHandle = document.getElementById("level-menu-scrollbar-handle");
  const playerNameButton = document.getElementById("menu-player-name");
  const prevButton = document.getElementById("menu-player-prev");
  const nextButton = document.getElementById("menu-player-next");
  const deleteButton = document.getElementById("menu-player-delete");
  const settingsButton = document.getElementById("menu-player-settings");
  const settingsIcon = document.getElementById("menu-player-settings-icon");
  const settingsPanel = document.getElementById("menu-settings-panel");
  const clearDataButton = document.getElementById("menu-settings-clear");
  if (!overlay || !levelList || !scrollbarTrack || !scrollbarHandle || !playerNameButton || !prevButton || !nextButton || !deleteButton || !settingsButton || !settingsPanel || !clearDataButton) return null;

  htmlMenuUi = {
    overlay,
    levelList,
    scrollbarTrack,
    scrollbarHandle,
    playerNameButton,
    prevButton,
    nextButton,
    deleteButton,
    settingsButton,
    settingsIcon,
    settingsPanel,
    clearDataButton,
  };
  if (settingsIcon) renderMenuSettingsGearIcon(settingsIcon);

  const dragState = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startCard: null,
    startScrollLeft: 0,
    moved: false,
    blockNextClick: false,
  };
  const scrollbarDragState = {
    active: false,
    pointerId: null,
    grabOffsetX: 0,
  };

  const CARD_TAP_DRAG_THRESHOLD_PX = 8;
  const clampNumber = (value, minValue, maxValue) => Math.max(minValue, Math.min(maxValue, value));
  const setSettingsPanelOpen = (open) => {
    const show = Boolean(open);
    settingsPanel.hidden = !show;
    settingsButton.setAttribute("aria-expanded", show ? "true" : "false");
  };
  const getLevelCardAtClientPoint = (clientX, clientY) => {
    if (typeof document === "undefined") return null;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const hit = document.elementFromPoint(clientX, clientY);
    if (!hit || typeof hit.closest !== "function") return null;
    return hit.closest(".level-menu-card");
  };
  const tryOpenLevelCardElement = (card) => {
    if (!card) return false;
    const levelIndex = Number(card.dataset.level);
    if (!Number.isInteger(levelIndex)) return false;
    openLevelFromHtmlMenu(levelIndex);
    return true;
  };
  const getScrollbarMetrics = () => {
    const trackWidth = Math.max(0, Math.round(scrollbarTrack.clientWidth));
    const viewportWidth = Math.max(0, Math.round(levelList.clientWidth));
    const contentWidth = Math.max(0, Math.round(levelList.scrollWidth));
    const maxScrollLeft = Math.max(0, contentWidth - viewportWidth);
    const handleMinWidth = 72;
    const handleWidth = maxScrollLeft <= 0 || contentWidth <= 0
      ? trackWidth
      : clampNumber(Math.round((viewportWidth / contentWidth) * trackWidth), handleMinWidth, trackWidth);
    const maxHandleLeft = Math.max(0, trackWidth - handleWidth);
    return { trackWidth, maxScrollLeft, handleWidth, maxHandleLeft };
  };
  const updateScrollbarFromLevelList = () => {
    const { trackWidth, maxScrollLeft, handleWidth, maxHandleLeft } = getScrollbarMetrics();
    if (trackWidth <= 0) return;

    if (maxScrollLeft <= 0) {
      scrollbarTrack.style.opacity = "0.55";
      scrollbarHandle.style.width = `${trackWidth}px`;
      scrollbarHandle.style.left = "0px";
      return;
    }

    const ratio = clampNumber(levelList.scrollLeft / maxScrollLeft, 0, 1);
    const handleLeft = Math.round(maxHandleLeft * ratio);
    scrollbarTrack.style.opacity = "1";
    scrollbarHandle.style.width = `${handleWidth}px`;
    scrollbarHandle.style.left = `${handleLeft}px`;
  };
  const updateLevelCardWidthForHeight = () => {
    const sampleCard = levelList.querySelector(".level-menu-card");
    if (!sampleCard) {
      levelList.style.removeProperty("--menu-card-width");
      return;
    }

    // Use CSS default width as baseline, then iteratively shrink to fit current list height.
    levelList.style.removeProperty("--menu-card-width");
    const baselineCardWidth = Math.round(sampleCard.getBoundingClientRect().width);
    const maxAllowedHeight = Math.max(1, Math.floor(levelList.clientHeight) - 2);
    if (!Number.isFinite(baselineCardWidth) || baselineCardWidth <= 0 || maxAllowedHeight <= 0) return;

    const minCardWidth = 90;
    let fittedWidth = baselineCardWidth;
    for (let i = 0; i < 5; i++) {
      levelList.style.setProperty("--menu-card-width", `${fittedWidth}px`);
      const measuredCard = levelList.querySelector(".level-menu-card");
      const measuredHeight = measuredCard ? Math.ceil(measuredCard.getBoundingClientRect().height) : 0;
      if (measuredHeight <= maxAllowedHeight || fittedWidth <= minCardWidth) break;

      const ratio = maxAllowedHeight / Math.max(1, measuredHeight);
      const nextWidth = Math.floor(fittedWidth * ratio) - 1;
      fittedWidth = Math.max(minCardWidth, Math.min(fittedWidth - 1, nextWidth));
    }
    levelList.style.setProperty("--menu-card-width", `${Math.max(minCardWidth, fittedWidth)}px`);
  };
  const updateMenuLayout = () => {
    updateLevelCardWidthForHeight();
    updateScrollbarFromLevelList();
  };
  let menuLayoutRafId = 0;
  const requestMenuLayoutUpdate = () => {
    if (menuLayoutRafId !== 0) return;
    menuLayoutRafId = requestAnimationFrame(() => {
      menuLayoutRafId = 0;
      updateMenuLayout();
    });
  };
  const scheduleMenuLayoutSettle = () => {
    requestMenuLayoutUpdate();
    setTimeout(requestMenuLayoutUpdate, 90);
    setTimeout(requestMenuLayoutUpdate, 220);
  };
  const handleMenuWheelEvent = (event) => {
    if (!isHtmlLevelMenuActive()) return;
    if (event?.ctrlKey) return;
    const didScroll = scrollLevelListWithWheel(event);
    if (event?.cancelable) event.preventDefault();
    if (didScroll && typeof event.stopPropagation === "function") event.stopPropagation();
  };
  const scrollLevelListWithWheel = (event) => {
    if (!event) return false;
    let delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (event.deltaMode === 1) delta *= 32; // line mode -> px
    else if (event.deltaMode === 2) delta *= Math.max(1, levelList.clientWidth); // page mode -> px
    if (delta !== 0 && Math.abs(delta) < 40) delta = Math.sign(delta) * 40; // avoid snap-back on tiny wheel ticks
    if (!Number.isFinite(delta) || delta === 0) return false;
    const maxScrollLeft = Math.max(0, levelList.scrollWidth - levelList.clientWidth);
    if (maxScrollLeft <= 0) return false;
    const sampleCard = levelList.querySelector(".level-menu-card");
    if (!sampleCard) return false;
    let gap = 0;
    try {
      const styles = window.getComputedStyle(levelList);
      gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    } catch {}
    const pitch = Math.max(1, Math.round(sampleCard.getBoundingClientRect().width + gap));
    const stepCount = Math.max(1, Math.round(Math.abs(delta) / 120));
    const direction = Math.sign(delta);
    const currentIndex = Math.round(levelList.scrollLeft / pitch);
    const maxIndex = Math.max(0, Math.round(maxScrollLeft / pitch));
    const nextIndex = Math.max(0, Math.min(maxIndex, currentIndex + direction * stepCount));
    const next = Math.max(0, Math.min(maxScrollLeft, nextIndex * pitch));
    if (next === levelList.scrollLeft) return false;
    levelList.scrollLeft = next;
    updateScrollbarFromLevelList();
    return true;
  };
  const setLevelListScrollFromClientX = (clientX, grabOffsetX = null) => {
    const { maxScrollLeft, handleWidth, maxHandleLeft } = getScrollbarMetrics();
    if (maxScrollLeft <= 0) {
      levelList.scrollLeft = 0;
      updateScrollbarFromLevelList();
      return;
    }

    const trackRect = scrollbarTrack.getBoundingClientRect();
    const targetOffset = Number.isFinite(grabOffsetX) ? grabOffsetX : handleWidth / 2;
    const handleLeft = clampNumber(clientX - trackRect.left - targetOffset, 0, maxHandleLeft);
    const ratio = maxHandleLeft <= 0 ? 0 : handleLeft / maxHandleLeft;
    levelList.scrollLeft = ratio * maxScrollLeft;
    updateScrollbarFromLevelList();
  };
  htmlMenuUi.updateScrollbar = updateScrollbarFromLevelList;
  htmlMenuUi.updateLayout = updateMenuLayout;
  htmlMenuUi.scheduleLayoutSettle = scheduleMenuLayoutSettle;
  htmlMenuUi.setSettingsPanelOpen = setSettingsPanelOpen;
  setSettingsPanelOpen(false);

  const stopPropagation = (event) => {
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();
  };
  for (const el of [overlay, levelList, scrollbarTrack, playerNameButton, prevButton, nextButton, deleteButton, settingsButton, settingsPanel, clearDataButton]) {
    el.addEventListener("pointerdown", stopPropagation);
    el.addEventListener("pointerup", stopPropagation);
    el.addEventListener("touchstart", stopPropagation, { passive: true });
    el.addEventListener("touchmove", stopPropagation, { passive: true });
    el.addEventListener("touchend", stopPropagation, { passive: false });
  }

  playerNameButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSettingsPanelOpen(false);
    promptForPlayerName();
    refreshHtmlLevelMenu();
  });
  prevButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSettingsPanelOpen(false);
    cyclePlayer(-1);
    refreshHtmlLevelMenu();
  });
  nextButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSettingsPanelOpen(false);
    cyclePlayer(1);
    refreshHtmlLevelMenu();
  });
  deleteButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSettingsPanelOpen(false);
    deleteCurrentPlayer();
    refreshHtmlLevelMenu();
  });
  settingsButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setSettingsPanelOpen(settingsPanel.hidden);
  });
  clearDataButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!clearAllGameData()) return;
    setSettingsPanelOpen(false);
    refreshHtmlLevelMenu(false);
  });
  overlay.addEventListener("click", (event) => {
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return;
    if (target.closest("#menu-settings-panel") || target.closest("#menu-player-settings")) return;
    setSettingsPanelOpen(false);
  });

  const endLevelListDrag = (event) => {
    if (!dragState.active || event.pointerId !== dragState.pointerId) return;
    const cardAtPointer = getLevelCardAtClientPoint(event.clientX, event.clientY);
    const candidateCard = cardAtPointer || dragState.startCard;
    const opened = !dragState.moved && tryOpenLevelCardElement(candidateCard);
    dragState.blockNextClick = opened || dragState.moved;
    if (dragState.blockNextClick) setTimeout(() => { dragState.blockNextClick = false; }, 0);
    dragState.active = false;
    dragState.pointerId = null;
    dragState.startX = 0;
    dragState.startY = 0;
    dragState.startCard = null;
    dragState.moved = false;
    levelList.classList.remove("is-dragging");
    if (typeof levelList.releasePointerCapture === "function") {
      try { levelList.releasePointerCapture(event.pointerId); } catch {}
    }
  };
  levelList.addEventListener("pointerdown", (event) => {
    if (typeof event.button === "number" && event.button !== 0) return;
    dragState.active = true;
    dragState.pointerId = event.pointerId;
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
    dragState.startCard = event.target && typeof event.target.closest === "function"
      ? event.target.closest(".level-menu-card")
      : null;
    dragState.startScrollLeft = levelList.scrollLeft;
    dragState.moved = false;
    dragState.blockNextClick = false;
    levelList.classList.add("is-dragging");
    if (typeof levelList.setPointerCapture === "function") {
      try { levelList.setPointerCapture(event.pointerId); } catch {}
    }
  });
  levelList.addEventListener("pointermove", (event) => {
    if (!dragState.active || event.pointerId !== dragState.pointerId) return;
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && (Math.abs(deltaX) > CARD_TAP_DRAG_THRESHOLD_PX || Math.abs(deltaY) > CARD_TAP_DRAG_THRESHOLD_PX)) {
      dragState.moved = true;
    }
    if (!dragState.moved) return;
    dragState.blockNextClick = true;
    levelList.scrollLeft = dragState.startScrollLeft - deltaX;
    updateScrollbarFromLevelList();
    event.preventDefault();
  });
  levelList.addEventListener("pointerup", endLevelListDrag);
  levelList.addEventListener("pointercancel", endLevelListDrag);

  const endScrollbarDrag = (event) => {
    if (!scrollbarDragState.active || event.pointerId !== scrollbarDragState.pointerId) return;
    scrollbarDragState.active = false;
    scrollbarDragState.pointerId = null;
    scrollbarHandle.classList.remove("is-dragging");
    if (typeof scrollbarTrack.releasePointerCapture === "function") {
      try { scrollbarTrack.releasePointerCapture(event.pointerId); } catch {}
    }
  };
  scrollbarTrack.addEventListener("pointerdown", (event) => {
    if (typeof event.button === "number" && event.button !== 0) return;
    const handleRect = scrollbarHandle.getBoundingClientRect();
    const target = event.target;
    const hitHandle = target === scrollbarHandle || (target && typeof target.closest === "function" && target.closest("#level-menu-scrollbar-handle"));
    scrollbarDragState.active = true;
    scrollbarDragState.pointerId = event.pointerId;
    scrollbarDragState.grabOffsetX = hitHandle ? (event.clientX - handleRect.left) : handleRect.width / 2;
    scrollbarHandle.classList.add("is-dragging");
    setLevelListScrollFromClientX(event.clientX, scrollbarDragState.grabOffsetX);
    if (typeof scrollbarTrack.setPointerCapture === "function") {
      try { scrollbarTrack.setPointerCapture(event.pointerId); } catch {}
    }
    event.preventDefault();
  });
  scrollbarTrack.addEventListener("pointermove", (event) => {
    if (!scrollbarDragState.active || event.pointerId !== scrollbarDragState.pointerId) return;
    setLevelListScrollFromClientX(event.clientX, scrollbarDragState.grabOffsetX);
    event.preventDefault();
  });
  scrollbarTrack.addEventListener("pointerup", endScrollbarDrag);
  scrollbarTrack.addEventListener("pointercancel", endScrollbarDrag);

  levelList.addEventListener("click", (event) => {
    if (dragState.blockNextClick) {
      dragState.blockNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const card = target.closest(".level-menu-card");
    if (!card) return;
    const levelIndex = Number(card.dataset.level);
    if (!Number.isInteger(levelIndex)) return;
    event.preventDefault();
    event.stopPropagation();
    setSettingsPanelOpen(false);
    openLevelFromHtmlMenu(levelIndex);
  });

  window.addEventListener("wheel", handleMenuWheelEvent, { passive: false, capture: true });

  levelList.addEventListener("scroll", () => {
    updateScrollbarFromLevelList();
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (!isHtmlLevelMenuActive()) return;
    scheduleMenuLayoutSettle();
  });
  window.addEventListener("orientationchange", () => {
    if (!isHtmlLevelMenuActive()) return;
    scheduleMenuLayoutSettle();
  });
  if (typeof window !== "undefined" && window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (!isHtmlLevelMenuActive()) return;
      scheduleMenuLayoutSettle();
    });
    window.visualViewport.addEventListener("scroll", () => {
      if (!isHtmlLevelMenuActive()) return;
      scheduleMenuLayoutSettle();
    });
  }

  scheduleMenuLayoutSettle();

  return htmlMenuUi;
}

function isHtmlLevelMenuActive() {
  return htmlMenuVisible && gameMode === 4;
}

function levelPreviewToDataUrl(preview) {
  if (!preview) return "";
  try {
    if (preview.canvas && typeof preview.canvas.toDataURL === "function") return preview.canvas.toDataURL("image/png");
    if (preview.elt && typeof preview.elt.toDataURL === "function") return preview.elt.toDataURL("image/png");
  } catch {}
  return "";
}

function setHtmlLevelMenuVisible(visible) {
  const ui = getHtmlMenuUi();
  if (!ui) {
    htmlMenuVisible = false;
    return;
  }

  htmlMenuVisible = Boolean(visible);
  ui.overlay.classList.toggle("is-visible", htmlMenuVisible);
  ui.overlay.setAttribute("aria-hidden", htmlMenuVisible ? "false" : "true");
  if (!htmlMenuVisible && typeof ui.setSettingsPanelOpen === "function") ui.setSettingsPanelOpen(false);
  if (htmlMenuVisible) {
    if (typeof ui.scheduleLayoutSettle === "function") ui.scheduleLayoutSettle();
    else if (typeof ui.updateLayout === "function") {
      requestAnimationFrame(() => {
        ui.updateLayout();
      });
    }
  }
}

function openLevelFromHtmlMenu(levelIndex) {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex > getMaxLevelIndex()) return;
  if (player === null && !promptForPlayerName()) {
    refreshHtmlLevelMenu();
    return;
  }
  level = levelIndex;
  loadLevel(false);
  gameMode = 0;
  setHtmlLevelMenuVisible(false);
}

function refreshHtmlLevelMenu(preserveScroll = true) {
  const ui = getHtmlMenuUi();
  if (!ui) return false;

  const names = getPlayerNames();
  const hasPlayer = player !== null;
  const hasMultiplePlayers = names.length > 1;
  ui.playerNameButton.textContent = hasPlayer ? player : "Set Player Name";
  ui.prevButton.disabled = !hasMultiplePlayers;
  ui.nextButton.disabled = !hasMultiplePlayers;
  ui.prevButton.hidden = !hasMultiplePlayers;
  ui.nextButton.hidden = !hasMultiplePlayers;
  ui.deleteButton.disabled = !hasPlayer;
  ui.deleteButton.hidden = !hasPlayer;

  const scrollLeft = preserveScroll ? ui.levelList.scrollLeft : 0;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < getLevelCount(); i++) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "level-menu-card";
    if (i === level) card.classList.add("is-current");
    card.dataset.level = String(i);

    calcScore(i);
    const isSolved = minLines > 0 || minTime > 0;
    if (isSolved) card.classList.add("is-solved");

    const previewWrap = document.createElement("div");
    previewWrap.className = "level-menu-preview";
    const previewData = levelPreviewToDataUrl(levelImg[i]);
    const defaultPreviewData = levelPreviewToDataUrl(levelDefaultImg[i] || levelImg[i]);
    const hasPreview = Boolean(previewData || defaultPreviewData);
    if (hasPreview) {
      const currentSrc = previewData || defaultPreviewData;
      const previewImgCurrent = document.createElement("img");
      previewImgCurrent.className = "level-menu-preview-image level-menu-preview-current";
      previewImgCurrent.src = currentSrc;
      previewImgCurrent.alt = `Level ${i + 1} preview`;
      previewWrap.appendChild(previewImgCurrent);

      if (isSolved && defaultPreviewData && defaultPreviewData !== currentSrc) {
        const previewImgDefault = document.createElement("img");
        previewImgDefault.className = "level-menu-preview-image level-menu-preview-default";
        previewImgDefault.src = defaultPreviewData;
        previewImgDefault.alt = "";
        previewImgDefault.setAttribute("aria-hidden", "true");
        previewWrap.appendChild(previewImgDefault);
      }
    } else {
      const previewEmpty = document.createElement("span");
      previewEmpty.className = "level-menu-preview-empty";
      previewEmpty.textContent = "No Preview";
      previewWrap.appendChild(previewEmpty);
    }

    const levelLabel = document.createElement("span");
    levelLabel.className = "level-menu-label";
    if (isSolved) levelLabel.classList.add("is-solved");
    levelLabel.textContent = `${i + 1}`;
    levelLabel.setAttribute("aria-label", `Level ${i + 1}${isSolved ? " solved" : ""}`);
    previewWrap.appendChild(levelLabel);

    const scoreWrap = document.createElement("div");
    scoreWrap.className = "level-menu-score";

    const fewestLine = document.createElement("span");
    fewestLine.textContent =
      minLines > 0 && playerMinLines
        ? formatFewestScore(playerMinLines, minLines)
        : "fewest: -";
    const fastestLine = document.createElement("span");
    fastestLine.textContent =
      minTime > 0 && playerMinTime
        ? formatFastestScore(playerMinTime, minTime)
        : "fastest: -";
    scoreWrap.appendChild(fewestLine);
    scoreWrap.appendChild(fastestLine);

    card.appendChild(previewWrap);
    card.appendChild(scoreWrap);
    fragment.appendChild(card);
  }

  ui.levelList.replaceChildren(fragment);
  ui.levelList.scrollLeft = scrollLeft;
  if (typeof ui.scheduleLayoutSettle === "function") {
    ui.scheduleLayoutSettle();
  } else if (typeof ui.updateLayout === "function") {
    requestAnimationFrame(() => {
      ui.updateLayout();
    });
  }
  return true;
}

function syncHtmlLevelMenuVisibility() {
  const ui = getHtmlMenuUi();
  if (!ui) {
    htmlMenuVisible = false;
    return false;
  }

  if (gameMode === 4 && (levelsLoadingFromSources || menuOpenPending)) {
    if (htmlMenuVisible) setHtmlLevelMenuVisible(false);
    return false;
  }

  if (gameMode === 4) {
    if (!htmlMenuVisible) {
      setHtmlLevelMenuVisible(true);
      refreshHtmlLevelMenu(false);
    }
    if (typeof ui.updateScrollbar === "function") ui.updateScrollbar();
    return true;
  }

  if (htmlMenuVisible) setHtmlLevelMenuVisible(false);
  return false;
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

function drawLevelMenuLoading(message = "Loading levels...") {
  background(COLOR_GRAY_LIGHT);
  noStroke();
  fill(COLOR_BLACK);
  textAlign(CENTER, CENTER);
  textSize(Math.max(18, height / 26));
  text(message, width / 2, height / 2);
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

function pointInRectWithSlop(px, py, rectData, slop = 0) {
  const s = Math.max(0, Number(slop) || 0);
  return pointInRect(px, py, {
    x: rectData.x - s,
    y: rectData.y - s,
    w: rectData.w + s * 2,
    h: rectData.h + s * 2,
  });
}

function getPointerCanvasPosition(event) {
  let px = mouseX;
  let py = mouseY;
  if (!event || !canvasRenderer || !canvasRenderer.elt) return { x: px, y: py };

  const touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
  if (!touch) return { x: px, y: py };

  const rect = canvasRenderer.elt.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return { x: px, y: py };
  const sx = width / rect.width;
  const sy = height / rect.height;
  px = (touch.clientX - rect.left) * sx;
  py = (touch.clientY - rect.top) * sy;
  return { x: px, y: py };
}

function isGameMenuButtonAvailable() {
  return gameMode === 0 || gameMode === 1 || gameMode === 2;
}

function isGameResetButtonAvailable() {
  return (gameMode === 1 && physics) || (gameMode === 2 && levelUp);
}

function getTouchButtonSlopPx() {
  return Math.max(18, Math.round(Math.min(width, height) * 0.02));
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
  // Align top edge with reset button for consistent vertical level.
  const y = getResetButtonRect(false).y;
  const rect = { x, y, w, h };
  if (!expand) return rect;
  // On touch devices, enlarge only the hit area (not visuals)
  if (isTouchDevice) {
    const padX = Math.max(28, width * 0.03);
    const padY = Math.max(28, height * 0.03);
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
  const borderW = hover ? 2 : 1;
  fill(COLOR_WHITE);
  stroke(COLOR_BLACK, ALPHA_OPAQUE);
  strokeWeight(borderW);
  rect(x + w / 2, y + h / 2, w, h, 10);
  noStroke();
  fill(COLOR_BLACK);
  textAlign(CENTER, CENTER);
  textSize(h * 0.52);
  text("Menu", x + w / 2, y + h / 2);
}

function enterMenu() {
  if (menuOpenPending) return;
  physics = false;
  linePos = [];
  linePosTest = [];
  gameMode = 4;
  menuOpenPending = true;
  if (htmlMenuVisible) setHtmlLevelMenuVisible(false);
  // Give one frame of visual feedback before building menu DOM.
  setTimeout(() => {
    requestAnimationFrame(() => {
      try {
        if (gameMode !== 4) return;
        refreshHtmlLevelMenu(false);
      } finally {
        menuOpenPending = false;
      }
    });
  }, 40);
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
  const storedTimeLen = Array.isArray(row?.timeScores) ? row.timeScores.length : 0;
  const storedLineLen = Array.isArray(row?.lineScores) ? row.lineScores.length : 0;
  // Never shrink loaded score arrays based on a temporarily smaller level count.
  const scoreLen = Math.max(1, getLevelCount(), storedTimeLen, storedLineLen);
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
function clearAllGameData() {
  const confirmed = window.confirm("Delete all saved game data? This will clear players, records, and saved level previews.");
  if (!confirmed) return false;

  try {
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === SCORE_KEY || key === EDITOR_TEST_LEVEL_KEY || key.startsWith(PREVIEW_KEY)) keysToDelete.push(key);
    }
    for (const key of keysToDelete) localStorage.removeItem(key);
  } catch (err) {
    console.warn("Failed to clear saved game data:", err);
  }

  scoreStore = { rows: [], activeRowId: null };
  player = null;
  minTime = 0;
  minLines = 0;
  playerMinTime = null;
  playerMinLines = null;
  generateDefaultPreviews();
  saveScores();
  return true;
}
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
  let pendingLoads = 0;
  let updatedAny = false;
  const finalize = () => {
    if (pendingLoads !== 0) return;
    if (updatedAny && gameMode === 4) refreshHtmlLevelMenu();
  };

  for (let i = 0; i <= getMaxLevelIndex(); i++) {
    const data = localStorage.getItem(previewKey(i));
    if (!data) continue;
    pendingLoads++;
    loadImage(data, (img) => {
      levelImg[i] = img;
      updatedAny = true;
      pendingLoads--;
      finalize();
    }, () => {
      pendingLoads--;
      finalize();
    });
  }
  finalize();
}
function saveLevelPreview(i) {
  // Snapshot the current canvas as the level's preview image.
  if (!canvasRenderer) return;
  try {
    const data = canvasRenderer.elt.toDataURL("image/png");
    localStorage.setItem(previewKey(i), data);
    loadImage(data, (img) => {
      levelImg[i] = img;
      if (gameMode === 4) refreshHtmlLevelMenu();
    }, () => {});
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

function isPrimaryPointerButton(event = null) {
  if (touchInteractionInProgress) return true;
  if (event && typeof event.buttons === "number" && event.buttons !== 0) return event.buttons === 1;
  if (event && typeof event.button === "number") return event.button === 0;
  if (typeof mouseButton === "undefined") return true;
  if (typeof mouseButton === "number") return mouseButton === 0;
  if (typeof mouseButton === "string") return mouseButton.toLowerCase() === "left";
  return mouseButton === LEFT;
}

function isCanvasTouchEvent(event) {
  if (!canvasRenderer || !canvasRenderer.elt) return false;
  const canvasEl = canvasRenderer.elt;
  const target = event?.target;

  if (target && typeof target.closest === "function") {
    if (target.closest("#a2hs-banner, #ios-install-overlay, #level-menu-overlay")) return false;
    const targetCanvas = target.closest("canvas");
    if (targetCanvas === canvasEl) return true;
  }
  if (target === canvasEl) return true;

  const changedTouches = event?.changedTouches;
  if (changedTouches && changedTouches.length > 0) {
    const rect = canvasEl.getBoundingClientRect();
    for (let i = 0; i < changedTouches.length; i++) {
      const t = changedTouches[i];
      if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
        return true;
      }
    }
    return false;
  }

  if (typeof touches !== "undefined" && Array.isArray(touches) && touches.length > 0) {
    const t = touches[0];
    if (Number.isFinite(t?.x) && Number.isFinite(t?.y)) {
      return t.x >= 0 && t.x <= width && t.y >= 0 && t.y <= height;
    }
  }

  return false;
}

function getEventTouchCount(event) {
  const eventTouches = event?.touches;
  if (eventTouches && typeof eventTouches.length === "number") return eventTouches.length;
  if (typeof touches !== "undefined" && Array.isArray(touches)) return touches.length;
  return 0;
}

function shouldBlockTouchInteraction(event) {
  const count = getEventTouchCount(event);
  if (count > 1) {
    multiTouchBlockActive = true;
    return true;
  }
  if (multiTouchBlockActive) {
    if (count === 0) multiTouchBlockActive = false;
    return true;
  }
  return false;
}

function cancelPointerInteractionState() {
  linePos = [];
  linePosTest = [];
  drawPermit = false;
  menuDragMode = "none";
  menuDragMoved = false;
  menuScrollbarGrabOffsetX = 0;
  menuButtonArmed = false;
  resetButtonArmed = false;
  activeTouchUiButton = null;
}

function mousePressed(event) {
  // Adds first coordinate to linePos when the mouse is pressed.
  if (isHtmlLevelMenuActive()) return true;
  if (!isPrimaryPointerButton(event)) {
    cancelPointerInteractionState();
    return false;
  }
  const { x: pressX, y: pressY } = getPointerCanvasPosition(event);
  if (!Number.isFinite(pressX) || !Number.isFinite(pressY)) {
    cancelPointerInteractionState();
    return false;
  }
  const menuRect = getMenuButtonRect(true);
  menuButtonArmed = (gameMode === 0 || gameMode === 1 || gameMode === 2) && pointInRect(pressX, pressY, menuRect);
  const resetRect = getResetButtonRect(true);
  resetButtonArmed = (gameMode === 1 || (gameMode === 2 && levelUp)) && pointInRect(pressX, pressY, resetRect);
  if (gameMode === 1 && (menuButtonArmed || resetButtonArmed)) return;
  if (gameMode === 2 && (menuButtonArmed || resetButtonArmed)) return;

  checkEdge(pressX, pressY);
  if (drawPermit && gameMode === 1) linePos.push(createVector(pressX, pressY));
  if (gameMode === 4) {
    menuDragMode = "none";
    menuDragMoved = false;
    menuDragStartX = pressX;
    menuDragStartY = pressY;
    menuScrollbarGrabOffsetX = 0;

    const scrollbar = getLevelScrollbarGeometry();
    const inTrack = pointInRect(pressX, pressY, scrollbar.track);
    if (inTrack) {
      menuDragMode = "scrollbar";
      const handleCenterX = scrollbar.handle.x + scrollbar.handle.w / 2;
      if (pointInRect(pressX, pressY, scrollbar.handle)) {
        menuScrollbarGrabOffsetX = pressX - handleCenterX;
      }
      const clampedCenterX = constrain(pressX - menuScrollbarGrabOffsetX, scrollbar.trackPadding, width - scrollbar.trackPadding);
      imgScroll = map(clampedCenterX, scrollbar.trackPadding, width - scrollbar.trackPadding, 0, scrollbar.minScroll);
      imgScroll = clampLevelScroll(imgScroll);
      return;
    }

    const inLevelStrip = pressY <= imgY + imgH && pressY >= imgY - imgH;
    if (inLevelStrip) {
      menuDragMode = "levels";
    }
  }
}

function mouseDragged(event) {
  // Adds coordinates to linePos while dragging.
  if (isHtmlLevelMenuActive()) return true;
  if (!isPrimaryPointerButton(event)) {
    cancelPointerInteractionState();
    return false;
  }
  const { x: dragX, y: dragY } = getPointerCanvasPosition(event);
  if (!Number.isFinite(dragX) || !Number.isFinite(dragY)) {
    cancelPointerInteractionState();
    return false;
  }
  checkEdge(dragX, dragY);
  if (drawPermit && gameMode === 1) {
    if (linePos.length > 0) {
      const l = linePos[linePos.length - 1];
      if (dist(dragX, dragY, l.x, l.y) > d) linePos.push(createVector(dragX, dragY));
    } else linePos.push(createVector(dragX, dragY));
  }
  if (gameMode === 4) {
    if (menuDragMode === "levels") {
      imgScroll = clampLevelScroll(imgScroll + (dragX - pmouseX));
    } else if (menuDragMode === "scrollbar") {
      const scrollbar = getLevelScrollbarGeometry();
      const clampedCenterX = constrain(dragX - menuScrollbarGrabOffsetX, scrollbar.trackPadding, width - scrollbar.trackPadding);
      imgScroll = map(clampedCenterX, scrollbar.trackPadding, width - scrollbar.trackPadding, 0, scrollbar.minScroll);
      imgScroll = clampLevelScroll(imgScroll);
    }
    if (!menuDragMoved && dist(dragX, dragY, menuDragStartX, menuDragStartY) > MENU_DRAG_THRESHOLD_PX) menuDragMoved = true;
  }
}

function mouseWheel(e) {
  if (isHtmlLevelMenuActive()) return false;
  const c = e?.deltaY === 0 ? 0 : Math.sign(e?.deltaY || 0);
  if (gameMode === 4 && c !== 0) imgScroll = clampLevelScroll(imgScroll + c * MENU_SCROLL_STEP_PX);
  return false;
}

function mouseClicked(event) {
  if (isHtmlLevelMenuActive()) return true;
  if (!isPrimaryPointerButton(event)) {
    cancelPointerInteractionState();
    return false;
  }
  const { x: clickX, y: clickY } = getPointerCanvasPosition(event);
  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) {
    cancelPointerInteractionState();
    return false;
  }
  /*
    Checks if a button is clicked and reloads/selects level. This avoids
    accidental reset while drawing because release is handled separately.
  */
  if (gameMode === 4) {
    if (menuDragMoved) {
      menuDragMoved = false;
      return;
    }
    if (pointInRect(clickX, clickY, playerNameFieldRect)) {
      promptForPlayerName();
      return;
    }
    if (pointInRect(clickX, clickY, playerPrevButtonRect) && getPlayerNames().length > 1) {
      cyclePlayer(-1);
      return;
    }
    if (pointInRect(clickX, clickY, playerNextButtonRect) && getPlayerNames().length > 1) {
      cyclePlayer(1);
      return;
    }
    if (pointInRect(clickX, clickY, playerDeleteButtonRect) && player !== null) {
      deleteCurrentPlayer();
      return;
    }
  }

  if (clickY < imgY + imgH && clickY > imgY - imgH && gameMode === 4 && selectedLevel !== -1) {
    if (player === null && !promptForPlayerName()) return;
    level = selectedLevel;
    loadLevel(false);
    gameMode = 0;
  }
}

function mouseReleased(event) {
  /*
    If gameMode is 1, convert drawn coordinates into a physical line.
    Otherwise handle button clicks to reset/load level.
  */
  if (isHtmlLevelMenuActive()) return true;
  if (!isPrimaryPointerButton(event)) {
    cancelPointerInteractionState();
    return false;
  }
  const { x: releaseX, y: releaseY } = getPointerCanvasPosition(event);
  if (!Number.isFinite(releaseX) || !Number.isFinite(releaseY)) {
    cancelPointerInteractionState();
    return false;
  }
  if (gameMode === 4) {
    menuDragMode = "none";
    menuScrollbarGrabOffsetX = 0;
  }
  const buttonReleaseSlop = isTouchDevice
    ? Math.max(12, Math.round(Math.min(width, height) * 0.012))
    : Math.max(6, Math.round(Math.min(width, height) * 0.008));

  if (
    (gameMode === 0 || gameMode === 1 || gameMode === 2) &&
    menuButtonArmed &&
    pointInRectWithSlop(releaseX, releaseY, getMenuButtonRect(true), buttonReleaseSlop)
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
      pointInRectWithSlop(releaseX, releaseY, getResetButtonRect(true), buttonReleaseSlop)
    ) {
      loadLevel(false);
    }
  } else if (gameMode === 2 && levelUp && resetButtonArmed && pointInRectWithSlop(releaseX, releaseY, getResetButtonRect(true), buttonReleaseSlop)) {
    loadLevel(false);
  } else if ((gameMode === 0 || gameMode === 2) && player !== null && dist(releaseX, releaseY, buttonX, buttonY) < buttonW / 2) loadLevel();
  resetButtonArmed = false;
  menuButtonArmed = false;
}

function touchStarted(event) {
  if (isHtmlLevelMenuActive()) {
    touchInteractionInProgress = false;
    activeTouchUiButton = null;
    return true;
  }
  if (shouldBlockTouchInteraction(event)) {
    touchInteractionInProgress = false;
    cancelPointerInteractionState();
    return false;
  }

  const touchPos = getPointerCanvasPosition(event);
  const touchButtonSlop = getTouchButtonSlopPx();
  if (isGameMenuButtonAvailable() && pointInRectWithSlop(touchPos.x, touchPos.y, getMenuButtonRect(true), touchButtonSlop)) {
    activeTouchUiButton = "menu";
    touchInteractionInProgress = false;
    menuButtonArmed = false;
    resetButtonArmed = false;
    linePos = [];
    linePosTest = [];
    return false;
  }
  if (isGameResetButtonAvailable() && pointInRectWithSlop(touchPos.x, touchPos.y, getResetButtonRect(true), touchButtonSlop)) {
    activeTouchUiButton = "reset";
    touchInteractionInProgress = false;
    menuButtonArmed = false;
    resetButtonArmed = false;
    linePos = [];
    linePosTest = [];
    return false;
  }

  activeTouchUiButton = null;
  touchInteractionInProgress = isCanvasTouchEvent(event);
  if (!touchInteractionInProgress) return true;
  if (gameMode === 0 || gameMode === 1 || gameMode === 2 || gameMode === 4) {
    mousePressed(event);
    return false;
  }
  return false;
}

function touchMoved(event) {
  if (isHtmlLevelMenuActive()) return true;
  if (activeTouchUiButton) {
    const touchPos = getPointerCanvasPosition(event);
    const touchButtonSlop = getTouchButtonSlopPx();
    if (activeTouchUiButton === "menu") {
      if (!isGameMenuButtonAvailable() || !pointInRectWithSlop(touchPos.x, touchPos.y, getMenuButtonRect(true), touchButtonSlop)) {
        activeTouchUiButton = null;
      }
    } else if (activeTouchUiButton === "reset") {
      if (!isGameResetButtonAvailable() || !pointInRectWithSlop(touchPos.x, touchPos.y, getResetButtonRect(true), touchButtonSlop)) {
        activeTouchUiButton = null;
      }
    }
    return false;
  }
  if (shouldBlockTouchInteraction(event)) {
    touchInteractionInProgress = false;
    cancelPointerInteractionState();
    return false;
  }
  if (!touchInteractionInProgress) return true;
  if (event && !isCanvasTouchEvent(event)) return true;
  if (gameMode === 0 || gameMode === 1 || gameMode === 2 || gameMode === 4) {
    mouseDragged(event);
    return false;
  }
  return false;
}

function touchEnded(event) {
  if (isHtmlLevelMenuActive()) {
    touchInteractionInProgress = false;
    activeTouchUiButton = null;
    return true;
  }
  if (activeTouchUiButton) {
    const touchPos = getPointerCanvasPosition(event);
    const touchButtonSlop = getTouchButtonSlopPx();
    const touchButton = activeTouchUiButton;
    activeTouchUiButton = null;
    if (
      touchButton === "menu" &&
      isGameMenuButtonAvailable() &&
      pointInRectWithSlop(touchPos.x, touchPos.y, getMenuButtonRect(true), touchButtonSlop)
    ) {
      cancelPointerInteractionState();
      enterMenu();
    } else if (
      touchButton === "reset" &&
      isGameResetButtonAvailable() &&
      pointInRectWithSlop(touchPos.x, touchPos.y, getResetButtonRect(true), touchButtonSlop)
    ) {
      cancelPointerInteractionState();
      loadLevel(false);
    }
    touchInteractionInProgress = false;
    return false;
  }
  if (shouldBlockTouchInteraction(event)) {
    touchInteractionInProgress = false;
    cancelPointerInteractionState();
    return false;
  }
  if (!touchInteractionInProgress) {
    touchInteractionInProgress = false;
    return true;
  }
  if (gameMode === 0 || gameMode === 1 || gameMode === 2) {
    mouseReleased(event);
    touchInteractionInProgress = false;
    return false;
  }
  if (gameMode === 4) {
    mouseReleased(event);
    mouseClicked(event);
    touchInteractionInProgress = false;
    return false;
  }
  touchInteractionInProgress = false;
  return false;
}

function appendSegmentTestPoints(out, x0, y0, x1, y1, stepPx) {
  const segDist = dist(x0, y0, x1, y1);
  if (segDist <= 0) return;
  const step = Math.max(1, Number(stepPx) || 1);
  const count = Math.max(1, Math.ceil(segDist / step));
  for (let i = 1; i < count; i++) {
    const t = i / count;
    out.push(createVector(lerp(x0, x1, t), lerp(y0, y1, t)));
  }
}

function pointBlockedBySolids(x, y, dia = 0) {
  for (const b of boxes) if (b.contains(x, y, dia)) return true;
  for (const a of arcBoxes) if (a.contains(x, y, dia)) return true;
  for (const g of rigidGroups) if (g.contains(x, y, dia)) return true;
  for (const l of lines) if (l.contains(x, y, dia)) return true;
  for (const c of circles) if (c.contains(x, y, dia)) return true;
  for (const r of rotors) if (r.contains(x, y, dia)) return true;
  for (const s of cShapes) if (s.contains(x, y)) return true;
  return false;
}

function brushBlockedAt(x, y, dia) {
  // First do an inflated center check for round objects, then sample brush edge points.
  if (pointBlockedBySolids(x, y, dia)) return true;

  const r = (Number(dia) || 0) / 2;
  if (r <= 0) return false;
  const dxy = r * 0.7071;
  const offsets = [
    [-r, 0], [r, 0], [0, -r], [0, r],
    [-dxy, -dxy], [dxy, -dxy], [-dxy, dxy], [dxy, dxy]
  ];
  for (const [ox, oy] of offsets) {
    if (pointBlockedBySolids(x + ox, y + oy, 0)) return true;
  }
  return false;
}

function strokeBlocked(points, dia) {
  if (!Array.isArray(points) || points.length < 1) return false;
  const step = Math.max(1, (Number(dia) || 1) * DRAW_COLLISION_STEP_FACTOR);

  // Validate each anchor and swept segment using full brush thickness.
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (brushBlockedAt(p.x, p.y, dia)) return true;
    if (i > 0) {
      const prev = points[i - 1];
      const mid = [];
      appendSegmentTestPoints(mid, prev.x, prev.y, p.x, p.y, step);
      for (const m of mid) if (brushBlockedAt(m.x, m.y, dia)) return true;
    }
  }
  return false;
}

function checkEdge(px = mouseX, py = mouseY) {
  /*
    Checks if mouse or the segment to the last line coordinate goes inside
    or through another object.
  */
  drawPermit = true;
  if (px < d / 2 || px > width - d / 2 || py < d / 2 || py > height - d / 2) {
    drawPermit = false;
    return;
  }

  linePosTest = [];
  if (linePos.length > 0) {
    const l = linePos[linePos.length - 1];
    linePosTest.push(l.copy());
    const step = Math.max(1, d * DRAW_COLLISION_STEP_FACTOR);
    appendSegmentTestPoints(linePosTest, l.x, l.y, px, py, step);
  }

  if (brushBlockedAt(px, py, d)) {
    drawPermit = false;
    return;
  }
  for (const t of linePosTest) {
    if (brushBlockedAt(t.x, t.y, d)) {
      drawPermit = false;
      return;
    }
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
    const sides = normalizeArcSides(obj.sides ?? obj.side, ARC_SIDE_TOP);
    arcBoxes.push(new ArcBox(
      obj.x * width,
      obj.y * height,
      obj.w * width,
      obj.h * height,
      clampArcCut(obj.cut),
      sides,
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
        sides: normalizeArcSides(part.sides ?? part.side, ARC_SIDE_TOP),
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
        sides: normalizeArcSides(part.sides ?? part.side, ARC_SIDE_TOP),
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

