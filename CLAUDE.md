# tpl-web-frontend — 局部编码规则

> 进入本目录时自动叠加。**本文件只约束局部编码。**
> 项目全貌见 `../../k8s/docs/project-guide/overall-architecture.md`（§5 是前端形态）。
> **改代码前先读 `../../k8s/docs/dev-investment-agent/tree-build/rules/constraints.md`**（39 条，按主题分组）。
> 与代码冲突时以代码为准。

## 技术栈

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui + @base-ui ·
next-intl（i18n）· TanStack Query · Zustand · zod · vitest + playwright ·
pnpm（锁文件 `pnpm-lock.yaml`）· `output: 'standalone'`

**未使用 axios。**HTTP 一律走 `lib/common/api-client.ts`。

## 三条最容易搞错的事

| 常见误解 | 实际 |
| --- | --- |
| 路由边界是 `middleware.ts` | **是 `proxy.ts`**（Next 16 已改名），在 `app/` 目录同级 |
| OIDC 回调 / session 在前端 API Route | **全部在后端**。前端唯一的 route 是 `app/healthz/route.ts` |
| 用 axios 封装请求 | 用 `lib/common/api-client.ts`，只允许**同源 `/api/` 路径** |

## 目录结构

```
app/                          ← 工程根在这一层（不是仓根）
├── app/[locale]/(auth|dashboard)/   页面，locale 路由
├── app/healthz/route.ts             唯一的 route handler
├── proxy.ts                         路由边界：locale + 每请求 CSP nonce
├── env/server-schema.ts             服务端环境变量 zod 校验，生产缺项即 throw
├── lib/
│   ├── common/api-client.ts         HTTP 客户端（同源限制 + problem 归一化）
│   ├── server/auth-session.ts       server-only，经 BACKEND_INTERNAL_URL 读会话
│   ├── auth/browser-session.ts
│   ├── interaction/                 run 投影、SSE 客户端
│   └── security/                    CSP、响应头
├── contracts/                       后端契约的 zod 复刻
├── components/  i18n/  messages/  tests/
```

## 会让你失败的规则

| 规则 | 后果 |
| --- | --- |
| 生产 `APP_ORIGIN` 必须 HTTPS | `env/server-schema.ts` 直接 `throw` |
| 生产必须有 `DEPLOYMENT_ENV`/`AUTH_APP`/`APP_ORIGIN`/`BACKEND_INTERNAL_URL`/`DEPLOYMENT_ID` | 同上 |
| token 不得写入 `localStorage` | 会话由服务端维护 |
| 鉴权不得下放到 `proxy.ts` | 代码注释明示：鉴权绝不在此；最终授权在 Backend |
| 非安全方法必须带 `X-CSRF-Token` | 后端拒绝 |
| `BACKEND_INTERNAL_URL` 只能在 server-only 模块用 | 泄露内部地址 |
| 去别的应用的链接只在 `app/lib/cross-app/` 拼，要去的页面登记在 `destinations.ts`；链接里不带身份、令牌、回去的地址 | 登记时就报错；规则见后端 `app/domain/cross_app.py` |
| 「回到原处」的地址只用后端给的（`/api/web/v1/cross-app/origin`），不从地址栏里取 | 别人伪造链接就能把用户带到别处 |

## 三件套

```bash
cd app
corepack pnpm install --frozen-lockfile
corepack pnpm check          # typecheck + lint + i18n + test + build
corepack pnpm dev
```

## 预览

不连后端看页面：`cd app && pnpm preview`，打开终端里打印的 `/__preview`。说明在 `app/preview/README.md`。

| 规则 | 原因 |
| --- | --- |
| 网页端的代码里不写预览的分支 | 预览是网页端之外的一个进程，它顶替的是后端 |
| 样例不手写、不手改 | `app/preview/fixtures/` 是从真的后端录下来的。要改就改后端的录制脚本（后端 `tests/test_preview_fixtures.py`）重录 |
| 页面要了、样例里没有的请求 | 预览的终端与目录页会列出来。去后端的录制脚本里补上，重录 |

## 动手前

1. 读对应后端路由（`../tpl-backend/app/app/interfaces/`）确认参数与响应结构
2. 契约以后端 DTO 与 `contracts/` 下的 zod 为准，**不维护手写的平行契约**
3. 关键页面覆盖 loading / error / empty / success 四态
4. 改 `next.config.ts` 的构建相关配置时同步检查 `../mybuild/Dockerfile`
