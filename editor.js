"use strict";

const BASE_WIDTH = 1024;
const BASE_HEIGHT = 768;
const DEFAULT_CIRCLE_RADIUS = BASE_WIDTH / 50;
const STORAGE_KEY = "connect_level_editor_v1";
const EDITOR_TEST_LEVEL_KEY = "connect_editor_test_level_v1";
const EDITOR_TEST_URL = "index.html?editor_test=1";

const TYPE_CIRCLE = "circle";
const TYPE_BOX = "box";
const TYPE_ARC_BOX = "arcbox";
const TYPE_SHAPE = "shape";
const TYPE_ROTOR = "rotor";
const TYPE_RIGID_GROUP = "rigid_group";
const VALUE_MODE_PX = "px";
const VALUE_MODE_RATIO = "ratio";
const VALUE_MODE_PERCENT = "percent";

const CIRCLE_COLOR_A = "A";
const CIRCLE_COLOR_B = "B";

const MAX_SHAPE_EDGES = 32;
const ARC_BOX_SEGMENTS = 28;
const ARC_BOX_MAX_CUT = 0.95;
const ARC_SIDE_TOP = "top";
const ARC_SIDE_RIGHT = "right";
const ARC_SIDE_BOTTOM = "bottom";
const ARC_SIDE_LEFT = "left";
const ARC_SIDE_ORDER = [ARC_SIDE_TOP, ARC_SIDE_RIGHT, ARC_SIDE_BOTTOM, ARC_SIDE_LEFT];
const RESIZE_HANDLE_DRAW_SIZE = 10;
const RESIZE_HANDLE_HIT_RADIUS = 10;
const RESIZE_HANDLE_SHOW_MARGIN = 16;
const ROTATE_HANDLE_OFFSET = 22;
const ROTATE_SNAP_DEG = 15;
const DEFAULT_ROTOR_MOTOR_SPEED_DEG = 180;
const DEFAULT_ROTOR_MOTOR_DIRECTION = 1;
const DEFAULT_ROTOR_MOTOR_TORQUE = 1000000000;

const palette = {
  circleA: "#f5d400",
  circleB: "#2f6de1",
  dynamic: "#8e9db2",
  static: "#c7d1df",
  rotor: "#6d8bb9",
  rotorStroke: "#2d4766",
  pivot: "#d5dee9",
  gridMinor: "#d3dbe8",
  gridMajor: "#b5c2d5",
  gridCenter: "#9aaac0",
  selection: "#d62929",
  text: "#142742"
};

const els = {
  canvas: document.getElementById("editorCanvas"),
  objectList: document.getElementById("objectList"),
  propertyEditor: document.getElementById("propertyEditor"),
  status: document.getElementById("status"),
  snapEnabled: document.getElementById("snapEnabled"),
  snapSize: document.getElementById("snapSize"),
  editStepLabel: document.getElementById("editStepLabel"),
  editStep: document.getElementById("editStep"),
  valueMode: document.getElementById("valueMode"),
  levelNumber: document.getElementById("levelNumber"),
  codeOutput: document.getElementById("codeOutput"),
  importJson: document.getElementById("importJson")
};

const buttons = {
  addBox: document.getElementById("addBox"),
  addArcBox: document.getElementById("addArcBox"),
  addShape: document.getElementById("addShape"),
  addRotorBox: document.getElementById("addRotorBox"),
  duplicateObject: document.getElementById("duplicateObject"),
  deleteObject: document.getElementById("deleteObject"),
  centerObject: document.getElementById("centerObject"),
  clearAll: document.getElementById("clearAll"),
  groupSelected: document.getElementById("groupSelected"),
  ungroupSelected: document.getElementById("ungroupSelected"),
  addToRotor: document.getElementById("addToRotor"),
  generateCode: document.getElementById("generateCode"),
  copyCode: document.getElementById("copyCode"),
  downloadJson: document.getElementById("downloadJson"),
  testInGame: document.getElementById("testInGame")
};

const ctx = els.canvas.getContext("2d");

const state = {
  objects: [],
  selectedId: null,
  selectedIds: [],
  nextId: 1,
  dragging: false,
  draggingPointerId: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  resizing: false,
  resizePointerId: null,
  resizeHandle: null,
  resizeStart: null,
  rotating: false,
  rotatePointerId: null,
  rotateStart: null,
  hoverResizeHandle: null,
  hoverCanvasX: null,
  hoverCanvasY: null,
  snapEnabled: true,
  snapSize: 16,
  editStep: 8,
  valueMode: VALUE_MODE_PX
};

init();

function init() {
  bindEvents();
  if (!loadFromStorage()) {
    addDefaultObjects();
  }
  els.valueMode.value = state.valueMode;
  syncEditStepControl();
  renderObjectList();
  renderPropertyEditor();
  renderExport();
  requestAnimationFrame(draw);
}

function bindEvents() {
  buttons.addBox.addEventListener("click", () => insertObject(createBox()));
  buttons.addArcBox.addEventListener("click", () => insertObject(createArcBox()));
  buttons.addShape.addEventListener("click", () => insertObject(createShape()));
  buttons.addRotorBox.addEventListener("click", () => insertObject(createRotor(4)));

  buttons.duplicateObject.addEventListener("click", duplicateSelectedObject);
  buttons.deleteObject.addEventListener("click", deleteSelectedObject);
  buttons.centerObject.addEventListener("click", centerSelectedObject);
  buttons.clearAll.addEventListener("click", clearAllObjects);
  buttons.groupSelected.addEventListener("click", groupSelectedObjects);
  buttons.ungroupSelected.addEventListener("click", ungroupSelectedObjects);
  buttons.addToRotor.addEventListener("click", addSelectedObjectsToRotor);

  buttons.generateCode.addEventListener("click", renderExport);
  buttons.copyCode.addEventListener("click", copyCodeToClipboard);
  buttons.downloadJson.addEventListener("click", downloadJson);
  buttons.testInGame.addEventListener("click", testInGame);
  els.levelNumber.addEventListener("input", renderExport);

  els.importJson.addEventListener("change", importJson);

  els.snapEnabled.addEventListener("change", () => {
    state.snapEnabled = els.snapEnabled.checked;
    persist();
    renderStatus("Snap setting updated.");
  });

  els.snapSize.addEventListener("input", () => {
    state.snapSize = clamp(Math.round(Number(els.snapSize.value) || 16), 1, 256);
    els.snapSize.value = String(state.snapSize);
    persist();
  });

  els.editStep.addEventListener("input", () => {
    setEditStepFromDisplay(Number(els.editStep.value));
    syncEditStepControl();
    // Apply the new step immediately to selection fields.
    renderPropertyEditor();
    persist();
  });

  els.valueMode.addEventListener("change", () => {
    state.valueMode = normalizeValueMode(els.valueMode.value);
    state.editStep = normalizeEditStepForMode(state.editStep, state.valueMode);
    els.valueMode.value = state.valueMode;
    syncEditStepControl();
    renderPropertyEditor();
    persist();
  });

  els.objectList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = Number(target.dataset.id);
    if (!Number.isInteger(id)) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      toggleSelection(id);
    } else {
      setSingleSelection(id);
    }
    renderObjectList();
    renderPropertyEditor();
    persist();
  });

  window.addEventListener("keydown", onKeyDown);

  els.canvas.addEventListener("pointerdown", onPointerDown);
  els.canvas.addEventListener("pointermove", onPointerMove);
  els.canvas.addEventListener("pointerup", onPointerUp);
  els.canvas.addEventListener("pointercancel", onPointerUp);
  els.canvas.addEventListener("pointerleave", onPointerLeave);
  els.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}

function addDefaultObjects() {
  const ground = {
    id: state.nextId++,
    type: TYPE_BOX,
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT - BASE_HEIGHT / 40,
    w: BASE_WIDTH,
    h: BASE_HEIGHT / 20,
    st: true
  };
  state.objects = [ground];
  ensureMandatoryCircles({ resetPositions: true });
  setSingleSelection(ground.id);
  persist();
}

function getDefaultCirclePosition(color) {
  if (color === CIRCLE_COLOR_B) {
    return { x: (BASE_WIDTH / 4) * 3, y: BASE_HEIGHT / 6 };
  }
  return { x: BASE_WIDTH / 4, y: BASE_HEIGHT / 6 };
}

function ensureMandatoryCircles(options = {}) {
  const resetPositions = Boolean(options.resetPositions);
  const circles = state.objects.filter((obj) => obj.type === TYPE_CIRCLE);
  const sourceA = circles.find((obj) => obj.color === CIRCLE_COLOR_A) || circles[0] || null;
  const sourceB = circles.find((obj) => obj !== sourceA && obj.color === CIRCLE_COLOR_B) || circles.find((obj) => obj !== sourceA) || null;

  function coerceCircle(source, color) {
    const base = getDefaultCirclePosition(color);
    const out = {
      id: Number.isInteger(source?.id) ? source.id : state.nextId++,
      type: TYPE_CIRCLE,
      x: resetPositions ? base.x : (Number.isFinite(source?.x) ? source.x : base.x),
      y: resetPositions ? base.y : (Number.isFinite(source?.y) ? source.y : base.y),
      r: DEFAULT_CIRCLE_RADIUS,
      color
    };
    sanitizeObject(out);
    return out;
  }

  const circleA = coerceCircle(sourceA, CIRCLE_COLOR_A);
  const circleB = coerceCircle(sourceB, CIRCLE_COLOR_B);
  const others = state.objects.filter((obj) => obj.type !== TYPE_CIRCLE);
  state.objects = [circleA, circleB, ...others];
  normalizeSelection();
  if (state.selectedIds.length < 1) {
    const fallback = others.length > 0 ? others[others.length - 1].id : circleA.id;
    setSingleSelection(fallback);
  }
}

function draw() {
  drawBackground();
  drawObjects();
  drawSelection();
  requestAnimationFrame(draw);
}

function drawBackground() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = "#f5f8fc";
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  const step = state.snapEnabled ? state.snapSize : 16;
  const major = step * 4;
  for (let x = 0; x <= BASE_WIDTH; x += step) {
    ctx.strokeStyle = x % major === 0 ? palette.gridMajor : palette.gridMinor;
    ctx.lineWidth = x % major === 0 ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, BASE_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= BASE_HEIGHT; y += step) {
    ctx.strokeStyle = y % major === 0 ? palette.gridMajor : palette.gridMinor;
    ctx.lineWidth = y % major === 0 ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(BASE_WIDTH, y + 0.5);
    ctx.stroke();
  }

  // Slightly darker center guides.
  ctx.strokeStyle = palette.gridCenter;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(BASE_WIDTH / 2 + 0.5, 0);
  ctx.lineTo(BASE_WIDTH / 2 + 0.5, BASE_HEIGHT);
  ctx.moveTo(0, BASE_HEIGHT / 2 + 0.5);
  ctx.lineTo(BASE_WIDTH, BASE_HEIGHT / 2 + 0.5);
  ctx.stroke();
}

function drawObjects() {
  for (let i = 0; i < state.objects.length; i++) {
    drawObject(state.objects[i], i + 1);
  }
}

function drawObject(obj, index) {
  switch (obj.type) {
    case TYPE_CIRCLE:
      drawCircle(obj);
      break;
    case TYPE_BOX:
      drawBox(obj);
      break;
    case TYPE_ARC_BOX:
      drawArcBox(obj);
      break;
    case TYPE_SHAPE:
      drawShape(obj);
      break;
    case TYPE_RIGID_GROUP:
      drawRigidGroup(obj);
      break;
    case TYPE_ROTOR:
      drawRotor(obj);
      break;
    default:
      break;
  }

  ctx.save();
  ctx.fillStyle = palette.text;
  ctx.font = "12px Consolas, 'Courier New', monospace";
  ctx.fillText(String(index), obj.x + 6, obj.y - 6);
  ctx.restore();
}

