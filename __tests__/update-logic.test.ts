/**
 * 업데이트 알림 로직 철저 검증 테스트
 * 
 * 테스트 시나리오:
 * 1. 현재 버전 = 서버 최신 버전 → 업데이트 알림 안 뜸
 * 2. 현재 버전 < 서버 최신 버전 → 업데이트 알림 뜸
 * 3. 현재 버전 > 서버 최신 버전 → 업데이트 알림 안 뜸
 */

import { describe, it, expect } from "vitest";

/**
 * 버전 비교 함수 (lib/app-update.ts와 동일한 로직)
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  
  const maxLength = Math.max(partsA.length, partsB.length);
  
  for (let i = 0; i < maxLength; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  
  return 0;
}

/**
 * 서버 측 버전 비교 로직 (server/routers.ts와 동일한 로직)
 */
function serverCompareVersions(currentVersion: string, latestVersion: string): boolean {
  const currentParts = currentVersion.split('.').map(Number);
  const latestParts = latestVersion.split('.').map(Number);
  
  let hasUpdate = false;
  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const current = currentParts[i] || 0;
    const latest = latestParts[i] || 0;
    if (latest > current) {
      hasUpdate = true;
      break;
    } else if (current > latest) {
      break;
    }
  }
  
  return hasUpdate;
}

