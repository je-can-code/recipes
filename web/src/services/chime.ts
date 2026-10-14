/**
 * The notes of the chime, a bright rising C major arpeggio, in hertz.
 */
const notes = [ 1046.5, 1318.51, 1567.98, 2093 ];

/**
 * The little tune a timer plays when it goes off.
 *
 * iOS only lets a page make sound once a tap has asked for it, and a sound started later from a timer's
 * tick isn't a tap. So the tap that starts a timer calls ready, which makes (or wakes) the audio while the
 * tap still counts, and the chime plays through that same audio when the timer ends. The ring/silent
 * switch still mutes it, which is why a ringing timer also flashes.
 */
class Chime
{
  /**
   * Makes the audio, the first time it's needed. It's the browser's AudioContext everywhere but the tests.
   */
  #makeAudio: () => AudioContext;

  /**
   * The audio, once a tap has made it.
   */
  #audio: AudioContext | null = null;

  /**
   * @param {() => AudioContext} makeAudio Makes the audio the chime plays through.
   */
  constructor(makeAudio: () => AudioContext)
  {
    this.#makeAudio = makeAudio;
  }

  /**
   * Makes the audio ready to play. Call it from inside a tap.
   */
  ready(): void
  {
    if (this.#audio === null)
    {
      this.#audio = this.#makeAudio();
    }
    if (this.#audio.state === 'suspended')
    {
      void this.#audio.resume();
    }
  }

  /**
   * Plays the arpeggio twice, so it's hard to miss over a sizzling pan. Before any tap has readied the
   * audio there's nothing allowed to play through, so it stays quiet.
   */
  play(): void
  {
    if (this.#audio === null)
    {
      return;
    }

    // a phone that slept may have paused the audio, so it's woken first.
    const audio = this.#audio;
    void audio.resume();
    [ 0, 0.9 ].forEach((delay) =>
    {
      notes.forEach((frequency, index) =>
      {
        this.#ring(audio, frequency, audio.currentTime + delay + index * 0.11);
      });
    });
  }

  /**
   * Rings one note: a quick strike that fades out, like a small bell.
   * @param {AudioContext} audio The audio to play it through.
   * @param {number} frequency The note, in hertz.
   * @param {number} start When it starts, on the audio's own clock.
   */
  #ring(audio: AudioContext, frequency: number, start: number): void
  {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.type = 'sine';
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.25, start + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    tone.connect(volume).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.65);
  }
}

/**
 * The chime every timer on the page shares.
 */
const chime = new Chime(() => new AudioContext());

export { Chime, chime };
