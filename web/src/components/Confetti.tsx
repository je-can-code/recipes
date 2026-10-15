import { useEffect, useRef } from 'react';
import { advance, isGone, launch, party } from '../services/confetti';
import type { Piece } from '../services/confetti';

/**
 * How tall the world the confetti flies in is. Pieces move in these units and the canvas scales them to
 * the screen, so a burst rises the same share of the screen on a phone as on a tablet.
 */
const worldHeight = 1000;

/**
 * The longest a party lasts, in seconds, even if a piece somehow never lands.
 */
const longestParty = 10;

/**
 * How long a frame can take, in milliseconds, before the party stops firing new volleys. Past this the
 * device is struggling, and a smaller party beats a slideshow.
 */
const strugglingFrame = 28;

/**
 * What to do once the party's over.
 */
interface ConfettiProps
{
  onDone: () => void;
}

/**
 * A rainbow confetti party for finishing a recipe: volley after volley from both bottom corners and a
 * shower from the top, thousands of pieces in all. It draws over everything but never blocks a tap, keeps
 * itself to what the device can draw smoothly, and is skipped entirely for anyone whose device asks for
 * less motion.
 * @param {ConfettiProps} props What to do once the party's over.
 * @returns {React.JSX.Element} The canvas the confetti flies across.
 */
const Confetti = ({ onDone }: ConfettiProps): React.JSX.Element =>
{
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() =>
  {
    const canvas = canvasRef.current;
    const context = canvas === null ? null : canvas.getContext('2d');
    if (canvas === null || context === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    {
      onDone();
      return undefined;
    }

    // the canvas matches the screen pixel for pixel, and the world is scaled onto it.
    const density = window.devicePixelRatio;
    canvas.width = window.innerWidth * density;
    canvas.height = window.innerHeight * density;
    const scale = canvas.height / worldHeight;
    const worldWidth = canvas.width / scale;
    const colors = rainbowColors();

    let volleys = party;
    let pieces: Piece[] = [];
    let frame = 0;
    let averageFrame = 16;
    let began = -1;
    let last = 0;

    /**
     * Fires any volleys that are due, unless the device is already struggling, then moves every piece on
     * by one frame, draws them, and asks for the next frame until the party's over.
     * @param {number} time When this frame is, from performance.now.
     */
    const draw = (time: number): void =>
    {
      // the party's clock starts on its first frame, so a slow start doesn't count against the device.
      if (began < 0)
      {
        began = time;
        last = time;
      }

      // a frame can arrive late, as when the tab was hidden, and nothing should leap across the screen.
      const elapsed = (time - began) / 1000;
      const seconds = Math.min(0.05, (time - last) / 1000);
      averageFrame = averageFrame * 0.85 + Math.min(100, time - last) * 0.15;
      last = time;

      // every volley that's due goes off now, unless the device is already struggling to keep up.
      const due = volleys.filter((volley) => volley.at <= elapsed);
      volleys = volleys.filter((volley) => volley.at > elapsed);
      if (averageFrame < strugglingFrame)
      {
        due.forEach((volley) => pieces.push(...launch(volley, worldWidth, worldHeight, Math.random)));
      }

      pieces.forEach((piece) => advance(piece, seconds));
      pieces = pieces.filter((piece) => isGone(piece, worldWidth, worldHeight) === false);
      paint(context, canvas, pieces, colors, scale);

      if ((volleys.length === 0 && pieces.length === 0) || elapsed > longestParty)
      {
        onDone();
        return;
      }
      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} className="confetti" aria-hidden="true" />;
};

/**
 * Draws every piece. Thousands of pieces a frame is a lot of drawing, so each color is drawn in one pass,
 * and each piece's turn and flutter go straight into the canvas's transform rather than through a save and
 * a restore apiece.
 * @param {CanvasRenderingContext2D} context The canvas's drawing context.
 * @param {HTMLCanvasElement} canvas The canvas.
 * @param {Piece[]} pieces Every piece in the air.
 * @param {string[]} colors The seven rainbow colors.
 * @param {number} scale How many canvas pixels make one world unit.
 */
const paint = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  pieces: Piece[],
  colors: string[],
  scale: number,
): void =>
{
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  colors.forEach((color, colorIndex) =>
  {
    context.fillStyle = color;
    pieces.forEach((piece) =>
    {
      if (piece.color !== colorIndex)
      {
        return;
      }

      // turned by its angle, squashed by its flip, moved to its place, all scaled onto the screen.
      const cos = Math.cos(piece.angle) * scale;
      const sin = Math.sin(piece.angle) * scale;
      const flutter = Math.cos(piece.flip);
      context.setTransform(cos, sin, -sin * flutter, cos * flutter, piece.x * scale, piece.y * scale);
      context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
    });
  });
};

/**
 * The seven rainbow colors as the stylesheet has them right now, so confetti matches the light or dark
 * theme the page is showing.
 * @returns {string[]} The colors, red first.
 */
const rainbowColors = (): string[] =>
{
  const style = getComputedStyle(document.documentElement);
  return [ 0, 1, 2, 3, 4, 5, 6 ].map((index) => style.getPropertyValue(`--rainbow-${index}`).trim());
};

export { Confetti };
