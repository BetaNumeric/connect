/* global planck */
const MAX_LEVEL = 20;
const SCORE_KEY = "connect_scores_v1";
const PREVIEW_KEY = "connect_level_preview_";

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
let nameInput, nameButton, changeNameButton, playerSelect;
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
    this.c = st ? color(200) : color(127);
    this.body = box2d.world.createBody({ type: st ? "static" : "dynamic", position: box2d.p2w(x, y) });
    this.body.createFixture(planck.Box(box2d.pxToW(w / 2), box2d.pxToW(h / 2)), { density: 0.2, friction: 0.3, restitution: 0.1 });
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
    this.body.createFixture(planck.Circle(box2d.pxToW(r)), { density: 0.5, friction: 0.2, restitution: 0.1 });
    this.body.setUserData(this);
  }
  delete() { box2d.destroy(this.body); }
  change() { this.c = color(0, 255, 0); }
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
    push(); translate(this.pos.x, this.pos.y); rotate(-this.body.getAngle()); if (info) fill(127, 127); else fill(this.c); noStroke(); ellipse(0, 0, this.r * 2, this.r * 2); if (info) { stroke(0); line(0, 0, this.r, 0); } pop();
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
    this.body.createFixture(planck.Circle(box2d.pxToW(this.h / 2)), { density: 3, friction: 0.2, restitution: 0.01 });

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

      this.body.createFixture(planck.Circle(this.offset[i], box2d.pxToW(this.h / 2)), { density: 3, friction: 0.2, restitution: 0.01 });
      this.body.createFixture(planck.Box(w / 2, box2d.pxToW(this.h / 2), c, this.angle[i]), { density: 3, friction: 0.2, restitution: 0.01 });
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
    push(); translate(pos.x, pos.y); rotate(-this.body.getAngle()); noStroke(); if (info) fill(127, 100); else fill(127);
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
    this.c = st ? color(200) : color(127);
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
      this.body.createFixture(planck.Circle(box2d.pxToW((w + h) / 2)), { density: 0.1, friction: 0.2, restitution: 0 });
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
    noFill(); strokeWeight(5); stroke(200); ellipse(a.x, a.y, this.h / 2, this.h / 2);
  }
}