describe("업데이트 알림 로직 철저 검증", () => {
  
  describe("클라이언트 측 compareVersions 함수", () => {
    
    describe("시나리오 1: 현재 버전 = 서버 최신 버전 → 업데이트 알림 안 뜸", () => {
      const testCases = [
        { current: "0.0.12", server: "0.0.12" },
        { current: "0.0.13", server: "0.0.13" },
        { current: "1.0.0", server: "1.0.0" },
        { current: "0.1.0", server: "0.1.0" },
        { current: "2.5.10", server: "2.5.10" },
      ];
      
      testCases.forEach(({ current, server }) => {
        it(`현재 버전 ${current} = 서버 버전 ${server} → hasUpdate = false`, () => {
          const comparison = compareVersions(server, current);
          const hasUpdate = comparison > 0;
          
          expect(comparison).toBe(0);
          expect(hasUpdate).toBe(false);
        });
      });
    });
    
    describe("시나리오 2: 현재 버전 < 서버 최신 버전 → 업데이트 알림 뜸", () => {
      const testCases = [
        { current: "0.0.12", server: "0.0.13", description: "패치 버전 증가" },
        { current: "0.0.12", server: "0.1.0", description: "마이너 버전 증가" },
        { current: "0.0.12", server: "1.0.0", description: "메이저 버전 증가" },
        { current: "0.0.9", server: "0.0.10", description: "9 → 10 전환" },
        { current: "0.0.99", server: "0.0.100", description: "99 → 100 전환" },
        { current: "0.9.9", server: "0.10.0", description: "마이너 9 → 10 전환" },
        { current: "0.0.11", server: "0.0.12", description: "실제 이전 버전 → 현재 버전" },
        { current: "0.0.10", server: "0.0.12", description: "2단계 이전 버전" },
      ];
      
      testCases.forEach(({ current, server, description }) => {
        it(`${description}: 현재 ${current} < 서버 ${server} → hasUpdate = true`, () => {
          const comparison = compareVersions(server, current);
          const hasUpdate = comparison > 0;
          
          expect(comparison).toBe(1);
          expect(hasUpdate).toBe(true);
        });
      });
    });
    
    describe("시나리오 3: 현재 버전 > 서버 최신 버전 → 업데이트 알림 안 뜸", () => {
      const testCases = [
        { current: "0.0.13", server: "0.0.12", description: "개발 버전이 서버보다 높음" },
        { current: "0.0.14", server: "0.0.13", description: "로컬 빌드가 서버보다 높음" },
        { current: "1.0.0", server: "0.9.99", description: "메이저 버전이 높음" },
        { current: "0.1.0", server: "0.0.99", description: "마이너 버전이 높음" },
        { current: "0.0.100", server: "0.0.99", description: "패치 100 > 99" },
      ];
      
      testCases.forEach(({ current, server, description }) => {
        it(`${description}: 현재 ${current} > 서버 ${server} → hasUpdate = false`, () => {
          const comparison = compareVersions(server, current);
          const hasUpdate = comparison > 0;
          
          expect(comparison).toBe(-1);
          expect(hasUpdate).toBe(false);
        });
      });
    });
  });
  
  describe("서버 측 버전 비교 로직", () => {
    
    describe("시나리오 1: 현재 버전 = 서버 최신 버전 → hasUpdate = false", () => {
      const testCases = [
        { current: "0.0.12", server: "0.0.12" },
        { current: "0.0.13", server: "0.0.13" },
        { current: "1.0.0", server: "1.0.0" },
      ];
      
      testCases.forEach(({ current, server }) => {
        it(`현재 ${current} = 서버 ${server}`, () => {
          const hasUpdate = serverCompareVersions(current, server);
          expect(hasUpdate).toBe(false);
        });
      });
    });
    
    describe("시나리오 2: 현재 버전 < 서버 최신 버전 → hasUpdate = true", () => {
      const testCases = [
        { current: "0.0.12", server: "0.0.13" },
        { current: "0.0.11", server: "0.0.12" },
        { current: "0.0.10", server: "0.0.13" },
        { current: "0.0.9", server: "0.0.10" },
      ];
      
      testCases.forEach(({ current, server }) => {
        it(`현재 ${current} < 서버 ${server}`, () => {
          const hasUpdate = serverCompareVersions(current, server);
          expect(hasUpdate).toBe(true);
        });
      });
    });
    
    describe("시나리오 3: 현재 버전 > 서버 최신 버전 → hasUpdate = false", () => {
      const testCases = [
        { current: "0.0.13", server: "0.0.12" },
        { current: "0.0.14", server: "0.0.13" },
        { current: "1.0.0", server: "0.9.99" },
      ];
      
      testCases.forEach(({ current, server }) => {
        it(`현재 ${current} > 서버 ${server}`, () => {
          const hasUpdate = serverCompareVersions(current, server);
          expect(hasUpdate).toBe(false);
        });
      });
    });
  });
  
  describe("실제 배포 시나리오 시뮬레이션", () => {
    
    it("v0.0.13 빌드 후 DB에 등록 → v0.0.12 사용자에게 업데이트 알림", () => {
      const currentUserVersion = "0.0.12";
      const serverLatestVersion = "0.0.13";
      
      // 클라이언트 측 로직
      const clientHasUpdate = compareVersions(serverLatestVersion, currentUserVersion) > 0;
      expect(clientHasUpdate).toBe(true);
      
      // 서버 측 로직
      const serverHasUpdate = serverCompareVersions(currentUserVersion, serverLatestVersion);
      expect(serverHasUpdate).toBe(true);
    });
    
    it("v0.0.13 빌드 후 DB에 등록 → v0.0.13 사용자에게 업데이트 알림 안 뜸", () => {
      const currentUserVersion = "0.0.13";
      const serverLatestVersion = "0.0.13";
      
      // 클라이언트 측 로직
      const clientHasUpdate = compareVersions(serverLatestVersion, currentUserVersion) > 0;
      expect(clientHasUpdate).toBe(false);
      
      // 서버 측 로직
      const serverHasUpdate = serverCompareVersions(currentUserVersion, serverLatestVersion);
      expect(serverHasUpdate).toBe(false);
    });
    
    it("v0.0.13 빌드 후 DB 등록 전 → v0.0.13 사용자에게 업데이트 알림 안 뜸 (DB에 0.0.12만 있음)", () => {
      const currentUserVersion = "0.0.13";
      const serverLatestVersion = "0.0.12"; // DB에 아직 0.0.13이 등록되지 않음
      
      // 클라이언트 측 로직
      const clientHasUpdate = compareVersions(serverLatestVersion, currentUserVersion) > 0;
      expect(clientHasUpdate).toBe(false);
      
      // 서버 측 로직
      const serverHasUpdate = serverCompareVersions(currentUserVersion, serverLatestVersion);
      expect(serverHasUpdate).toBe(false);
    });
    
    it("v0.0.11 사용자가 v0.0.13 서버 버전 확인 → 업데이트 알림 뜸", () => {
      const currentUserVersion = "0.0.11";
      const serverLatestVersion = "0.0.13";
      
      const clientHasUpdate = compareVersions(serverLatestVersion, currentUserVersion) > 0;
      expect(clientHasUpdate).toBe(true);
      
      const serverHasUpdate = serverCompareVersions(currentUserVersion, serverLatestVersion);
      expect(serverHasUpdate).toBe(true);
    });
  });
  
  describe("엣지 케이스", () => {
    
    it("버전 문자열에 선행 0이 있는 경우", () => {
      // "01" 같은 문자열은 Number()로 변환 시 1이 됨
      const hasUpdate = compareVersions("0.0.13", "0.0.012") > 0;
      expect(hasUpdate).toBe(true); // 13 > 12
    });
    
    it("버전 길이가 다른 경우 (0.0.12 vs 0.0.12.1)", () => {
      const hasUpdate = compareVersions("0.0.12.1", "0.0.12") > 0;
      expect(hasUpdate).toBe(true); // 0.0.12.1 > 0.0.12
    });
    
    it("빈 버전 세그먼트는 0으로 처리", () => {
      const hasUpdate = compareVersions("0.0.12", "0.0") > 0;
      expect(hasUpdate).toBe(true); // 0.0.12 > 0.0.0
    });
  });
});
