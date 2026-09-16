# 15 — Testing & QA

## 1. Test pyramid
- Unit: adapters, normalizers, parsers, selectors, utilities.
- Integration: Supabase/RLS, API routes, provider fallback, cache.
- Component/UI: domain components.
- E2E: critical journeys web/admin; mobile smoke/E2E khi pipeline hỗ trợ.

## 2. Mandatory CI
`lint`, `typecheck`, `unit`, `integration` phù hợp, web build, admin build. Mobile config/build validation ở phase tương ứng.

## 3. Domain test matrix
### Movies
search, detail, episode, resume, source failover, empty catalog.
### TV
M3U parse, EPG mapping, channel switch, reconnect, no EPG, failed stream.
### Football
timezone, live/final/upcoming status, stale data, standings, no stream available.
### YouTube
curated feed, embed unavailable, playlist/channel navigation, Shorts layout.

## 4. Provider chaos tests
Simulate timeout, 4xx, 5xx, malformed JSON, empty payload, schema drift, slow response. App/API phải degrade gracefully.

## 5. RLS security tests
User A không đọc/sửa history/favorites/profile của User B. Anonymous không đọc admin/provider secrets. Admin role test đúng scope.

## 6. Responsive QA
Mobile nhỏ/lớn, tablet, web desktop; iOS safe area; Android gesture/nav bar; orientation player.

## 7. Performance
Measure startup, list virtualization, image loading, API p95, player TTFF, memory during long video session. Không render hàng trăm cards không virtualization.

## 8. Accessibility
Screen reader smoke test, focus web, contrast, dynamic type, reduce motion.

## 9. Release gate
Không release khi có P0/P1 bug, auth/RLS regression, crash blocker, playback crash loop hoặc admin có thể leak secret.