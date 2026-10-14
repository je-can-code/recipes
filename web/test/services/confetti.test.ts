import { describe, expect, it } from 'vitest';
import { advance, fire, isGone, launch, party, shower } from '../../src/services/confetti';
import type { Piece } from '../../src/services/confetti';

/**
 * A stand-in for Math.random that always lands in the middle, so every piece's flight is known exactly.
 * @returns {number} Always 0.5.
 */
const middle = (): number => 0.5;

/**
 * A stand-in for Math.random that walks through the given numbers in turn, over and over.
 * @param {number[]} numbers The numbers to hand out.
 * @returns {() => number} The stand-in.
 */
const sequence = (numbers: number[]): () => number =>
{
  let next = 0;
  return () =>
  {
    const number = numbers[next % numbers.length];
    next++;
    return number;
  };
};

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

/*
 * shower owes the party pieces spread across the whole top of the screen, starting just out of sight and
 * already falling.
 */
describe('shower', () =>
{
  it('spreads pieces across the width, just above the top, falling', () =>
  {
    // Arrange- the first number places each piece across, the second above.
    const random = sequence([ 0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5 ]);

    // Act.
    const pieces = shower(500, 2, random);

    // Assert.
    expect(pieces.map((piece) => [ piece.x, piece.y, piece.speedX, piece.speedY ]))
      .toEqual([ [ 50, -110, 0, 180 ], [ 450, -110, 0, 180 ] ]);
  });
});

/*
 * launch owes each volley its own source: the left cannon in the bottom-left corner, the right one in the
 * bottom-right, and the top's shower.
 */
describe('launch', () =>
{
  it('fires the left cannon from the bottom-left corner, aiming right', () =>
  {
    // Arrange.
    const volley = { at: 0, from: 'left' as const, count: 3 };

    // Act.
    const pieces = launch(volley, 600, 1000, middle);

    // Assert.
    expect(pieces.map((piece) => [ piece.x, piece.y, piece.speedX ]))
      .toEqual([ [ 0, 1000, 632.5 ], [ 0, 1000, 632.5 ], [ 0, 1000, 632.5 ] ]);
  });

  it('fires the right cannon from the bottom-right corner, aiming left', () =>
  {
    // Arrange.
    const volley = { at: 0, from: 'right' as const, count: 2 };

    // Act.
    const pieces = launch(volley, 600, 1000, middle);

    // Assert.
    expect(pieces.map((piece) => [ piece.x, piece.y, piece.speedX ]))
      .toEqual([ [ 600, 1000, -632.5 ], [ 600, 1000, -632.5 ] ]);
  });

  it('showers the top volley down from above the screen', () =>
  {
    // Arrange.
    const volley = { at: 0.3, from: 'top' as const, count: 2 };

    // Act.
    const pieces = launch(volley, 600, 1000, middle);

    // Assert.
    expect(pieces.map((piece) => [ piece.x, piece.y, piece.speedY ]))
      .toEqual([ [ 300, -110, 180 ], [ 300, -110, 180 ] ]);
  });
});

/*
 * party owes a finished recipe a real celebration: fifty times the first version's 160 pieces, spread over
 * a couple of seconds from all three sources.
 */
describe('party', () =>
{
  it('throws eight thousand pieces in all', () =>
  {
    // Arrange.
    const volleys = party;

    // Act.
    const total = volleys.reduce((sum, volley) => sum + volley.count, 0);

    // Assert.
    expect(total)
      .toBe(8000);
  });

  it('fires from both cannons and the top, all within two and a half seconds', () =>
  {
    // Arrange.
    const volleys = party;

    // Act.
    const sources = [ ...new Set(volleys.map((volley) => volley.from)) ].sort();
    const lastVolley = Math.max(...volleys.map((volley) => volley.at));

    // Assert.
    expect([ sources, lastVolley ])
      .toEqual([ [ 'left', 'right', 'top' ], 2.4 ]);
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
    advance(piece, 0.1);

    // Assert.
    expect(piece.speedX)
      .toBeCloseTo(562.925);
    expect(piece.speedY)
      .toBeCloseTo(-1200.5);
    expect(piece.x)
      .toBeCloseTo(56.2925);
    expect(piece.y)
      .toBeCloseTo(879.95);
  });

  it('turns the piece and flips it as it goes', () =>
  {
    // Arrange- a spin of 2 turns it 0.2 in a tenth of a second.
    const piece = { ...launched(), angle: 1, spin: 2, flip: 0 };

    // Act.
    advance(piece, 0.1);

    // Assert.
    expect(piece.angle)
      .toBeCloseTo(1.2);
    expect(piece.flip)
      .toBeCloseTo(0.9);
  });
});

/*
 * isGone owes the animation an end and a lighter load: a piece counts as gone once it has fallen out of
 * sight, or drifted far off either side, and never while it's still on its way up from below the screen,
 * which is where every cannon fires from.
 */
describe('isGone', () =>
{
  it('is true once a falling piece is out of sight below the screen', () =>
  {
    // Arrange.
    const piece = { ...launched(), x: 300, y: 1041, speedY: 300 };

    // Act.
    const gone = isGone(piece, 600, 1000);

    // Assert.
    expect(gone)
      .toBe(true);
  });

  it('is false for a falling piece still in sight', () =>
  {
    // Arrange.
    const piece = { ...launched(), x: 300, y: 1040, speedY: 300 };

    // Act.
    const gone = isGone(piece, 600, 1000);

    // Assert.
    expect(gone)
      .toBe(false);
  });

  it('is false for a piece still rising from below the screen', () =>
  {
    // Arrange.
    const piece = { ...launched(), x: 300, y: 1100, speedY: -300 };

    // Act.
    const gone = isGone(piece, 600, 1000);

    // Assert.
    expect(gone)
      .toBe(false);
  });

  it('is true once a piece drifts far off the left', () =>
  {
    // Arrange.
    const piece = { ...launched(), x: -121, y: 500, speedY: -300 };

    // Act.
    const gone = isGone(piece, 600, 1000);

    // Assert.
    expect(gone)
      .toBe(true);
  });

  it('is true once a piece drifts far off the right, but not just past the edge', () =>
  {
    // Arrange.
    const pieces = [ { ...launched(), x: 721, y: 500 }, { ...launched(), x: 720, y: 500 } ];

    // Act.
    const gone = pieces.map((piece) => isGone(piece, 600, 1000));

    // Assert.
    expect(gone)
      .toEqual([ true, false ]);
  });
});