class Particle {
  constructor(x, y, size, c) {
    // Diameter, lifetime, color, and velocity.
    this.life = 80;
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
    this.velocity.mult(0.93);
  }
  draw() {
    // Draws particles and decreases opacity depending on remaining lifetime.
    noStroke();
    const o = map(this.ttl, 0, this.life, 0, 255);
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
  canvasRenderer = createCanvas(1024, 768);
  rectMode(CENTER);
  imageMode(CENTER);
  box2d = new B2D();
  box2d.createWorld();
  loadScores();
  setupNameUi();
  loadStoredPreviews();
  circleR = width / 50;
  d = width / 100;
  buttonX = width / 2;
  buttonY = height / 2;
  buttonW = height / 4;
  const row = getActiveRow();
  if (row) { player = row.name; showNameUi(false); }
}

function draw() {
  // Main game loop.
  background(255);
  positionNameUi();
  positionChangeNameUi();
  if (gameMode !== 4) showChangeNameUi(false);
  fill(0);
  if (info) {
    textSize(12);
    textAlign(LEFT);
    text(`fps: ${frameRate().toFixed(3)}, Box: ${boxes.length}, balls: ${circles.length}, lPos: ${linePos.length}, partic.: ${particles.length}, Rotor: ${rotors.length}, Line: ${lines.length}, all lines: ${totalLines}, test: ${linePosTest.length}, mode: ${gameMode}, Level: ${level + 1}`, 100, 20);
  }

  drawPermit = true;
  // Prohibits drawing lines outside of the screen.
  if (mouseX < d / 2 || mouseX > width - d / 2 || mouseY < d / 2 || mouseY > height - d / 2) drawPermit = false;
  if (physics) box2d.step();
  if (!(gameMode === 4 && player === null)) drawObjects();

  if (gameMode === 0) drawStartMode();
  if (gameMode === 1) drawPlayMode(); else cursor(ARROW);
  if (gameMode === 1 && physics) drawResetButton();
  if (gameMode === 2) drawResultMode();
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
  textAlign(LEFT);
  textSize(width / 40);
  fill(0, 127);
  if (mouseX < width / 40 + width / 15 && mouseY < height / 20) fill(0);
  text("Menu", width / 40, height / 20);

  fill(255, 127); noStroke(); rect(width / 2, height / 2, width, height);
  buttonX = width / 2; buttonY = height / 2; buttonW = height / 4;
  textAlign(CENTER); textSize(width / 20); fill(0); text(`Level: ${level + 1}`, width / 2, height / 5);
  textAlign(LEFT); textSize(width / 30);
  calcScore(level);
  if (playerMinLines !== null && minLines !== 0) text(`Best: ${minLines} ${minLines > 1 ? "Lines" : "Line"} (by: ${playerMinLines}),`, width / 4, height - height / 4);
  if (playerMinTime !== null && minTime !== 0) text(`${fmtSecs(minTime)} Seconds (by: ${playerMinTime})`, width / 4, height - height / 8);
  tint(255, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? 255 : 127);
  if (playImg) image(playImg, buttonX, buttonY, buttonW, buttonW);
}

function drawPlayMode() {
  // Active gameplay mode with drawing cursor and timer.
  if (!physics) timeStart = millis(); else testConnection();
  time = millis() - timeStart;
  noStroke();
  textAlign(LEFT); textSize(height / 30); fill(0); text(`${fmtSecs(time)}s`, width / 100, height / 25);

  noCursor(); noStroke(); fill(127); ellipse(mouseX, mouseY, d, d);
  strokeWeight(d); stroke(127, 127);
  if (mouseIsPressed && linePos.length > 0) {
    const l = linePos[linePos.length - 1];
    line(mouseX, mouseY, l.x, l.y);
    if (info) {
      let dis = dist(l.x, l.y, mouseX, mouseY) / 10;
      noStroke(); fill(0, 255, 0); ellipse(mouseX, mouseY, d, d); ellipse(l.x, l.y, d, d); fill(255, 0, 0);
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
  tint(255, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? 255 : 127);
  if (retryImg) image(retryImg, buttonX, buttonY, buttonW, buttonW);
}

function drawResultMode() {
  // Draw replay/next UI and level results after finish/failure.
  fill(255, 127); noStroke(); rect(width / 2, height / 2, width, height);
  buttonX = width / 2; buttonY = height / 2; buttonW = height / 4;

  noStroke();
  textAlign(LEFT); textSize(width / 40); fill(0, 127);
  if (mouseX < width / 40 + width / 15 && mouseY < height / 20) fill(0);
  text("Menu", width / 40, height / 20);

  textAlign(CENTER); textSize(width / 20); fill(0);
  text(`Level: ${level + 1}`, width / 2, height / 5);
  text(levelUp ? "Complete!" : "Failed!", width / 2, height / 3);

  textAlign(LEFT); textSize(width / 30); calcScore(level);
  if (levelUp) {
    const bestLine = (minLines === 0 || minLines >= totalLines);
    const bestTime = (minTime === 0 || minTime >= time);
    fill(bestLine ? color(0, 255, 0) : color(0));
    text(`${totalLines} ${totalLines > 1 ? "lines" : "line"}${bestLine ? ` (new record by ${player}!)` : ` (best: ${minLines} by: ${playerMinLines})`}`, width / 4, height - height / 4);
    fill(bestTime ? color(0, 255, 0) : color(0));
    text(`${fmtSecs(time)} seconds${bestTime ? ` (new record by ${player}!)` : ` (best: ${fmtSecs(minTime)}s by: ${playerMinTime})`}`, width / 4, height - height / 8);
    tint(255, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? 255 : 127);
    if (nextImg) image(nextImg, buttonX, buttonY, buttonW, buttonW);
  } else {
    if (minLines !== 0 && playerMinLines !== null) text(`Best: ${minLines} ${minLines > 1 ? "Lines" : "Line"} (by: ${playerMinLines})`, width / 4, height - height / 4);
    if (minTime !== 0 && playerMinTime !== null) text(`Best: ${fmtSecs(minTime)} Seconds (by: ${playerMinTime})`, width / 4, height - height / 8);
    tint(255, dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2 ? 255 : 127);
    if (retryImg) image(retryImg, buttonX, buttonY, buttonW, buttonW);
  }
}

function drawLevelMenu() {
  // Draw player input or scrollable level selection menu.
  if (player === null) {
    background(255);
    showChangeNameUi(false);
    noStroke();
    fill(0); textSize(height / 25); textAlign(LEFT); text("Player Name:", width / 4, height / 2 - height / 40);
    textSize(height / 35); fill(80); text("Or choose an existing player:", width / 4, height / 2 + height / 6);
    showNameUi(true);
    positionNameUi();
    return;
  }

  showNameUi(false);
  showChangeNameUi(true);
  background(200);
  strokeWeight(1); stroke(0);
  imgW = width / 3; imgH = height / 3; imgX = imgScroll; imgY = height / 2;
  if (mouseY < imgY + imgH && mouseY > imgY - imgH && mouseIsPressed && abs(mouseX - pmouseX) > 0) cursor(MOVE); else cursor(ARROW);

  tint(255, 255);
  for (let i = 0; i < levelImg.length; i++) {
    fill(255);
    if (levelImg[i]) image(levelImg[i], imgX + imgW * i + imgW / 2, imgY - imgH / 2, imgW, imgH);
    else rect(imgX + imgW * i + imgW / 2, imgY - imgH / 2, imgW, imgH);
    noFill(); rect(imgX + imgW * i + imgW / 2, imgY - imgH / 2, imgW, imgH);
    fill(127); rect(imgX + imgW * i + imgW / 2, imgY + imgH / 2, imgW, imgH);
    calcScore(i);
    noStroke();
    textSize(imgW / 15); textAlign(LEFT); fill(0); text(`Level: ${i + 1}`, 3 + imgX + imgW * i + imgW / 2, 2 + imgY - imgH / 2, imgW, imgH);
    textSize(imgW / 12); fill(255);
    if (minLines > 0 && minTime > 0 && playerMinLines && playerMinTime) {
      text(`Best:\n${minLines} ${minLines > 1 ? "Lines" : "Line"} (by: ${playerMinLines})\n${fmtSecs(minTime)} Seconds (by: ${playerMinTime})`, 5 + imgX + imgW * i + imgW / 2, 5 + imgY + imgH / 2, imgW - 5, imgH);
    } else text("Best:\n -\n -", 5 + imgX + imgW * i + imgW / 2, 5 + imgY + imgH / 2, imgW - 5, imgH);
  }

  fill(100); rect(width / 2, imgY + imgH + height / 40, width, height / 20);
  fill(200); rect(map(imgScroll, 0, width - imgW * (MAX_LEVEL + 1), height / 20, width - height / 20), imgY + imgH + height / 40, height / 10, height / 20);

  selectedLevel = -1;
  for (let i = 0; i < levelImg.length; i++) {
    if (mouseX > imgX + imgW * i && mouseX < imgX + imgW * i + imgW && mouseY < imgY && mouseY > imgY - imgH) {
      strokeWeight(5); stroke(0); noFill(); rect(imgX + imgW * i + imgW / 2, imgY - imgH / 2, imgW, imgH);
      selectedLevel = i;
    }
  }
}

function setupNameUi() {
  // Replacement for ControlP5 text input in the web version.
  nameInput = createInput("");
  nameInput.attribute("id", "player-name");
  nameInput.attribute("name", "playerName");
  nameInput.attribute("maxlength", "24");
  nameInput.attribute("autocomplete", "nickname");
  nameInput.style("font-size", "24px");
  nameInput.style("padding", "4px 8px");
  nameInput.style("border", "1px solid #777");
  nameButton = createButton("Play");
  nameButton.style("font-size", "20px");
  nameButton.style("padding", "4px 8px");
  nameButton.mousePressed(submitName);

  playerSelect = createSelect();
  playerSelect.attribute("id", "existing-player");
  playerSelect.attribute("name", "existingPlayer");
  playerSelect.style("font-size", "18px");
  playerSelect.style("padding", "4px 8px");
  playerSelect.changed(() => {
    const selectedName = playerSelect.value();
    if (!selectedName) return;
    selectExistingPlayer(selectedName);
    playerSelect.value("");
  });

  changeNameButton = createButton("Change Player");
  changeNameButton.attribute("id", "change-player");
  changeNameButton.attribute("name", "changePlayer");
  changeNameButton.style("font-size", "16px");
  changeNameButton.style("padding", "4px 4px");
  changeNameButton.mousePressed(() => {
    player = null;
    showChangeNameUi(false);
    showNameUi(true);
    refreshPlayerSelect();
    positionNameUi();
    nameInput.elt.focus();
  });
  nameInput.elt.addEventListener("keydown", (e) => { if (e.key === "Enter") submitName(); });
  refreshPlayerSelect();
  positionNameUi();
  positionChangeNameUi();
  showChangeNameUi(false);
}

function positionNameUi() {
  // Keep name controls aligned with the canvas layout.
  if (!nameInput || !nameButton || !playerSelect || !canvasRenderer) return;
  const canvasRect = canvasRenderer.elt.getBoundingClientRect();
  const canvasLeft = canvasRect.left + window.scrollX;
  const canvasTop = canvasRect.top + window.scrollY;

  nameInput.position(canvasLeft + width / 4, canvasTop + height / 2);
  nameInput.size(width / 2, height / 20);
  nameButton.position(canvasLeft + width / 2 - width / 20, canvasTop + height / 2 + height / 20 + 10);
  nameButton.size(width / 10, height / 20);
  playerSelect.position(canvasLeft + width / 4, canvasTop + height / 2 + height / 20 + 10 + height / 20 + 10);
  playerSelect.size(width / 2, height / 20);
}

function showNameUi(show) {
  const display = show ? "block" : "none";
  if (nameInput) nameInput.style("display", display);
  if (nameButton) nameButton.style("display", display);
  if (playerSelect) playerSelect.style("display", display);
}

function positionChangeNameUi() {
  if (!changeNameButton || !canvasRenderer) return;
  const canvasRect = canvasRenderer.elt.getBoundingClientRect();
  const canvasLeft = canvasRect.left + window.scrollX;
  const canvasTop = canvasRect.top + window.scrollY;
  const buttonW = width / 8;
  const buttonH = height / 22;
  changeNameButton.size(buttonW, buttonH);
  changeNameButton.position(canvasLeft + width - buttonW - width / 40, canvasTop + height / 40);
}

function showChangeNameUi(show) {
  if (changeNameButton) {
    changeNameButton.style("display", show ? "block" : "none");
  }
}

function submitName() {
  // Create a score row on first valid player name.
  const name = nameInput.value().trim();
  if (!name) return;
  player = name;
  createScoreRow(player);
  nameInput.value("");
  if (playerSelect) playerSelect.value("");
  showNameUi(false);
}

function refreshPlayerSelect() {
  if (!playerSelect) return;
  const previous = playerSelect.value();
  playerSelect.elt.innerHTML = "";
  playerSelect.option("-- Select existing player --", "");
  const names = Array.from(new Set(scoreStore.rows.map((row) => row.name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  for (const name of names) playerSelect.option(name, name);
  if (previous && names.includes(previous)) playerSelect.value(previous);
  else playerSelect.value("");
}

function selectExistingPlayer(name) {
  for (let i = scoreStore.rows.length - 1; i >= 0; i--) {
    if (scoreStore.rows[i].name === name) {
      scoreStore.activeRowId = scoreStore.rows[i].id;
      saveScores();
      player = name;
      showNameUi(false);
      showChangeNameUi(true);
      return;
    }
  }
}

function normalizeRow(row) {
  const out = { id: String(row?.id ?? `${Date.now()}_${Math.floor(Math.random() * 1e9)}`), name: String(row?.name ?? "Player"), timeScores: new Array(MAX_LEVEL + 1).fill(0), lineScores: new Array(MAX_LEVEL + 1).fill(0) };
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
  refreshPlayerSelect();
}

function saveScores() { localStorage.setItem(SCORE_KEY, JSON.stringify(scoreStore)); }
function createScoreRow(name) {
  // Add a new player session row.
  const row = { id: `${Date.now()}_${Math.floor(Math.random() * 1e9)}`, name, timeScores: new Array(MAX_LEVEL + 1).fill(0), lineScores: new Array(MAX_LEVEL + 1).fill(0) };
  scoreStore.rows.push(row); scoreStore.activeRowId = row.id; saveScores();
  refreshPlayerSelect();
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
    for (let i = 0; i < 40; i++) particles.push(new Particle(x, y, circleR / 2, circles[0].c));
    gameMode = 2;
    levelUp = true;
  }
}

function keyPressed() {
  // Toggles debug info and handles mode hotkeys.
  if (player !== null) {
    if (key === "I" || key === "i") info = !info;
    if (keyCode === ENTER) gameMode = 5;
    if (keyCode === ESCAPE) { gameMode = 4; return false; }
  }
  return true;
}

function mousePressed() {
  // Adds first coordinate to linePos when the mouse is pressed.
  checkEdge();
  if (drawPermit && gameMode === 1) linePos.push(createVector(mouseX, mouseY));
  if (gameMode === 4 && mouseX >= height / 40 && mouseX <= width - height / 40 && mouseY >= imgY + imgH && mouseY <= imgY + imgH + height / 20) {
    imgScroll = map(mouseX, height / 20, width - height / 20, 0, width - imgW * (MAX_LEVEL + 1));
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
    if (mouseY < imgY + imgH && mouseY > imgY - imgH && imgScroll + (mouseX - pmouseX) <= 0 && imgScroll + (mouseX - pmouseX) >= width - imgW * (MAX_LEVEL + 1)) imgScroll += mouseX - pmouseX;
    if (mouseX >= height / 40 && mouseX <= width - height / 40 && mouseY >= imgY + imgH && mouseY <= imgY + imgH + height / 20) {
      imgScroll = map(mouseX, height / 40, width - height / 40, 0, width - imgW * (MAX_LEVEL + 1));
    }
  }
}

function mouseWheel(e) {
  const c = e.deltaY === 0 ? 0 : Math.sign(e.deltaY);
  if (imgScroll + c <= 0 && imgScroll + c >= width - imgW * (MAX_LEVEL + 1)) imgScroll += c * 20;
  return false;
}

function mouseClicked() {
  /*
    Checks if a button is clicked and reloads/selects level. This avoids
    accidental reset while drawing because release is handled separately.
  */
  if (gameMode === 1 && dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2) loadLevel();
  if ((gameMode === 0 || gameMode === 2) && mouseX < width / 40 + width / 15 && mouseY < height / 20) gameMode = 4;
  if (mouseY < imgY + imgH && mouseY > imgY - imgH && gameMode === 4 && selectedLevel !== -1) { level = selectedLevel; loadLevel(); gameMode = 0; }
}

function mouseReleased() {
  /*
    If gameMode is 1, convert drawn coordinates into a physical line.
    Otherwise handle button clicks to reset/load level.
  */
  if (gameMode === 1) {
    if (linePos.length > 0) {
      lines.push(new LineBody(linePos, d));
      totalLines++;
      linePos = [];
      physics = true;
    }
  } else if (player !== null && dist(mouseX, mouseY, buttonX, buttonY) < buttonW / 2) loadLevel();
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
      for (let j = 0; j < 70; j++) particles.push(new Particle(circles[i].pos.x, circles[i].pos.y, circleR, circles[i].c));
      circles.splice(i, 1);
      gameMode = 2;
    }
  }
  for (let i = cShapes.length - 1; i >= 0; i--) { cShapes[i].draw(); if (cShapes[i].done()) cShapes.splice(i, 1); }
  for (let i = 1; i < linePos.length; i++) { stroke(127); strokeWeight(d); line(linePos[i].x, linePos[i].y, linePos[i - 1].x, linePos[i - 1].y); strokeWeight(1); }
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
      circles.push(new Circle(width / 4, height / 5, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height / 5, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      break;
    case 1:
      circles.push(new Circle(width / 4, height - height / 20 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height / 5, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      break;
    case 2:
      circles.push(new Circle(width / 4, height - height / 20 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height - height / 20 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      break;
    case 3:
      circles.push(new Circle(width / 2, height - height / 20 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle(width / 2, height - height / 2 - height / 40 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2, height - height / 2, width / 2, height / 20, true));
      break;
    case 4:
      circles.push(new Circle(width / 5, height / 2 - height / 40 - height / 4, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 5) * 4, height / 2 - height / 40 + height / 4, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) cShapes.push(new CustomShape(width / 10 + i * (width / 5), height / 10 + j * (height / 4), circleR * 2, circleR * 2, 6, false));
      break;
    case 5:
      circles.push(new Circle(width / 4, height / 5, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height / 5, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2, height - height / 4, width / 5, height / 2, true));
      break;
    case 6:
      circles.push(new Circle(width / 4, height - height / 20 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height - height / 20 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2, height / 4, width / 5, height / 2, false));
      break;
    case 7:
      circles.push(new Circle(width / 4, height / 3 - height / 40 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height - height / 20 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      boxes.push(new Box(width / 2 + width / 8, height - height / 3, width - width / 4, height / 20, true));
      boxes.push(new Box(width / 2 - width / 8, height / 3, width - width / 4, height / 20, true));
      break;
    case 8:
      circles.push(new Circle(width / 4, height - height / 5 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height - height / 5 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width - width / 6, height - height / 10, width / 3, height / 5, true));
      boxes.push(new Box(width / 6, height - height / 10, width / 3, height / 5, true));
      boxes.push(new Box(width - width / 9, height - height / 20, width / 2, height / 5, true));
      boxes.push(new Box(width / 9, height - height / 20, width / 2, height / 5, true));
      break;
    case 9:
      circles.push(new Circle(width / 4, height / 3, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height / 3, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 4, height - height / 10, width / 2, height / 5, true));
      break;
    case 10:
      circles.push(new Circle((width / 6) * 2, height / 2 - height / 40 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 6) * 4, height / 2 - height / 40 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 2, width / 2, height / 20, true));
      boxes.push(new Box(width / 2, height / 4, width / 30, height / 2, true));
      break;
    case 11:
      circles.push(new Circle(width / 4, height / 2, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height / 2, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height / 2, width / 10, width / 10, true));
      break;
    case 12:
      circles.push(new Circle(width / 2, height / 2 + height / 6 - circleR * 2, circleR, color(255, 255, 0)));
      circles.push(new Circle(width / 2, height / 2 - height / 6 - circleR * 2, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2 + height / 40, height / 2 + height / 6, height / 3, height / 20, true));
      boxes.push(new Box(width / 2 - height / 40, height / 2 - height / 6, height / 3, height / 20, true));
      boxes.push(new Box(width / 2 - height / 6, height / 2 + height / 40, height / 20, height / 3, true));
      boxes.push(new Box(width / 2 + height / 6, height / 2 - height / 15, height / 20, height / 4, true));
      break;
    case 13:
      circles.push(new Circle(width / 2, height / 2 + height / 6 - height / 40 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle(width / 2, height / 2 - height / 6 - height / 40 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height / 2 + height / 6, width / 3, height / 20, true));
      boxes.push(new Box(width / 2, height / 2 - height / 6, width / 2, height / 20, true));
      break;
    case 14:
      circles.push(new Circle(width / 5, height / 2 + height / 6, circleR, color(255, 255, 0)));
      circles.push(new Circle(width - width / 5, height / 2 - height / 6, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 5, height / 2, width / 2.5, height / 20, true));
      boxes.push(new Box(width - width / 5, height / 2, width / 2.5, height / 20, true));
      break;
    case 15:
      circles.push(new Circle(width / 3.5, height / 2 - height / 40 - circleR, circleR, color(255, 255, 0)));
      circles.push(new Circle(width - width / 3.5, height / 2 - height / 40 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height / 2 - height / 80, width / 2, height / 40, false));
      cShapes.push(new CustomShape(width / 2, height, width / 20, height / 2, 4, true));
      break;
    case 16:
      circles.push(new Circle(width / 10, height / 6 + height / 8, circleR, color(255, 255, 0)));
      circles.push(new Circle(width - width / 10, height - height / 20 - circleR, circleR, color(0, 0, 255)));
      boxes.push(new Box(width - width / 8, height - height / 40, width / 4, height / 20, true));
      boxes.push(new Box(width / 8, height - height / 40, width / 4, height / 20, true));
      cShapes.push(new CustomShape(width / 12, height - height / 20, width / 6, height - height / 4, 3, true));
      break;
    case 17:
      circles.push(new Circle(width / 5, height / 3, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 5) * 4, height / 3, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 2, height - height / 40, width, height / 20, true));
      cShapes.push(new CustomShape(width / 2, height, width / 2, height / 2, 4, true));
      cShapes.push(new CustomShape(width / 2, height / 5, height / 15, height / 15, 10, false));
      break;
    case 18:
      circles.push(new Circle(width / 5, height / 2 - circleR * 2, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 5) * 4, height / 2 - circleR * 2, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 10, height / 2, width / 4, height / 20, true));
      boxes.push(new Box(width - width / 10, height / 2, width / 4, height / 20, true));
      rotors.push(new Rotor(width / 2, height / 2, width / 2, height / 20, 4, false));
      break;
    case 19:
      circles.push(new Circle(width / 5, height / 2 - circleR * 2, circleR, color(255, 255, 0)));
      circles.push(new Circle(width / 2, height - height / 20 - circleR * 2, circleR, color(0, 0, 255)));
      boxes.push(new Box(width / 10, height / 2, width / 4, height / 20, true));
      boxes.push(new Box(width / 2, height - height / 20, width / 6, height / 20, true));
      boxes.push(new Box(width / 2 - width / 12 + height / 40, height - height / 20 - height / 20, height / 20, height / 10, true));
      boxes.push(new Box(width / 2 + width / 12 - height / 40, height - height / 20 - height / 20, height / 20, height / 10, true));
      rotors.push(new Rotor(width / 2, height / 2, width / 2, height / 20, 4, false));
      break;
    case MAX_LEVEL:
      circles.push(new Circle(width / 4, height / 4 - circleR * 2, circleR, color(255, 255, 0)));
      circles.push(new Circle((width / 4) * 3, height - height / 4 - circleR * 2, circleR, color(0, 0, 255)));
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
