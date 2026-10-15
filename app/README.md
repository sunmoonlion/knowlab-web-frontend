# tpl-web-frontend

SunmoonAI 的 Next Web 通用模板。B2~B4 期间它与当前 `tpl-backend`（Nest Web BFF）
组成发布和验收单元；B5/B6 后默认配对同契约 FastAPI BFF，Nest 作为可选 profile。
模板提供 App Router、明确的 public/authenticated 渲染边界、
next-intl、Tailwind/shadcn UI、同源 `/api` 接入和自托管 standalone 构建。
本仓库不包含 Knowfeed、Knowbase 或 Research 的领域页面和 DTO。

## 本地开发

```bash
# .nvmrc/.node-version and Docker/CI share the same release baseline.
nvm use 24.18.0
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

发布基线为 Node `24.18.0` LTS 与 pnpm `10.24.x`；`package.json` 只接受
`>=24.18.0 <25`。版本冻结服务于单次发布可复现，不代表永久停留在该版本；模板按
季度检查 LTS 生命周期，并在 EOL 前至少六个月启动下一次受控升级。

首次使用时，从 `.env.example` 生成未提交的 `.env.local`。浏览器 API 固定为
同源 `/api`；`DEPLOYMENT_ENV`、`AUTH_APP`、`APP_ORIGIN`、`BACKEND_INTERNAL_URL`、`DEPLOYMENT_ID`
属于 server-only 运行时契约。不要把 Casdoor、Redis、服务 token 或其他凭据
放进 `NEXT_PUBLIC_*` 或前端仓库。

## 质量门禁

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm check:i18n
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

生产镜像使用 `mybuild/Dockerfile` 的 `output: standalone` 产物，并由 Nginx/
Ingress 或受控 Node server 对外提供服务。发布前必须同时记录模板 commit、依赖
锁、镜像 digest、环境契约和回滚版本；本仓库不会覆盖三个 Web App 的正式流量。

## 架构边界

- `proxy.ts` 只负责 locale negotiation 等请求前路由工作，不是授权边界。
- `env/client.ts` 只允许同源 API path；`instrumentation.ts` 在生产 Node server
  启动时验证 server-only 环境。
- 公共首页可预渲染；工作区明确 dynamic/no-store/noindex。受权页面只通过
  `lib/server/auth-session.ts` 的 server-only DAL 把请求 cookie 和 correlation ID 转给
  配对 backend，并严格解析 Browser Session DTO v1；401 服务端跳转登录，其他上游或
  契约错误 fail closed。浏览器 logout 只使用同源 POST+CSRF，不保存第二份 auth 状态。
- B2 通过只证明身份内核、DAL/DTO 和受控配对 fixture；真实 Casdoor、双 Pod、滚动与
  回滚资格仍由 B4 验收。
- B3 增加实现无关的 Run snapshot、typed query、SSE cursor/去重/断档对账、HITL action、
  browser-safe Citation 和稳定 error adapter。参考 UI 仅在
  `REFERENCE_UI_ENABLED=true` 时启用；生产默认关闭，fixture 不代表真实 Run 成功。
- BFF、session/cookie、SSE cursor/reconcile、Citation DTO 和缓存归属以
  ADR-001/002/004/005/014 为准，不在模板中伪造业务成功。
- 迁移到 Knowfeed、Knowbase、Research 时必须原地替换现有仓库，保留领域页面并按
  迁移前 tag、候选镜像 digest、隔离部署和回滚证据串行执行。

## 参考

- Next.js App Router 与自托管文档：<https://nextjs.org/docs>
- 当前架构与契约入口：`k8s/sunmoonai/docs/project-guide/`
- 旧设计与迁移证据：按 `k8s/sunmoonai/docs/legacy-backlog/verification-index.md` 的固定 Git 版本查询，不作为当前实施基线。
