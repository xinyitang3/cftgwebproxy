# Cloudflare Telegram Web Proxy

[![GitHub stars](https://img.shields.io/github/stars/xinyitang3/cftgwebproxy?style=social)](https://github.com/xinyitang3/cftgwebproxy/stargazers)
[![Platform](https://img.shields.io/badge/Platform-Cloudflare%20Edge-F38020?logo=cloudflare)]()
[![Pages](https://img.shields.io/badge/Pages-Main%20Program-F38020?logo=cloudflare)]()
[![Workers](https://img.shields.io/badge/Workers-Relay%20%7C%20DNS-F38020?logo=cloudflare)]()
[![License](https://img.shields.io/badge/License-MIT-green)]()
[![Last Commit](https://img.shields.io/github/last-commit/xinyitang3/cftgwebproxy?label=Last%20Commit)](https://github.com/xinyitang3/cftgwebproxy/commits)
[![Repo Size](https://img.shields.io/github/repo-size/xinyitang3/cftgwebproxy?label=Repo%20Size)](https://github.com/xinyitang3/cftgwebproxy)
[![Telegram](https://img.shields.io/badge/Telegram-@MiaChatChannel-26A5E4?logo=telegram)](https://t.me/MiaChatChannel)

> ⭐ **如果觉得好用，点个 Star 支持一下～**

基于 **Cloudflare Pages** + **Worker** + **DNS 自动解析** 的 Telegram Web Proxy 代理方案。主程序运行于 Pages 规避 Worker 直接代理易触发的 1101/522 错误，Worker 仅作转发层并承接 Pages 无法路由的优选域名，配合自动 DNS 解析，实现高可用、稳定的接入。

---

### 📍 快速导航
- 🚀 [我要部署](#-部署步骤)
- 🔗 [我要看链路](#-最终链路)
- 💡 [为什么分开部署](#-分开部署的原因)

---

## 🚀 部署步骤

### 1. `telegram_webproxy.js`：Telegram Web Proxy主程序（部署到 Pages，建议单独账号）

环境变量均用**密钥方式**：
- `SECRET`：32 位小写十六进制（0-9a-f），推荐 `openssl rand -hex 16` 生成。
- `BOOT`：建议 ≥16 位随机字符串，推荐 `openssl rand -hex 24` 生成。
- `SECRET` 支持 `dd` 前缀：启用 MTProxy 随机填充（Random Padding），随机化包长以降低流量特征、增强抗 DPI。

> [!IMPORTANT]
> **文件名变更提示**：在 Cloudflare Pages 中部署时，请务必将本文件重命名为 **`_worker.js`** 后再上传至根目录。这是 Pages 识别 Functions 代码的强制要求。

---

### 2. `webproxy-relay.js`：Worker 转发层（部署到 Worker，建议单独账号）

**作用**：转发到 Pages 上的 Telegram Web Proxy主程序。

**修改代码**：
- `TARGET_HOST`：填 Pages 上的 Telegram Web Proxy主程序域名（只填域名，不带 `https://` 和路径）。

环境变量用**密钥方式**：
- `SECRET`：必须和Telegram Web Proxy主程序的 SECRET 完全一致。

用 Worker 路由方式接入你的优选域名：Worker 路由支持根域名和通配子域名，可按实际需要添加：
- `你的优选域名/*`：对应 `@` 根域名；
- `*.你的优选域名/*`：对应 `*` 通配子域名。

> [!WARNING]
> 注意：你的优选域名所在的 Zone 必须与该 Worker 同一个 Cloudflare 账号，否则无法添加路由。

---

### 3. `domain-dns.js`：优选 IP 自动 DNS 解析（部署到 Worker，账号单独/共用）

**修改代码**：
- `IP_SOURCE_URL`：填你的优选 IP API 地址；返回文本每行 `IP:Port`（可带注释）。
- `你的优选域名`：填你的实际优选域名；`RECORD_NAMES` 会分别生成 `@` 根域名和 `*` 通配子域名的 A 记录。

**环境变量**：
- `CF_API_TOKEN`：**密钥方式**，需有你的优选域名 Zone DNS 编辑权限。
- `CF_ZONE_ID`：**文本方式**，填你的优选域名 Zone ID。

**添加 Cron 触发器**，自动把 API 中端口为 `443` 的 IP 写入优选域名的 A 记录，实现自动优选。

---

## 🔗 最终链路

```text
Telegram 客户端 → 你的优选域名 → Worker 转发层（webproxy-relay.js）→ Pages 主程序（telegram_webproxy.js）→ Telegram 服务器（KWS/DC）
```

**Telegram客户端代理填写**：服务器 = 优选域名，密钥 = SECRET（与主程序/转发层一致）。

---

## 💡 分开部署的原因

- **Pages 主程序**：避开 Worker 直接代理易触发的 1101/522；Pages 和 Worker 的请求额度分开计算。
- **Worker 转发层**：仅作转发层降低 1101/522 风险，并让优选域名能通过 Worker 路由接入。

---

## 🙏 致谢

- 主程序与协议逻辑：[ToiCF/CF-Workers-TGProxy](https://github.com/ToiCF/CF-Workers-TGProxy)

---

**许可证**：本项目采用 [MIT License](https://opensource.org/licenses/MIT) 开源。
