import { useEffect, useRef } from 'react';
import { advance, fire, isGone } from '../services/confetti';
import type { Piece } from '../services/confetti';

/**
 * How tall the world the confetti flies in is. Pieces move in these units and the canvas scales them to
 * the screen, so a burst rises the same share of the screen on a phone as on a tablet.
 */
const worldHeight = 1000;

/**
 * The longest a party lasts, in seconds, even if a piece somehow never lands.
 */
const longestParty = 6;

/**
 * What to do once the party's over.
 */
interface ConfettiProps
{
  onDone: () => void;
}

/**
 * A burst of rainbow confetti from both bottom corners, for finishing a recipe. It draws over everything
 * but never blocks a tap, and it's skipped entirely for anyone whose device asks for less motion.
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

    let pieces: Piece[] = [
      ...fire({ x: 0, y: worldHeight, aim: 1 }, 80, Math.random),
      ...fire({ x: worldWidth, y: worldHeight, aim: -1 }, 80, Math.random),
    ];
    let frame = 0;
    let last = performance.now();
    const began = last;

    /**
     * Moves every piece on by one frame, draws them, and asks for the next frame until they've all
     * landed or the party has gone on long enough.
     * @param {number} time When this frame is, from performance.now.
     */
    const draw = (time: number): void =>
    {
      // a frame can arrive late, as when the tab was hidden, and nothing should leap across the screen.
      const seconds = Math.min(0.05, (time - last) / 1000);
      last = time;
      pieces = pieces
        .map((piece) => advance(piece, seconds))
        .filter((piece) => isGone(piece, worldHeight) === false);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      pieces.forEach((piece) =>
      {
        // turning a piece edge-on and back again is what makes paper look like it's fluttering.
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        context.scale(1, Math.cos(piece.flip));
        context.fillStyle = colors[piece.color];
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        context.restore();
      });

      if (pieces.length === 0 || (time - began) / 1000 > longestParty)
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
