# 00 — Project Charter

## 1. Tầm nhìn
FULLMEDIA là ứng dụng giải trí đa nền tảng cho iOS, Android và Web. Sản phẩm gom bốn nhu cầu lớn vào một tài khoản duy nhất nhưng tuyệt đối không biến chúng thành một giao diện chung: **Xem phim**, **TV**, **Bóng đá**, **YouTube**.

## 2. Mục tiêu
- Người dùng có thể xem phim từ các provider được tích hợp như OPhim/KKPhim thông qua lớp Provider Engine.
- Người dùng có thể xem IPTV/live TV, EPG và đổi kênh nhanh.
- Người dùng có thể xem lịch bóng, tỉ số, BXH, match center và nguồn xem trận hợp lệ khi có.
- Người dùng có thể xem nội dung YouTube bằng cơ chế phát được YouTube cho phép.
- Một tài khoản dùng chung lịch sử, yêu thích, watchlist, cài đặt và thông báo.
- Admin có thể bật/tắt, đổi endpoint, key, header, priority, fallback và mapping của provider mà không sửa client.

## 3. Phạm vi nền tảng
- `apps/mobile`: iOS + Android.
- `apps/web`: web người dùng responsive.
- `apps/admin`: CMS quản trị riêng.
- `apps/api`: BFF/provider orchestration.
- Supabase: Auth, Postgres, RLS, Realtime khi phù hợp, storage cho asset do dự án sở hữu.
- Vercel: web/admin/API. Video stream không proxy qua Vercel nếu không cần thiết.

## 4. Nguyên tắc không được phá vỡ
1. Bottom mobile cố định 4 mục: **Xem phim / TV / Bóng đá / YouTube**.
2. Không có tab Home chung trộn tất cả nội dung.
3. Mỗi domain có component và interaction model riêng.
4. Account mở từ avatar/profile entry ở top bar.
5. Client không chứa secret key hoặc service-role key.
6. Client không phụ thuộc trực tiếp schema thô của provider bên ngoài.
7. Mọi nguồn có health check, timeout, retry có giới hạn và fallback.
8. Không triển khai bypass DRM, bypass quảng cáo, hoặc stream không có quyền sử dụng.
9. Không dùng mock data trong production path.
10. Mọi phase phải có acceptance criteria trước khi chuyển phase.

## 5. KPI kỹ thuật ban đầu
- Crash-free session >= 99.5% sau giai đoạn ổn định.
- API p95 metadata < 800ms khi cache hit; < 2.5s khi provider call bình thường.
- Time-to-first-frame được theo dõi riêng cho movie/TV/live sports/YouTube.
- Provider error không được làm sập toàn app.
- Mọi màn hình có loading, empty, partial-error và retry state.

## 6. Out of scope ban đầu
- Thanh toán/subscription thương mại.
- Offline download nội dung bên thứ ba nếu không có quyền.
- DRM riêng của FULLMEDIA.
- Social feed/chat công khai.

## 7. Quyền quyết định thiết kế
Tài liệu trong `docs/` là source of truth. Khi code khác tài liệu, phải cập nhật tài liệu hoặc sửa code; không được để hai bên lệch nhau.