function drawCircle(obj) {
  ctx.save();
  ctx.fillStyle = obj.color === CIRCLE_COLOR_B ? palette.circleB : palette.circleA;
  ctx.strokeStyle = "#11325e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, obj.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBox(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(getObjectAngleRad(obj));
  ctx.fillStyle = obj.st ? palette.static : palette.dynamic;
  ctx.strokeStyle = "#3f5575";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(-obj.w / 2, -obj.h / 2, obj.w, obj.h);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawArcBox(obj) {
  const points = buildArcBoxLocalPoints(obj.w, obj.h, obj.cut, obj.sides ?? obj.side);
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(getObjectAngleRad(obj));
  ctx.fillStyle = obj.st ? palette.static : palette.dynamic;
  ctx.strokeStyle = "#3f5575";
  ctx.lineWidth = 1.5;
  drawClosedPath(points);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawShape(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(getObjectAngleRad(obj));
  ctx.fillStyle = obj.st ? palette.static : palette.dynamic;
  ctx.strokeStyle = "#3f5575";
  ctx.lineWidth = 1.5;
  shapePath(0, 0, obj.w, obj.h, obj.e);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRotor(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(getObjectAngleRad(obj));
  ctx.fillStyle = palette.rotor;
  ctx.strokeStyle = palette.rotorStroke;
  ctx.lineWidth = 1.8;
  if (obj.e === 4) {
    ctx.beginPath();
    ctx.rect(-obj.w / 2, -obj.h / 2, obj.w, obj.h);
  } else {
    shapePath(0, 0, obj.w, obj.h, obj.e);
  }
  ctx.fill();
  ctx.stroke();

  const parts = Array.isArray(obj.parts) ? obj.parts : [];
  for (const part of parts) drawRigidGroupPart({ st: false }, part);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = palette.pivot;
  ctx.strokeStyle = "#7488a5";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(obj.x, obj.y, obj.h / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (obj.motor) {
    ctx.strokeStyle = "#243855";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, Math.max(obj.h / 3, 10), Math.PI * 0.2, Math.PI * 1.6);
    ctx.stroke();

    const arrowX = obj.x + Math.cos(Math.PI * 1.6) * Math.max(obj.h / 3, 10);
    const arrowY = obj.y + Math.sin(Math.PI * 1.6) * Math.max(obj.h / 3, 10);
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - 6, arrowY + 3);
    ctx.lineTo(arrowX - 2, arrowY - 4);
    ctx.closePath();
    ctx.fillStyle = "#243855";
    ctx.fill();
  }
  ctx.restore();
}

function drawRigidGroup(obj) {
  ctx.save();
  ctx.translate(obj.x, obj.y);
  ctx.rotate(getObjectAngleRad(obj));
  const parts = Array.isArray(obj.parts) ? obj.parts : [];
  for (const part of parts) drawRigidGroupPart(obj, part);
  ctx.restore();
}

function drawRigidGroupPart(groupObj, part) {
  const p = sanitizeRigidGroupPart(part);
  if (!p) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.angle * Math.PI) / 180);
  ctx.fillStyle = groupObj.st ? palette.static : palette.dynamic;
  ctx.strokeStyle = "#3f5575";
  ctx.lineWidth = 1.5;
  if (p.type === TYPE_BOX) {
    ctx.beginPath();
    ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (p.type === TYPE_ARC_BOX) {
    const points = buildArcBoxLocalPoints(p.w, p.h, p.cut, p.sides ?? p.side);
    drawClosedPath(points);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  shapePath(0, 0, p.w, p.h, p.edges);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSelection() {
  const selected = getSelectedObjects();
  if (selected.length < 1) return;
  ctx.save();
  ctx.strokeStyle = palette.selection;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  for (const obj of selected) {
    const b = getBounds(obj);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.setLineDash([]);
  const primary = getSelectedObject();
  if (primary && selected.length === 1) {
    ctx.beginPath();
    ctx.moveTo(primary.x - 8, primary.y);
    ctx.lineTo(primary.x + 8, primary.y);
    ctx.moveTo(primary.x, primary.y - 8);
    ctx.lineTo(primary.x, primary.y + 8);
    ctx.stroke();
    drawResizeHandles(primary);
  }
  ctx.restore();
}

function shapePath(x, y, w, h, edges) {
  const edgeCount = clamp(Math.round(edges), 3, MAX_SHAPE_EDGES);
  ctx.beginPath();
  if (edgeCount <= 8) {
    for (let i = 0; i < edgeCount; i++) {
      const a = (i / edgeCount) * Math.PI * 2;
      const px = x + Math.cos(a) * w;
      const py = y + Math.sin(a) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    const radius = (w + h) / 2;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
}

function drawClosedPath(points) {
  ctx.beginPath();
  if (!Array.isArray(points) || points.length < 1) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
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

function hasArcSide(sides, side) {
  return normalizeArcSides(sides, null).includes(normalizeArcSide(side));
}

function toggleArcSide(sides, side, enabled) {
  const target = normalizeArcSide(side);
  const set = new Set(normalizeArcSides(sides, null));
  if (enabled) set.add(target);
  else set.delete(target);
  return ARC_SIDE_ORDER.filter((entry) => set.has(entry));
}

function arcSidesLabel(sides) {
  const list = normalizeArcSides(sides, null);
  if (list.length < 1) return "none";
  return list.join("+");
}

function clampArcCut(value) {
  return clamp(Number(value) || 0, -ARC_BOX_MAX_CUT, ARC_BOX_MAX_CUT);
}

function normalizeRotorMotorSpeedDeg(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_ROTOR_MOTOR_SPEED_DEG;
  return clamp(Math.abs(raw), 0, 1000000);
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
  return clamp(raw, 0, 1e15);
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
  const useCCW = distance(ccwPoint.x, ccwPoint.y, targetPoint.x, targetPoint.y) <= distance(cwPoint.x, cwPoint.y, targetPoint.x, targetPoint.y);
  const span = useCCW ? ccwSpan : cwSpan;

  const steps = Math.max(6, Math.round(segments));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = a1 + (span * i) / steps;
    out.push({
      x: center.x + Math.cos(a) * radius,
      y: center.y + Math.sin(a) * radius
    });
  }
  return out;
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

  const chord = distance(p1.x, p1.y, p2.x, p2.y);
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
    y: midpoint.y - bulge.y * centerOffset
  };
  const target = {
    x: midpoint.x + bulge.x * notchDepth,
    y: midpoint.y + bulge.y * notchDepth
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
    { side: ARC_SIDE_LEFT, end: tl }
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
    if (distance(last.x, last.y, tl.x, tl.y) < 1e-6) out.pop();
  }
  return out;
}

function getObjectAngleDeg(obj) {
  if (!obj || (obj.type !== TYPE_BOX && obj.type !== TYPE_ARC_BOX && obj.type !== TYPE_SHAPE && obj.type !== TYPE_RIGID_GROUP && obj.type !== TYPE_ROTOR)) return 0;
  return Number.isFinite(obj.angle) ? obj.angle : 0;
}

function normalizeAngleDeg(value) {
  let out = Number(value) || 0;
  while (out <= -180) out += 360;
  while (out > 180) out -= 360;
  return out;
}

function getObjectAngleRad(obj) {
  return (getObjectAngleDeg(obj) * Math.PI) / 180;
}

function toLocalPoint(px, py, cx, cy, angleRad) {
  const dx = px - cx;
  const dy = py - cy;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return {
    x: dx * cosA + dy * sinA,
    y: -dx * sinA + dy * cosA
  };
}

function rotatePoint(px, py, angleRad) {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  return {
    x: px * cosA - py * sinA,
    y: px * sinA + py * cosA
  };
}

function localToWorldPoint(localX, localY, cx, cy, angleRad) {
  const r = rotatePoint(localX, localY, angleRad);
  return { x: cx + r.x, y: cy + r.y };
}

function isRectLikeObject(obj) {
  return obj.type === TYPE_BOX || obj.type === TYPE_ARC_BOX || (obj.type === TYPE_ROTOR && obj.e === 4);
}

function canResizeObject(obj) {
  return Boolean(obj) && obj.type !== TYPE_CIRCLE && obj.type !== TYPE_RIGID_GROUP;
}

function getObjectHalfExtents(obj) {
  if (isRectLikeObject(obj)) return { halfW: obj.w / 2, halfH: obj.h / 2, minHalfW: 0.5, minHalfH: 0.5 };
  return { halfW: obj.w, halfH: obj.h, minHalfW: 1, minHalfH: 1 };
}

function buildResizeHandles(obj) {
  if (!canResizeObject(obj)) return [];
  const ext = getObjectHalfExtents(obj);
  const angle = getObjectAngleRad(obj);
  const rawHandles = [
    { objectId: obj.id, kind: "side", axis: "x", side: -1, localX: -ext.halfW, localY: 0 },
    { objectId: obj.id, kind: "side", axis: "x", side: 1, localX: ext.halfW, localY: 0 },
    { objectId: obj.id, kind: "side", axis: "y", side: -1, localX: 0, localY: -ext.halfH },
    { objectId: obj.id, kind: "side", axis: "y", side: 1, localX: 0, localY: ext.halfH },
    { objectId: obj.id, kind: "corner", sideX: -1, sideY: -1, localX: -ext.halfW, localY: -ext.halfH },
    { objectId: obj.id, kind: "corner", sideX: 1, sideY: -1, localX: ext.halfW, localY: -ext.halfH },
    { objectId: obj.id, kind: "corner", sideX: -1, sideY: 1, localX: -ext.halfW, localY: ext.halfH },
    { objectId: obj.id, kind: "corner", sideX: 1, sideY: 1, localX: ext.halfW, localY: ext.halfH },
    { objectId: obj.id, kind: "rotate", localX: 0, localY: -ext.halfH - ROTATE_HANDLE_OFFSET }
  ];
  return rawHandles.map((h) => {
    const world = localToWorldPoint(h.localX, h.localY, obj.x, obj.y, angle);
    return { ...h, x: world.x, y: world.y };
  });
}

function getResizeHandleSignature(handle) {
  if (!handle) return "";
  if (handle.kind === "rotate") return `${handle.objectId}:rotate`;
  if (handle.kind === "corner") return `${handle.objectId}:corner:${handle.sideX}:${handle.sideY}`;
  return `${handle.objectId}:side:${handle.axis}:${handle.side}`;
}

function sameResizeHandle(a, b) {
  return getResizeHandleSignature(a) !== "" && getResizeHandleSignature(a) === getResizeHandleSignature(b);
}

function shouldShowResizeHandlesAt(obj, px, py) {
  if (state.resizing) return true;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
  const bounds = getBounds(obj);
  const handles = buildResizeHandles(obj);
  let minX = bounds.x;
  let maxX = bounds.x + bounds.w;
  let minY = bounds.y;
  let maxY = bounds.y + bounds.h;
  for (const handle of handles) {
    minX = Math.min(minX, handle.x);
    maxX = Math.max(maxX, handle.x);
    minY = Math.min(minY, handle.y);
    maxY = Math.max(maxY, handle.y);
  }
  return (
    px >= minX - RESIZE_HANDLE_SHOW_MARGIN &&
    px <= maxX + RESIZE_HANDLE_SHOW_MARGIN &&
    py >= minY - RESIZE_HANDLE_SHOW_MARGIN &&
    py <= maxY + RESIZE_HANDLE_SHOW_MARGIN
  );
}

function getResizeHandleAt(px, py, force = false) {
  if (getSelectedObjects().length !== 1) return null;
  const obj = getSelectedObject();
  if (!obj || !canResizeObject(obj)) return null;
  if (!force && !shouldShowResizeHandlesAt(obj, px, py)) return null;
  const handles = buildResizeHandles(obj);
  for (const handle of handles) {
    if (distance(px, py, handle.x, handle.y) <= RESIZE_HANDLE_HIT_RADIUS) return handle;
  }
  return null;
}

function cursorForResizeHandle(handle) {
  if (!handle) return "crosshair";
  if (handle.kind === "rotate") return "grab";
  if (handle.kind === "corner") return handle.sideX === handle.sideY ? "nwse-resize" : "nesw-resize";
  return handle.axis === "x" ? "ew-resize" : "ns-resize";
}

function drawResizeHandles(obj) {
  if (!canResizeObject(obj)) return;
  if (!shouldShowResizeHandlesAt(obj, state.hoverCanvasX, state.hoverCanvasY) && !state.resizing) return;
  const handles = buildResizeHandles(obj);
  const half = RESIZE_HANDLE_DRAW_SIZE / 2;
  const angle = getObjectAngleRad(obj);
  const ext = getObjectHalfExtents(obj);
  const anchor = localToWorldPoint(0, -ext.halfH, obj.x, obj.y, angle);
  const rotateHandle = handles.find((h) => h.kind === "rotate");

  if (rotateHandle) {
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#7a8ea9";
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(rotateHandle.x, rotateHandle.y);
    ctx.stroke();
  }

  for (const handle of handles) {
    const active = sameResizeHandle(handle, state.resizeHandle);
    const hover = sameResizeHandle(handle, state.hoverResizeHandle);
    if (handle.kind === "rotate") {
      ctx.lineWidth = active || hover ? 2 : 1.5;
      ctx.strokeStyle = active || hover ? palette.selection : "#7a8ea9";
      ctx.fillStyle = active ? "#ffe4e4" : hover ? "#fff3f3" : "#ffffff";
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }
    ctx.lineWidth = active || hover ? 2 : 1.5;
    ctx.strokeStyle = active || hover ? palette.selection : "#7a8ea9";
    ctx.fillStyle = active ? "#ffe4e4" : hover ? "#fff3f3" : "#ffffff";
    ctx.beginPath();
    ctx.rect(handle.x - half, handle.y - half, RESIZE_HANDLE_DRAW_SIZE, RESIZE_HANDLE_DRAW_SIZE);
    ctx.fill();
    ctx.stroke();
  }
}

function quantizeEditValue(value, axis) {
  const step = state.snapEnabled ? state.snapSize : getEditStepPx(axis);
  if (!Number.isFinite(step) || step <= 0) return value;
  return snap(value, step);
}

function refreshHoverFeedback(point) {
  if (!point) {
    state.hoverResizeHandle = null;
    if (!state.dragging && !state.resizing && !state.rotating) els.canvas.style.cursor = "crosshair";
    return;
  }
  state.hoverResizeHandle = getResizeHandleAt(point.x, point.y);
  if (state.resizing && state.resizeHandle) {
    els.canvas.style.cursor = cursorForResizeHandle(state.resizeHandle);
    return;
  }
  if (state.rotating) {
    els.canvas.style.cursor = "grabbing";
    return;
  }
  if (state.dragging) {
    els.canvas.style.cursor = "grabbing";
    return;
  }
  if (state.hoverResizeHandle) {
    els.canvas.style.cursor = cursorForResizeHandle(state.hoverResizeHandle);
    return;
  }
  const hoveredObj = getTopObjectAt(point.x, point.y);
  els.canvas.style.cursor = hoveredObj ? "move" : "crosshair";
}

function applyResizeDrag(obj, point, options = {}) {
  if (!obj || !state.resizeHandle || !state.resizeStart) return;
  const start = state.resizeStart;
  const angleRad = ((Number(start.angleDeg) || 0) * Math.PI) / 180;
  const rectLike = isRectLikeObject(obj);
  const ext = getObjectHalfExtents(obj);
  const minHalfX = ext.minHalfW;
  const minHalfY = ext.minHalfH;
  const startHalfX = start.w / 2;
  const startHalfY = start.h / 2;
  const minSpanX = minHalfX * 2;
  const minSpanY = minHalfY * 2;
  const localPoint = toLocalPoint(point.x, point.y, start.x, start.y, angleRad);
  const qx = quantizeEditValue(localPoint.x, "x");
  const qy = quantizeEditValue(localPoint.y, "y");
  const symmetric = Boolean(options.symmetric);
  const uniform = Boolean(options.uniform);

  function applyHalfExtents(centerLocalX, centerLocalY, halfX, halfY) {
    const center = localToWorldPoint(centerLocalX, centerLocalY, start.x, start.y, angleRad);
    obj.x = center.x;
    obj.y = center.y;
    obj.w = rectLike ? halfX * 2 : halfX;
    obj.h = rectLike ? halfY * 2 : halfY;
  }

  if (state.resizeHandle.kind === "corner") {
    const sideX = state.resizeHandle.sideX;
    const sideY = state.resizeHandle.sideY;
    if (symmetric) {
      let halfX = Math.max(minHalfX, sideX > 0 ? qx : -qx);
      let halfY = Math.max(minHalfY, sideY > 0 ? qy : -qy);
      if (uniform) {
        const sx = halfX / Math.max(1e-9, startHalfX);
        const sy = halfY / Math.max(1e-9, startHalfY);
        const scale = Math.max(sx, sy);
        halfX = Math.max(minHalfX, startHalfX * scale);
        halfY = Math.max(minHalfY, startHalfY * scale);
      }
      applyHalfExtents(0, 0, halfX, halfY);
      sanitizeObject(obj);
      return;
    }

    let left = start.left;
    let right = start.right;
    let top = start.top;
    let bottom = start.bottom;
    if (sideX > 0) right = Math.max(qx, left + minSpanX);
    else left = Math.min(qx, right - minSpanX);
    if (sideY > 0) bottom = Math.max(qy, top + minSpanY);
    else top = Math.min(qy, bottom - minSpanY);

    if (uniform) {
      const startSpanX = start.right - start.left;
      const startSpanY = start.bottom - start.top;
      const spanX = right - left;
      const spanY = bottom - top;
      const scale = Math.max(spanX / Math.max(1e-9, startSpanX), spanY / Math.max(1e-9, startSpanY));
      const targetX = Math.max(minSpanX, startSpanX * scale);
      const targetY = Math.max(minSpanY, startSpanY * scale);
      if (sideX > 0) right = start.left + targetX; else left = start.right - targetX;
      if (sideY > 0) bottom = start.top + targetY; else top = start.bottom - targetY;
    }

    applyHalfExtents((left + right) / 2, (top + bottom) / 2, (right - left) / 2, (bottom - top) / 2);
    sanitizeObject(obj);
    return;
  }

  if (uniform) {
    const axisIsX = state.resizeHandle.axis === "x";
    const movedHalf = axisIsX
      ? Math.max(minHalfX, state.resizeHandle.side > 0 ? qx : -qx)
      : Math.max(minHalfY, state.resizeHandle.side > 0 ? qy : -qy);
    const sourceHalf = axisIsX ? startHalfX : startHalfY;
    const scale = Math.max(movedHalf / Math.max(1e-9, sourceHalf), 0);
    const halfX = Math.max(minHalfX, startHalfX * scale);
    const halfY = Math.max(minHalfY, startHalfY * scale);
    applyHalfExtents(0, 0, halfX, halfY);
    sanitizeObject(obj);
    return;
  }

  if (state.resizeHandle.axis === "x") {
    if (symmetric) {
      let half = state.resizeHandle.side > 0 ? qx : -qx;
      half = Math.max(minHalfX, half);
      applyHalfExtents(0, 0, half, startHalfY);
    } else {
      let left = start.left;
      let right = start.right;
      if (state.resizeHandle.side > 0) right = Math.max(qx, left + minSpanX);
      else left = Math.min(qx, right - minSpanX);
      applyHalfExtents((left + right) / 2, 0, (right - left) / 2, startHalfY);
    }
  } else {
    if (symmetric) {
      let half = state.resizeHandle.side > 0 ? qy : -qy;
      half = Math.max(minHalfY, half);
      applyHalfExtents(0, 0, startHalfX, half);
    } else {
      let top = start.top;
      let bottom = start.bottom;
      if (state.resizeHandle.side > 0) bottom = Math.max(qy, top + minSpanY);
      else top = Math.min(qy, bottom - minSpanY);
      applyHalfExtents(0, (top + bottom) / 2, startHalfX, (bottom - top) / 2);
    }
  }
  sanitizeObject(obj);
}

function onPointerDown(event) {
  const point = getCanvasPoint(event);
  state.hoverCanvasX = point.x;
  state.hoverCanvasY = point.y;

  const resizeHandle = getResizeHandleAt(point.x, point.y, true);
  if (resizeHandle) {
    const obj = getSelectedObject();
    if (obj) {
      if (resizeHandle.kind === "rotate") {
        state.rotating = true;
        state.rotatePointerId = event.pointerId;
        state.rotateStart = {
          startObjectAngle: getObjectAngleDeg(obj),
          startPointerAngle: Math.atan2(point.y - obj.y, point.x - obj.x) * 180 / Math.PI
        };
        state.dragging = false;
        state.draggingPointerId = null;
        state.resizing = false;
        state.resizePointerId = null;
        state.resizeHandle = null;
        state.resizeStart = null;
        state.hoverResizeHandle = resizeHandle;
        els.canvas.style.cursor = "grabbing";
        els.canvas.setPointerCapture(event.pointerId);
        return;
      }
      const ext = getObjectHalfExtents(obj);
      state.resizing = true;
      state.resizePointerId = event.pointerId;
      state.resizeHandle = { ...resizeHandle };
      state.resizeStart = {
        x: obj.x,
        y: obj.y,
        w: ext.halfW * 2,
        h: ext.halfH * 2,
        left: -ext.halfW,
        right: ext.halfW,
        top: -ext.halfH,
        bottom: ext.halfH,
        angleDeg: getObjectAngleDeg(obj)
      };
      state.dragging = false;
      state.draggingPointerId = null;
      state.hoverResizeHandle = resizeHandle;
      els.canvas.style.cursor = cursorForResizeHandle(resizeHandle);
      els.canvas.setPointerCapture(event.pointerId);
      return;
    }
  }

  const hit = getTopObjectAt(point.x, point.y);
  if (!hit) {
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) setSingleSelection(null);
    state.dragging = false;
    state.draggingPointerId = null;
    state.hoverResizeHandle = null;
    renderObjectList();
    renderPropertyEditor();
    persist();
    refreshHoverFeedback(point);
    return;
  }

  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    toggleSelection(hit.id);
    state.dragging = false;
    state.draggingPointerId = null;
    state.hoverResizeHandle = null;
    renderObjectList();
    renderPropertyEditor();
    persist();
    refreshHoverFeedback(point);
    return;
  }

  setSingleSelection(hit.id);
  state.dragging = true;
  state.resizing = false;
  state.resizePointerId = null;
  state.resizeHandle = null;
  state.resizeStart = null;
  state.draggingPointerId = event.pointerId;
  state.dragOffsetX = point.x - hit.x;
  state.dragOffsetY = point.y - hit.y;
  state.hoverResizeHandle = null;
  els.canvas.style.cursor = "grabbing";
  els.canvas.setPointerCapture(event.pointerId);
  renderObjectList();
  renderPropertyEditor();
}

function onPointerMove(event) {
  const point = getCanvasPoint(event);
  state.hoverCanvasX = point.x;
  state.hoverCanvasY = point.y;

  if (state.rotating && state.rotatePointerId === event.pointerId) {
    const obj = getSelectedObject();
    if (!obj || !state.rotateStart) return;
    const pointerAngle = Math.atan2(point.y - obj.y, point.x - obj.x) * 180 / Math.PI;
    let angle = state.rotateStart.startObjectAngle + (pointerAngle - state.rotateStart.startPointerAngle);
    if (event.shiftKey) angle = Math.round(angle / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
    obj.angle = normalizeAngleDeg(angle);
    sanitizeObject(obj);
    renderPropertyEditor(true);
    renderObjectList();
    renderExport();
    persist();
    refreshHoverFeedback(point);
    return;
  }

  if (state.resizing && state.resizePointerId === event.pointerId) {
    const obj = getSelectedObject();
    if (!obj) return;
    applyResizeDrag(obj, point, { symmetric: event.ctrlKey || event.metaKey, uniform: event.shiftKey });
    renderPropertyEditor(true);
    renderObjectList();
    renderExport();
    persist();
    refreshHoverFeedback(point);
    return;
  }

  if (state.dragging && state.draggingPointerId === event.pointerId) {
    const obj = getSelectedObject();
    if (!obj) return;

    let nextX = point.x - state.dragOffsetX;
    let nextY = point.y - state.dragOffsetY;

    if (state.snapEnabled) {
      nextX = snap(nextX, state.snapSize);
      nextY = snap(nextY, state.snapSize);
    }

    obj.x = clamp(nextX, -BASE_WIDTH * 2, BASE_WIDTH * 3);
    obj.y = clamp(nextY, -BASE_HEIGHT * 2, BASE_HEIGHT * 3);

    renderPropertyEditor(true);
    renderObjectList();
    persist();
    refreshHoverFeedback(point);
    return;
  }

  refreshHoverFeedback(point);
}

function onPointerUp(event) {
  if (state.rotatePointerId === event.pointerId) {
    state.rotating = false;
    state.rotatePointerId = null;
    state.rotateStart = null;
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch (_e) {
      // No-op if pointer capture was not active.
    }
  }
  if (state.resizePointerId === event.pointerId) {
    state.resizing = false;
    state.resizePointerId = null;
    state.resizeHandle = null;
    state.resizeStart = null;
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch (_e) {
      // No-op if pointer capture was not active.
    }
  }
  if (state.draggingPointerId === event.pointerId) {
    state.dragging = false;
    state.draggingPointerId = null;
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch (_e) {
      // No-op if pointer capture was not active.
    }
  }
  const point = getCanvasPoint(event);
  state.hoverCanvasX = point.x;
  state.hoverCanvasY = point.y;
  refreshHoverFeedback(point);
}

function onPointerLeave() {
  state.hoverCanvasX = null;
  state.hoverCanvasY = null;
  if (!state.dragging && !state.resizing && !state.rotating) {
    state.hoverResizeHandle = null;
    els.canvas.style.cursor = "crosshair";
  }
}

function onKeyDown(event) {
  if (isTypingTarget(event.target)) return;
  const selected = getSelectedObjects();
  if (selected.length < 1) return;

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelectedObject();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelectedObject();
    return;
  }

  const nudgeX = state.snapEnabled ? state.snapSize : getEditStepPx("x");
  const nudgeY = state.snapEnabled ? state.snapSize : getEditStepPx("y");
  const stepX = event.shiftKey ? nudgeX * 5 : nudgeX;
  const stepY = event.shiftKey ? nudgeY * 5 : nudgeY;
  let changed = false;
  if (event.key === "ArrowLeft") {
    for (const obj of selected) obj.x -= stepX;
    changed = true;
  } else if (event.key === "ArrowRight") {
    for (const obj of selected) obj.x += stepX;
    changed = true;
  } else if (event.key === "ArrowUp") {
    for (const obj of selected) obj.y -= stepY;
    changed = true;
  } else if (event.key === "ArrowDown") {
    for (const obj of selected) obj.y += stepY;
    changed = true;
  }

  if (changed) {
    event.preventDefault();
    for (const obj of selected) {
      if (state.snapEnabled) {
        obj.x = snap(obj.x, state.snapSize);
        obj.y = snap(obj.y, state.snapSize);
      }
      sanitizeObject(obj);
    }
    renderPropertyEditor();
    renderObjectList();
    renderExport();
    persist();
  }
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function getCanvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * BASE_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * BASE_HEIGHT
  };
}

function getTopObjectAt(x, y) {
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];
    if (containsPoint(obj, x, y)) return obj;
  }
  return null;
}

