export function preventMobileZoom(target: Document): void {
  const preventGestureZoom = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  target.addEventListener('gesturestart', preventGestureZoom, { passive: false });
  target.addEventListener('gesturechange', preventGestureZoom, { passive: false });
  target.addEventListener('touchmove', event => {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, { passive: false });
}
