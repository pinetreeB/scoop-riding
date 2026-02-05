# GCP Cloud Run용 Dockerfile
# Node.js 서버 빌드 및 실행

# 빌드 스테이지
FROM node:22-alpine AS builder

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# 의존성 파일 복사
COPY package.json pnpm-lock.yaml ./

# 의존성 설치
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN pnpm build

# 프로덕션 스테이지
FROM node:22-alpine AS runner

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# 프로덕션 의존성만 설치
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 빌드된 파일 복사
COPY --from=builder /app/dist ./dist

# drizzle 스키마 및 마이그레이션 파일 복사 (런타임에 필요할 수 있음)
COPY --from=builder /app/drizzle ./drizzle

# shared 폴더 복사 (런타임에 필요)
COPY --from=builder /app/shared ./shared

# 환경 변수 설정
ENV NODE_ENV=production
ENV PORT=8080

# 포트 노출
EXPOSE 8080

# 서버 실행
CMD ["node", "dist/index.js"]
