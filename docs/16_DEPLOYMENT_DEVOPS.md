# 16 — Deployment & DevOps

## 1. Environments
`local`, `preview/staging`, `production`. Mỗi environment có Supabase project/config riêng khi có thể. Không dùng production service key ở local CI log.

## 2. Vercel
- `apps/web` project riêng.
- `apps/admin` project riêng.
- `apps/api` project riêng hoặc deployment phù hợp kiến trúc serverless.
- Preview deployments cho PR.

## 3. Mobile
Expo/EAS profiles: development, preview/internal, production. iOS/Android bundle identifiers cố định từ sớm. Secrets dùng EAS/CI secret store, không commit.

## 4. Supabase
Migrations chạy có kiểm soát trước app deploy khi schema compatible. Seed chỉ cho local/staging; production không seed fake content.

## 5. CI/CD
PR: install frozen lockfile -> lint -> typecheck -> tests -> builds. Main: deploy preview/staging trước; production promotion theo release process. Không tự ý chạy workflow tốn quota nếu repo owner đã chọn manual workflow policy.

## 6. Rollback
- Web/Admin/API: rollback deployment.
- Provider config: version + rollback từ Admin.
- DB: forward-fix ưu tiên; migration nguy hiểm có backup/rollback plan.
- Mobile: remote config/feature flag để disable feature lỗi trong lúc chờ store release.

## 7. Env contract
Document `.env.example` không có secret thật. Validate env khi app boot/build và fail-fast với message rõ.

## 8. Observability
Error tracking, structured logs, provider health dashboard, uptime checks. Alert theo error rate và provider outage, tránh alert noise.

## 9. Media delivery
Không dùng Vercel làm video proxy mặc định. Media phát từ origin/CDN/provider hợp lệ để tránh bandwidth/timeouts không cần thiết.