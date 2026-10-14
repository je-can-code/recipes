/**
 * One piece of confetti, in pixels and seconds: where it is, how fast it's going each way, which way it's
 * turned and how fast it spins, how far through its flip it is (paper flutters by turning edge-on and back),
 * its size, and which of the seven rainbow colors it is.
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
 * How hard confetti falls, in pixels per second per second. Lighter than real gravity, so it hangs in the
 * air long enough to enjoy.
 */
const gravity = 900;

/**
 * How much speed the air takes each second. Paper is mostly air resistance, which is what makes it drift
 * instead of drop.
 */
const drag = 1.1;

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
    return {
      x: cannon.x,
      y: cannon.y,
      speedX: sideways,
      speedY: upward,
      angle: random() * Math.PI * 2,
      spin: (random() - 0.5) * 12,
      flip: random() * Math.PI * 2,
      width: 7 + random() * 6,
      height: 4 + random() * 4,
      color: index % 7,
    };
  });
};

/**
 * Moves a piece forward in time: air slows it, gravity pulls it down, and it spins and flutters as it goes.
 * @param {Piece} piece The piece.
 * @param {number} seconds How much time passed, usually one frame's worth.
 * @returns {Piece} Where the piece is now.
 */
const advance = (piece: Piece, seconds: number): Piece =>
{
  const slowing = Math.max(0, 1 - drag * seconds);
  const speedX = piece.speedX * slowing;
  const speedY = piece.speedY * slowing + gravity * seconds;
  return {
    ...piece,
    x: piece.x + speedX * seconds,
    y: piece.y + speedY * seconds,
    speedX,
    speedY,
    angle: piece.angle + piece.spin * seconds,
    flip: piece.flip + 9 * seconds,
  };
};

/**
 * Whether a piece has fallen out of sight below the screen. Pieces still rising never count, even from
 * below the bottom edge, since that's where a cannon fires from.
 * @param {Piece} piece The piece.
 * @param {number} bottom The screen's height in pixels.
 * @returns {boolean} True once it has fallen past the bottom.
 */
const isGone = (piece: Piece, bottom: number): boolean =>
{
  return piece.speedY > 0 && piece.y > bottom + 40;
};

export { advance, fire, isGone };
export type { Cannon, Piece };
