# 14 — API Contracts

## 1. Quy ước
Base `/api/v1`. JSON response chuẩn:
```json
{"data":{},"meta":{},"error":null}
```
Error chuẩn có `code`, `message`, `requestId`, optional retry hint. Không trả stack trace production.

## 2. Movies
- `GET /movies/home`
- `GET /movies/search?q=`
- `GET /movies/:id`
- `GET /movies/:id/episodes`
- `POST /movies/:id/playback/resolve`

Canonical Movie DTO gồm internal id, title, originalTitle, poster, backdrop, year, type, genres, countries, synopsis, status; không expose raw provider secret.

## 3. TV
- `GET /tv/home`
- `GET /tv/channels`
- `GET /tv/channels/:id`
- `GET /tv/channels/:id/epg`
- `POST /tv/channels/:id/playback/resolve`

## 4. Football
- `GET /football/home?date=`
- `GET /football/matches/:id`
- `GET /football/competitions/:id/fixtures`
- `GET /football/competitions/:id/standings`
- `POST /football/matches/:id/playback/resolve`

Response match luôn có `dataFreshness`/`updatedAt` khi phù hợp.

## 5. YouTube/video
- `GET /youtube/home`
- `GET /youtube/search`
- `GET /youtube/videos/:id`
- playback route chỉ khi integration cần server mediation; official embed IDs có thể trả descriptor phù hợp.

## 6. User
- `GET/PATCH /me/profile`
- `GET /me/history`
- `PUT/DELETE /me/favorites/:domain/:targetId`
- `GET/PUT/DELETE /me/watchlist`
- `GET/PATCH /me/settings`

## 7. Admin
Namespace `/api/v1/admin/*`, role protected. Provider mutation dùng optimistic/version control để tránh overwrite cấu hình mới.

## 8. Pagination
Cursor-based cho feed lớn; page-based được phép khi upstream bắt buộc nhưng API nội bộ nên normalize.

## 9. Versioning
Breaking contract tạo version mới hoặc compatibility layer. Remote config luôn có `schemaVersion` và client fallback defaults.