/**
 * One piece of confetti, in world units and seconds: where it is, how fast it's going each way, which way
 * it's turned and how fast it spins, how far through its flip it is (paper flutters by turning edge-on and
 * back), its size, and which of the seven rainbow colors it is.
 */
interface Piece
{
  x: number;
  y: number;
  speedX: number;
  speedY: number;
  angle: number;
  spin: number;
  flip: number;
  width: number;
  height: number;
  color: number;
}

/**
 * Where a burst comes from, and which way it fires: -1 up and to the left, 1 up and to the right, 0
 * straight up.
 */
interface Cannon
{
  x: number;
  y: number;
  aim: number;
}

/**
 * One volley of the party: when it goes off, in seconds from the start, where from, and how many pieces.
 * The left and right cannons sit in the bottom corners; the top showers pieces down across the whole width.
 */
interface Volley
{
  at: number;
  from: 'left' | 'right' | 'top';
  count: number;
}

/**
 * How hard confetti falls, in world units per second per second. Lighter than real gravity, so it hangs in
 * the air long enough to enjoy.
 */
const gravity = 900;

/**
 * How much speed the air takes each second. Paper is mostly air resistance, which is what makes it drift
 * instead of drop.
 */
const drag = 1.1;

/**
 * How far past either side of the screen a piece can drift before it's given up on. Air has slowed it too
 * much by then to ever drift back.
 */
const sideMargin = 120;

/**
 * The whole party, eight thousand pieces in all. Both cannons fire six volleys over a second and a half,
 * and the top showers eight more across the screen meanwhile, so the screen fills from every side instead
 * of showing two arcs. Spreading it out keeps fewer pieces in the air at once than one giant burst would.
 */
const party: Volley[] = [
  ...[ 0, 0.25, 0.5, 0.8, 1.1, 1.5 ].flatMap((at) =>
  {
    return [ { at, from: 'left' as const, count: 420 }, { at, from: 'right' as const, count: 420 } ];
  }),
  ...[ 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4 ].map((at) =>
  {
    return { at, from: 'top' as const, count: 370 };
  }),
];

/**
 * Fires a burst of confetti from a cannon. Random numbers decide every piece; the tests hand in their own
 * so they know exactly where each piece goes.
 * @param {Cannon} cannon Where it fires from, and which way.
 * @param {number} count How many pieces.
 * @param {() => number} random Numbers from 0 up to 1, like Math.random.
 * @returns {Piece[]} The pieces, all starting at the cannon's mouth.
 */
const fire = (cannon: Cannon, count: number, random: () => number): Piece[] =>
{
  return Array.from({ length: count }, (_, index) =>
  {
    // each piece leaves at its own angle within a cone around the aim, and at its own speed.
    const sideways = (cannon.aim * 0.55 + (random() - 0.5) * 0.9) * (900 + random() * 500);
    const upward = -(1100 + random() * 700);
    return makePiece(cannon.x, cannon.y, sideways, upward, index, random);
  });
};

/**
 * Showers confetti down from just above the top of the screen, spread across its whole width.
 * @param {number} width How wide the screen is, in world units.
 * @param {number} count How many pieces.
 * @param {() => number} random Numbers from 0 up to 1, like Math.random.
 * @returns {Piece[]} The pieces, waiting above the screen to fall into it.
 */
const shower = (width: number, count: number, random: () => number): Piece[] =>
{
  return Array.from({ length: count }, (_, index) =>
  {
    const x = random() * width;
    const y = -20 - random() * 180;
    return makePiece(x, y, (random() - 0.5) * 300, 60 + random() * 240, index, random);
  });
};

/**
 * Makes one piece at a place and a speed, with its own spin, flutter and size, and a color that goes round
 * the rainbow with its place in the batch.
 * @param {number} x Where it starts across.
 * @param {number} y Where it starts down.
 * @param {number} speedX How fast it's going across.
 * @param {number} speedY How fast it's going down (negative is up).
 * @param {number} index Its place in the batch, which picks its color.
 * @param {() => number} random Numbers from 0 up to 1.
 * @returns {Piece} The piece.
 */
const makePiece = (x: number, y: number, speedX: number, speedY: number, index: number, random: () => number): Piece =>
{
  return {
    x,
    y,
    speedX,
    speedY,
    angle: random() * Math.PI * 2,
    spin: (random() - 0.5) * 12,
    flip: random() * Math.PI * 2,
    width: 6 + random() * 5,
    height: 3.5 + random() * 3.5,
    color: index % 7,
  };
};

/**
 * Fires one volley of the party.
 * @param {Volley} volley The volley.
 * @param {number} width How wide the screen is, in world units.
 * @param {number} height How tall the screen is, in world units.
 * @param {() => number} random Numbers from 0 up to 1, like Math.random.
 * @returns {Piece[]} The volley's pieces.
 */
const launch = (volley: Volley, width: number, height: number, random: () => number): Piece[] =>
{
  if (volley.from === 'top')
  {
    return shower(width, volley.count, random);
  }
  const cannon = volley.from === 'left' ? { x: 0, y: height, aim: 1 } : { x: width, y: height, aim: -1 };
  return fire(cannon, volley.count, random);
};

/**
 * Moves a piece forward in time, in place: air slows it, gravity pulls it down, and it spins and flutters
 * as it goes. It changes the piece rather than making a new one, since thousands of pieces move every frame
 * and a fresh object for each would keep the phone's garbage collector busy mid-party.
 * @param {Piece} piece The piece.
 * @param {number} seconds How much time passed, usually one frame's worth.
 */
const advance = (piece: Piece, seconds: number): void =>
{
  const slowing = Math.max(0, 1 - drag * seconds);
  piece.speedX *= slowing;
  piece.speedY = piece.speedY * slowing + gravity * seconds;
  piece.x += piece.speedX * seconds;
  piece.y += piece.speedY * seconds;
  piece.angle += piece.spin * seconds;
  piece.flip += 9 * seconds;
};

/**
 * Whether a piece is out of the party for good: fallen out of sight below the screen, or drifted far off
 * either side. Pieces still rising never count as fallen, even from below the bottom edge, since that's
 * where the cannons fire from.
 * @param {Piece} piece The piece.
 * @param {number} width The screen's width, in world units.
 * @param {number} height The screen's height, in world units.
 * @returns {boolean} True once it can't be seen again.
 */
const isGone = (piece: Piece, width: number, height: number): boolean =>
{
  const hasFallen = piece.speedY > 0 && piece.y > height + 40;
  const hasDrifted = piece.x < -sideMargin || piece.x > width + sideMargin;
  return hasFallen || hasDrifted;
};

export { advance, fire, isGone, launch, party, shower };
export type { Cannon, Piece, Volley };
