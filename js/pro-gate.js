/**
 * ProGate — Freemium access control for EVP-MINI
 * Manages Free vs Pro tiers with license code validation.
 *
 * Free tier: EVP Scan only, 30-second sessions, basic audio analysis, gear shop
 * Pro tier:  All 4 modes, unlimited sessions, all tools, history, map, export
 *
 * For production, replace client-side code validation with a serverless
 * function (Cloudflare Worker) that checks against a database of Gumroad orders.
 */
class ProGate {
  constructor() {
    // Valid activation codes — replace with your Gumroad-generated codes
    // For production: validate via Cloudflare Worker + Gumroad API
    this._codes = new Set([
      'EVPMINI-PRO-2024',
      'GHOST-HUNTER-VIP',
      'PARANORMAL-PRO-1',
      'EVP-LAUNCH-2024',
      'evpmini2024'        // Legacy admin access
    ]);

    this.isPro = false;
    this._load();
  }

  _load() {
    try {
      const stored = localStorage.getItem('evpProStatus');
      if (stored) {
        const data = JSON.parse(stored);
        if (data.pro === true) this.isPro = true;
      }
    } catch (e) { /* localStorage unavailable */ }
  }

  _save() {
    try {
      localStorage.setItem('evpProStatus', JSON.stringify({
        pro: this.isPro,
        activatedAt: Date.now()
      }));
    } catch (e) { /* localStorage unavailable */ }
  }

  activate(code) {
    const c = code.trim();
    if (this._codes.has(c) || this._codes.has(c.toUpperCase())) {
      this.isPro = true;
      this._save();
      return { success: true };
    }
    return { success: false, error: 'Invalid code. Check your purchase confirmation email.' };
  }

  // Check if a feature is available in current tier
  canUse(feature) {
    if (this.isPro) return true;
    // Free tier allowed features
    const free = ['evp', 'basic-audio', 'gear'];
    return free.includes(feature);
  }

  // Max session duration in seconds (Infinity for Pro)
  getMaxDuration() {
    return this.isPro ? Infinity : 30;
  }

  // Allowed scan modes
  getAllowedModes() {
    if (this.isPro) return ['evp', 'spiritbox', 'visual', 'fullspectrum'];
    return ['evp'];
  }

  // Feature access map
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
      gear: true  // Always available (affiliate revenue from free users)
    };
  }

  // Restore from localStorage (for returning users)
  restorePurchase() {
    this._load();
    return this.isPro;
  }

  reset() {
    this.isPro = false;
    try { localStorage.removeItem('evpProStatus'); } catch (e) {}
  }
}

window.ProGate = ProGate;
