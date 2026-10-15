import { describe, expect, it } from 'vitest';
import { Chime } from '../../src/services/chime';

/**
 * A stand-in for the browser's audio, keeping every note it's asked to play and every time it's woken.
 * @param {AudioContextState} state Whether the audio starts asleep or running.
 * @returns {{ audio: AudioContext, notes: number[][], wakes: string[] }} The audio, the notes played as
 * [ frequency, start ] pairs, and a list with one entry per wake.
 */
const fakeAudio = (state: AudioContextState): { audio: AudioContext; notes: number[][]; wakes: string[] } =>
{
  const notes: number[][] = [];
  const wakes: string[] = [];
  const connectTo = (node: unknown): unknown => node;
  const audio = {
    state,
    currentTime: 10,
    destination: {},
    resume: (): Promise<void> =>
    {
      wakes.push('resume');
      audio.state = 'running';
      return Promise.resolve();
    },
    createOscillator: () =>
    {
      const tone = {
        type: '',
        frequency: { value: 0 },
        connect: connectTo,
        start: (time: number) => notes.push([ tone.frequency.value, time ]),
        stop: () => undefined,
      };
      return tone;
    },
    createGain: () =>
    {
      return {
        gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
        connect: connectTo,
      };
    },
  };
  return { audio: audio as unknown as AudioContext, notes, wakes };
};

/*
 * Chime owes iOS its one rule: the audio is made inside a tap, never later, and nothing tries to play
 * before a tap has readied it. Once readied, a finished timer gets the full arpeggio, twice.
 */
describe('Chime', () =>
{
  it('makes the audio once, however many taps ready it', () =>
  {
    // Arrange.
    const { audio } = fakeAudio('running');
    let made = 0;
    const chime = new Chime(() =>
    {
      made++;
      return audio;
    });

    // Act.
    chime.ready();
    chime.ready();

    // Assert.
    expect(made)
      .toBe(1);
  });

  it('wakes audio that starts asleep', () =>
  {
    // Arrange.
    const { audio, wakes } = fakeAudio('suspended');
    const chime = new Chime(() => audio);

    // Act.
    chime.ready();

    // Assert.
    expect(wakes)
      .toEqual([ 'resume' ]);
  });

  it('leaves running audio alone', () =>
  {
    // Arrange.
    const { audio, wakes } = fakeAudio('running');
    const chime = new Chime(() => audio);

    // Act.
    chime.ready();

    // Assert.
    expect(wakes)
      .toEqual([]);
  });

  it('stays quiet before a tap has readied it', () =>
  {
    // Arrange.
    const { audio, notes } = fakeAudio('running');
    let made = 0;
    const chime = new Chime(() =>
    {
      made++;
      return audio;
    });

    // Act.
    chime.play();

    // Assert.
    expect([ made, notes.length ])
      .toEqual([ 0, 0 ]);
  });

  it('plays the rising arpeggio twice once readied', () =>
  {
    // Arrange.
    const { audio, notes } = fakeAudio('running');
    const chime = new Chime(() => audio);
    chime.ready();

    // Act.
    chime.play();

    // Assert.
    expect(notes.map(([ frequency ]) => frequency))
      .toEqual([ 1046.5, 1318.51, 1567.98, 2093, 1046.5, 1318.51, 1567.98, 2093 ]);
    expect(notes.map(([ , start ]) => Math.round(start * 100) / 100))
      .toEqual([ 10, 10.11, 10.22, 10.33, 10.9, 11.01, 11.12, 11.23 ]);
  });
});
