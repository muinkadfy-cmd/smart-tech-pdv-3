# QZ Tray Worker de Assinatura

Este projeto agora inclui um Worker pronto para assinar mensagens do `QZ Tray`.

## Arquivos

- `qz-sign-worker/wrangler.toml`
- `qz-sign-worker/src/index.ts`

## Rotas do Worker

- `GET/POST /sign`
  - recebe `request`
  - devolve a assinatura em texto puro
- `GET /cert`
  - devolve o certificado público em PEM

## Secrets e Vars no Cloudflare

No diretório `qz-sign-worker`, publique estes valores:

### Secret obrigatório

```powershell
npx wrangler secret put QZ_PRIVATE_KEY
```

Cole o conteúdo completo do arquivo `smarttech-qz-private-key.pem`.

### Secret recomendado

```powershell
npx wrangler secret put QZ_CERTIFICATE
```

Cole o conteúdo completo do arquivo `smarttech-qz-certificate.pem`.

### Var recomendada

Defina no `wrangler.toml` ou no dashboard:

- `QZ_ALLOWED_ORIGIN=https://smart-tech-pdv-3.pages.dev`
- `QZ_SIGNATURE_ALGORITHM=SHA-512`

## Deploy do Worker

No terminal:

```powershell
cd qz-sign-worker
npx wrangler deploy
```

Depois do deploy, você terá algo assim:

- `https://smarttech-qz-sign.<seu-subdominio>.workers.dev/sign`
- `https://smarttech-qz-sign.<seu-subdominio>.workers.dev/cert`

## Variáveis no Cloudflare Pages

No projeto web, configure:

- `VITE_QZ_SIGN_URL=https://smarttech-qz-sign.<seu-subdominio>.workers.dev/sign`
- `VITE_QZ_CERT_URL=https://smarttech-qz-sign.<seu-subdominio>.workers.dev/cert`
- `VITE_QZ_SIGNATURE_ALGORITHM=SHA512`

## Benefício para usuários

Quando o site estiver publicado com essas variáveis e o `QZ Tray` instalado:

- todos os usuários dessa mesma URL passam a usar o modo confiável
- a chance de prompts do `QZ Tray` diminui bastante
- o sistema fica mais próximo de impressão silenciosa profissional

## Observação importante

Nunca coloque `QZ_PRIVATE_KEY` em `VITE_*` ou no frontend.
Ela deve ficar apenas no Worker como secret.
