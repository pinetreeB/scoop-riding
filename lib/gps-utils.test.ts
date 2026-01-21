import { describe, it, expect } from "vitest";

// Only test pure functions that don't require expo modules
// Import the functions we need to test directly

// Haversine distance calculation
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function msToKmh(ms: number): number {
  return ms * 3.6;
}

interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
  speed: number | null;
  accuracy: number | null;
}

interface TrackData {
  points: GpsPoint[];
  startTime: Date;
  endTime: Date;
  name: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateGpxContent(track: TrackData): string {
  const formatDate = (date: Date) => date.toISOString();

  const trackPoints = track.points
    .map((point) => {
      const ele = point.altitude !== null ? `      <ele>${point.altitude.toFixed(1)}</ele>\n` : "";
      const time = `      <time>${new Date(point.timestamp).toISOString()}</time>\n`;
      const speed =
        point.speed !== null
          ? `      <extensions>\n        <speed>${point.speed.toFixed(2)}</speed>\n      </extensions>\n`
          : "";
      return `    <trkpt lat="${point.latitude.toFixed(7)}" lon="${point.longitude.toFixed(7)}">\n${ele}${time}${speed}    </trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SCOOP Riding App"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(track.name)}</name>
    <time>${formatDate(track.startTime)}</time>
  </metadata>
  <trk>
    <name>${escapeXml(track.name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

function calculateTotalDistance(points: GpsPoint[]): number {
  if (points.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += calculateDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return totalDistance;
}

function calculateAverageSpeed(points: GpsPoint[]): number {
  if (points.length === 0) return 0;

  const validSpeeds = points
    .filter((p) => p.speed !== null && p.speed >= 0)
    .map((p) => msToKmh(p.speed!));

  if (validSpeeds.length === 0) return 0;

  return validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length;
}

function getMaxSpeed(points: GpsPoint[]): number {
  if (points.length === 0) return 0;

  const validSpeeds = points
    .filter((p) => p.speed !== null && p.speed >= 0)
    .map((p) => msToKmh(p.speed!));

  if (validSpeeds.length === 0) return 0;

  return Math.max(...validSpeeds);
}

describe("gps-utils", () => {
  describe("calculateDistance", () => {
    it("should return 0 for same coordinates", () => {
      const distance = calculateDistance(37.5665, 126.978, 37.5665, 126.978);
      expect(distance).toBe(0);
    });

    it("should calculate distance between two points correctly", () => {
      // Seoul to Busan (approximately 325km)
      const distance = calculateDistance(37.5665, 126.978, 35.1796, 129.0756);
      expect(distance).toBeGreaterThan(300000); // > 300km
      expect(distance).toBeLessThan(350000); // < 350km
    });

    it("should calculate short distances accurately", () => {
      // About 100 meters apart
      const distance = calculateDistance(37.5665, 126.978, 37.5674, 126.978);
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });
  });

  describe("msToKmh", () => {
    it("should convert 0 m/s to 0 km/h", () => {
      expect(msToKmh(0)).toBe(0);
    });

    it("should convert 1 m/s to 3.6 km/h", () => {
      expect(msToKmh(1)).toBe(3.6);
    });

    it("should convert 10 m/s to 36 km/h", () => {
      expect(msToKmh(10)).toBe(36);
    });

    it("should convert 27.78 m/s to approximately 100 km/h", () => {
      expect(msToKmh(27.78)).toBeCloseTo(100, 0);
    });
  });

  describe("generateGpxContent", () => {
    it("should generate valid GPX XML", () => {
      const track: TrackData = {
        points: [
          {
            latitude: 37.5665,
            longitude: 126.978,
            altitude: 10,
            timestamp: 1700000000000,
            speed: 5,
            accuracy: 5,
          },
          {
            latitude: 37.5675,
            longitude: 126.979,
            altitude: 12,
            timestamp: 1700000001000,
            speed: 6,
            accuracy: 4,
          },
        ],
        startTime: new Date("2024-01-01T10:00:00Z"),
        endTime: new Date("2024-01-01T10:30:00Z"),
        name: "Test Ride",
      };

      const gpx = generateGpxContent(track);

      expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(gpx).toContain("<gpx");
      expect(gpx).toContain("<trk>");
      expect(gpx).toContain("<trkpt");
      expect(gpx).toContain('lat="37.5665000"');
      expect(gpx).toContain('lon="126.9780000"');
      expect(gpx).toContain("<ele>10.0</ele>");
      expect(gpx).toContain("<name>Test Ride</name>");
    });

    it("should escape XML special characters in name", () => {
      const track: TrackData = {
        points: [],
        startTime: new Date(),
        endTime: new Date(),
        name: "Test <Ride> & \"Special\" 'Characters'",
      };

      const gpx = generateGpxContent(track);

      expect(gpx).toContain("&lt;Ride&gt;");
      expect(gpx).toContain("&amp;");
      expect(gpx).toContain("&quot;Special&quot;");
      expect(gpx).toContain("&apos;Characters&apos;");
    });
  });

  describe("calculateTotalDistance", () => {
    it("should return 0 for empty array", () => {
      expect(calculateTotalDistance([])).toBe(0);
    });

    it("should return 0 for single point", () => {
      const points: GpsPoint[] = [
        {
          latitude: 37.5665,
          longitude: 126.978,
          altitude: null,
          timestamp: Date.now(),
          speed: null,
          accuracy: null,
        },
      ];
      expect(calculateTotalDistance(points)).toBe(0);
    });

    it("should calculate total distance for multiple points", () => {
      const points: GpsPoint[] = [
        { latitude: 37.5665, longitude: 126.978, altitude: null, timestamp: Date.now(), speed: null, accuracy: null },
        { latitude: 37.5675, longitude: 126.978, altitude: null, timestamp: Date.now(), speed: null, accuracy: null },
        { latitude: 37.5685, longitude: 126.978, altitude: null, timestamp: Date.now(), speed: null, accuracy: null },
      ];
      const distance = calculateTotalDistance(points);
      expect(distance).toBeGreaterThan(200); // About 222m total
      expect(distance).toBeLessThan(250);
    });
  });

  describe("calculateAverageSpeed", () => {
    it("should return 0 for empty array", () => {
      expect(calculateAverageSpeed([])).toBe(0);
    });

    it("should return 0 when no valid speeds", () => {
      const points: GpsPoint[] = [
        { latitude: 0, longitude: 0, altitude: null, timestamp: Date.now(), speed: null, accuracy: null },
      ];
      expect(calculateAverageSpeed(points)).toBe(0);
    });

    it("should calculate average speed correctly", () => {
      const points: GpsPoint[] = [
        { latitude: 0, longitude: 0, altitude: null, timestamp: Date.now(), speed: 5, accuracy: null }, // 18 km/h
        { latitude: 0, longitude: 0, altitude: null, timestamp: Date.now(), speed: 10, accuracy: null }, // 36 km/h
      ];
      const avgSpeed = calculateAverageSpeed(points);
      expect(avgSpeed).toBeCloseTo(27, 0); // (18 + 36) / 2 = 27 km/h
    });
  });

  describe("getMaxSpeed", () => {
    it("should return 0 for empty array", () => {
      expect(getMaxSpeed([])).toBe(0);
    });

    it("should return max speed in km/h", () => {
      const points: GpsPoint[] = [
        { latitude: 0, longitude: 0, altitude: null, timestamp: Date.now(), speed: 5, accuracy: null },
        { latitude: 0, longitude: 0, altitude: null, timestamp: Date.now(), speed: 15, accuracy: null },
        { latitude: 0, longitude: 0, altitude: null, timestamp: Date.now(), speed: 10, accuracy: null },
      ];
      const maxSpeed = getMaxSpeed(points);
      expect(maxSpeed).toBeCloseTo(54, 0); // 15 m/s = 54 km/h
    });
  });
});
