# 12 — Playback & Streaming

## 1. Nguyên tắc
Playback layer chỉ phát nguồn mà dự án có quyền sử dụng hoặc được provider cho phép. Không bypass DRM, signature protection hay quảng cáo của nền tảng bên thứ ba.

## 2. Playback Descriptor
Client không nhận raw provider config. BFF trả descriptor canonical, ví dụ:
`type`, `url`, `headers` nếu an toàn/cần thiết, `expiresAt`, `mimeType`, `drm` metadata hợp lệ, `candidateId`, `providerPublicName`, `isLive`.

Signed/sensitive descriptors có TTL ngắn và không log nguyên URL.

## 3. Movie playback
- HLS/MP4/DASH tùy adapter/player support.
- Resume, seek, episode next, server switch.
- Candidate failover chỉ khi lỗi kỹ thuật retryable.
- Không tự nhảy nguồn vô hạn.

## 4. TV playback
- Live HLS ưu tiên low-latency khi source hỗ trợ ổn định.
- Reconnect với exponential backoff có giới hạn.
- Channel drawer giữ player context.
- EPG overlay không block controls.

## 5. Football playback
Match Center tách data khỏi stream. Playback chỉ được resolve khi backend có candidate hợp lệ; không có source thì không render fake player.

## 6. YouTube
Dùng official/embed/player mechanism phù hợp. Không re-host media hoặc cố loại quảng cáo. Nếu video không cho embed, UI hiển thị trạng thái không khả dụng thay vì circumvent.

## 7. Quality selection
Auto quality mặc định; user có thể chọn nếu player/source cung cấp renditions. Data Saver giảm quality target trên cellular.

## 8. Player state machine
`IDLE -> RESOLVING -> LOADING -> PLAYING -> BUFFERING -> ENDED | ERROR`.
Error class chuẩn: NETWORK, SOURCE_UNAVAILABLE, EXPIRED, GEO_BLOCKED, NOT_AUTHORIZED, FORMAT_UNSUPPORTED, DRM_ERROR, UNKNOWN.

## 9. Analytics
Đo resolve latency, TTFF, buffering ratio, playback error, candidate switch. Không gửi full signed URL/token.

## 10. Background/PiP
Chỉ bật Picture-in-Picture/background playback khi loại nội dung, platform policy và quyền nội dung cho phép.