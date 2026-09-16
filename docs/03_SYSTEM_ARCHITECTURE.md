# 03 — System Architecture

## 1. Monorepo
Dùng pnpm workspace + Turborepo.

```text
apps/
  mobile/
  web/
  admin/
  api/
packages/
  api-client/
  auth/
  config/
  contracts/
  database/
  design-tokens/
  providers/
  playback/
  logger/
  analytics/
  ui/
  testing/
  types/
supabase/
  migrations/
  seed/
  functions/
docs/
```

## 2. Client
### Mobile
Expo + React Native + TypeScript. Native player abstraction phải cho phép dùng implementation khác nhau theo platform khi cần. Navigation theo 4 root stack độc lập.

### Web
Next.js App Router, SSR/ISR cho metadata/catalog khi phù hợp, client components cho player và realtime UI.

### Admin
Next.js riêng, route guard theo role. Không deploy chung public routes với user web.

## 3. API/BFF
`apps/api` là boundary giữa client và external providers. Trách nhiệm:
- authenticate/authorize request khi cần;
- normalize provider data;
- cache;
- rate limit;
- provider selection/fallback;
- issue short-lived playback descriptor khi cần;
- hide secrets;
- health metrics;
- audit admin mutations.

Client không được biết raw provider credential.

## 4. Provider architecture
```text
Client
  ↓
BFF
  ↓
Domain Service
  ↓
Provider Registry
  ↓
Adapter A / Adapter B / Adapter C
```

Domain interfaces: `MovieProvider`, `TVProvider`, `FootballDataProvider`, `FootballStreamProvider`, `VideoProvider`.

## 5. Data plane vs control plane
- Control plane: Supabase DB, provider config, remote config, user data, admin config.
- Data plane: metadata request và playback URL.
- Media bytes nên đi trực tiếp từ licensed origin/CDN đến player; không proxy video qua Vercel mặc định.

## 6. Cache
Ba lớp khi cần:
1. Client query cache.
2. BFF/server cache.
3. Provider-side cache/CDN.

TTL theo loại dữ liệu: movie catalog dài hơn; live score ngắn hơn; stream descriptor cực ngắn và không cache public.

## 7. Observability
Structured logs có `request_id`, `provider_id`, `domain`, latency, status class. Không log tokens/secret URLs. Metrics tối thiểu: error rate, p50/p95 latency, fallback count, playback failures.

## 8. Scalability
Provider adapters stateless. Config đọc từ cached registry. Supabase migrations versioned. Nếu một domain tăng tải mạnh có thể tách API service mà không thay client contract.