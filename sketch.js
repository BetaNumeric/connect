/* global planck */
const BASE_WIDTH = 1024;
const BASE_HEIGHT = 768;
const MAX_LEVEL = 20;
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

const PARTICLE_LIFE_FRAMES = 80;
const PARTICLE_DAMPING = 0.93;
const PARTICLES_ON_CONNECT = 40;
const PARTICLES_ON_FAIL = 70;

const BOX_FIXTURE_DEF = { density: 0.2, friction: 0.3, restitution: 0.1 };
const CIRCLE_FIXTURE_DEF = { density: 0.5, friction: 0.2, restitution: 0.1 };
const DRAWN_LINE_FIXTURE_DEF = { density: 3, friction: 0.2, restitution: 0.01 };
const CUSTOM_SHAPE_CIRCLE_FIXTURE_DEF = { density: 0.1, friction: 0.2, restitution: 0 };

let box2d;
let canvasRenderer;
// Images for buttons.
let playImg, retryImg, nextImg;
// Lists for game objects and effects.
let circles = [], boxes = [], lines = [], rotors = [], particles = [], cShapes = [];
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
let levelImg = new Array(MAX_LEVEL + 1).fill(null);
let timeStart = 0, time = 0, totalLines = 0;
let minTime = 0, minLines = 0;
let playerMinTime = null, playerMinLines = null;
let player = null;
let viewportScale = 1;
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
  constructor(x, y, w, h, st) {
    // Coordinates, size, and static/dynamic mode for a box body.
    this.x = x; this.y = y; this.w = w; this.h = h; this.st = st;
    this.c = st ? color(COLOR_GRAY_LIGHT) : color(COLOR_GRAY_MID);
    this.body = box2d.world.createBody({ type: st ? "static" : "dynamic", position: box2d.p2w(x, y) });
    this.body.createFixture(planck.Box(box2d.pxToW(w / 2), box2d.pxToW(h / 2)), { ...BOX_FIXTURE_DEF });
    this.body.setUserData(this);
  }
  contains(x, y, dia) {
    // Checks if coordinates are inside this box.
    const pos = box2d.getBodyPos(this.body);
    if (this.st) {
      return x + dia / 2 > pos.x - this.w / 2 && x - dia / 2 < pos.x + this.w / 2 && y + dia / 2 > pos.y - this.h / 2 && y - dia / 2 < pos.y + this.h / 2;
    }
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
  constructor(x, y, w, h, e, st) {
    // Location, size, edges (<=8 polygon, >8 circle), and static/dynamic mode.
    this.x = x; this.y = y; this.w = w; this.h = h; this.e = max(3, e); this.st = st;
    this.c = st ? color(COLOR_GRAY_LIGHT) : color(COLOR_GRAY_MID);
    this.body = box2d.world.createBody({ type: st ? "static" : "dynamic", position: box2d.p2w(x, y) });
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
  constructor(x, y, w, h, e, motor) {
    // Coordinates and size of the rotating platform/shape.
    this.h = h;
    this.fixture = new Box(x, y, h / 2, h / 2, true);
    this.platform = null;
    this.shape = null;
    if (e === 4) {
      this.platform = new Box(x, y, w, h, false);
      box2d.world.createJoint(planck.RevoluteJoint({ motorSpeed: PI, maxMotorTorque: 500, enableMotor: motor }, this.fixture.body, this.platform.body, this.fixture.body.getWorldCenter()));
    } else {
      this.shape = new CustomShape(x, y, w, h, e, false);
      box2d.world.createJoint(planck.RevoluteJoint({ motorSpeed: PI, maxMotorTorque: 500, enableMotor: motor }, this.fixture.body, this.shape.body, this.fixture.body.getWorldCenter()));
    }
  }
  contains(x, y, dia) {
    // Checks if coordinates are inside this rotor.
    if (this.platform) return this.platform.contains(x, y, dia);
    if (this.shape) return this.shape.contains(x, y);
    return false;
  }
  delete() { this.fixture.delete(); if (this.platform) this.platform.delete(); if (this.shape) this.shape.delete(); }
  done() { return false; }
  draw() {
    if (this.platform) this.platform.draw();
    if (this.shape) this.shape.draw();
    const a = box2d.w2p(this.fixture.body.getWorldCenter());
    noFill(); strokeWeight(5); stroke(COLOR_GRAY_LIGHT); ellipse(a.x, a.y, this.h / 2, this.h / 2);
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
  // Load button images and level preview images.
  playImg = loadImage("data/play.png");
  retryImg = loadImage("data/retry.png");
  nextImg = loadImage("data/next.png");
  for (let i = 0; i < levelImg.length; i++) {
    levelImg[i] = loadImage(`data/levels/level ${i}.png`, () => {}, () => { levelImg[i] = null; });
  }
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
  loadScores();
  loadStoredPreviews();
  circleR = width / 50;
  d = width / 100;
  buttonX = width / 2;
  buttonY = height / 2;
  buttonW = height / 4;
  const row = getActiveRow();
  if (row) player = row.name;
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

function draw() {
  // Main game loop.
  background(COLOR_WHITE);
  fill(COLOR_BLACK);
  if (info) {
    textSize(12);
    textAlign(LEFT);
    text(`fps: ${frameRate().toFixed(3)}, Box: ${boxes.length}, balls: ${circles.length}, lPos: ${linePos.length}, partic.: ${particles.length}, Rotor: ${rotors.length}, Line: ${lines.length}, all lines: ${totalLines}, test: ${linePosTest.length}, mode: ${gameMode}, Level: ${level + 1}`, 100, 20);
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
  if (gameMode === 1 && physics) drawResetButton();
  if (gameMode === 2) drawResultMode();
  if (gameMode === 0 || gameMode === 1 || gameMode === 2) drawGlobalMenuButton();
  if (gameMode === 4) drawLevelMenu();
  if (gameMode === 5) {
    saveLevelPreview(level);
    if (level < MAX_LEVEL) level++; else { level = 0; gameMode = 0; }
    loadLevel();
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
  tint(COLOR_WHITE, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? ALPHA_OPAQUE : ALPHA_DIM);
  if (playImg) image(playImg, buttonX, buttonY, buttonW, buttonW);
}

function drawPlayMode() {
  // Active gameplay mode with drawing cursor and timer.
  if (!physics) timeStart = millis(); else testConnection();
  time = millis() - timeStart;
  noStroke();
  textAlign(CENTER); textSize(height / 30); fill(COLOR_BLACK); text(`${fmtSecs(time)}s`, width / 2, height / 25);

  if (!pointInRect(mouseX, mouseY, getMenuButtonRect())) noCursor();
  noStroke(); fill(COLOR_GRAY_MID); ellipse(mouseX, mouseY, d, d);
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
  buttonX = width - height / 10;
  buttonY = height / 10;
  buttonW = height / 10;
  testConnection();
  tint(COLOR_WHITE, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? ALPHA_OPAQUE : ALPHA_DIM);
  if (retryImg) image(retryImg, buttonX, buttonY, buttonW, buttonW);
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
    const bestLine = (minLines === 0 || minLines >= totalLines);
    const bestTime = (minTime === 0 || minTime >= time);
    const completeFewestLine = `${totalLines} ${totalLines > 1 ? "lines" : "line"}${bestLine ? ` (new record by ${player}!)` : ` (${formatFewestScore(playerMinLines, minLines)})`}`;
    const completeFastestLine = `${fmtSecs(time)}s${bestTime ? ` (new record by ${player}!)` : ` (${formatFastestScore(playerMinTime, minTime)})`}`;
    const completeScoreLeftX = getCenteredLeftAlignedBlockX(width / 2, [completeFewestLine, completeFastestLine]);
    fill(bestLine ? color(...COLOR_SUCCESS_RGB) : color(COLOR_BLACK));
    text(completeFewestLine, completeScoreLeftX, height - height / 4);
    fill(bestTime ? color(...COLOR_SUCCESS_RGB) : color(COLOR_BLACK));
    text(completeFastestLine, completeScoreLeftX, height - height / 6);
    tint(COLOR_WHITE, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? ALPHA_OPAQUE : ALPHA_DIM);
    if (nextImg) image(nextImg, buttonX, buttonY, buttonW, buttonW);
  } else {
    const failScoreLines = [];
    if (minLines !== 0 && playerMinLines !== null) failScoreLines.push(formatFewestScore(playerMinLines, minLines));
    if (minTime !== 0 && playerMinTime !== null) failScoreLines.push(formatFastestScore(playerMinTime, minTime));
    drawCenteredLeftAlignedTextLines(width / 2, height - height / 4, failScoreLines, height / 12);
    tint(COLOR_WHITE, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? ALPHA_OPAQUE : ALPHA_DIM);
    if (retryImg) image(retryImg, buttonX, buttonY, buttonW, buttonW);
  }
}

function drawLevelMenu() {
  // Draw scrollable level selection menu with player controls.
  background(COLOR_GRAY_LIGHT);
  drawMenuTopPlayerBar();
  strokeWeight(1);
  noStroke();
  imgW = width / 3; imgH = height / 3; imgX = imgScroll; imgY = height / 2;
  const levelPitch = getLevelCardPitch();
  const leadingGap = getLevelCardGap();
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
    } else text("Fewest: -\nFastest: -", 5 + cardX, 5 + imgY + imgH / 2, imgW - 5, imgH);

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
  const barY = height / 18;
  const barH = height / 16;
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
  const stripW = getLevelCardPitch() * (MAX_LEVEL + 1);
  return width - stripW;
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
  const handleCenterX = map(imgScroll, 0, minScroll, trackPadding, width - trackPadding);
  return {
    track: { x: 0, y: trackY - trackH / 2, w: width, h: trackH },
    handle: { x: handleCenterX - handleW / 2, y: trackY - handleH / 2, w: handleW, h: handleH },
    trackPadding,
    trackY,
    minScroll,
  };
}

function getMenuButtonRect() {
  const w = width / 8;
  const h = height / 16;
  const x = width / 40;
  const y = height / 40;
  return { x, y, w, h };
}

function drawGlobalMenuButton() {
  menuButtonRect = getMenuButtonRect();
  const { x, y, w, h } = menuButtonRect;
  const hover = pointInRect(mouseX, mouseY, menuButtonRect);
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
  const out = { id: String(row?.id ?? `${Date.now()}_${Math.floor(Math.random() * ID_RANDOM_RANGE)}`), name: sanitizePlayerName(String(row?.name ?? "Player")), timeScores: new Array(MAX_LEVEL + 1).fill(0), lineScores: new Array(MAX_LEVEL + 1).fill(0) };
  if (Array.isArray(row?.timeScores)) for (let i = 0; i <= MAX_LEVEL; i++) out.timeScores[i] = Number(row.timeScores[i]) || 0;
  if (Array.isArray(row?.lineScores)) for (let i = 0; i <= MAX_LEVEL; i++) out.lineScores[i] = Number(row.lineScores[i]) || 0;
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
  const row = { id: `${Date.now()}_${Math.floor(Math.random() * ID_RANDOM_RANGE)}`, name: sanitizePlayerName(name), timeScores: new Array(MAX_LEVEL + 1).fill(0), lineScores: new Array(MAX_LEVEL + 1).fill(0) };
  scoreStore.rows.push(row); scoreStore.activeRowId = row.id; saveScores();
}
function getActiveRow() { return scoreStore.rows.find((r) => r.id === scoreStore.activeRowId) || null; }
function updateCurrentScore(lv, ms, lineCount) {
  // Save current level time and line count for the active row.
  const row = getActiveRow();
  if (!row) return;
  row.timeScores[lv] = ms;
  row.lineScores[lv] = lineCount;
  saveScores();
}
function calcScore(lv) {
  // Calculate best time and best line count for one level across all rows.
  lv = constrain(lv, 0, MAX_LEVEL);
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
  for (let i = 0; i <= MAX_LEVEL; i++) {
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
  return `Fewest: ${playerName} [${lineCount} ${lineCount === 1 ? "line" : "lines"}]`;
}

function formatFastestScore(playerName, ms) {
  const sec = Number(fmtSecs(ms));
  return `Fastest: ${playerName} [${fmtSecs(ms)}s]`;
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
    updateCurrentScore(level, time, totalLines);
    saveLevelPreview(level);
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
  const menuRect = getMenuButtonRect();
  menuButtonArmed = (gameMode === 0 || gameMode === 1 || gameMode === 2) && pointInRect(mouseX, mouseY, menuRect);
  resetButtonArmed = gameMode === 1 && dist(mouseX, mouseY, width - height / 10, height / 10) < (height / 10) / 2;
  if (gameMode === 1 && (menuButtonArmed || resetButtonArmed)) return;

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
    loadLevel();
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
    pointInRect(mouseX, mouseY, getMenuButtonRect())
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
      dist(mouseX, mouseY, width - height / 10, height / 10) < (height / 10) / 2
    ) {
      loadLevel();
    }
  } else if ((gameMode === 0 || gameMode === 2) && player !== null && dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2) loadLevel();
  resetButtonArmed = false;
  menuButtonArmed = false;
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

function loadLevel() {
  // Deletes all level objects, resets variables, and (re)loads level content.
  if (gameMode !== 4 && levelUp) level++;
  if (level > MAX_LEVEL) { if (player) createScoreRow(player); level = 0; }

  for (const o of circles) o.delete(); circles = [];
  for (const o of boxes) o.delete(); boxes = [];
  for (const o of cShapes) o.delete(); cShapes = [];
  for (const o of rotors) o.delete(); rotors = [];
  for (const o of lines) o.delete(); lines = [];

  linePos = []; linePosTest = []; totalLines = 0;
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
  // Builds the current level with boxes, circles, shapes, and rotors.
  switch (level) {
    case 0:
      circles.push(new Circle(width / 4, height / 5, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height / 5, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      break;
    case 1:
      circles.push(new Circle(width / 4, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height / 5, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      break;
    case 2:
      circles.push(new Circle(width / 4, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      break;
    case 3:
      circles.push(new Circle(width / 2, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle(width / 2, height - height / 2 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2, height - height / 2, width / 2, height / 20, true));
      break;
    case 4:
      circles.push(new Circle(width / 5, height / 2 - height / 40 - height / 4, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 5) * 4, height / 2 - height / 40 + height / 4, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) cShapes.push(new CustomShape(width / 10 + i * (width / 5), height / 10 + j * (height / 4), circleR * 2, circleR * 2, 6, false));
      break;
    case 5:
      circles.push(new Circle(width / 4, height / 5, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height / 5, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2, height - height / 4, width / 5, height / 2, true));
      break;
    case 6:
      circles.push(new Circle(width / 4, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2, height / 4, width / 5, height / 2, false));
      break;
    case 7:
      circles.push(new Circle(width / 4, height / 3 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2 + width / 8, height - height / 3, width - width / 4, height / 20, true));
      boxes.push(new Box(width / 2 - width / 8, height / 3, width - width / 4, height / 20, true));
      break;
    case 8:
      circles.push(new Circle(width / 4, height - height / 5 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height - height / 5 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width - width / 6, height - height / 10, width / 3, height / 5, true));
      boxes.push(new Box(width / 6, height - height / 10, width / 3, height / 5, true));
      boxes.push(new Box(width - width / 9, height - height / 20, width / 2, height / 5, true));
      boxes.push(new Box(width / 9, height - height / 20, width / 2, height / 5, true));
      break;
    case 9:
      circles.push(new Circle(width / 4, height / 3, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height / 3, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 4, height - height / 10, width / 2, height / 5, true));
      break;
    case 10:
      circles.push(new Circle((width / 6) * 2, height / 2 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 6) * 4, height / 2 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 2, width / 2, height / 20, true));
      boxes.push(new Box(width / 2, height / 4, width / 30, height / 2, true));
      break;
    case 11:
      circles.push(new Circle(width / 4, height / 2, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height / 2, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height / 2, width / 10, width / 10, true));
      break;
    case 12:
      circles.push(new Circle(width / 2, height / 2 + height / 6 - circleR * 2, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle(width / 2, height / 2 - height / 6 - circleR * 2, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2 + height / 40, height / 2 + height / 6, height / 3, height / 20, true));
      boxes.push(new Box(width / 2 - height / 40, height / 2 - height / 6, height / 3, height / 20, true));
      boxes.push(new Box(width / 2 - height / 6, height / 2 + height / 40, height / 20, height / 3, true));
      boxes.push(new Box(width / 2 + height / 6, height / 2 - height / 15, height / 20, height / 4, true));
      break;
    case 13:
      circles.push(new Circle(width / 2, height / 2 + height / 6 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle(width / 2, height / 2 - height / 6 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height / 2 + height / 6, width / 3, height / 20, true));
      boxes.push(new Box(width / 2, height / 2 - height / 6, width / 2, height / 20, true));
      break;
    case 14:
      circles.push(new Circle(width / 5, height / 2 + height / 6, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle(width - width / 5, height / 2 - height / 6, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 5, height / 2, width / 2.5, height / 20, true));
      boxes.push(new Box(width - width / 5, height / 2, width / 2.5, height / 20, true));
      break;
    case 15:
      circles.push(new Circle(width / 3.5, height / 2 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle(width - width / 3.5, height / 2 - height / 40 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height / 2 - height / 80, width / 2, height / 40, false));
      cShapes.push(new CustomShape(width / 2, height, width / 20, height / 2, 4, true));
      break;
    case 16:
      circles.push(new Circle(width / 10, height / 6 + height / 8, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle(width - width / 10, height - height / 20 - circleR, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width - width / 8, height - height / 40, width / 4, height / 20, true));
      boxes.push(new Box(width / 8, height - height / 40, width / 4, height / 20, true));
      cShapes.push(new CustomShape(width / 12, height - height / 20, width / 6, height - height / 4, 3, true));
      break;
    case 17:
      circles.push(new Circle(width / 5, height / 3, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 5) * 4, height / 3, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      cShapes.push(new CustomShape(width / 2, height, width / 2, height / 2, 4, true));
      cShapes.push(new CustomShape(width / 2, height / 5, height / 15, height / 15, 10, false));
      break;
    case 18:
      circles.push(new Circle(width / 5, height / 2 - circleR * 2, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 5) * 4, height / 2 - circleR * 2, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 10, height / 2, width / 4, height / 20, true));
      boxes.push(new Box(width - width / 10, height / 2, width / 4, height / 20, true));
      rotors.push(new Rotor(width / 2, height / 2, width / 2, height / 20, 4, false));
      break;
    case 19:
      circles.push(new Circle(width / 5, height / 2 - circleR * 2, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle(width / 2, height - height / 20 - circleR * 2, circleR, color(...COLOR_PLAYER_B_RGB)));
      boxes.push(new Box(width / 10, height / 2, width / 4, height / 20, true));
      boxes.push(new Box(width / 2, height - height / 20, width / 6, height / 20, true));
      boxes.push(new Box(width / 2 - width / 12 + height / 40, height - height / 20 - height / 20, height / 20, height / 10, true));
      boxes.push(new Box(width / 2 + width / 12 - height / 40, height - height / 20 - height / 20, height / 20, height / 10, true));
      rotors.push(new Rotor(width / 2, height / 2, width / 2, height / 20, 4, false));
      break;
    case MAX_LEVEL:
      circles.push(new Circle(width / 4, height / 4 - circleR * 2, circleR, color(...COLOR_PLAYER_A_RGB)));
      circles.push(new Circle((width / 4) * 3, height - height / 4 - circleR * 2, circleR, color(...COLOR_PLAYER_B_RGB)));
      rotors.push(new Rotor(width / 4, height / 4, width / 2 - height / 20, height / 20, 4, false));
      rotors.push(new Rotor((width / 4) * 3, height / 4, width / 2 - height / 20, height / 20, 4, false));
      rotors.push(new Rotor(width / 4, height - height / 4, width / 2 - height / 20, height / 20, 4, false));
      rotors.push(new Rotor((width / 4) * 3, height - height / 4, width / 2 - height / 20, height / 20, 4, false));
      break;
    default:
      gameMode = 4;
      break;
  }
}

