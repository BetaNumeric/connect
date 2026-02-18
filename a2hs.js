// Add to Home Screen (A2HS) functionality
let __deferredA2HSPrompt = null;

function isStandaloneDisplayMode() {
  // PWA standalone detection (Android/desktop)
  const standaloneMq = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari standalone detection
  const iosStandalone = window.navigator && window.navigator.standalone;
  return !!(standaloneMq || iosStandalone);
}

function getA2HSBannerElements() {
  const banner = document.getElementById('a2hs-banner');
  const installBtn = document.getElementById('a2hs-install-btn');
  const openBtn = document.getElementById('a2hs-open-btn');
  const closeBtn = document.getElementById('a2hs-close-btn');
  const text = document.getElementById('a2hs-text');
  const iosOverlay = document.getElementById('ios-install-overlay');
  const iosCloseBtn = document.getElementById('ios-close-btn');
  return { banner, installBtn, openBtn, closeBtn, text, iosOverlay, iosCloseBtn };
}

function shieldElementFromGameTouch(el) {
  if (!el || el.__a2hsShielded) return;
  const stop = (e) => { if (e && typeof e.stopPropagation === 'function') e.stopPropagation(); };
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('touchmove', stop, { passive: true });
  el.addEventListener('touchend', stop, { passive: false });
  el.addEventListener('pointerdown', stop);
  el.addEventListener('pointerup', stop);
  el.__a2hsShielded = true;
}

function bindTapAction(el, action) {
  if (!el || typeof action !== 'function') return;
  let lastHandledAt = 0;
  const handler = (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const now = Date.now();
    if (now - lastHandledAt < 300) return;
    lastHandledAt = now;
    action();
  };
  el.onclick = handler;
  el.ontouchend = handler;
  el.onpointerup = handler;
}

function shouldShowA2HSBanner() {
  // Use the global isMobileDevice function from main.js
  if (typeof isMobileDevice === 'function' && !isMobileDevice()) return false;
  if (isStandaloneDisplayMode()) return false;
  try {
    if (localStorage.getItem('a2hsDismissed') === 'true') return false;
  } catch (_) {}
  return true;
}

function showA2HSBanner({ showInstallButton, showOpenButton, text: messageText }) {
  const { banner, installBtn, openBtn, closeBtn, text } = getA2HSBannerElements();
  if (!banner) return;
  shieldElementFromGameTouch(banner);
  shieldElementFromGameTouch(installBtn);
  shieldElementFromGameTouch(openBtn);
  shieldElementFromGameTouch(closeBtn);
  
  // Clear all existing styles and CSS variables - use explicit styles only
  banner.style.cssText = '';
  banner.style.display = 'flex';
  banner.style.position = 'fixed';
  banner.style.top = '0px';
  banner.style.left = '0px';
  banner.style.right = '0px';
  banner.style.height = 'auto';
  banner.style.minHeight = '72px';
  banner.style.maxHeight = 'none';
  banner.style.zIndex = '99999';
  banner.style.backgroundColor = '#2c3e50';
  banner.style.color = '#ffffff';
  banner.style.padding = '14px 16px';
  banner.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
  banner.style.fontFamily = 'Helvetica, Arial, sans-serif';
  banner.style.fontSize = '16px';
  banner.style.alignItems = 'center';
  banner.style.justifyContent = 'space-between';
  banner.style.gap = '8px';
  banner.style.flexWrap = 'wrap';
  banner.style.pointerEvents = 'auto';
  banner.style.touchAction = 'manipulation';
  banner.style.boxSizing = 'border-box';
  
  // Set up the content
  if (text && messageText) {
    text.textContent = messageText;
    text.style.flex = '1';
    text.style.marginRight = '6px';
    text.style.fontSize = '15px';
    text.style.lineHeight = '1.3';
    text.style.whiteSpace = 'normal';
    text.style.minWidth = '0';
  }
  
  if (installBtn) {
    installBtn.style.display = showInstallButton ? 'inline-block' : 'none';
    installBtn.style.backgroundColor = '#3498db';
    installBtn.style.color = '#ffffff';
    installBtn.style.border = 'none';
    installBtn.style.padding = '12px 14px';
    installBtn.style.borderRadius = '8px';
    installBtn.style.fontSize = '16px';
    installBtn.style.cursor = 'pointer';
    installBtn.style.fontFamily = 'Helvetica, Arial, sans-serif';
    installBtn.style.flexShrink = '0';
    installBtn.style.whiteSpace = 'nowrap';
    installBtn.style.minWidth = '88px';
    installBtn.style.minHeight = '44px';
    installBtn.style.pointerEvents = 'auto';
    installBtn.style.touchAction = 'manipulation';
    // Ensure button has text content
    if (!installBtn.textContent) {
      installBtn.textContent = 'Install';
    }
  }
  
  if (openBtn) {
    openBtn.style.display = showOpenButton ? 'inline-block' : 'none';
    openBtn.style.backgroundColor = '#2ecc71';
    openBtn.style.color = '#ffffff';
    openBtn.style.border = 'none';
    openBtn.style.padding = '12px 14px';
    openBtn.style.borderRadius = '8px';
    openBtn.style.fontSize = '16px';
    openBtn.style.cursor = 'pointer';
    openBtn.style.fontFamily = 'Helvetica, Arial, sans-serif';
    openBtn.style.flexShrink = '0';
    openBtn.style.whiteSpace = 'nowrap';
    openBtn.style.minWidth = '88px';
    openBtn.style.minHeight = '44px';
    openBtn.style.pointerEvents = 'auto';
    openBtn.style.touchAction = 'manipulation';
    // Ensure button has text content
    if (!openBtn.textContent) {
      openBtn.textContent = 'Open App';
    }
  }
  
  if (closeBtn) {
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.color = '#ffffff';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '22px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '6px 8px';
    closeBtn.style.fontFamily = 'Helvetica, Arial, sans-serif';
    closeBtn.style.flexShrink = '0';
    closeBtn.style.minWidth = '36px';
    closeBtn.style.minHeight = '36px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.pointerEvents = 'auto';
    closeBtn.style.touchAction = 'manipulation';
    bindTapAction(closeBtn, () => {
      banner.style.display = 'none';
      try { localStorage.setItem('a2hsDismissed', 'true'); } catch (_) {}
    });
  }
}

