import { describe, expect, it } from 'vitest';
import { advance, fire, isGone } from '../../src/services/confetti';
import type { Piece } from '../../src/services/confetti';

/**
 * A stand-in for Math.random that always lands in the middle, so every piece's flight is known exactly.
 * @returns {number} Always 0.5.
 */
const middle = (): number => 0.5;

/*
 * fire owes the party a burst from the cannon's mouth, aimed the way it points, in all seven colors.
 */
describe('fire', () =>
{
  it('fires every piece from the cannon, going round the rainbow', () =>
  {
    // Arrange.
    const cannon = { x: 0, y: 1000, aim: 1 };

    // Act.
    const pieces = fire(cannon, 9, middle);

    // Assert.
    expect(pieces.map((piece) => [ piece.x, piece.y, piece.color ]))
      .toEqual([
        [ 0, 1000, 0 ], [ 0, 1000, 1 ], [ 0, 1000, 2 ], [ 0, 1000, 3 ], [ 0, 1000, 4 ], [ 0, 1000, 5 ],
        [ 0, 1000, 6 ], [ 0, 1000, 0 ], [ 0, 1000, 1 ],
      ]);
  });

  it('sends a piece up and the way the cannon aims', () =>
  {
    // Arrange- the left cannon aims right, and the right cannon left.
    const cannons = [ { x: 0, y: 1000, aim: 1 }, { x: 600, y: 1000, aim: -1 } ];

    // Act.
    const pieces = cannons.map((cannon) => fire(cannon, 1, middle)[0]);

    // Assert.
    expect(pieces.map((piece) => [ piece.speedX, piece.speedY ]))
      .toEqual([ [ 632.5, -1450 ], [ -632.5, -1450 ] ]);
  });
});

/**
 * A piece leaving the left cannon, as fire makes it from the middle of every random range.
 * @returns {Piece} The piece.
 */
const launched = (): Piece =>
{
  return fire({ x: 0, y: 1000, aim: 1 }, 1, middle)[0];
};

/*
 * advance owes every frame the same physics: air slowing the piece, gravity pulling it down, and a steady
 * spin and flutter.
 */
describe('advance', () =>
{
  it('slows a piece, pulls it down, and moves it along', () =>
  {
    // Arrange.
    const piece = launched();

    // Act.
    const moved = advance(piece, 0.1);

    // Assert.
    expect(moved.speedX)
      .toBeCloseTo(562.925);
    expect(moved.speedY)
      .toBeCloseTo(-1200.5);
    expect(moved.x)
      .toBeCloseTo(56.2925);
    expect(moved.y)
      .toBeCloseTo(879.95);
  });

  it('turns the piece and flips it as it goes', () =>
  {
    // Arrange- a spin of 2 turns it 0.2 in a tenth of a second.
    const piece = { ...launched(), angle: 1, spin: 2, flip: 0 };

    // Act.
    const moved = advance(piece, 0.1);

    // Assert.
    expect(moved.angle)
      .toBeCloseTo(1.2);
    expect(moved.flip)
      .toBeCloseTo(0.9);
  });
});

/*
 * isGone owes the animation an end: a piece counts as gone once it has fallen out of sight, and never while
 * it's still on its way up from below the screen, which is where every cannon fires from.
 */
describe('isGone', () =>
{
  it('is true once a falling piece is out of sight below the screen', () =>
  {
    // Arrange.
    const piece = { ...launched(), y: 1041, speedY: 300 };

    // Act.
    const gone = isGone(piece, 1000);

    // Assert.
    expect(gone)
      .toBe(true);
  });

  it('is false for a falling piece still in sight', () =>
  {
    // Arrange.
    const piece = { ...launched(), y: 1040, speedY: 300 };

    // Act.
    const gone = isGone(piece, 1000);

    // Assert.
    expect(gone)
      .toBe(false);
  });

  it('is false for a piece still rising from below the screen', () =>
  {
    // Arrange.
    const piece = { ...launched(), y: 1100, speedY: -300 };

    // Act.
    const gone = isGone(piece, 1000);

    // Assert.
    expect(gone)
      .toBe(false);
  });
});