function containsPoint(obj, x, y) {
  if (obj.type === TYPE_CIRCLE) {
    return distance(x, y, obj.x, obj.y) <= obj.r;
  }

  if (obj.type === TYPE_BOX) {
    return pointInRotatedBox(x, y, obj.x, obj.y, obj.w, obj.h, getObjectAngleDeg(obj));
  }

  if (obj.type === TYPE_ARC_BOX) {
    const local = toLocalPoint(x, y, obj.x, obj.y, (getObjectAngleDeg(obj) * Math.PI) / 180);
    const points = buildArcBoxLocalPoints(obj.w, obj.h, obj.cut, obj.sides ?? obj.side);
    return pointInPolygon(local.x, local.y, points);
  }

  if (obj.type === TYPE_SHAPE) {
    return pointInCustomShape(
      x,
      y,
      obj.x,
      obj.y,
      obj.w,
      obj.h,
      obj.e,
      getObjectAngleDeg(obj)
    );
  }

  if (obj.type === TYPE_RIGID_GROUP) {
    return pointInRigidGroup(x, y, obj);
  }

  if (obj.type === TYPE_ROTOR) {
    return pointInRotor(x, y, obj);
  }

  return false;
}

function pointInRotor(px, py, obj) {
  const rotorLocal = toLocalPoint(px, py, obj.x, obj.y, getObjectAngleRad(obj));
  if (obj.e === 4) {
    if (rotorLocal.x >= -obj.w / 2 && rotorLocal.x <= obj.w / 2 && rotorLocal.y >= -obj.h / 2 && rotorLocal.y <= obj.h / 2) return true;
  } else {
    const e = clamp(Math.round(obj.e), 3, MAX_SHAPE_EDGES);
    if (e <= 8) {
      const points = [];
      for (let i = 0; i < e; i++) {
        const a = (i / e) * Math.PI * 2;
        points.push({ x: Math.cos(a) * obj.w, y: Math.sin(a) * obj.h });
      }
      if (pointInPolygon(rotorLocal.x, rotorLocal.y, points)) return true;
    } else {
      const radius = (obj.w + obj.h) / 2;
      if (distance(rotorLocal.x, rotorLocal.y, 0, 0) <= radius) return true;
    }
  }

  const parts = Array.isArray(obj.parts) ? obj.parts : [];
  for (const rawPart of parts) {
    const part = sanitizeRigidGroupPart(rawPart);
    if (!part) continue;
    const partLocal = toLocalPoint(rotorLocal.x, rotorLocal.y, part.x, part.y, (part.angle * Math.PI) / 180);
    if (part.type === TYPE_BOX) {
      if (partLocal.x >= -part.w / 2 && partLocal.x <= part.w / 2 && partLocal.y >= -part.h / 2 && partLocal.y <= part.h / 2) return true;
      continue;
    }
    if (part.type === TYPE_ARC_BOX) {
      const points = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.sides ?? part.side);
      if (pointInPolygon(partLocal.x, partLocal.y, points)) return true;
      continue;
    }
    if (part.type === TYPE_SHAPE) {
      const e = clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES);
      if (e <= 8) {
        const points = [];
        for (let i = 0; i < e; i++) {
          const a = (i / e) * Math.PI * 2;
          points.push({ x: Math.cos(a) * part.w, y: Math.sin(a) * part.h });
        }
        if (pointInPolygon(partLocal.x, partLocal.y, points)) return true;
      } else {
        const radius = (part.w + part.h) / 2;
        if (distance(partLocal.x, partLocal.y, 0, 0) <= radius) return true;
      }
    }
  }
  return false;
}

function pointInRigidGroup(px, py, obj) {
  const groupLocal = toLocalPoint(px, py, obj.x, obj.y, getObjectAngleRad(obj));
  const parts = Array.isArray(obj.parts) ? obj.parts : [];
  for (const rawPart of parts) {
    const part = sanitizeRigidGroupPart(rawPart);
    if (!part) continue;
    const partLocal = toLocalPoint(groupLocal.x, groupLocal.y, part.x, part.y, (part.angle * Math.PI) / 180);
    if (part.type === TYPE_BOX) {
      if (partLocal.x >= -part.w / 2 && partLocal.x <= part.w / 2 && partLocal.y >= -part.h / 2 && partLocal.y <= part.h / 2) return true;
      continue;
    }
    if (part.type === TYPE_ARC_BOX) {
      const points = buildArcBoxLocalPoints(part.w, part.h, part.cut, part.sides ?? part.side);
      if (pointInPolygon(partLocal.x, partLocal.y, points)) return true;
      continue;
    }
    if (part.type === TYPE_SHAPE) {
      const e = clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES);
      if (e <= 8) {
        const points = [];
        for (let i = 0; i < e; i++) {
          const a = (i / e) * Math.PI * 2;
          points.push({ x: Math.cos(a) * part.w, y: Math.sin(a) * part.h });
        }
        if (pointInPolygon(partLocal.x, partLocal.y, points)) return true;
      } else {
        const radius = (part.w + part.h) / 2;
        if (distance(partLocal.x, partLocal.y, 0, 0) <= radius) return true;
      }
    }
  }
  return false;
}

function pointInRotatedBox(px, py, x, y, w, h, angleDeg) {
  const local = toLocalPoint(px, py, x, y, (angleDeg * Math.PI) / 180);
  return local.x >= -w / 2 && local.x <= w / 2 && local.y >= -h / 2 && local.y <= h / 2;
}

function pointInCustomShape(px, py, x, y, w, h, edges, angleDeg = 0) {
  const e = clamp(Math.round(edges), 3, MAX_SHAPE_EDGES);
  const local = toLocalPoint(px, py, x, y, (angleDeg * Math.PI) / 180);
  if (e <= 8) {
    const points = [];
    for (let i = 0; i < e; i++) {
      const a = (i / e) * Math.PI * 2;
      points.push({ x: Math.cos(a) * w, y: Math.sin(a) * h });
    }
    return pointInPolygon(local.x, local.y, points);
  }
  const radius = (w + h) / 2;
  return distance(local.x, local.y, 0, 0) <= radius;
}

