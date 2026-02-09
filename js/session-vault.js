/**
 * SessionVault — IndexedDB evidence storage + GPS location tagging
 * Persists investigation sessions with full evidence data
 */
class SessionVault {
  constructor() {
    this.db = null;
    this.dbName = 'evp-mini-vault';
    this.dbVersion = 1;
    this.storeName = 'sessions';
    this.currentLocation = null;
    this.locationWatchId = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('locationName', 'locationName', { unique: false });
          store.createIndex('evpCount', 'evpCount', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(true);
      };

      request.onerror = (e) => {
        console.error('IndexedDB init failed:', e);
        resolve(false);
      };
    });
  }

  // ─── GPS Location ───────────────────────────────────────────
  async acquireLocation() {
    if (!navigator.geolocation) {
      this.currentLocation = { available: false, error: 'Geolocation not supported' };
      return this.currentLocation;
    }

    // Use watchPosition to get the most accurate reading, then stop
    return new Promise((resolve) => {
      let bestPosition = null;
      let watchId = null;
      const timeout = setTimeout(() => {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (bestPosition) {
          this.currentLocation = bestPosition;
          resolve(bestPosition);
        } else {
          // Fallback: single attempt with no cache
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              this.currentLocation = {
                available: true,
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude,
                timestamp: pos.timestamp
              };
              resolve(this.currentLocation);
            },
            (err) => {
              this.currentLocation = { available: false, error: err.message };
              resolve(this.currentLocation);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        }
      }, 6000); // Wait up to 6s for best GPS fix

      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const loc = {
              available: true,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              timestamp: pos.timestamp
            };
            // Keep the most accurate reading
            if (!bestPosition || loc.accuracy < bestPosition.accuracy) {
              bestPosition = loc;
              this.currentLocation = loc;
            }
            // If accuracy is good enough (<30m), resolve immediately
            if (loc.accuracy <= 30) {
              clearTimeout(timeout);
              if (watchId !== null) navigator.geolocation.clearWatch(watchId);
              this.currentLocation = loc;
              resolve(loc);
            }
          },
          (err) => {
            clearTimeout(timeout);
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            if (bestPosition) {
              resolve(bestPosition);
            } else {
              this.currentLocation = { available: false, error: err.message };
              resolve(this.currentLocation);
            }
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      } catch (e) {
        clearTimeout(timeout);
        this.currentLocation = { available: false, error: 'GPS error' };
        resolve(this.currentLocation);
      }
    });
  }

  async reverseGeocode(lat, lng) {
    try {
      const resp = await fetch(
        'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1',
        { headers: { 'Accept-Language': 'en' } }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      // Build precise address from structured parts
      if (data.address) {
        const a = data.address;
        const parts = [];
        // Street-level detail
        const street = a.house_number ? (a.house_number + ' ' + (a.road || '')) : (a.road || a.pedestrian || a.building || a.amenity || '');
        if (street.trim()) parts.push(street.trim());
        // Neighborhood / suburb
        if (a.neighbourhood || a.suburb || a.quarter) parts.push(a.neighbourhood || a.suburb || a.quarter);
        // City
        if (a.city || a.town || a.village || a.hamlet) parts.push(a.city || a.town || a.village || a.hamlet);
        // State abbreviation
        if (a.state) parts.push(a.state);
        if (parts.length > 0) return parts.join(', ');
      }
      if (data.display_name) {
        const parts = data.display_name.split(',').slice(0, 4).map(s => s.trim());
        return parts.join(', ');
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ─── Save Session ───────────────────────────────────────────
  async saveSession(sessionData) {
    if (!this.db) return null;

    const location = this.currentLocation || { available: false };
    let locationName = 'Unknown Location';

    if (location.available) {
      const geocoded = await this.reverseGeocode(location.latitude, location.longitude);
      if (geocoded) locationName = geocoded;
      else locationName = location.latitude.toFixed(5) + ', ' + location.longitude.toFixed(5);
    }

    const record = {
      date: new Date().toISOString(),
      dateDisplay: new Date().toLocaleString(),
      duration: sessionData.duration || 0,
      durationDisplay: sessionData.durationDisplay || '0:00',
      mode: sessionData.mode || 'evp',
      evpCount: sessionData.evpCount || 0,
      evpDetections: sessionData.evpDetections || [],
      wordDetections: sessionData.wordDetections || [],
      sensorSummary: sessionData.sensorSummary || {},
      reportSummary: sessionData.reportSummary || '',
      location: location,
      locationName: locationName,
      activityScore: this._calculateActivityScore(sessionData)
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(record);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  _calculateActivityScore(data) {
    let score = 0;
    score += (data.evpCount || 0) * 15;
    if (data.evpDetections) {
      for (const d of data.evpDetections) {
        if (d.class === 'A') score += 30;
        else if (d.class === 'B') score += 15;
        else score += 5;
      }
    }
    if (data.sensorSummary) {
      score += (data.sensorSummary.emfAnomalies || 0) * 10;
      score += (data.sensorSummary.infrasoundEvents || 0) * 20;
    }
    score += (data.wordDetections || []).length * 10;
    return Math.min(100, score);
  }

  // ─── Retrieve Sessions ──────────────────────────────────────
  async getAllSessions() {
    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result || [];
        sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
        resolve(sessions);
      };
      request.onerror = () => resolve([]);
    });
  }

  async getSession(id) {
    if (!this.db) return null;

    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async deleteSession(id) {
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }

  async clearAll() {
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }

  async getSessionCount() {
    if (!this.db) return 0;

    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }

  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return {
        used: est.usage || 0,
        total: est.quota || 0,
        usedMB: ((est.usage || 0) / (1024 * 1024)).toFixed(1),
        totalMB: ((est.quota || 0) / (1024 * 1024)).toFixed(0)
      };
    }
    return { used: 0, total: 0, usedMB: '?', totalMB: '?' };
  }

  // ─── Render History HTML ────────────────────────────────────
  renderHistoryList(sessions) {
    if (!sessions.length) {
      return '<div class="vault-empty">No investigations saved yet.<br>Complete a scan to save evidence.</div>';
    }

    let html = '';
    for (const s of sessions) {
      const scoreClass = s.activityScore > 60 ? 'high' : s.activityScore > 25 ? 'medium' : 'low';
      html += '<div class="vault-entry" data-session-id="' + s.id + '">';
      html += '<div class="vault-entry-header">';
      html += '<span class="vault-date">' + s.dateDisplay + '</span>';
      html += '<span class="vault-score score-' + scoreClass + '">' + s.activityScore + '</span>';
      html += '</div>';
      html += '<div class="vault-location">' + s.locationName + '</div>';
      html += '<div class="vault-stats">';
      html += '<span>Mode: ' + s.mode.toUpperCase() + '</span>';
      html += '<span>Duration: ' + s.durationDisplay + '</span>';
      html += '<span>EVPs: ' + s.evpCount + '</span>';
      if (s.wordDetections && s.wordDetections.length > 0) {
        html += '<span>Words: ' + s.wordDetections.length + '</span>';
      }
      html += '</div>';
      if (s.evpDetections && s.evpDetections.length > 0) {
        html += '<div class="vault-evps">';
        for (const evp of s.evpDetections.slice(0, 5)) {
          html += '<span class="vault-evp-badge class-' + evp.class.toLowerCase() + '">Class ' + evp.class + '</span>';
        }
        if (s.evpDetections.length > 5) html += '<span class="vault-more">+' + (s.evpDetections.length - 5) + ' more</span>';
        html += '</div>';
      }
      html += '<div class="vault-actions">';
      html += '<button class="vault-delete-btn" data-delete-id="' + s.id + '">Delete</button>';
      html += '</div>';
      html += '</div>';
    }
    return html;
  }
}

window.SessionVault = SessionVault;
