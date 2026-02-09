/**
 * InvestigationMap — Leaflet.js map for plotting past investigation locations
 * Shows markers color-coded by activity score on a dark basemap
 */
class InvestigationMap {
  constructor() {
    this.map = null;
    this.markers = [];
    this.ready = false;
  }

  init(containerId) {
    if (!window.L) {
      console.warn('Leaflet.js not loaded');
      return false;
    }
    if (this.ready) {
      this.refresh();
      return true;
    }

    try {
      this.map = L.map(containerId, {
        zoomControl: true,
        attributionControl: false
      }).setView([39.8, -98.6], 4);

      // Dark themed tile layer
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(this.map);

      this.ready = true;
      return true;
    } catch (e) {
      console.warn('Map init failed:', e);
      return false;
    }
  }

  plot(sessions) {
    if (!this.map) return;
    this.clearMarkers();

    let hasMarkers = false;
    for (const s of sessions) {
      if (!s.location || !s.location.available) continue;

      const score = s.activityScore || 0;
      const color = score >= 60 ? '#ff1744' : score >= 30 ? '#ffea00' : '#00e5ff';
      const radius = 6 + Math.min(10, score / 5);

      const marker = L.circleMarker([s.location.latitude, s.location.longitude], {
        radius: radius,
        color: color,
        fillColor: color,
        fillOpacity: 0.6,
        weight: 2
      }).addTo(this.map);

      const name = s.location.name || s.locationName || (s.location.latitude.toFixed(4) + ', ' + s.location.longitude.toFixed(4));
      const dateStr = new Date(s.date).toLocaleDateString();
      const timeStr = new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      marker.bindPopup(
        '<div style="font-family:system-ui;font-size:13px;min-width:150px">' +
        '<b style="color:#7c4dff">' + name + '</b><br>' +
        '<span>Activity: <b>' + score + '</b>/100</span><br>' +
        '<span>EVPs: ' + (s.evpCount || 0) + '</span><br>' +
        '<span>Mode: ' + (s.mode || 'EVP').toUpperCase() + '</span><br>' +
        '<span>Duration: ' + (s.durationDisplay || '—') + '</span><br>' +
        '<span style="color:#999">' + dateStr + ' ' + timeStr + '</span>' +
        '</div>'
      );

      this.markers.push(marker);
      hasMarkers = true;
    }

    if (hasMarkers) {
      try {
        this.map.fitBounds(L.featureGroup(this.markers).getBounds().pad(0.3));
      } catch (e) { /* bounds error if all markers at same point */ }
    }
  }

  clearMarkers() {
    for (const m of this.markers) {
      if (this.map) m.removeFrom(this.map);
    }
    this.markers = [];
  }

  refresh() {
    if (this.map) setTimeout(() => this.map.invalidateSize(), 200);
  }

  getMarkerCount() {
    return this.markers.length;
  }

  destroy() {
    this.clearMarkers();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.ready = false;
  }
}

window.InvestigationMap = InvestigationMap;