function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function getRotatedRectBounds(x, y, w, h, angleDeg) {
  const angle = (angleDeg * Math.PI) / 180;
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: -w / 2, y: h / 2 },
    { x: w / 2, y: h / 2 }
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const r = rotatePoint(c.x, c.y, angle);
    const wx = x + r.x;
    const wy = y + r.y;
    minX = Math.min(minX, wx);
    minY = Math.min(minY, wy);
    maxX = Math.max(maxX, wx);
    maxY = Math.max(maxY, wy);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getRotatedShapeBounds(x, y, w, h, edges, angleDeg) {
  const e = clamp(Math.round(edges), 3, MAX_SHAPE_EDGES);
  if (e > 8) {
    const radius = (w + h) / 2;
    return { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 };
  }
  const angle = (angleDeg * Math.PI) / 180;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < e; i++) {
    const a = (i / e) * Math.PI * 2;
    const localX = Math.cos(a) * w;
    const localY = Math.sin(a) * h;
    const r = rotatePoint(localX, localY, angle);
    const wx = x + r.x;
    const wy = y + r.y;
    minX = Math.min(minX, wx);
    minY = Math.min(minY, wy);
    maxX = Math.max(maxX, wx);
    maxY = Math.max(maxY, wy);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function getBounds(obj) {
  if (obj.type === TYPE_CIRCLE) {
    return { x: obj.x - obj.r, y: obj.y - obj.r, w: obj.r * 2, h: obj.r * 2 };
  }
  if (obj.type === TYPE_BOX || obj.type === TYPE_ARC_BOX) {
    return getRotatedRectBounds(obj.x, obj.y, obj.w, obj.h, getObjectAngleDeg(obj));
  }
  if (obj.type === TYPE_SHAPE) {
    return getRotatedShapeBounds(obj.x, obj.y, obj.w, obj.h, obj.e, getObjectAngleDeg(obj));
  }
  if (obj.type === TYPE_ROTOR) {
    return getRotorBounds(obj);
  }
  if (obj.type === TYPE_RIGID_GROUP) {
    return getRigidGroupBounds(obj);
  }
  return { x: obj.x - 10, y: obj.y - 10, w: 20, h: 20 };
}

function getRotorBounds(obj) {
  const angle = getObjectAngleRad(obj);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const coreLocalBounds = obj.e === 4
    ? getRotatedRectBounds(0, 0, obj.w, obj.h, 0)
    : getRotatedShapeBounds(0, 0, obj.w, obj.h, obj.e, 0);

  const coreCorners = [
    { x: coreLocalBounds.x, y: coreLocalBounds.y },
    { x: coreLocalBounds.x + coreLocalBounds.w, y: coreLocalBounds.y },
    { x: coreLocalBounds.x, y: coreLocalBounds.y + coreLocalBounds.h },
    { x: coreLocalBounds.x + coreLocalBounds.w, y: coreLocalBounds.y + coreLocalBounds.h }
  ];
  for (const corner of coreCorners) {
    const world = localToWorldPoint(corner.x, corner.y, obj.x, obj.y, angle);
    minX = Math.min(minX, world.x);
    minY = Math.min(minY, world.y);
    maxX = Math.max(maxX, world.x);
    maxY = Math.max(maxY, world.y);
  }

  const parts = Array.isArray(obj.parts) ? obj.parts : [];
  for (const rawPart of parts) {
    const part = sanitizeRigidGroupPart(rawPart);
    if (!part) continue;
    let partBounds;
    if (part.type === TYPE_BOX || part.type === TYPE_ARC_BOX) {
      partBounds = getRotatedRectBounds(part.x, part.y, part.w, part.h, part.angle);
    } else {
      partBounds = getRotatedShapeBounds(part.x, part.y, part.w, part.h, part.edges, part.angle);
    }
    const corners = [
      { x: partBounds.x, y: partBounds.y },
      { x: partBounds.x + partBounds.w, y: partBounds.y },
      { x: partBounds.x, y: partBounds.y + partBounds.h },
      { x: partBounds.x + partBounds.w, y: partBounds.y + partBounds.h }
    ];
    for (const corner of corners) {
      const world = localToWorldPoint(corner.x, corner.y, obj.x, obj.y, angle);
      minX = Math.min(minX, world.x);
      minY = Math.min(minY, world.y);
      maxX = Math.max(maxX, world.x);
      maxY = Math.max(maxY, world.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: obj.x - 10, y: obj.y - 10, w: 20, h: 20 };
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function getRigidGroupBounds(obj) {
  const parts = Array.isArray(obj.parts) ? obj.parts : [];
  if (parts.length < 1) return { x: obj.x - 10, y: obj.y - 10, w: 20, h: 20 };
  const groupAngle = getObjectAngleRad(obj);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const rawPart of parts) {
    const part = sanitizeRigidGroupPart(rawPart);
    if (!part) continue;
    let partBounds;
    if (part.type === TYPE_BOX || part.type === TYPE_ARC_BOX) {
      partBounds = getRotatedRectBounds(part.x, part.y, part.w, part.h, part.angle);
    } else {
      partBounds = getRotatedShapeBounds(part.x, part.y, part.w, part.h, part.edges, part.angle);
    }
    const corners = [
      { x: partBounds.x, y: partBounds.y },
      { x: partBounds.x + partBounds.w, y: partBounds.y },
      { x: partBounds.x, y: partBounds.y + partBounds.h },
      { x: partBounds.x + partBounds.w, y: partBounds.y + partBounds.h }
    ];
    for (const corner of corners) {
      const world = localToWorldPoint(corner.x, corner.y, obj.x, obj.y, groupAngle);
      minX = Math.min(minX, world.x);
      minY = Math.min(minY, world.y);
      maxX = Math.max(maxX, world.x);
      maxY = Math.max(maxY, world.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { x: obj.x - 10, y: obj.y - 10, w: 20, h: 20 };
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function createBox() {
  return {
    id: state.nextId++,
    type: TYPE_BOX,
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT / 2,
    w: BASE_WIDTH / 4,
    h: BASE_HEIGHT / 20,
    angle: 0,
    st: true
  };
}

function createArcBox() {
  return {
    id: state.nextId++,
    type: TYPE_ARC_BOX,
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT / 2,
    w: BASE_WIDTH / 5,
    h: BASE_HEIGHT / 5,
    cut: 0.25,
    sides: [ARC_SIDE_TOP],
    angle: 0,
    st: true
  };
}

function createShape() {
  return {
    id: state.nextId++,
    type: TYPE_SHAPE,
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT / 2,
    w: BASE_WIDTH / 25,
    h: BASE_HEIGHT / 25,
    e: 6,
    angle: 0,
    st: false
  };
}

function createRotor(edges) {
  return {
    id: state.nextId++,
    type: TYPE_ROTOR,
    x: BASE_WIDTH / 2,
    y: BASE_HEIGHT / 2,
    w: BASE_WIDTH / 3,
    h: BASE_HEIGHT / 20,
    e: clamp(Math.round(edges), 3, MAX_SHAPE_EDGES),
    angle: 0,
    motor: false,
    motorSpeed: DEFAULT_ROTOR_MOTOR_SPEED_DEG,
    motorDirection: DEFAULT_ROTOR_MOTOR_DIRECTION,
    motorTorque: DEFAULT_ROTOR_MOTOR_TORQUE,
    parts: []
  };
}

function getSelectedIdSet() {
  return new Set(Array.isArray(state.selectedIds) ? state.selectedIds : []);
}

function getObjectById(id) {
  if (!Number.isInteger(id)) return null;
  return state.objects.find((obj) => obj.id === id) || null;
}

function setSingleSelection(id) {
  if (!Number.isInteger(id)) {
    state.selectedId = null;
    state.selectedIds = [];
    return;
  }
  state.selectedId = id;
  state.selectedIds = [id];
}

function toggleSelection(id) {
  if (!Number.isInteger(id)) return;
  const target = getObjectById(id);
  if (!target) return;
  if (target.type === TYPE_CIRCLE) {
    renderStatus("Player circles are single-select only.");
    return;
  }
  const set = getSelectedIdSet();
  for (const selectedId of Array.from(set)) {
    const selectedObj = getObjectById(selectedId);
    if (selectedObj && selectedObj.type === TYPE_CIRCLE) set.delete(selectedId);
  }
  if (set.has(id)) set.delete(id);
  else set.add(id);
  state.selectedIds = Array.from(set);
  if (set.size < 1) {
    state.selectedId = null;
    return;
  }
  if (!set.has(state.selectedId)) state.selectedId = state.selectedIds[state.selectedIds.length - 1] ?? null;
}

function normalizeSelection() {
  const objectById = new Map(state.objects.map((obj) => [obj.id, obj]));
  const valid = new Set(objectById.keys());
  const out = [];
  for (const id of state.selectedIds || []) {
    if (valid.has(id) && !out.includes(id)) out.push(id);
  }
  const normalized = out.length > 1
    ? out.filter((id) => objectById.get(id)?.type !== TYPE_CIRCLE)
    : out;
  state.selectedIds = normalized;
  if (state.selectedIds.length < 1) {
    state.selectedId = null;
    return;
  }
  if (!state.selectedIds.includes(state.selectedId)) state.selectedId = state.selectedIds[state.selectedIds.length - 1];
}

function getSelectedObjects() {
  normalizeSelection();
  const selected = getSelectedIdSet();
  return state.objects.filter((obj) => selected.has(obj.id));
}

function insertObject(obj) {
  if (obj.type === TYPE_CIRCLE) {
    renderStatus("Player circles are fixed per level (A and B).");
    return;
  }
  if (state.snapEnabled) {
    obj.x = snap(obj.x, state.snapSize);
    obj.y = snap(obj.y, state.snapSize);
  }
  state.objects.push(obj);
  setSingleSelection(obj.id);
  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
}

function deleteSelectedObject() {
  const selectedSet = getSelectedIdSet();
  if (selectedSet.size < 1) return;
  const circleIds = new Set(
    state.objects
      .filter((obj) => obj.type === TYPE_CIRCLE)
      .map((obj) => obj.id)
  );
  const survivors = state.objects.filter((obj) => !selectedSet.has(obj.id) || circleIds.has(obj.id));
  if (survivors.length === state.objects.length) {
    if (Array.from(selectedSet).some((id) => circleIds.has(id))) {
      renderStatus("Player circles cannot be deleted.");
    }
    return;
  }
  state.objects = survivors;
  ensureMandatoryCircles();
  if (state.objects.length < 1) setSingleSelection(null);
  else setSingleSelection(state.objects[Math.max(0, state.objects.length - 1)].id);
  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
}

function duplicateSelectedObject() {
  const selectedRaw = getSelectedObjects();
  const selected = selectedRaw.filter((obj) => obj.type !== TYPE_CIRCLE);
  if (selected.length < 1) {
    if (selectedRaw.some((obj) => obj.type === TYPE_CIRCLE)) {
      renderStatus("Player circles cannot be duplicated.");
    }
    return;
  }
  const dupIds = [];
  const offset = state.snapEnabled ? state.snapSize : 12;
  for (const obj of selected) {
    const duplicate = JSON.parse(JSON.stringify(obj));
    duplicate.id = state.nextId++;
    duplicate.x += offset;
    duplicate.y += offset;
    sanitizeObject(duplicate);
    state.objects.push(duplicate);
    dupIds.push(duplicate.id);
  }
  state.selectedIds = dupIds.slice();
  state.selectedId = dupIds[dupIds.length - 1] ?? null;
  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
}

function centerSelectedObject() {
  const selected = getSelectedObjects();
  if (selected.length < 1) return;
  if (selected.length === 1) {
    const obj = selected[0];
    obj.x = BASE_WIDTH / 2;
    obj.y = BASE_HEIGHT / 2;
    if (state.snapEnabled) {
      obj.x = snap(obj.x, state.snapSize);
      obj.y = snap(obj.y, state.snapSize);
    }
  } else {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const obj of selected) {
      const b = getBounds(obj);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    let dx = BASE_WIDTH / 2 - centerX;
    let dy = BASE_HEIGHT / 2 - centerY;
    if (state.snapEnabled) {
      dx = snap(dx, state.snapSize);
      dy = snap(dy, state.snapSize);
    }
    for (const obj of selected) {
      obj.x = clamp(obj.x + dx, -BASE_WIDTH * 2, BASE_WIDTH * 3);
      obj.y = clamp(obj.y + dy, -BASE_HEIGHT * 2, BASE_HEIGHT * 3);
    }
  }
  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
}

function clearAllObjects() {
  const clearableCount = state.objects.filter((obj) => obj.type !== TYPE_CIRCLE).length;
  if (clearableCount > 0) {
    const ok = window.confirm(`Clear all ${clearableCount} non-player object${clearableCount === 1 ? "" : "s"} from this level?`);
    if (!ok) return;
  }
  state.objects = [];
  ensureMandatoryCircles({ resetPositions: true });
  setSingleSelection(state.objects[0]?.id ?? null);
  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
  renderStatus("Cleared all non-player objects.");
}

function canConvertObjectToRigidPart(obj) {
  return obj && (obj.type === TYPE_BOX || obj.type === TYPE_ARC_BOX || obj.type === TYPE_SHAPE);
}

function objectToRigidGroupPart(obj, groupX, groupY) {
  if (!canConvertObjectToRigidPart(obj)) return null;
  const part = {
    x: obj.x - groupX,
    y: obj.y - groupY,
    w: Number(obj.w),
    h: Number(obj.h),
    angle: getObjectAngleDeg(obj)
  };
  if (obj.type === TYPE_ARC_BOX) {
    return sanitizeRigidGroupPart({
      type: TYPE_ARC_BOX,
      ...part,
      cut: clampArcCut(obj.cut),
      sides: normalizeArcSides(obj.sides ?? obj.side, ARC_SIDE_TOP)
    });
  }
  if (obj.type === TYPE_SHAPE) {
    return sanitizeRigidGroupPart({
      type: TYPE_SHAPE,
      ...part,
      edges: clamp(Math.round(obj.e), 3, MAX_SHAPE_EDGES)
    });
  }
  return sanitizeRigidGroupPart({ type: TYPE_BOX, ...part });
}

function objectToRotorPart(obj, rotor) {
  if (!canConvertObjectToRigidPart(obj) || !rotor || rotor.type !== TYPE_ROTOR) return null;
  const rotorAngle = getObjectAngleRad(rotor);
  const local = toLocalPoint(obj.x, obj.y, rotor.x, rotor.y, rotorAngle);
  const part = {
    x: local.x,
    y: local.y,
    w: Number(obj.w),
    h: Number(obj.h),
    angle: normalizeAngleDeg(getObjectAngleDeg(obj) - getObjectAngleDeg(rotor))
  };
  if (obj.type === TYPE_ARC_BOX) {
    return sanitizeRigidGroupPart({
      type: TYPE_ARC_BOX,
      ...part,
      cut: clampArcCut(obj.cut),
      sides: normalizeArcSides(obj.sides ?? obj.side, ARC_SIDE_TOP)
    });
  }
  if (obj.type === TYPE_SHAPE) {
    return sanitizeRigidGroupPart({
      type: TYPE_SHAPE,
      ...part,
      edges: clamp(Math.round(obj.e), 3, MAX_SHAPE_EDGES)
    });
  }
  return sanitizeRigidGroupPart({ type: TYPE_BOX, ...part });
}

function rigidGroupToRotorParts(group, rotor) {
  if (!group || group.type !== TYPE_RIGID_GROUP || !rotor || rotor.type !== TYPE_ROTOR) return [];
  const out = [];
  const groupAngle = getObjectAngleRad(group);
  const groupAngleDeg = getObjectAngleDeg(group);
  const rotorAngle = getObjectAngleRad(rotor);
  const rotorAngleDeg = getObjectAngleDeg(rotor);
  const parts = Array.isArray(group.parts) ? group.parts : [];

  for (const rawPart of parts) {
    const part = sanitizeRigidGroupPart(rawPart);
    if (!part) continue;

    const offset = rotatePoint(part.x, part.y, groupAngle);
    const worldX = group.x + offset.x;
    const worldY = group.y + offset.y;
    const worldAngle = normalizeAngleDeg(groupAngleDeg + part.angle);
    const local = toLocalPoint(worldX, worldY, rotor.x, rotor.y, rotorAngle);
    const base = {
      x: local.x,
      y: local.y,
      w: Number(part.w),
      h: Number(part.h),
      angle: normalizeAngleDeg(worldAngle - rotorAngleDeg)
    };

    let next = null;
    if (part.type === TYPE_ARC_BOX) {
      next = sanitizeRigidGroupPart({
        type: TYPE_ARC_BOX,
        ...base,
        cut: clampArcCut(part.cut),
        sides: normalizeArcSides(part.sides ?? part.side, ARC_SIDE_TOP)
      });
    } else if (part.type === TYPE_SHAPE) {
      next = sanitizeRigidGroupPart({
        type: TYPE_SHAPE,
        ...base,
        edges: clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES)
      });
    } else {
      next = sanitizeRigidGroupPart({
        type: TYPE_BOX,
        ...base
      });
    }
    if (next) out.push(next);
  }

  return out;
}

function rigidPartToStandaloneObject(group, rawPart) {
  const part = sanitizeRigidGroupPart(rawPart);
  if (!part) return null;
  const groupAngle = getObjectAngleRad(group);
  const offset = rotatePoint(part.x, part.y, groupAngle);
  const worldX = group.x + offset.x;
  const worldY = group.y + offset.y;
  const worldAngle = normalizeAngleDeg(getObjectAngleDeg(group) + part.angle);

  if (part.type === TYPE_ARC_BOX) {
    return {
      id: state.nextId++,
      type: TYPE_ARC_BOX,
      x: worldX,
      y: worldY,
      w: part.w,
      h: part.h,
      cut: clampArcCut(part.cut),
      sides: normalizeArcSides(part.sides ?? part.side, ARC_SIDE_TOP),
      angle: worldAngle,
      st: Boolean(group.st)
    };
  }
  if (part.type === TYPE_SHAPE) {
    return {
      id: state.nextId++,
      type: TYPE_SHAPE,
      x: worldX,
      y: worldY,
      w: part.w,
      h: part.h,
      e: clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES),
      angle: worldAngle,
      st: Boolean(group.st)
    };
  }
  return {
    id: state.nextId++,
    type: TYPE_BOX,
    x: worldX,
    y: worldY,
    w: part.w,
    h: part.h,
    angle: worldAngle,
    st: Boolean(group.st)
  };
}

function groupSelectedObjects() {
  const selected = getSelectedObjects();
  if (selected.length < 2) {
    renderStatus("Select at least two compatible objects to create a rigid group.");
    return;
  }
  const incompatible = selected.filter((obj) => !canConvertObjectToRigidPart(obj));
  if (incompatible.length > 0) {
    renderStatus("Only Box, Arc Box, and Shape objects can be combined into a rigid group.");
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of selected) {
    const b = getBounds(obj);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const groupX = (minX + maxX) / 2;
  const groupY = (minY + maxY) / 2;

  const parts = [];
  for (const obj of selected) {
    const part = objectToRigidGroupPart(obj, groupX, groupY);
    if (part) parts.push(part);
  }
  if (parts.length < 1) {
    renderStatus("No compatible parts found.");
    return;
  }

  const allStatic = selected.every((obj) => Boolean(obj.st));
  const selectedSet = getSelectedIdSet();
  state.objects = state.objects.filter((obj) => !selectedSet.has(obj.id));

  const group = {
    id: state.nextId++,
    type: TYPE_RIGID_GROUP,
    x: groupX,
    y: groupY,
    angle: 0,
    st: allStatic,
    parts
  };
  sanitizeObject(group);
  state.objects.push(group);
  setSingleSelection(group.id);

  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
  renderStatus(`Created rigid group with ${parts.length} part${parts.length === 1 ? "" : "s"}.`);
}

function addSelectedObjectsToRotor() {
  const selected = getSelectedObjects();
  const rotors = selected.filter((obj) => obj.type === TYPE_ROTOR);
  if (rotors.length !== 1) {
    renderStatus("Select exactly one rotor and one or more Box/Arc Box/Shape/Rigid Group objects.");
    return;
  }
  const rotor = rotors[0];
  const others = selected.filter((obj) => obj.id !== rotor.id);
  if (others.length < 1) {
    renderStatus("Select at least one object to attach to the rotor.");
    return;
  }
  const incompatible = others.filter((obj) => obj.type !== TYPE_BOX && obj.type !== TYPE_ARC_BOX && obj.type !== TYPE_SHAPE && obj.type !== TYPE_RIGID_GROUP);
  if (incompatible.length > 0) {
    renderStatus("Only Box, Arc Box, Shape, and Rigid Group objects can be attached to a rotor.");
    return;
  }

  const nextParts = Array.isArray(rotor.parts) ? rotor.parts.slice() : [];
  const removeIds = new Set();
  let attachedPartCount = 0;
  for (const obj of others) {
    if (obj.type === TYPE_RIGID_GROUP) {
      const parts = rigidGroupToRotorParts(obj, rotor);
      if (parts.length > 0) {
        nextParts.push(...parts);
        removeIds.add(obj.id);
        attachedPartCount += parts.length;
      }
      continue;
    }
    const part = objectToRotorPart(obj, rotor);
    if (!part) continue;
    nextParts.push(part);
    removeIds.add(obj.id);
    attachedPartCount += 1;
  }
  if (attachedPartCount < 1) {
    renderStatus("No compatible parts found to attach.");
    return;
  }
  rotor.parts = nextParts;
  sanitizeObject(rotor);

  state.objects = state.objects.filter((obj) => !removeIds.has(obj.id));
  setSingleSelection(rotor.id);

  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
  renderStatus(`Attached ${attachedPartCount} part${attachedPartCount === 1 ? "" : "s"} from ${removeIds.size} object${removeIds.size === 1 ? "" : "s"} to rotor.`);
}

function ungroupSelectedObjects() {
  const selected = getSelectedObjects();
  const groups = selected.filter((obj) => obj.type === TYPE_RIGID_GROUP);
  const rotorWithParts = selected.filter((obj) => obj.type === TYPE_ROTOR && Array.isArray(obj.parts) && obj.parts.length > 0);
  if (groups.length < 1 && rotorWithParts.length < 1) {
    renderStatus("Select one or more rigid groups or rotors with attached parts to ungroup.");
    return;
  }

  const selectedSet = getSelectedIdSet();
  const out = [];
  const newIds = [];
  let detachedRotorParts = 0;

  for (const obj of state.objects) {
    if (!selectedSet.has(obj.id)) {
      out.push(obj);
      continue;
    }

    if (obj.type === TYPE_RIGID_GROUP) {
      const parts = Array.isArray(obj.parts) ? obj.parts : [];
      for (const rawPart of parts) {
        const next = rigidPartToStandaloneObject(obj, rawPart);
        if (!next) continue;
        sanitizeObject(next);
        out.push(next);
        newIds.push(next.id);
      }
      continue;
    }

    if (obj.type === TYPE_ROTOR) {
      const parts = Array.isArray(obj.parts) ? obj.parts : [];
      for (const rawPart of parts) {
        const next = rigidPartToStandaloneObject({ x: obj.x, y: obj.y, angle: obj.angle, st: false }, rawPart);
        if (!next) continue;
        sanitizeObject(next);
        out.push(next);
        newIds.push(next.id);
        detachedRotorParts++;
      }
      obj.parts = [];
      sanitizeObject(obj);
      out.push(obj);
      continue;
    }

    out.push(obj);
  }

  state.objects = out;
  if (newIds.length > 0) {
    state.selectedIds = newIds.slice();
    state.selectedId = newIds[newIds.length - 1];
  } else {
    setSingleSelection(null);
  }

  renderObjectList();
  renderPropertyEditor();
  renderExport();
  persist();
  const segments = [];
  if (groups.length > 0) segments.push(`ungrouped ${groups.length} rigid group${groups.length === 1 ? "" : "s"}`);
  if (rotorWithParts.length > 0) segments.push(`detached ${detachedRotorParts} rotor part${detachedRotorParts === 1 ? "" : "s"}`);
  renderStatus(segments.length > 0 ? `${segments.join(" and ")}.` : "Ungroup complete.");
}

function getSelectedObject() {
  normalizeSelection();
  if (state.selectedId === null) return null;
  return state.objects.find((obj) => obj.id === state.selectedId) || null;
}

function renderObjectList() {
  normalizeSelection();
  els.objectList.innerHTML = "";
  if (state.objects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "property-editor-empty";
    empty.textContent = "No objects yet. Add one from the buttons above.";
    els.objectList.appendChild(empty);
    return;
  }

  const selected = getSelectedIdSet();
  for (let i = 0; i < state.objects.length; i++) {
    const obj = state.objects[i];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "object-entry" + (selected.has(obj.id) ? " active" : "");
    button.dataset.id = String(obj.id);
    button.textContent = `${i + 1}. ${describeObject(obj)}`;
    els.objectList.appendChild(button);
  }
}

function describeObject(obj) {
  if (obj.type === TYPE_CIRCLE) return `Circle ${obj.color} @ (${round2(obj.x)}, ${round2(obj.y)})`;
  if (obj.type === TYPE_BOX) return `Box a=${round2(getObjectAngleDeg(obj))} ${obj.st ? "static" : "dynamic"} @ (${round2(obj.x)}, ${round2(obj.y)})`;
  if (obj.type === TYPE_ARC_BOX) return `ArcBox sides=${arcSidesLabel(obj.sides ?? obj.side)} cut=${round2(clampArcCut(obj.cut))} a=${round2(getObjectAngleDeg(obj))} ${obj.st ? "static" : "dynamic"} @ (${round2(obj.x)}, ${round2(obj.y)})`;
  if (obj.type === TYPE_SHAPE) return `Shape e=${obj.e} a=${round2(getObjectAngleDeg(obj))} ${obj.st ? "static" : "dynamic"} @ (${round2(obj.x)}, ${round2(obj.y)})`;
  if (obj.type === TYPE_RIGID_GROUP) return `RigidGroup parts=${Array.isArray(obj.parts) ? obj.parts.length : 0} a=${round2(getObjectAngleDeg(obj))} ${obj.st ? "static" : "dynamic"} @ (${round2(obj.x)}, ${round2(obj.y)})`;
  if (obj.type === TYPE_ROTOR) {
    const dir = normalizeRotorMotorDirection(obj.motorDirection) > 0 ? "cw" : "ccw";
    return `Rotor e=${obj.e} parts=${Array.isArray(obj.parts) ? obj.parts.length : 0} a=${round2(getObjectAngleDeg(obj))} motor=${obj.motor ? "on" : "off"} s=${round2(normalizeRotorMotorSpeedDeg(obj.motorSpeed))} ${dir} t=${round2(normalizeRotorMotorTorque(obj.motorTorque))} @ (${round2(obj.x)}, ${round2(obj.y)})`;
  }
  return `Unknown @ (${round2(obj.x)}, ${round2(obj.y)})`;
}

function normalizeValueMode(mode) {
  if (mode === VALUE_MODE_RATIO) return VALUE_MODE_RATIO;
  if (mode === VALUE_MODE_PERCENT) return VALUE_MODE_PERCENT;
  return VALUE_MODE_PX;
}

function getAxisBase(axis) {
  return axis === "y" ? BASE_HEIGHT : BASE_WIDTH;
}

function defaultEditStepForMode(mode) {
  if (mode === VALUE_MODE_RATIO) return 0.01;
  if (mode === VALUE_MODE_PERCENT) return 1;
  return 8;
}

function normalizeEditStepForMode(value, mode) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return defaultEditStepForMode(mode);
  if (mode === VALUE_MODE_RATIO) return clamp(raw, 0.0001, 1);
  if (mode === VALUE_MODE_PERCENT) return clamp(raw, 0.01, 100);
  return clamp(raw, 0.1, 256);
}

function normalizeLoadedEditStep(value, mode) {
  let raw = Number(value);
  if (!Number.isFinite(raw)) return defaultEditStepForMode(mode);
  // Backward-compat: older builds persisted ratio/percent step internally as px.
  if (mode === VALUE_MODE_RATIO && raw > 1) raw = raw / BASE_WIDTH;
  if (mode === VALUE_MODE_PERCENT && raw > 100) raw = (raw / BASE_WIDTH) * 100;
  return normalizeEditStepForMode(raw, mode);
}

function setEditStepFromDisplay(displayValue) {
  state.editStep = normalizeEditStepForMode(displayValue, state.valueMode);
}

function getEditStepPx(axis) {
  if (state.valueMode === VALUE_MODE_RATIO) return state.editStep * getAxisBase(axis);
  if (state.valueMode === VALUE_MODE_PERCENT) return (state.editStep / 100) * getAxisBase(axis);
  return state.editStep;
}

function syncEditStepControl() {
  if (!els.editStep || !els.editStepLabel) return;
  const value = normalizeEditStepForMode(state.editStep, state.valueMode);
  state.editStep = value;
  if (state.valueMode === VALUE_MODE_RATIO) {
    els.editStepLabel.textContent = "Edit Step (0..1)";
    els.editStep.min = "0.0001";
    els.editStep.max = "1";
    els.editStep.step = "0.001";
  } else if (state.valueMode === VALUE_MODE_PERCENT) {
    els.editStepLabel.textContent = "Edit Step (%)";
    els.editStep.min = "0.01";
    els.editStep.max = "100";
    els.editStep.step = "0.1";
  } else {
    els.editStepLabel.textContent = "Edit Step (px)";
    els.editStep.min = "0.1";
    els.editStep.max = "256";
    els.editStep.step = "0.1";
  }
  els.editStep.value = String(round3(value));
}

function toDisplayLinear(pixelValue, axis) {
  const base = getAxisBase(axis);
  if (state.valueMode === VALUE_MODE_RATIO) return pixelValue / base;
  if (state.valueMode === VALUE_MODE_PERCENT) return (pixelValue / base) * 100;
  return pixelValue;
}

function fromDisplayLinear(displayValue, axis) {
  const base = getAxisBase(axis);
  if (state.valueMode === VALUE_MODE_RATIO) return displayValue * base;
  if (state.valueMode === VALUE_MODE_PERCENT) return (displayValue / 100) * base;
  return displayValue;
}

function getDisplayLinearStep(axis) {
  return state.editStep;
}

function getDisplayLinearLabel(label, axis) {
  if (state.valueMode === VALUE_MODE_RATIO) return `${label} (${axis === "x" ? "0..1 of width" : "0..1 of height"})`;
  if (state.valueMode === VALUE_MODE_PERCENT) return `${label} (${axis === "x" ? "% of width" : "% of height"})`;
  return `${label} (px)`;
}

function renderPropertyEditor(skipIfInputActive = false) {
  if (skipIfInputActive && isTypingTarget(document.activeElement)) return;
  const linearStepX = getDisplayLinearStep("x");
  const linearStepY = getDisplayLinearStep("y");
  normalizeSelection();
  const selectedCount = state.selectedIds.length;

  const obj = getSelectedObject();
  els.propertyEditor.innerHTML = "";
  if (!obj) {
    const empty = document.createElement("p");
    empty.className = "property-editor-empty";
    empty.textContent = "Select an object to edit its properties.";
    els.propertyEditor.appendChild(empty);
    return;
  }
  if (selectedCount > 1) {
    const hint = document.createElement("p");
    hint.className = "property-editor-empty";
    hint.textContent = `${selectedCount} objects selected. Use Combine To Group, Ungroup, move, duplicate, or delete.`;
    els.propertyEditor.appendChild(hint);
    return;
  }

  appendNumberField(getDisplayLinearLabel("X", "x"), toDisplayLinear(obj.x, "x"), (value) => {
    obj.x = fromDisplayLinear(value, "x");
    touchObject(obj);
  }, { step: linearStepX, stepBase: 0 });
  appendNumberField(getDisplayLinearLabel("Y", "y"), toDisplayLinear(obj.y, "y"), (value) => {
    obj.y = fromDisplayLinear(value, "y");
    touchObject(obj);
  }, { step: linearStepY, stepBase: 0 });

  if (obj.type === TYPE_BOX) {
    appendNumberField(getDisplayLinearLabel("Width", "x"), toDisplayLinear(obj.w, "x"), (value) => {
      obj.w = clamp(fromDisplayLinear(value, "x"), 1, BASE_WIDTH * 2);
      touchObject(obj);
    }, { step: linearStepX, stepBase: 0 });
    appendNumberField(getDisplayLinearLabel("Height", "y"), toDisplayLinear(obj.h, "y"), (value) => {
      obj.h = clamp(fromDisplayLinear(value, "y"), 1, BASE_HEIGHT * 2);
      touchObject(obj);
    }, { step: linearStepY, stepBase: 0 });
    appendNumberField("Rotation (deg)", getObjectAngleDeg(obj), (value) => {
      obj.angle = normalizeAngleDeg(value);
      touchObject(obj);
    }, { step: 1, stepBase: 0 });
    appendCheckboxField("Static", obj.st, (value) => {
      obj.st = value;
      touchObject(obj);
    });
  }

  if (obj.type === TYPE_ARC_BOX) {
    appendNumberField(getDisplayLinearLabel("Width", "x"), toDisplayLinear(obj.w, "x"), (value) => {
      obj.w = clamp(fromDisplayLinear(value, "x"), 1, BASE_WIDTH * 2);
      touchObject(obj);
    }, { step: linearStepX, stepBase: 0 });
    appendNumberField(getDisplayLinearLabel("Height", "y"), toDisplayLinear(obj.h, "y"), (value) => {
      obj.h = clamp(fromDisplayLinear(value, "y"), 1, BASE_HEIGHT * 2);
      touchObject(obj);
    }, { step: linearStepY, stepBase: 0 });
    appendNumberField("Arc Depth (+inward / -outward)", clampArcCut(obj.cut), (value) => {
      obj.cut = clampArcCut(value);
      touchObject(obj);
    }, { step: 0.01, stepBase: 0, min: -ARC_BOX_MAX_CUT, max: ARC_BOX_MAX_CUT });
    appendArcSidesFields(els.propertyEditor, obj.sides ?? obj.side, (side, checked) => {
      obj.sides = toggleArcSide(obj.sides ?? obj.side, side, checked);
      touchObject(obj);
    });
    appendNumberField("Rotation (deg)", getObjectAngleDeg(obj), (value) => {
      obj.angle = normalizeAngleDeg(value);
      touchObject(obj);
    }, { step: 1, stepBase: 0 });
    appendCheckboxField("Static", obj.st, (value) => {
      obj.st = value;
      touchObject(obj);
    });
  }

  if (obj.type === TYPE_SHAPE) {
    appendNumberField(getDisplayLinearLabel("Radius X (w)", "x"), toDisplayLinear(obj.w, "x"), (value) => {
      obj.w = clamp(fromDisplayLinear(value, "x"), 1, BASE_WIDTH * 2);
      touchObject(obj);
    }, { step: linearStepX, stepBase: 0 });
    appendNumberField(getDisplayLinearLabel("Radius Y (h)", "y"), toDisplayLinear(obj.h, "y"), (value) => {
      obj.h = clamp(fromDisplayLinear(value, "y"), 1, BASE_HEIGHT * 2);
      touchObject(obj);
    }, { step: linearStepY, stepBase: 0 });
    appendNumberField("Edges", obj.e, (value) => {
      obj.e = clamp(Math.round(value), 3, MAX_SHAPE_EDGES);
      touchObject(obj);
    }, { step: 1, stepBase: 0 });
    appendNumberField("Rotation (deg)", getObjectAngleDeg(obj), (value) => {
      obj.angle = normalizeAngleDeg(value);
      touchObject(obj);
    }, { step: 1, stepBase: 0 });
    appendCheckboxField("Static", obj.st, (value) => {
      obj.st = value;
      touchObject(obj);
    });
  }

  if (obj.type === TYPE_RIGID_GROUP) {
    appendNumberField("Rotation (deg)", getObjectAngleDeg(obj), (value) => {
      obj.angle = normalizeAngleDeg(value);
      touchObject(obj);
    }, { step: 1, stepBase: 0 });
    appendCheckboxField("Static", obj.st, (value) => {
      obj.st = value;
      touchObject(obj);
    });
    appendRigidGroupPartsEditor(obj, { linearStepX, linearStepY }, { title: "Parts", minParts: 1 });
  }

  if (obj.type === TYPE_ROTOR) {
    appendNumberField(getDisplayLinearLabel("Width (w)", "x"), toDisplayLinear(obj.w, "x"), (value) => {
      obj.w = clamp(fromDisplayLinear(value, "x"), 1, BASE_WIDTH * 2);
      touchObject(obj);
    }, { step: linearStepX, stepBase: 0 });
    appendNumberField(getDisplayLinearLabel("Height (h)", "y"), toDisplayLinear(obj.h, "y"), (value) => {
      obj.h = clamp(fromDisplayLinear(value, "y"), 1, BASE_HEIGHT * 2);
      touchObject(obj);
    }, { step: linearStepY, stepBase: 0 });
    appendNumberField("Edges (4 = box rotor)", obj.e, (value) => {
      obj.e = clamp(Math.round(value), 3, MAX_SHAPE_EDGES);
      touchObject(obj);
    }, { step: 1, stepBase: 0 });
    appendNumberField("Rotation (deg)", getObjectAngleDeg(obj), (value) => {
      obj.angle = normalizeAngleDeg(value);
      touchObject(obj);
    }, { step: 1, stepBase: 0 });
    appendCheckboxField("Enable Motor", obj.motor, (value) => {
      obj.motor = value;
      touchObject(obj);
      renderPropertyEditor();
    });
    if (obj.motor) {
      appendNumberField("Motor Speed (deg/s)", normalizeRotorMotorSpeedDeg(obj.motorSpeed), (value) => {
        obj.motorSpeed = normalizeRotorMotorSpeedDeg(value);
        touchObject(obj);
      }, { step: 1, stepBase: 0, min: 0 });
      appendSelectField("Motor Direction", [
        { value: "1", label: "Clockwise (+)" },
        { value: "-1", label: "Counterclockwise (-)" }
      ], String(normalizeRotorMotorDirection(obj.motorDirection)), (value) => {
        obj.motorDirection = normalizeRotorMotorDirection(value);
        touchObject(obj);
      });
      appendNumberField("Motor Torque", normalizeRotorMotorTorque(obj.motorTorque), (value) => {
        obj.motorTorque = normalizeRotorMotorTorque(value);
        touchObject(obj);
      }, { step: 1000, stepBase: 0, min: 0 });
    }
    appendRigidGroupPartsEditor(obj, { linearStepX, linearStepY }, { title: "Attached Parts", minParts: 0 });
  }
}

function appendNumberField(labelText, value, onChange, options = {}) {
  appendNumberFieldTo(els.propertyEditor, labelText, value, onChange, options);
}

function appendNumberFieldTo(container, labelText, value, onChange, options = {}) {
  const step = Number.isFinite(options.step) && Number(options.step) > 0 ? Number(options.step) : 1;
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.step = trimNumber(step, 10);
  if (Number.isFinite(options.stepBase)) {
    // Set a far min aligned to stepBase so spinner increments anchor to the base (e.g. 0, 8, 16...).
    const alignedMin = Number(options.stepBase) - step * 1000000;
    input.min = trimNumber(alignedMin, 10);
  } else if (Number.isFinite(options.min)) {
    input.min = trimNumber(Number(options.min), 10);
  }
  if (Number.isFinite(options.max)) input.max = trimNumber(Number(options.max), 10);
  input.value = String(round3(value));
  input.addEventListener("input", () => {
    const next = Number(input.value);
    if (!Number.isFinite(next)) return;
    onChange(next);
  });
  label.appendChild(input);
  container.appendChild(label);
}

function appendSelectField(labelText, options, value, onChange) {
  appendSelectFieldTo(els.propertyEditor, labelText, options, value, onChange);
}

function appendSelectFieldTo(container, labelText, options, value, onChange) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    select.appendChild(el);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  label.appendChild(select);
  container.appendChild(label);
}

function appendCheckboxField(labelText, checked, onChange) {
  appendCheckboxFieldTo(els.propertyEditor, labelText, checked, onChange);
}

function appendCheckboxFieldTo(container, labelText, checked, onChange) {
  const label = document.createElement("label");
  label.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.appendChild(input);
  label.appendChild(document.createTextNode(labelText));
  container.appendChild(label);
}

function appendArcSidesFields(container, sides, onToggle) {
  for (const side of ARC_SIDE_ORDER) {
    const label = `Arc ${side[0].toUpperCase()}${side.slice(1)}`;
    appendCheckboxFieldTo(container, label, hasArcSide(sides, side), (checked) => onToggle(side, checked));
  }
}

function normalizeRigidGroupPartType(type) {
  const t = String(type || "").toLowerCase();
  if (t === TYPE_ARC_BOX) return TYPE_ARC_BOX;
  if (t === TYPE_SHAPE) return TYPE_SHAPE;
  return TYPE_BOX;
}

function createRigidGroupPart(type = TYPE_BOX) {
  const t = normalizeRigidGroupPartType(type);
  if (t === TYPE_ARC_BOX) {
    return {
      type: TYPE_ARC_BOX,
      x: 0,
      y: 0,
      w: BASE_WIDTH / 6,
      h: BASE_HEIGHT / 10,
      cut: 0.25,
      sides: [ARC_SIDE_TOP],
      angle: 0
    };
  }
  if (t === TYPE_SHAPE) {
    return {
      type: TYPE_SHAPE,
      x: 0,
      y: 0,
      w: BASE_WIDTH / 32,
      h: BASE_HEIGHT / 32,
      edges: 6,
      angle: 0
    };
  }
  return {
    type: TYPE_BOX,
    x: 0,
    y: 0,
    w: BASE_WIDTH / 6,
    h: BASE_HEIGHT / 12,
    angle: 0
  };
}

function sanitizeRigidGroupPart(rawPart) {
  if (!rawPart || typeof rawPart !== "object") return null;
  const t = normalizeRigidGroupPartType(rawPart.type);
  const part = {
    type: t,
    x: clamp(Number(rawPart.x) || 0, -BASE_WIDTH * 3, BASE_WIDTH * 3),
    y: clamp(Number(rawPart.y) || 0, -BASE_HEIGHT * 3, BASE_HEIGHT * 3),
    w: clamp(Math.abs(Number(rawPart.w) || (t === TYPE_SHAPE ? BASE_WIDTH / 32 : BASE_WIDTH / 6)), 1, BASE_WIDTH * 2),
    h: clamp(Math.abs(Number(rawPart.h) || (t === TYPE_SHAPE ? BASE_HEIGHT / 32 : BASE_HEIGHT / 12)), 1, BASE_HEIGHT * 2),
    angle: normalizeAngleDeg(rawPart.angle)
  };
  if (t === TYPE_ARC_BOX) {
    part.cut = clampArcCut(rawPart.cut);
    part.sides = normalizeArcSides(rawPart.sides ?? rawPart.side, ARC_SIDE_TOP);
    part.side = part.sides[0];
  } else if (t === TYPE_SHAPE) {
    part.edges = clamp(Math.round(Number(rawPart.edges) || 6), 3, MAX_SHAPE_EDGES);
  }
  return part;
}

function appendRigidGroupPartsEditor(obj, steps, options = {}) {
  const titleText = typeof options.title === "string" && options.title.trim() ? options.title : "Parts";
  const minParts = Number.isFinite(options.minParts) ? Math.max(0, Math.floor(options.minParts)) : 1;
  const collapsed = options.collapsed !== false;
  const details = document.createElement("details");
  details.style.marginTop = "8px";
  details.style.border = "1px solid #c8d5e8";
  details.style.borderRadius = "6px";
  details.style.padding = "6px";
  details.style.background = "#f4f8ff";
  details.open = !collapsed;

  const summary = document.createElement("summary");
  const partCount = Array.isArray(obj.parts) ? obj.parts.length : 0;
  summary.textContent = `${titleText} (${partCount})`;
  summary.style.cursor = "pointer";
  summary.style.userSelect = "none";
  summary.style.fontSize = "0.82rem";
  summary.style.fontWeight = "700";
  summary.style.color = "#152a46";
  details.appendChild(summary);

  const section = document.createElement("div");
  section.style.marginTop = "8px";

  const addRow = document.createElement("div");
  addRow.style.display = "grid";
  addRow.style.gridTemplateColumns = "1fr 1fr 1fr";
  addRow.style.gap = "6px";
  addRow.style.marginBottom = "8px";
  const addButtons = [
    { label: "Add Box", type: TYPE_BOX },
    { label: "Add Arc", type: TYPE_ARC_BOX },
    { label: "Add Shape", type: TYPE_SHAPE }
  ];
  for (const entry of addButtons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = entry.label;
    button.addEventListener("click", () => {
      if (!Array.isArray(obj.parts)) obj.parts = [];
      obj.parts.push(createRigidGroupPart(entry.type));
      touchObject(obj);
      renderPropertyEditor();
    });
    addRow.appendChild(button);
  }
  section.appendChild(addRow);

  if (!Array.isArray(obj.parts) || obj.parts.length < 1) {
    const empty = document.createElement("p");
    empty.className = "property-editor-empty";
    empty.textContent = "No parts yet.";
    section.appendChild(empty);
    details.appendChild(section);
    els.propertyEditor.appendChild(details);
    return;
  }

  for (let i = 0; i < obj.parts.length; i++) {
    const part = sanitizeRigidGroupPart(obj.parts[i]);
    if (!part) continue;
    obj.parts[i] = part;

    const card = document.createElement("div");
    card.style.border = "1px solid #c8d5e8";
    card.style.borderRadius = "6px";
    card.style.padding = "8px";
    card.style.marginBottom = "8px";
    card.style.background = "#f8fbff";

    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.justifyContent = "space-between";
    topRow.style.alignItems = "center";
    topRow.style.gap = "6px";
    topRow.style.marginBottom = "6px";

    const label = document.createElement("strong");
    label.textContent = `Part ${i + 1}`;
    label.style.fontSize = "0.82rem";
    topRow.appendChild(label);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.style.padding = "5px 7px";
    remove.style.fontSize = "0.76rem";
    remove.disabled = obj.parts.length <= minParts;
    remove.addEventListener("click", () => {
      obj.parts.splice(i, 1);
      touchObject(obj);
      renderPropertyEditor();
    });
    topRow.appendChild(remove);
    card.appendChild(topRow);

    appendSelectFieldTo(card, "Type", [
      { value: TYPE_BOX, label: "Box" },
      { value: TYPE_ARC_BOX, label: "Arc Box" },
      { value: TYPE_SHAPE, label: "Shape" }
    ], part.type, (value) => {
      const next = sanitizeRigidGroupPart({ ...part, type: value });
      obj.parts[i] = next || createRigidGroupPart(TYPE_BOX);
      touchObject(obj);
      renderPropertyEditor();
    });

    appendNumberFieldTo(card, getDisplayLinearLabel("Offset X", "x"), toDisplayLinear(part.x, "x"), (value) => {
      part.x = fromDisplayLinear(value, "x");
      obj.parts[i] = part;
      touchObject(obj);
    }, { step: steps.linearStepX, stepBase: 0 });
    appendNumberFieldTo(card, getDisplayLinearLabel("Offset Y", "y"), toDisplayLinear(part.y, "y"), (value) => {
      part.y = fromDisplayLinear(value, "y");
      obj.parts[i] = part;
      touchObject(obj);
    }, { step: steps.linearStepY, stepBase: 0 });
    appendNumberFieldTo(card, getDisplayLinearLabel("Width", "x"), toDisplayLinear(part.w, "x"), (value) => {
      part.w = clamp(fromDisplayLinear(value, "x"), 1, BASE_WIDTH * 2);
      obj.parts[i] = part;
      touchObject(obj);
    }, { step: steps.linearStepX, stepBase: 0 });
    appendNumberFieldTo(card, getDisplayLinearLabel("Height", "y"), toDisplayLinear(part.h, "y"), (value) => {
      part.h = clamp(fromDisplayLinear(value, "y"), 1, BASE_HEIGHT * 2);
      obj.parts[i] = part;
      touchObject(obj);
    }, { step: steps.linearStepY, stepBase: 0 });
    appendNumberFieldTo(card, "Rotation (deg)", part.angle, (value) => {
      part.angle = normalizeAngleDeg(value);
      obj.parts[i] = part;
      touchObject(obj);
    }, { step: 1, stepBase: 0 });

    if (part.type === TYPE_ARC_BOX) {
      appendNumberFieldTo(card, "Arc Depth (+inward / -outward)", clampArcCut(part.cut), (value) => {
        part.cut = clampArcCut(value);
        obj.parts[i] = part;
        touchObject(obj);
      }, { step: 0.01, stepBase: 0, min: -ARC_BOX_MAX_CUT, max: ARC_BOX_MAX_CUT });
      appendArcSidesFields(card, part.sides ?? part.side, (side, checked) => {
        part.sides = toggleArcSide(part.sides ?? part.side, side, checked);
        obj.parts[i] = part;
        touchObject(obj);
      });
    } else if (part.type === TYPE_SHAPE) {
      appendNumberFieldTo(card, "Edges", part.edges, (value) => {
        part.edges = clamp(Math.round(value), 3, MAX_SHAPE_EDGES);
        obj.parts[i] = part;
        touchObject(obj);
      }, { step: 1, stepBase: 0 });
    }

    section.appendChild(card);
  }

  details.appendChild(section);
  els.propertyEditor.appendChild(details);
}

function touchObject(obj) {
  sanitizeObject(obj);
  renderObjectList();
  renderExport();
  persist();
}

function sanitizeObject(obj) {
  obj.x = Number.isFinite(obj.x) ? obj.x : 0;
  obj.y = Number.isFinite(obj.y) ? obj.y : 0;
  if (obj.type === TYPE_CIRCLE) {
    obj.r = DEFAULT_CIRCLE_RADIUS;
    if (obj.color !== CIRCLE_COLOR_A && obj.color !== CIRCLE_COLOR_B) obj.color = CIRCLE_COLOR_A;
  }
  if (obj.type === TYPE_BOX) {
    obj.w = clamp(Number(obj.w) || BASE_WIDTH / 4, 1, BASE_WIDTH * 2);
    obj.h = clamp(Number(obj.h) || BASE_HEIGHT / 20, 1, BASE_HEIGHT * 2);
    obj.angle = normalizeAngleDeg(obj.angle);
    obj.st = Boolean(obj.st);
  }
  if (obj.type === TYPE_ARC_BOX) {
    obj.w = clamp(Number(obj.w) || BASE_WIDTH / 5, 1, BASE_WIDTH * 2);
    obj.h = clamp(Number(obj.h) || BASE_HEIGHT / 5, 1, BASE_HEIGHT * 2);
    obj.cut = clampArcCut(obj.cut);
    obj.sides = normalizeArcSides(obj.sides ?? obj.side, ARC_SIDE_TOP);
    obj.side = obj.sides[0];
    obj.angle = normalizeAngleDeg(obj.angle);
    obj.st = Boolean(obj.st);
  }
  if (obj.type === TYPE_SHAPE) {
    obj.w = clamp(Number(obj.w) || BASE_WIDTH / 25, 1, BASE_WIDTH * 2);
    obj.h = clamp(Number(obj.h) || BASE_HEIGHT / 25, 1, BASE_HEIGHT * 2);
    obj.e = clamp(Math.round(Number(obj.e) || 6), 3, MAX_SHAPE_EDGES);
    obj.angle = normalizeAngleDeg(obj.angle);
    obj.st = Boolean(obj.st);
  }
  if (obj.type === TYPE_RIGID_GROUP) {
    obj.angle = normalizeAngleDeg(obj.angle);
    obj.st = Boolean(obj.st);
    const nextParts = [];
    const parts = Array.isArray(obj.parts) ? obj.parts : [];
    for (const rawPart of parts) {
      const part = sanitizeRigidGroupPart(rawPart);
      if (part) nextParts.push(part);
    }
    obj.parts = nextParts;
  }
  if (obj.type === TYPE_ROTOR) {
    obj.w = clamp(Number(obj.w) || BASE_WIDTH / 3, 1, BASE_WIDTH * 2);
    obj.h = clamp(Number(obj.h) || BASE_HEIGHT / 20, 1, BASE_HEIGHT * 2);
    obj.e = clamp(Math.round(Number(obj.e) || 4), 3, MAX_SHAPE_EDGES);
    obj.angle = normalizeAngleDeg(obj.angle);
    obj.motor = Boolean(obj.motor);
    obj.motorSpeed = normalizeRotorMotorSpeedDeg(obj.motorSpeed);
    obj.motorDirection = normalizeRotorMotorDirection(obj.motorDirection);
    obj.motorTorque = normalizeRotorMotorTorque(obj.motorTorque);
    const nextParts = [];
    const parts = Array.isArray(obj.parts) ? obj.parts : [];
    for (const rawPart of parts) {
      const part = sanitizeRigidGroupPart(rawPart);
      if (part) nextParts.push(part);
    }
    obj.parts = nextParts;
  }
}

function renderExport() {
  const level = clamp(Math.floor(Number(els.levelNumber.value) || 0), 0, 999);
  els.levelNumber.value = String(level);
  els.codeOutput.value = generateCaseSnippet(level);
}

function generateCaseSnippet(level) {
  const circles = state.objects.filter((obj) => obj.type === TYPE_CIRCLE);
  const boxes = state.objects.filter((obj) => obj.type === TYPE_BOX);
  const arcBoxes = state.objects.filter((obj) => obj.type === TYPE_ARC_BOX);
  const cShapes = state.objects.filter((obj) => obj.type === TYPE_SHAPE);
  const rigidGroups = state.objects.filter((obj) => obj.type === TYPE_RIGID_GROUP);
  const rotors = state.objects.filter((obj) => obj.type === TYPE_ROTOR);

  const lines = [`case ${level}:`];
  for (const obj of circles) {
    const x = relativeExpr(obj.x, BASE_WIDTH, "width");
    const y = relativeExpr(obj.y, BASE_HEIGHT, "height");
    const r = circleRadiusExpr(obj.r);
    const colorExpr = obj.color === CIRCLE_COLOR_B ? "color(...COLOR_PLAYER_B_RGB)" : "color(...COLOR_PLAYER_A_RGB)";
    lines.push(`  circles.push(new Circle(${x}, ${y}, ${r}, ${colorExpr}));`);
  }
  for (const obj of boxes) {
    const x = relativeExpr(obj.x, BASE_WIDTH, "width");
    const y = relativeExpr(obj.y, BASE_HEIGHT, "height");
    const w = relativeExpr(obj.w, BASE_WIDTH, "width");
    const h = relativeExpr(obj.h, BASE_HEIGHT, "height");
    lines.push(`  boxes.push(new Box(${x}, ${y}, ${w}, ${h}, ${obj.st}, ${trimNumber(getObjectAngleDeg(obj), 3)}));`);
  }
  for (const obj of arcBoxes) {
    const x = relativeExpr(obj.x, BASE_WIDTH, "width");
    const y = relativeExpr(obj.y, BASE_HEIGHT, "height");
    const w = relativeExpr(obj.w, BASE_WIDTH, "width");
    const h = relativeExpr(obj.h, BASE_HEIGHT, "height");
    const cut = trimNumber(clampArcCut(obj.cut), 3);
    const sidesExpr = arcSidesExpr(obj.sides ?? obj.side);
    const angle = trimNumber(getObjectAngleDeg(obj), 3);
    lines.push(`  arcBoxes.push(new ArcBox(${x}, ${y}, ${w}, ${h}, ${cut}, ${sidesExpr}, ${obj.st}, ${angle}));`);
  }
  for (const obj of cShapes) {
    const x = relativeExpr(obj.x, BASE_WIDTH, "width");
    const y = relativeExpr(obj.y, BASE_HEIGHT, "height");
    const w = relativeExpr(obj.w, BASE_WIDTH, "width");
    const h = relativeExpr(obj.h, BASE_HEIGHT, "height");
    lines.push(`  cShapes.push(new CustomShape(${x}, ${y}, ${w}, ${h}, ${obj.e}, ${obj.st}, ${trimNumber(getObjectAngleDeg(obj), 3)}));`);
  }
  for (const obj of rigidGroups) {
    const x = relativeExpr(obj.x, BASE_WIDTH, "width");
    const y = relativeExpr(obj.y, BASE_HEIGHT, "height");
    const angle = trimNumber(getObjectAngleDeg(obj), 3);
    const parts = Array.isArray(obj.parts) ? obj.parts : [];
    lines.push("  rigidGroups.push(new RigidGroup(");
    lines.push(`    ${x}, ${y},`);
    lines.push("    [");
    for (const rawPart of parts) {
      const part = sanitizeRigidGroupPart(rawPart);
      if (!part) continue;
      const px = relativeExpr(part.x, BASE_WIDTH, "width");
      const py = relativeExpr(part.y, BASE_HEIGHT, "height");
      const pw = relativeExpr(part.w, BASE_WIDTH, "width");
      const ph = relativeExpr(part.h, BASE_HEIGHT, "height");
      const pAngle = trimNumber(part.angle, 3);
      if (part.type === TYPE_ARC_BOX) {
        lines.push(`      { type: "${TYPE_ARC_BOX}", x: ${px}, y: ${py}, w: ${pw}, h: ${ph}, cut: ${trimNumber(clampArcCut(part.cut), 3)}, sides: ${arcSidesExpr(part.sides ?? part.side)}, angle: ${pAngle} },`);
      } else if (part.type === TYPE_SHAPE) {
        lines.push(`      { type: "${TYPE_SHAPE}", x: ${px}, y: ${py}, w: ${pw}, h: ${ph}, edges: ${clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES)}, angle: ${pAngle} },`);
      } else {
        lines.push(`      { type: "${TYPE_BOX}", x: ${px}, y: ${py}, w: ${pw}, h: ${ph}, angle: ${pAngle} },`);
      }
    }
    lines.push("    ],");
    lines.push(`    ${Boolean(obj.st)}, ${angle}`);
    lines.push("  ));");
  }
  for (const obj of rotors) {
    const x = relativeExpr(obj.x, BASE_WIDTH, "width");
    const y = relativeExpr(obj.y, BASE_HEIGHT, "height");
    const w = relativeExpr(obj.w, BASE_WIDTH, "width");
    const h = relativeExpr(obj.h, BASE_HEIGHT, "height");
    const angle = trimNumber(getObjectAngleDeg(obj), 3);
    const parts = Array.isArray(obj.parts) ? obj.parts : [];
    const partExpr = [];
    for (const rawPart of parts) {
      const part = sanitizeRigidGroupPart(rawPart);
      if (!part) continue;
      const px = relativeExpr(part.x, BASE_WIDTH, "width");
      const py = relativeExpr(part.y, BASE_HEIGHT, "height");
      const pw = relativeExpr(part.w, BASE_WIDTH, "width");
      const ph = relativeExpr(part.h, BASE_HEIGHT, "height");
      const pAngle = trimNumber(part.angle, 3);
      if (part.type === TYPE_ARC_BOX) {
        partExpr.push(`{ type: "${TYPE_ARC_BOX}", x: ${px}, y: ${py}, w: ${pw}, h: ${ph}, cut: ${trimNumber(clampArcCut(part.cut), 3)}, sides: ${arcSidesExpr(part.sides ?? part.side)}, angle: ${pAngle} }`);
      } else if (part.type === TYPE_SHAPE) {
        partExpr.push(`{ type: "${TYPE_SHAPE}", x: ${px}, y: ${py}, w: ${pw}, h: ${ph}, edges: ${clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES)}, angle: ${pAngle} }`);
      } else {
        partExpr.push(`{ type: "${TYPE_BOX}", x: ${px}, y: ${py}, w: ${pw}, h: ${ph}, angle: ${pAngle} }`);
      }
    }
    const motorSpeed = trimNumber(normalizeRotorMotorSpeedDeg(obj.motorSpeed), 3);
    const motorDirection = normalizeRotorMotorDirection(obj.motorDirection);
    const motorTorque = trimNumber(normalizeRotorMotorTorque(obj.motorTorque), 3);
    lines.push(`  rotors.push(new Rotor(${x}, ${y}, ${w}, ${h}, ${obj.e}, ${obj.motor}, ${angle}, [${partExpr.join(", ")}], ${motorSpeed}, ${motorDirection}, ${motorTorque}));`);
  }
  lines.push("  break;");
  return lines.join("\n");
}

function ratioToExpression(ratio, variableName) {
  if (Math.abs(ratio) < 1e-8) return "0";
  const sign = ratio < 0 ? "-" : "";
  const abs = Math.abs(ratio);
  if (Math.abs(abs - 1) < 1e-6) return sign + variableName;

  const denoms = [2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30, 32, 40, 48, 50, 60, 64, 80, 96, 100];
  for (const denom of denoms) {
    const numerator = Math.round(abs * denom);
    if (numerator === 0) continue;
    const err = Math.abs(abs - numerator / denom);
    if (err > 0.0007) continue;
    const body = fractionToExpression(numerator, denom, variableName);
    return sign + body;
  }

  return `${sign}${variableName} * ${trimNumber(abs, 5)}`;
}

function fractionToExpression(numerator, denominator, variableName) {
  if (numerator === denominator) return variableName;
  if (numerator === 1) return `${variableName} / ${denominator}`;
  if (numerator % denominator === 0) return `${variableName} * ${numerator / denominator}`;
  return `(${variableName} / ${denominator}) * ${numerator}`;
}

function relativeExpr(value, base, variableName) {
  const ratio = value / base;
  return ratioToExpression(ratio, variableName);
}

function circleRadiusExpr(radius) {
  const ratio = radius / DEFAULT_CIRCLE_RADIUS;
  return ratioToExpression(ratio, "circleR");
}

function arcSidesExpr(sides) {
  const list = normalizeArcSides(sides, ARC_SIDE_TOP);
  if (list.length === 1) return `"${list[0]}"`;
  return `[${list.map((side) => `"${side}"`).join(", ")}]`;
}

function roundJson(value) {
  return Number(value.toFixed(8));
}

function toRelativeLevelObjects() {
  const out = [];
  for (const obj of state.objects) {
    if (obj.type === TYPE_CIRCLE) {
      out.push({
        type: TYPE_CIRCLE,
        x: roundJson(obj.x / BASE_WIDTH),
        y: roundJson(obj.y / BASE_HEIGHT),
        rScale: roundJson(obj.r / DEFAULT_CIRCLE_RADIUS),
        color: obj.color === CIRCLE_COLOR_B ? CIRCLE_COLOR_B : CIRCLE_COLOR_A
      });
      continue;
    }
    if (obj.type === TYPE_BOX) {
      out.push({
        type: TYPE_BOX,
        x: roundJson(obj.x / BASE_WIDTH),
        y: roundJson(obj.y / BASE_HEIGHT),
        w: roundJson(obj.w / BASE_WIDTH),
        h: roundJson(obj.h / BASE_HEIGHT),
        angle: roundJson(getObjectAngleDeg(obj)),
        static: Boolean(obj.st)
      });
      continue;
    }
    if (obj.type === TYPE_ARC_BOX) {
      const sides = normalizeArcSides(obj.sides ?? obj.side, ARC_SIDE_TOP);
      const arcOut = {
        type: TYPE_ARC_BOX,
        x: roundJson(obj.x / BASE_WIDTH),
        y: roundJson(obj.y / BASE_HEIGHT),
        w: roundJson(obj.w / BASE_WIDTH),
        h: roundJson(obj.h / BASE_HEIGHT),
        cut: roundJson(clampArcCut(obj.cut)),
        sides,
        angle: roundJson(getObjectAngleDeg(obj)),
        static: Boolean(obj.st)
      };
      if (sides.length === 1) arcOut.side = sides[0];
      out.push(arcOut);
      continue;
    }
    if (obj.type === TYPE_SHAPE) {
      out.push({
        type: TYPE_SHAPE,
        x: roundJson(obj.x / BASE_WIDTH),
        y: roundJson(obj.y / BASE_HEIGHT),
        w: roundJson(obj.w / BASE_WIDTH),
        h: roundJson(obj.h / BASE_HEIGHT),
        edges: clamp(Math.round(obj.e), 3, MAX_SHAPE_EDGES),
        angle: roundJson(getObjectAngleDeg(obj)),
        static: Boolean(obj.st)
      });
      continue;
    }
    if (obj.type === TYPE_RIGID_GROUP) {
      const partsOut = [];
      const parts = Array.isArray(obj.parts) ? obj.parts : [];
      for (const rawPart of parts) {
        const part = sanitizeRigidGroupPart(rawPart);
        if (!part) continue;
        const partOut = {
          type: part.type,
          x: roundJson(part.x / BASE_WIDTH),
          y: roundJson(part.y / BASE_HEIGHT),
          w: roundJson(part.w / BASE_WIDTH),
          h: roundJson(part.h / BASE_HEIGHT),
          angle: roundJson(part.angle)
        };
        if (part.type === TYPE_ARC_BOX) {
          partOut.cut = roundJson(clampArcCut(part.cut));
          const sides = normalizeArcSides(part.sides ?? part.side, ARC_SIDE_TOP);
          partOut.sides = sides;
          if (sides.length === 1) partOut.side = sides[0];
        } else if (part.type === TYPE_SHAPE) {
          partOut.edges = clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES);
        }
        partsOut.push(partOut);
      }
      out.push({
        type: TYPE_RIGID_GROUP,
        x: roundJson(obj.x / BASE_WIDTH),
        y: roundJson(obj.y / BASE_HEIGHT),
        angle: roundJson(getObjectAngleDeg(obj)),
        static: Boolean(obj.st),
        parts: partsOut
      });
      continue;
    }
    if (obj.type === TYPE_ROTOR) {
      const partsOut = [];
      const parts = Array.isArray(obj.parts) ? obj.parts : [];
      for (const rawPart of parts) {
        const part = sanitizeRigidGroupPart(rawPart);
        if (!part) continue;
        const partOut = {
          type: part.type,
          x: roundJson(part.x / BASE_WIDTH),
          y: roundJson(part.y / BASE_HEIGHT),
          w: roundJson(part.w / BASE_WIDTH),
          h: roundJson(part.h / BASE_HEIGHT),
          angle: roundJson(part.angle)
        };
        if (part.type === TYPE_ARC_BOX) {
          partOut.cut = roundJson(clampArcCut(part.cut));
          const sides = normalizeArcSides(part.sides ?? part.side, ARC_SIDE_TOP);
          partOut.sides = sides;
          if (sides.length === 1) partOut.side = sides[0];
        } else if (part.type === TYPE_SHAPE) {
          partOut.edges = clamp(Math.round(part.edges), 3, MAX_SHAPE_EDGES);
        }
        partsOut.push(partOut);
      }
      out.push({
        type: TYPE_ROTOR,
        x: roundJson(obj.x / BASE_WIDTH),
        y: roundJson(obj.y / BASE_HEIGHT),
        w: roundJson(obj.w / BASE_WIDTH),
        h: roundJson(obj.h / BASE_HEIGHT),
        edges: clamp(Math.round(obj.e), 3, MAX_SHAPE_EDGES),
        angle: roundJson(getObjectAngleDeg(obj)),
        motor: Boolean(obj.motor),
        motorSpeed: roundJson(normalizeRotorMotorSpeedDeg(obj.motorSpeed)),
        motorDirection: normalizeRotorMotorDirection(obj.motorDirection),
        motorTorque: roundJson(normalizeRotorMotorTorque(obj.motorTorque)),
        parts: partsOut
      });
    }
  }
  return out;
}

function normalizeRelativeLevelObject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "").toLowerCase();
  const id = state.nextId++;
  if (type === TYPE_CIRCLE) {
    const obj = {
      id,
      type: TYPE_CIRCLE,
      x: Number(raw.x) * BASE_WIDTH,
      y: Number(raw.y) * BASE_HEIGHT,
      r: Number(raw.rScale) * DEFAULT_CIRCLE_RADIUS,
      color: raw.color === CIRCLE_COLOR_B ? CIRCLE_COLOR_B : CIRCLE_COLOR_A
    };
    sanitizeObject(obj);
    return obj;
  }
  if (type === TYPE_BOX) {
    const obj = {
      id,
      type: TYPE_BOX,
      x: Number(raw.x) * BASE_WIDTH,
      y: Number(raw.y) * BASE_HEIGHT,
      w: Number(raw.w) * BASE_WIDTH,
      h: Number(raw.h) * BASE_HEIGHT,
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.static)
    };
    sanitizeObject(obj);
    return obj;
  }
  if (type === TYPE_ARC_BOX) {
    const obj = {
      id,
      type: TYPE_ARC_BOX,
      x: Number(raw.x) * BASE_WIDTH,
      y: Number(raw.y) * BASE_HEIGHT,
      w: Number(raw.w) * BASE_WIDTH,
      h: Number(raw.h) * BASE_HEIGHT,
      cut: Number(raw.cut),
      sides: raw.sides,
      side: raw.side,
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.static)
    };
    sanitizeObject(obj);
    return obj;
  }
  if (type === TYPE_SHAPE) {
    const obj = {
      id,
      type: TYPE_SHAPE,
      x: Number(raw.x) * BASE_WIDTH,
      y: Number(raw.y) * BASE_HEIGHT,
      w: Number(raw.w) * BASE_WIDTH,
      h: Number(raw.h) * BASE_HEIGHT,
      e: Number(raw.edges),
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.static)
    };
    sanitizeObject(obj);
    return obj;
  }
  if (type === TYPE_RIGID_GROUP) {
    const parts = [];
    const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
    for (const rawPart of rawParts) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = sanitizeRigidGroupPart({
        type: rawPart.type,
        x: Number(rawPart.x) * BASE_WIDTH,
        y: Number(rawPart.y) * BASE_HEIGHT,
        w: Number(rawPart.w) * BASE_WIDTH,
        h: Number(rawPart.h) * BASE_HEIGHT,
        edges: rawPart.edges,
        cut: rawPart.cut,
        sides: rawPart.sides,
        side: rawPart.side,
        angle: Number(rawPart.angle) || 0
      });
      if (part) parts.push(part);
    }
    const obj = {
      id,
      type: TYPE_RIGID_GROUP,
      x: Number(raw.x) * BASE_WIDTH,
      y: Number(raw.y) * BASE_HEIGHT,
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.static),
      parts
    };
    sanitizeObject(obj);
    return obj;
  }
  if (type === TYPE_ROTOR) {
    const parts = [];
    const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
    for (const rawPart of rawParts) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = sanitizeRigidGroupPart({
        type: rawPart.type,
        x: Number(rawPart.x) * BASE_WIDTH,
        y: Number(rawPart.y) * BASE_HEIGHT,
        w: Number(rawPart.w) * BASE_WIDTH,
        h: Number(rawPart.h) * BASE_HEIGHT,
        edges: rawPart.edges,
        cut: rawPart.cut,
        sides: rawPart.sides,
        side: rawPart.side,
        angle: Number(rawPart.angle) || 0
      });
      if (part) parts.push(part);
    }
    const obj = {
      id,
      type: TYPE_ROTOR,
      x: Number(raw.x) * BASE_WIDTH,
      y: Number(raw.y) * BASE_HEIGHT,
      w: Number(raw.w) * BASE_WIDTH,
      h: Number(raw.h) * BASE_HEIGHT,
      e: Number(raw.edges),
      angle: Number(raw.angle) || 0,
      motor: Boolean(raw.motor),
      motorSpeed: normalizeRotorMotorSpeedDeg(raw.motorSpeed),
      motorDirection: normalizeRotorMotorDirection(raw.motorDirection),
      motorTorque: normalizeRotorMotorTorque(raw.motorTorque),
      parts
    };
    sanitizeObject(obj);
    return obj;
  }
  return null;
}

