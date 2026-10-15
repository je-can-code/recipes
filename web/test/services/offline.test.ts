import { describe, expect, it } from 'vitest';
import { keepACopy } from '../../src/services/offline';

/**
 * A stand-in for navigator.serviceWorker that records what it's asked to install.
 * @param {() => Promise<ServiceWorkerRegistration>} answer How it answers each request to install.
 * @returns {ServiceWorkerContainer & { installed: string[] }} The stand-in, with every script asked for.
 */
const containerAnswering = (
  answer: () => Promise<ServiceWorkerRegistration>,
): ServiceWorkerContainer & { installed: string[] } =>
{
  const installed: string[] = [];
  const container = {
    installed,
    register: (script: string) =>
    {
      installed.push(script);
      return answer();
    },
  };
  return container as unknown as ServiceWorkerContainer & { installed: string[] };
};

/**
 * A browser that installs the worker without complaint.
 * @returns {Promise<ServiceWorkerRegistration>} A registration, as far as anything here cares.
 */
const installs = (): Promise<ServiceWorkerRegistration> =>
{
  return Promise.resolve({} as ServiceWorkerRegistration);
};

/*
 * keepACopy owes the built site its service worker, and owes the development server none, since a worker
 * there would answer Vite's pages from a stale copy. A browser that can't or won't keep a copy has to
 * leave the site working as it always did.
 */
describe('keepACopy', () =>
{
  it('asks the browser to install the worker on the built site', () =>
  {
    // Arrange.
    const container = containerAnswering(installs);

    // Act.
    const asked = keepACopy(container, true);

    // Assert.
    expect(asked)
      .toBe(true);
    expect(container.installed)
      .toEqual([ '/sw.js' ]);
  });

  it('leaves the development server without a worker', () =>
  {
    // Arrange.
    const container = containerAnswering(installs);

    // Act.
    const asked = keepACopy(container, false);

    // Assert.
    expect(asked)
      .toBe(false);
    expect(container.installed)
      .toEqual([]);
  });

  it('carries on in a browser with no service workers', () =>
  {
    // Arrange- a page that isn't secure has no navigator.serviceWorker at all.
    const container = undefined;

    // Act.
    const asked = keepACopy(container, true);

    // Assert.
    expect(asked)
      .toBe(false);
  });

  it('shrugs off a browser that refuses the worker', async () =>
  {
    // Arrange- an unhandled refusal would fail this test run, so finishing cleanly is part of the proof.
    const container = containerAnswering(() => Promise.reject(new Error('The operation is insecure.')));

    // Act.
    const asked = keepACopy(container, true);
    await Promise.resolve();

    // Assert.
    expect(asked)
      .toBe(true);
    expect(container.installed)
      .toEqual([ '/sw.js' ]);
  });
});
