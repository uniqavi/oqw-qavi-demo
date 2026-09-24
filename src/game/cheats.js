// Global Cheats / Developer Mode state
// Default is false (OFF).

let cheatsEnabled = false;

export function isCheatsEnabled() {
  return cheatsEnabled;
}

export function setCheatsEnabled(val) {
  cheatsEnabled = !!val;
  // Update top-left dev jump menu visibility if present in DOM
  const devWrap = document.getElementById('dev-jump-wrap');
  if (devWrap) {
    devWrap.style.display = cheatsEnabled ? 'block' : 'none';
  }
}
