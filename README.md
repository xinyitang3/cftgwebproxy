README

```markdown
# Cloudflare Telegram Web Proxy 三件套

> ⭐ **如果觉得好用，点个 Star 支持一下～**

基于 **Cloudflare Pages** + **Worker** + **DNS 自动解析** 的 Telegram Web Proxy 代理方案。主程序运行于 Pages 规避 Worker 直接代理易触发的 1101/522 错误，Worker 仅作转发层并承接 Pages 无法路由的优选域名，配合 `domain-dns.js` 自动将优选 IP 写入 DNS A 记录，实现高可用接入。

**核心特性**：Pages 主程序与 Worker 转发层分离，请求额度独立计算；支持 Worker 路由绑定优选域名；`domain-dns.js` 定时同步优选 IP 至 DNS，无需手动更新。

---

### 快速导航

- [我要部署](https://github.com#-部署步骤)（三件套逐项配置）
- [我要看链路](https://github.com#-最终链路)（数据流向）
- [分开部署的原因](https://github.com#-分开部署的原因)
- ❓ [常见问题](https://github.com#-常见问题)

---

## ✨ 架构与功能特性

| 文件 | 部署位置 | 核心作用 |
|---|---|---|
| `telegram_webproxy.js` | **Pages** | Telegram Web Proxy 主程序，规避 Worker 直接代理易触发的 1101/522 |
| `webproxy-relay.js` | **Worker** | 转发层，降低 1101/522 风险，并让优选域名通过 Worker 路由接入 |
| `domain-dns.js` | **Worker** | 定时从优选 IP API 拉取 IP，写入 DNS A 记录 |

> **注意**：`webproxy-relay.js` 的 `SECRET` 必须与 `telegram_webproxy.js` 完全一致，包括 `dd` 前缀（如有）。

---

## 🚀 部署步骤

### 1. `telegram_webproxy.js`：Telegram Web Proxy 主程序

**部署到 Pages**，建议单独账号。

环境变量均用**密钥方式**：

- `SECRET`：32 位小写十六进制（0-9a-f），推荐 `openssl rand -hex 16` 生成。
- `BOOT`：建议 ≥16 位随机字符串，推荐 `openssl rand -hex 24` 生成。
- `SECRET` 支持 `dd` 前缀：启用 MTProxy 随机填充（Random Padding），随机化包长以降低流量特征、增强抗 DPI。

**来源**：https://github.com/ToiCF/CF-Workers-TGProxy  
**作者**：Alexandre Kojève (https://t.me/Alexandre_Kojeve)

---

### 2. `webproxy-relay.js`：Worker 转发层

**部署到 Worker**，建议单独账号。

作用：转发到 Pages 上的 Telegram Web Proxy 主程序。

环境变量用**密钥方式**：

- `SECRET`：必须和 Telegram Web Proxy 主程序的 `SECRET` 完全一致。
- 代码中的 `TARGET_HOST` 填 **Pages 上的 Telegram Web Proxy 主程序域名**（只填域名，不带 `https://` 和路径）。

**用 Worker 路由方式接入你的优选域名**：Worker 路由支持根域名和通配子域名，可按实际需要添加：

- `你的优选域名/*`：对应 `@` 根域名；
- `*.你的优选域名/*`：对应 `*` 通配子域名。

> ⚠️ **注意**：你的优选域名所在的 Zone 必须与该 Worker 同一个 Cloudflare 账号，否则无法添加路由。

---

### 3. `domain-dns.js`：优选 IP 自动 DNS 解析

**部署到 Worker**，账号单独/共用。

**修改代码**：

- `IP_SOURCE_URL`：填你的优选 IP API 地址；返回文本每行 `IP:Port`（可带注释）。
- `你的优选域名`：填你的实际优选域名；建议用编辑器“全局替换”，避免因 `.` 号而改错。

**环境变量**：

- `CF_API_TOKEN`：**密钥方式**，需有你的优选域名 Zone DNS 编辑权限。
- `CF_ZONE_ID`：**文本方式**，填你的优选域名 Zone ID。

**添加 Cron 触发器**，自动把 API 中端口为 `443` 的 IP 写入优选域名的 A 记录，实现自动优选。

`RECORD_NAMES` 中的 `'你的优选域名'` 和 `'*.你的优选域名'` 会分别生成 `@` 根域名和 `*` 通配子域名的 A 记录。

---

## 🔗 最终链路

```
Telegram 客户端 → 你的优选域名 → Worker 转发层（webproxy-relay.js）→ Pages 主程序（telegram_webproxy.js）→ Telegram 服务器（KWS/DC）
```

**Telegram 客户端代理填写**：服务器 = 你的优选域名，密钥 = `SECRET`（与主程序/转发层一致）。

---

## 💡 分开部署的原因

- **Pages 主程序**：避开 Worker 直接代理易触发的 1101/522；Pages 和 Worker 的请求额度分开计算。
- **Worker 转发层**：仅作转发，降低 1101/522 风险，并让你的优选域名能通过 Worker 路由接入。

---

## ❓ 常见问题

**Q：`webproxy-relay.js` 的 `SECRET` 为什么必须和主程序一致？**  
A：转发层会对传入请求进行 HMAC 签名校验，`SECRET` 不一致会导致校验失败，页面返回 404。

**Q：`dd` 前缀什么时候需要加？**  
A：`dd` 前缀用于启用 MTProxy 随机填充，在部分运营商对 MTProto 流量干扰较强时可绕过干扰；无特殊干扰可不加，但转发层和主程序必须保持一致。

**Q：`domain-dns.js` 的 Cron 表达式怎么写？**  
A：例如 `*/30 * * * *` 表示每 30 分钟同步一次优选 IP。IP 源返回空列表时程序会自动跳过同步，不会误删现有记录。
```