function initA2HSBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  
  // Check if app is already installed (standalone mode)
  if (isStandaloneDisplayMode()) {
    // App is already installed - don't show banner
    return;
  }
  
  // Don't show banner if not mobile device (handled by shouldShowA2HSBanner for new installs)
  if (!shouldShowA2HSBanner()) return;
  
  // Handle Android/Chromium via beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing
    e.preventDefault();
    __deferredA2HSPrompt = e;
    const { installBtn, openBtn, banner } = getA2HSBannerElements();
    showA2HSBanner({ showInstallButton: true, showOpenButton: false, text: 'Install for best experience' });
    if (installBtn) {
      bindTapAction(installBtn, async () => {
        if (!__deferredA2HSPrompt) return;
        __deferredA2HSPrompt.prompt();
        try { await __deferredA2HSPrompt.userChoice; } catch (_) {}
        __deferredA2HSPrompt = null;
        if (banner) banner.style.display = 'none';
      });
    }
  });
  
  // Handle iOS Safari (no beforeinstallprompt)
  if (isIOS) {
    const { installBtn, iosOverlay, iosCloseBtn } = getA2HSBannerElements();
    showA2HSBanner({ showInstallButton: true, showOpenButton: false, text: 'Install for best experience' });
    if (installBtn) {
      installBtn.textContent = 'How to Install';
      bindTapAction(installBtn, () => {
        if (iosOverlay) iosOverlay.style.display = 'flex';
      });
    }
    if (iosCloseBtn && iosOverlay) {
      shieldElementFromGameTouch(iosOverlay);
      shieldElementFromGameTouch(iosCloseBtn);
      bindTapAction(iosCloseBtn, () => { iosOverlay.style.display = 'none'; });
      iosOverlay.onclick = (e) => {
        if (e.target === iosOverlay) iosOverlay.style.display = 'none';
      };
    }
  }
  
  // Android fallback if beforeinstallprompt doesn't fire
  if (isAndroid) {
    setTimeout(() => {
      if (!__deferredA2HSPrompt && !isStandaloneDisplayMode()) {
        // Check if manifest exists to determine if PWA can be installed
        if ('serviceWorker' in navigator && window.matchMedia('(display-mode: browser)').matches) {
          // Fallback: provide actionable instructions when install prompt is unavailable.
          const { installBtn } = getA2HSBannerElements();
          showA2HSBanner({ showInstallButton: true, showOpenButton: false, text: 'Install for best experience' });
          if (installBtn) {
            installBtn.textContent = 'How to Install';
            bindTapAction(installBtn, () => {
              window.alert('In Chrome, open menu (⋮) and tap "Add to Home screen" or "Install app".');
            });
          }
        }
      }
    }, 2000);
  }
  
  // Hide banner when app is installed
  window.addEventListener('appinstalled', () => {
    const { banner } = getA2HSBannerElements();
    if (banner) banner.style.display = 'none';
    try { localStorage.setItem('a2hsDismissed', 'true'); } catch (_) {}
  });
}

// Initialize when DOM is ready and main.js has loaded
function initializeA2HS() {
  // Wait for isMobileDevice function to be available
  if (typeof isMobileDevice === 'function') {
    initA2HSBanner();
  } else {
    // Retry after a short delay
    setTimeout(initializeA2HS, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeA2HS);
} else {
  initializeA2HS();
}
