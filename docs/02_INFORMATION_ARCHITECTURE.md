# 02 — Information Architecture

## 1. Mobile IA

### Root
```text
App
├─ MoviesStack
├─ TVStack
├─ FootballStack
├─ YouTubeStack
└─ AccountModalStack
```

Bottom tab chỉ điều hướng giữa 4 root stack. Mỗi root stack giữ back-stack riêng để khi người dùng đổi tab rồi quay lại vẫn ở đúng vị trí trước đó.

### MoviesStack
```text
MoviesHome
├─ MovieSearch
├─ MovieCollection
├─ MovieDetail
│  ├─ EpisodePicker
│  └─ MoviePlayer
└─ MovieFilters
```

### TVStack
```text
TVHome
├─ TVSearch
├─ ChannelGroup
├─ ChannelDetail
├─ EPGGuide
└─ TVPlayer
```

### FootballStack
```text
FootballHome
├─ Competition
├─ Team
├─ MatchCenter
│  └─ MatchPlayer (chỉ khi có source hợp lệ)
├─ Fixtures
└─ Standings
```

### YouTubeStack
```text
YouTubeHome
├─ YouTubeSearch
├─ Channel
├─ Playlist
├─ ShortsFeed
└─ YouTubePlayer
```

### AccountModalStack
```text
AccountHome
├─ Login/Register
├─ ProfileEdit
├─ History
├─ Favorites
├─ Watchlist
├─ Notifications
├─ Settings
└─ Privacy
```

## 2. Web IA
Top navigation desktop: `Xem phim | TV | Bóng đá | YouTube`, bên phải là search contextual + avatar. Mobile web có thể dùng bottom nav giống app.

Route namespaces phải tách rõ để cache, SEO và analytics không lẫn domain.

## 3. Không được dùng Home tổng hợp
Không tạo `/home` chứa lẫn phim, TV, bóng đá, YouTube. App mở mặc định vào `MoviesHome`, nhưng Admin có thể thay `default_start_tab` bằng config nếu cần.

## 4. State ownership
- Global: auth session, profile, remote config, network status, theme, locale.
- Per-domain: filters, selected category, scroll position, cached queries, playback context.
- Player state không được dùng chung object schema cho movie/TV/football/YouTube; chỉ share transport-level primitives.

## 5. URL/deep-link stability
Các ID nội bộ FULLMEDIA phải ổn định ngay cả khi external provider ID thay đổi. Database lưu mapping provider IDs sang canonical entity.

## 6. Empty/error IA
Mọi screen phải xác định 4 trạng thái: loading, content, empty, error. Partial failure chỉ làm hỏng section/provider liên quan, không làm blank toàn màn hình.