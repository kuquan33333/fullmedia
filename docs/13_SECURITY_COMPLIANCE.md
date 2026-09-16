# 13 — Security & Compliance

## 1. Secrets
- Supabase service role, provider secret, signing key chỉ server-side.
- Không đưa secrets vào `NEXT_PUBLIC_*`, Expo public config hoặc bundle.
- Rotate secret từ Admin/server process; UI không đọc lại plaintext.

## 2. Auth
Supabase Auth. Access token validate server-side. Sensitive admin actions yêu cầu role/claims đã verify.

## 3. RLS
Bắt buộc cho profile/history/favorites/watchlist và mọi dữ liệu user-owned. Test cả positive và negative cases.

## 4. Admin security
Admin app tách domain/deployment, CSP phù hợp, CSRF strategy theo auth method, audit logs, least privilege. Dangerous operations có confirmation.

## 5. Provider/network
Allowlist protocol/domain khi phù hợp để giảm SSRF. Không cho Admin nhập URL nội bộ tùy ý nếu backend sẽ fetch. Block localhost/private network ranges trong generic fetcher trừ môi trường được kiểm soát.

## 6. Input validation
Zod/schema validation ở API boundary; sanitize rich text; limit upload size/type; không tin metadata từ playlist/provider.

## 7. Rate limiting
Áp dụng cho login-sensitive endpoints, search abuse, provider test, playback resolve và admin actions phù hợp.

## 8. Content rights
Mỗi source có metadata ownership/license/notes/status. Admin có thể disable ngay. Không build tính năng nhằm né DRM/quảng cáo/quyền truy cập.

## 9. Privacy
Chỉ thu dữ liệu cần thiết; cho user xóa history, export/xóa account theo quy trình sản phẩm. Analytics không chứa secrets hoặc dữ liệu nhạy cảm không cần thiết.

## 10. Logging
Redact Authorization, cookies, service keys, signed playback query params. Production logs có retention policy.

## 11. Dependency/security pipeline
Lockfile committed; automated dependency audit; secret scanning; SAST/typecheck; security review trước release major.