function looksLikeRelativeLevelObject(raw) {
  if (!raw || typeof raw !== "object") return false;
  const type = String(raw.type || "").toLowerCase();
  if (type === TYPE_CIRCLE) return "rScale" in raw;
  if (type === TYPE_BOX) return "static" in raw;
  if (type === TYPE_ARC_BOX) return "static" in raw && "cut" in raw;
  if (type === TYPE_SHAPE) return "edges" in raw;
  if (type === TYPE_RIGID_GROUP) return "static" in raw && Array.isArray(raw.parts);
  if (type === TYPE_ROTOR) return "edges" in raw;
  return false;
}

function copyCodeToClipboard() {
  const text = els.codeOutput.value;
  if (!text) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => renderStatus("Code copied to clipboard."))
      .catch(() => fallbackCopy());
  } else {
    fallbackCopy();
  }
}

function fallbackCopy() {
  els.codeOutput.focus();
  els.codeOutput.select();
  document.execCommand("copy");
  renderStatus("Code copied to clipboard.");
  window.getSelection().removeAllRanges();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  els.codeOutput.setSelectionRange(0, 0);
}

function downloadJson() {
  const level = getCurrentLevelNumber();
  const payload = buildSingleLevelPayload(level);
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `level_${level}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  renderStatus("JSON downloaded.");
}

function getCurrentLevelNumber() {
  const level = clamp(Math.floor(Number(els.levelNumber.value) || 0), 0, 999);
  els.levelNumber.value = String(level);
  return level;
}

function buildSingleLevelPayload(level) {
  return {
    id: level,
    objects: toRelativeLevelObjects()
  };
}

function testInGame() {
  const level = getCurrentLevelNumber();
  const payload = buildSingleLevelPayload(level);
  try {
    window.localStorage.setItem(EDITOR_TEST_LEVEL_KEY, JSON.stringify(payload));
  } catch (error) {
    renderStatus(`Could not save test level: ${error.message}`);
    return;
  }

  const sep = EDITOR_TEST_URL.includes("?") ? "&" : "?";
  const url = `${EDITOR_TEST_URL}${sep}t=${Date.now()}`;
  const w = window.open(url, "_blank");
  if (!w) window.location.href = url;
  renderStatus(`Opened level ${level} in game test mode.`);
}

function importJson() {
  const file = els.importJson.files && els.importJson.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const targetLevel = clamp(Math.floor(Number(els.levelNumber.value) || 0), 0, 999);
      const imported = [];

      if (Number.isInteger(parsed?.id) && Array.isArray(parsed?.objects)) {
        els.levelNumber.value = String(clamp(parsed.id, 0, 999));
        const relativePayload = parsed.objects.some((obj) => looksLikeRelativeLevelObject(obj));
        for (const raw of parsed.objects) {
          const obj = relativePayload ? normalizeRelativeLevelObject(raw) : normalizeImportedObject(raw);
          if (obj) imported.push(obj);
        }
      } else if (Array.isArray(parsed?.levels)) {
        const levelEntry = parsed.levels.find((entry) => Number(entry?.id) === targetLevel) || parsed.levels[0];
        if (!levelEntry || !Array.isArray(levelEntry.objects)) throw new Error("Missing level objects");
        for (const raw of levelEntry.objects) {
          const obj = normalizeRelativeLevelObject(raw);
          if (obj) imported.push(obj);
        }
      } else if (Array.isArray(parsed?.objects)) {
        const relativePayload = parsed.objects.some((obj) => looksLikeRelativeLevelObject(obj));
        for (const raw of parsed.objects) {
          const obj = relativePayload ? normalizeRelativeLevelObject(raw) : normalizeImportedObject(raw);
          if (obj) imported.push(obj);
        }
      } else {
        throw new Error("Missing levels or objects array");
      }

      state.objects = imported;
      ensureMandatoryCircles();
      if (state.objects[0]) setSingleSelection(state.objects[0].id);
      else setSingleSelection(null);
      state.nextId = state.objects.reduce((maxId, obj) => Math.max(maxId, obj.id), 0) + 1;
      renderObjectList();
      renderPropertyEditor();
      renderExport();
      persist();
      renderStatus(`Imported ${imported.length} object${imported.length === 1 ? "" : "s"} and enforced player circles.`);
    } catch (error) {
      renderStatus(`Import failed: ${error.message}`);
    } finally {
      els.importJson.value = "";
    }
  };
  reader.readAsText(file);
}

function normalizeImportedObject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number.isInteger(raw.id) ? raw.id : state.nextId++;
  const type = String(raw.type || "");
  const common = {
    id,
    type,
    x: Number(raw.x),
    y: Number(raw.y)
  };

  if (type === TYPE_CIRCLE) {
    const obj = {
      ...common,
      r: Number(raw.r),
      color: raw.color === CIRCLE_COLOR_B ? CIRCLE_COLOR_B : CIRCLE_COLOR_A
    };
    sanitizeObject(obj);
    return obj;
  }

  if (type === TYPE_BOX) {
    const obj = {
      ...common,
      w: Number(raw.w),
      h: Number(raw.h),
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.st)
    };
    sanitizeObject(obj);
    return obj;
  }
  if (type === TYPE_ARC_BOX) {
    const obj = {
      ...common,
      w: Number(raw.w),
      h: Number(raw.h),
      cut: Number(raw.cut),
      sides: raw.sides,
      side: raw.side,
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.st)
    };
    sanitizeObject(obj);
    return obj;
  }

  if (type === TYPE_SHAPE) {
    const obj = {
      ...common,
      w: Number(raw.w),
      h: Number(raw.h),
      e: Number(raw.e),
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.st)
    };
    sanitizeObject(obj);
    return obj;
  }

  if (type === TYPE_RIGID_GROUP) {
    const parts = [];
    const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
    for (const rawPart of rawParts) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = sanitizeRigidGroupPart({
        type: rawPart.type,
        x: Number(rawPart.x),
        y: Number(rawPart.y),
        w: Number(rawPart.w),
        h: Number(rawPart.h),
        edges: rawPart.edges,
        cut: rawPart.cut,
        sides: rawPart.sides,
        side: rawPart.side,
        angle: Number(rawPart.angle) || 0
      });
      if (part) parts.push(part);
    }
    const obj = {
      ...common,
      type: TYPE_RIGID_GROUP,
      angle: Number(raw.angle) || 0,
      st: Boolean(raw.st),
      parts
    };
    sanitizeObject(obj);
    return obj;
  }

  if (type === TYPE_ROTOR) {
    const parts = [];
    const rawParts = Array.isArray(raw.parts) ? raw.parts : [];
    for (const rawPart of rawParts) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = sanitizeRigidGroupPart({
        type: rawPart.type,
        x: Number(rawPart.x),
        y: Number(rawPart.y),
        w: Number(rawPart.w),
        h: Number(rawPart.h),
        edges: rawPart.edges,
        cut: rawPart.cut,
        sides: rawPart.sides,
        side: rawPart.side,
        angle: Number(rawPart.angle) || 0
      });
      if (part) parts.push(part);
    }
    const obj = {
      ...common,
      w: Number(raw.w),
      h: Number(raw.h),
      e: Number(raw.e),
      angle: Number(raw.angle) || 0,
      motor: Boolean(raw.motor),
      motorSpeed: normalizeRotorMotorSpeedDeg(raw.motorSpeed),
      motorDirection: normalizeRotorMotorDirection(raw.motorDirection),
      motorTorque: normalizeRotorMotorTorque(raw.motorTorque),
      parts
    };
    sanitizeObject(obj);
    return obj;
  }

  return null;
}

function persist() {
  normalizeSelection();
  const payload = {
    nextId: state.nextId,
    selectedId: state.selectedId,
    selectedIds: state.selectedIds.slice(),
    snapEnabled: state.snapEnabled,
    snapSize: state.snapSize,
    editStep: state.editStep,
    valueMode: state.valueMode,
    objects: state.objects.map((obj) => ({ ...obj }))
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadFromStorage() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.objects)) return false;

    state.objects = [];
    state.nextId = 1;
    for (const rawObj of parsed.objects) {
      const obj = normalizeImportedObject(rawObj);
      if (!obj) continue;
      state.objects.push(obj);
      state.nextId = Math.max(state.nextId, obj.id + 1);
    }
    ensureMandatoryCircles();
    state.nextId = state.objects.reduce((maxId, obj) => Math.max(maxId, obj.id), 0) + 1;
    if (Array.isArray(parsed.selectedIds)) {
      state.selectedIds = parsed.selectedIds.filter((id) => Number.isInteger(id));
    } else if (Number.isInteger(parsed.selectedId)) {
      state.selectedIds = [parsed.selectedId];
    } else {
      state.selectedIds = [];
    }
    state.selectedId = Number.isInteger(parsed.selectedId) ? parsed.selectedId : null;
    normalizeSelection();
    if (state.selectedIds.length < 1 && state.objects[0]) setSingleSelection(state.objects[0].id);
    state.snapEnabled = Boolean(parsed.snapEnabled);
    state.snapSize = clamp(Math.round(Number(parsed.snapSize) || 16), 1, 256);
    state.valueMode = normalizeValueMode(parsed.valueMode);
    state.editStep = normalizeLoadedEditStep(parsed.editStep, state.valueMode);
    els.snapEnabled.checked = state.snapEnabled;
    els.snapSize.value = String(state.snapSize);
    els.valueMode.value = state.valueMode;
    syncEditStepControl();
    return true;
  } catch (_error) {
    return false;
  }
}

function renderStatus(text) {
  els.status.textContent = text;
  if (!text) return;
  window.clearTimeout(renderStatus.timer);
  renderStatus.timer = window.setTimeout(() => {
    if (els.status.textContent === text) els.status.textContent = "";
  }, 2800);
}
renderStatus.timer = null;

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function snap(value, step) {
  return Math.round(value / step) * step;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function round3(value) {
  return Number(value).toFixed(3).replace(/\.?0+$/, "");
}

function trimNumber(value, precision) {
  return Number(value).toFixed(precision).replace(/\.?0+$/, "");
}
