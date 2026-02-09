/**
 * ProGate — Freemium access control for EVP-MINI
 * Manages Free vs Pro tiers with license verification.
 *
 * Verification order:
 * 1. Check built-in codes (instant, offline)
 * 2. Call /api/verify-license (Cloudflare Worker → Gumroad API)
 * 3. Fall back gracefully if network unavailable
 *
 * Free tier: EVP Scan only, 30-second sessions, basic audio, gear shop
 * Pro tier:  All 4 modes, unlimited sessions, all tools, history, map, export
 */
class ProGate {
  constructor() {
    // Built-in activation codes (work offline, no API needed)
    // Add your own codes here or rely on Gumroad license keys
    this._offlineCodes = new Set([
      'EVPMINI-PRO-2024',
      'GHOST-HUNTER-VIP',
      'PARANORMAL-PRO-1',
      'EVP-LAUNCH-2024',
      'TESTPRO1',
      'evpmini2024'
    ]);

    this.isPro = false;
    this._licenseKey = null;
    this._load();
  }

  _load() {
    try {
      const stored = localStorage.getItem('evpProStatus');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.pro === true) {
          this.isPro = true;
          this._licenseKey = data.licenseKey || null;
        }
      }
    } catch (e) { /* localStorage unavailable */ }
  }

  _save() {
    try {
      localStorage.setItem('evpProStatus', JSON.stringify({
        pro: this.isPro,
        licenseKey: this._licenseKey,
        activatedAt: Date.now()
      }));
    } catch (e) { /* localStorage unavailable */ }
  }

  async activate(code) {
    const c = code.trim();
    if (!c) return { success: false, error: 'Please enter a license key.' };

    // 1. Check built-in codes (instant, offline)
    if (this._offlineCodes.has(c) || this._offlineCodes.has(c.toUpperCase())) {
      this.isPro = true;
      this._licenseKey = c;
      this._save();
      return { success: true };
    }

    // 2. Try online Gumroad verification
    try {
      const res = await fetch('/api/verify-license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: c })
      });
      const data = await res.json();
      if (data.success) {
        this.isPro = true;
        this._licenseKey = c;
        this._save();
        return { success: true };
      }
      return { success: false, error: data.error || 'Invalid license key.' };
    } catch (e) {
      // Network unavailable
      return { success: false, error: 'Could not verify online. Check connection and try again.' };
    }
  }

  canUse(feature) {
    if (this.isPro) return true;
    const free = ['evp', 'basic-audio', 'gear'];
    return free.includes(feature);
  }

  getMaxDuration() {
    return this.isPro ? Infinity : 30;
  }

  getAllowedModes() {
    if (this.isPro) return ['evp', 'spiritbox', 'visual', 'fullspectrum'];
    return ['evp'];
  }

  getFeatures() {
    return {
      spiritBox: this.isPro,
      visual: this.isPro,
      fullSpectrum: this.isPro,
      tools: this.isPro,
      history: this.isPro,
      map: this.isPro,
      export: this.isPro,
      unlimitedDuration: this.isPro,
      gear: true
    };
  }

  restorePurchase() {
    this._load();
    return this.isPro;
  }

  reset() {
    this.isPro = false;
    this._licenseKey = null;
    try { localStorage.removeItem('evpProStatus'); } catch (e) {}
  }
}

window.ProGate = ProGate;
