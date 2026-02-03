import { Router, Request, Response } from "express";
import { ENV } from "../_core/env";

const router = Router();

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// 모빌리티 특화 시스템 프롬프트
// 현재 날짜를 동적으로 가져오는 함수
function getCurrentDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}

// 시스템 프롬프트 생성 함수
function getSystemPrompt(): string {
  const currentDate = getCurrentDateString();
  return `당신은 SCOOP 앱의 AI 어시스턴트 "스쿠피"입니다. 전동킥보드 및 모빌리티 전문가로서 사용자에게 도움을 제공합니다.

## 중요: 현재 날짜
오늘 날짜는 ${currentDate}입니다. 모든 답변에서 이 날짜를 기준으로 "현재", "지금", "올해" 등의 시간 표현을 사용하세요.

## 역할
- 전동킥보드 안전 수칙 및 법규 안내
- 주행 팁 및 기술 조언
- 기체 관리 및 정비 정보
- 모빌리티 관련 일반 질문 답변

## 한국 전동킥보드 법규 (2024년 기준)
- 만 16세 이상 운전 가능
- 원동기장치자전거 면허 또는 그 이상의 면허 필요
- 헬멧 착용 의무
- 자전거도로 또는 차도 우측 가장자리 주행
- 인도 주행 금지 (예외: 자전거 통행 허용 구간)
- 최고 속도 25km/h 이하
- 음주운전 금지 (혈중알코올농도 0.03% 이상 시 처벌)
- 2인 이상 탑승 금지

## 안전 수칙
- 주행 전 브레이크, 타이어, 조명 점검
- 야간 주행 시 전조등/후미등 필수
- 비 오는 날 미끄러움 주의
- 급가속/급제동 자제
- 교차로에서 서행 및 좌우 확인
- 이어폰 착용 자제 (주변 소리 인지 필요)

## 응답 스타일
- 친근하고 전문적인 톤 유지
- 간결하고 명확한 답변
- 필요시 이모지 적절히 사용
- 안전 관련 질문에는 항상 법규 준수 강조
- 모르는 내용은 솔직히 인정

## 제한사항
- 의료/법률 조언 제공 불가 (전문가 상담 권유)
- 불법 행위 조장 금지
- 개인정보 요청 금지
- SCOOP 앱 외 타사 서비스 홍보 금지`;
}

// 기존 호환성을 위한 변수 (deprecated, getSystemPrompt() 사용 권장)
const SYSTEM_PROMPT = getSystemPrompt();

// Rate limiting (simple in-memory)
const rateLimitMap = new Map<number, { count: number; resetTime: number }>();
const RATE_LIMIT = 20; // requests per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }

  userLimit.count++;
  return true;
}

// Chat endpoint
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, userId, conversationHistory } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "메시지를 입력해주세요." });
    }

    if (!userId) {
      return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return res.status(429).json({ 
        error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
        retryAfter: 60
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "AI 서비스가 설정되지 않았습니다." });
    }

    // Build conversation contents
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Add system instruction as first user message (동적으로 현재 날짜 포함)
    const currentSystemPrompt = getSystemPrompt();
    contents.push({
      role: "user",
      parts: [{ text: currentSystemPrompt + "\n\n위 지침을 따라 사용자의 질문에 답변해주세요." }]
    });
    contents.push({
      role: "model",
      parts: [{ text: "안녕하세요! 저는 SCOOP의 AI 어시스턴트 스쿠피입니다. 전동킥보드와 모빌리티에 관한 질문이 있으시면 무엇이든 물어보세요! 🛴" }]
    });

    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) { // Keep last 10 messages
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }]
        });
      }
    }

    // Add current message
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    // Call Gemini API
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[AI Chat] Gemini API error:", errorData);
      
      if (response.status === 429) {
        return res.status(429).json({ 
          error: "AI 서비스가 일시적으로 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.",
          retryAfter: 60
        });
      }
      
      return res.status(500).json({ error: "AI 응답을 생성하는 중 오류가 발생했습니다." });
    }

    const data = await response.json();
    
    // Extract response text
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiResponse) {
      console.error("[AI Chat] Empty response from Gemini:", data);
      return res.status(500).json({ error: "AI 응답을 생성할 수 없습니다." });
    }

    return res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[AI Chat] Error:", error);
    return res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// Quick suggestions endpoint
router.get("/suggestions", (_req: Request, res: Response) => {
  const suggestions = [
    "전동킥보드 안전하게 타는 방법",
    "비 오는 날 주행 팁",
    "배터리 오래 쓰는 방법",
    "헬멧 착용이 의무인가요?",
    "전동킥보드 면허가 필요한가요?",
    "야간 주행 시 주의사항",
    "브레이크 점검 방법",
    "타이어 공기압 관리",
  ];
  
  // Return 4 random suggestions
  const shuffled = suggestions.sort(() => 0.5 - Math.random());
  return res.json({ suggestions: shuffled.slice(0, 4) });
});

// Health check
router.get("/health", (_req: Request, res: Response) => {
  return res.json({ 
    ok: true, 
    apiKeyConfigured: !!GEMINI_API_KEY,
    timestamp: Date.now() 
  });
});

export default router;
