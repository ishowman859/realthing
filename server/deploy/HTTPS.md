# API를 HTTPS로 노출 (GitHub Pages 연동용)

GitHub Pages는 **HTTPS**만 쓰므로, 브라우저에서 `fetch`할 백엔드도 **HTTPS**여야 합니다.

## 1. DNS

도메인 관리 패널에서 (예: `veritychains.com`):

| 유형 | 이름 | 값 |
|------|------|-----|
| **A** | `api` | API 서버 공인 IP (예: 백엔드가 돌아가는 VPS IP) |

프로파게이션까지 수 분~수 시간 걸릴 수 있습니다.

## 2. Caddy로 TLS 종료 (권장)

API 프로세스는 그대로 `127.0.0.1:4000` 등에서 listen하고, **443** 에서 Caddy가 받아 프록시합니다.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

`Caddyfile.api.example` 을 참고해 `/etc/caddy/Caddyfile` (또는 include)에 넣고:

```bash
sudo systemctl reload caddy
```

Let’s Encrypt 인증서가 자동으로 발급됩니다.

## 3. GitHub

저장소 **Actions → Variables → `VERITY_PAGES_API`** = `https://api.도메인` (슬래시 없음)  
→ Pages 워크플로가 검증 `index.html` 메타에 주입합니다.

DNS가 아직 없으면 Pages에서 API 호출이 실패합니다. `nslookup api.도메인` 으로 확인 후 배포하세요.
