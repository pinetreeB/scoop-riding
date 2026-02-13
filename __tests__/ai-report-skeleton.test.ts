import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("AI Report Feature", () => {
  it("ai-report.tsx screen file exists", () => {
    const filePath = path.join(__dirname, "../app/ai-report.tsx");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("ai-report.tsx imports required dependencies", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../app/ai-report.tsx"),
      "utf-8"
    );
    expect(content).toContain("useTranslation");
    expect(content).toContain("trpc");
    expect(content).toContain("generateAiReport");
    expect(content).toContain("ScreenContainer");
    expect(content).toContain("AiReportSkeleton");
  });

  it("ai-report.tsx supports weekly and monthly periods", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../app/ai-report.tsx"),
      "utf-8"
    );
    expect(content).toContain('"weekly"');
    expect(content).toContain('"monthly"');
    expect(content).toContain("selectedPeriod");
  });

  it("ai-report.tsx uses i18n t() for all UI text", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../app/ai-report.tsx"),
      "utf-8"
    );
    // Check key translation keys are used
    expect(content).toContain("t('aiReport.title')");
    expect(content).toContain("t('aiReport.weekly')");
    expect(content).toContain("t('aiReport.monthly')");
    expect(content).toContain("t('aiReport.generateReport')");
    expect(content).toContain("t('aiReport.overallGrade')");
    expect(content).toContain("t('aiReport.safetyAnalysis')");
    expect(content).toContain("t('aiReport.regenerate')");
  });

  it("server routers.ts contains generateAiReport procedure", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../server/routers.ts"),
      "utf-8"
    );
    expect(content).toContain("generateAiReport");
    expect(content).toContain("invokeLLM");
    expect(content).toContain("aiReport");
  });
});

describe("Skeleton UI Components", () => {
  it("skeleton.tsx exports all required skeleton components", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../components/skeleton.tsx"),
      "utf-8"
    );
    expect(content).toContain("export function Skeleton");
    expect(content).toContain("export function StatCardSkeleton");
    expect(content).toContain("export function QuickActionCardSkeleton");
    expect(content).toContain("export function WeatherWidgetSkeleton");
    expect(content).toContain("export function RankingSectionSkeleton");
    expect(content).toContain("export function AiCoachingSkeleton");
    expect(content).toContain("export function AiReportSkeleton");
  });

  it("skeleton.tsx uses reanimated for shimmer animation", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../components/skeleton.tsx"),
      "utf-8"
    );
    expect(content).toContain("useSharedValue");
    expect(content).toContain("useAnimatedStyle");
    expect(content).toContain("withRepeat");
    expect(content).toContain("withTiming");
  });
});

describe("i18n - aiReport translations", () => {
  it("ko.json contains aiReport section with all required keys", () => {
    const ko = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../locales/ko.json"), "utf-8")
    );
    expect(ko.aiReport).toBeDefined();
    expect(ko.aiReport.title).toBe("AI 리포트");
    expect(ko.aiReport.weekly).toBeDefined();
    expect(ko.aiReport.monthly).toBeDefined();
    expect(ko.aiReport.generateReport).toBeDefined();
    expect(ko.aiReport.overallGrade).toBeDefined();
    expect(ko.aiReport.safetyAnalysis).toBeDefined();
    expect(ko.aiReport.efficiencyAnalysis).toBeDefined();
    expect(ko.aiReport.consistencyAnalysis).toBeDefined();
    expect(ko.aiReport.topAchievement).toBeDefined();
    expect(ko.aiReport.improvementArea).toBeDefined();
    expect(ko.aiReport.suggestedGoal).toBeDefined();
    expect(ko.aiReport.regenerate).toBeDefined();
  });

  it("en.json contains aiReport section with all required keys", () => {
    const en = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../locales/en.json"), "utf-8")
    );
    expect(en.aiReport).toBeDefined();
    expect(en.aiReport.title).toBe("AI Report");
    expect(en.aiReport.weekly).toBeDefined();
    expect(en.aiReport.monthly).toBeDefined();
    expect(en.aiReport.generateReport).toBeDefined();
    expect(en.aiReport.overallGrade).toBeDefined();
    expect(en.aiReport.safetyAnalysis).toBeDefined();
    expect(en.aiReport.efficiencyAnalysis).toBeDefined();
    expect(en.aiReport.consistencyAnalysis).toBeDefined();
    expect(en.aiReport.topAchievement).toBeDefined();
    expect(en.aiReport.improvementArea).toBeDefined();
    expect(en.aiReport.suggestedGoal).toBeDefined();
    expect(en.aiReport.regenerate).toBeDefined();
  });

  it("ko.json and en.json have matching aiReport keys", () => {
    const ko = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../locales/ko.json"), "utf-8")
    );
    const en = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../locales/en.json"), "utf-8")
    );
    const koKeys = Object.keys(ko.aiReport).sort();
    const enKeys = Object.keys(en.aiReport).sort();
    expect(koKeys).toEqual(enKeys);
  });

  it("home quickActions contains aiReport key in both locales", () => {
    const ko = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../locales/ko.json"), "utf-8")
    );
    const en = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../locales/en.json"), "utf-8")
    );
    expect(ko.home.quickActions.aiReport).toBeDefined();
    expect(en.home.quickActions.aiReport).toBeDefined();
    expect(ko.home.aiReportDesc).toBeDefined();
    expect(en.home.aiReportDesc).toBeDefined();
  });
});

describe("AI Usage - aiReport feature type", () => {
  it("ai-usage.ts includes aiReport in AiFeatureType", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../server/ai-usage.ts"),
      "utf-8"
    );
    expect(content).toContain('"aiReport"');
    expect(content).toContain("AiFeatureType");
  });
});

describe("AI Coaching Enhancement", () => {
  it("ride-analysis-modal.tsx contains coaching fields", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../components/ride-analysis-modal.tsx"),
      "utf-8"
    );
    expect(content).toContain("coaching");
    expect(content).toContain("useTranslation");
  });

  it("server analyzeRide includes coaching in system prompt", () => {
    const content = fs.readFileSync(
      path.join(__dirname, "../server/routers.ts"),
      "utf-8"
    );
    expect(content).toContain("coaching");
    expect(content).toContain("analyzeRide");
  });
});
