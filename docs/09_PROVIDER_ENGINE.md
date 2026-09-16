# 09 — Provider Engine

## 1. Mục tiêu
Provider Engine giúp FULLMEDIA thay nguồn, endpoint, key, header, priority và fallback từ Admin mà không buộc client update.

## 2. Provider types
- MOVIE_CATALOG
- MOVIE_PLAYBACK
- IPTV_PLAYLIST
- IPTV_EPG
- FOOTBALL_DATA
- FOOTBALL_STREAM
- YOUTUBE_VIDEO
- GENERIC_VIDEO (chỉ cho nguồn hợp lệ)

## 3. Adapter contracts
Mỗi adapter implement interface domain và trả canonical DTO. Ví dụ MovieProvider: list, search, detail, episodes, resolvePlayback. FootballDataProvider: fixtures, match, standings. TVProvider: channels, programmes, playback candidates.

## 4. Registry
Provider config từ DB được load vào cache registry. Config tối thiểu:
`id, code, type, enabled, base_url, auth_strategy, encrypted_secret_ref, headers_template, priority, weight, timeout_ms, retry_policy, cache_ttl, mapping_version, health_status`.

## 5. Secret handling
Secrets không lưu plaintext trong client/public config. Admin UI chỉ cho set/rotate; sau khi save không trả secret đầy đủ về browser. Server resolve secret ở runtime.

## 6. Selection
Pipeline:
1. Filter enabled + domain/capability.
2. Filter circuit-open/down providers.
3. Sort priority/health/optional weight.
4. Execute primary.
5. Normalize/validate.
6. Fallback nếu lỗi retryable.
7. Return canonical result + non-sensitive source metadata.

Không fallback vô hạn.

## 7. Health Check
Manual test trong Admin + scheduled health probe. Metrics: last success, last failure, latency, status code/error class, consecutive failures. Health state: UNKNOWN, HEALTHY, DEGRADED, DOWN, DISABLED.

## 8. Mapping
Mapping layer phải versioned. Với JSON provider, adapter chịu trách nhiệm mapping field; Admin có thể chỉnh mapping cho provider đã hỗ trợ nếu schema thay đổi trong phạm vi adapter. Giao thức hoàn toàn mới cần code adapter mới nhưng không thay kiến trúc.

## 9. Caching
Cache key chứa provider + operation + normalized params + config version. Provider config update phải invalidate liên quan. Không cache public signed stream URLs lâu hơn expiry.

## 10. Circuit breaker
Sau N lỗi liên tiếp, provider chuyển DOWN tạm thời; probe thử lại sau cooldown. Successful probe đóng circuit.

## 11. Audit
Mọi thay đổi provider config ghi actor, timestamp, before/after redacted, reason optional. Secret values luôn redacted.

## 12. OPhim/KKPhim
Tạo adapter độc lập, normalize về canonical movie DTO. Không rải logic đặc thù OPhim/KKPhim vào screen/client.