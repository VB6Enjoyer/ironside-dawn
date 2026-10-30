import type { FrameScheduler } from './local-host';

/** Drives the host from the browser's animation frames. */
export const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle as number),
};
