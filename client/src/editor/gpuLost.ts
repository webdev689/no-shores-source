// A GPU device lost (a driver's reset, the GPU taken away) leaves the editor and the Test Ground nothing to draw with,
// so the page says why its picture has stopped.

/** Says so through `stop` once `device` is lost, unless it was destroyed on purpose. */
export function stopWhenLost(device: Pick<GPUDevice, 'lost'>, stop: (message: string) => void): void {
  void device.lost.then((lost) => {
    if (lost.reason !== 'destroyed') stop(`The graphics device was lost (${lost.message}). Reload the page.`);
  });
}
