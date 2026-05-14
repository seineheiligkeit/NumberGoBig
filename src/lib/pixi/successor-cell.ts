import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { pencilStrokeDouble } from './pencil';
import { GRAPHITE, PENCIL_FONT_FAMILY } from './typography';

/**
 * The Successor cell — the player's first equation.
 *
 * Visually: a scribbled `{ }` with a hand-drawn drop zone between the braces.
 * Mechanically: drop any number on the cell, the cell consumes it and produces
 * its successor (n + 1) at the output port to the right.
 *
 * The drop zone is rendered as a faint dashed rectangle in the middle, so the
 * player knows where to aim. The cell is wider than a block because the braces
 * and drop zone need horizontal room.
 */

export const SUCCESSOR_CELL_WIDTH = 156;
export const SUCCESSOR_CELL_HEIGHT = 88;

export function drawSuccessorCell(x: number, y: number): Container {
  const container = new Container();
  container.x = x;
  container.y = y;

  const halfW = SUCCESSOR_CELL_WIDTH / 2;
  const halfH = SUCCESSOR_CELL_HEIGHT / 2;

  // Outer hand-drawn "frame" — a soft enclosing box so the cell reads as a unit.
  const frame = new Graphics();
  const cornerJitter = (): number => (Math.random() - 0.5) * 2.4;
  const corners = [
    { x: -halfW + cornerJitter(), y: -halfH + cornerJitter() },
    { x: halfW + cornerJitter(), y: -halfH + cornerJitter() },
    { x: halfW + cornerJitter(), y: halfH + cornerJitter() },
    { x: -halfW + cornerJitter(), y: halfH + cornerJitter() },
  ];
  corners.push({ ...corners[0] });
  pencilStrokeDouble(frame, corners, {
    color: GRAPHITE,
    width: 1.4,
    alpha: 0.55,
    jitter: 0.9,
    segmentsPerUnit: 0.18,
  });
  container.addChild(frame);

  // The braces themselves — large, hand-lettered, centered with a gap between.
  const braceStyle = new TextStyle({
    fontFamily: PENCIL_FONT_FAMILY,
    fontSize: 64,
    fontWeight: '500',
    fill: GRAPHITE,
  });
  const openBrace = new Text({ text: '{', style: braceStyle });
  openBrace.anchor.set(0.5);
  openBrace.x = -halfW + 22;
  openBrace.y = 0;
  openBrace.alpha = 0.92;
  openBrace.rotation = (Math.random() - 0.5) * 0.05;
  container.addChild(openBrace);

  const closeBrace = new Text({ text: '}', style: braceStyle });
  closeBrace.anchor.set(0.5);
  closeBrace.x = halfW - 22;
  closeBrace.y = 0;
  closeBrace.alpha = 0.92;
  closeBrace.rotation = (Math.random() - 0.5) * 0.05;
  container.addChild(closeBrace);

  // Drop-zone hint between the braces — a faint dashed rectangle the player
  // aims at. Drawn as a sequence of short pencil dashes.
  const dropZone = new Graphics();
  const dzHalfW = 26;
  const dzHalfH = 22;
  const dashStep = 7;
  for (let dx = -dzHalfW; dx < dzHalfW; dx += dashStep * 2) {
    dropZone.moveTo(dx, -dzHalfH);
    dropZone.lineTo(Math.min(dx + dashStep, dzHalfW), -dzHalfH);
    dropZone.moveTo(dx, dzHalfH);
    dropZone.lineTo(Math.min(dx + dashStep, dzHalfW), dzHalfH);
  }
  for (let dy = -dzHalfH; dy < dzHalfH; dy += dashStep * 2) {
    dropZone.moveTo(-dzHalfW, dy);
    dropZone.lineTo(-dzHalfW, Math.min(dy + dashStep, dzHalfH));
    dropZone.moveTo(dzHalfW, dy);
    dropZone.lineTo(dzHalfW, Math.min(dy + dashStep, dzHalfH));
  }
  dropZone.stroke({ color: GRAPHITE, width: 0.9, alpha: 0.32 });
  container.addChild(dropZone);

  // Slight whole-cell rotation so it sits on the page like it was placed by hand.
  container.rotation = (Math.random() - 0.5) * 0.03;

  return container;
}
