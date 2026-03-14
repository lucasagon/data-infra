# Troubleshooting: n8n — Mismatching Encryption Keys

**Data:** 2026-03-13
**Status:** ✅ Resolvido
**Contexto:** Migração do n8n de SQLite para PostgreSQL via PgBouncer

---

## Sintoma

O container `n8n` entrava em crash loop com a seguinte mensagem:

```
Error: Mismatching encryption keys.
The encryption key in the settings file /home/node/.n8n/config
does not match the N8N_ENCRYPTION_KEY env var.
Please make sure both keys match.
```

---

## Causa

O n8n armazena a chave de criptografia no arquivo `/home/node/.n8n/config` no volume persistente. Quando o container sobe pela primeira vez sem `N8N_ENCRYPTION_KEY`, o n8n gera uma chave aleatória e a salva neste arquivo.

Ao definir uma **nova** `N8N_ENCRYPTION_KEY` no `.env` (gerada com `openssl rand -hex 32`), ela diverge da chave já existente no volume — e o n8n rejeita a inicialização por segurança, pois as credenciais dos workflows estão criptografadas com a chave antiga.

```
Volume n8n_n8n_data
└── /home/node/.n8n/
    └── config  ← {"encryptionKey": "chave-original-gerada-no-1o-boot"}

Env var N8N_ENCRYPTION_KEY = "nova-chave-openssl"  ← DIVERGE → CRASH
```

---

## Diagnóstico

```bash
# Ver a mensagem de erro
docker logs n8n --tail 30

# Ler a chave atual armazenada no volume
docker run --rm -v n8n_n8n_data:/data alpine cat /data/config
```

---

## Solução

Usar a chave que **já existe no volume**, não gerar uma nova.

```bash
# 1. Ler a chave do volume
docker run --rm -v n8n_n8n_data:/data alpine cat /data/config
# Copiar o valor de "encryptionKey"

# 2. Colar no .env
nano /root/data/.env
# N8N_ENCRYPTION_KEY=<valor copiado acima>

# 3. Recriar o container
cd /root/data && docker compose up -d --force-recreate n8n

# 4. Confirmar
docker logs n8n --tail 10
# Esperado: "n8n ready on ::, port 5678"
```

---

## Por que NÃO gerar uma nova chave se o volume já existe?

A `N8N_ENCRYPTION_KEY` é usada para criptografar **credenciais dos workflows** (tokens de API, senhas de serviços). Trocando a chave:

- O n8n não consegue decifrar as credenciais antigas
- Todos os workflows que dependem de credenciais param de funcionar
- Não há migração automática — seria necessário reconfigurar tudo manualmente

---

## Quando gerar uma nova chave (instalação limpa)

```bash
# Remover o config existente do volume (⚠️ perde credenciais salvas)
docker run --rm -v n8n_n8n_data:/data alpine rm /data/config

# Gerar nova chave e colocar no .env
openssl rand -hex 32

cd /root/data && docker compose up -d n8n
```

---

## Aprendizados

| # | Aprendizado |
|---|---|
| 1 | Sempre ler a chave existente no volume antes de definir `N8N_ENCRYPTION_KEY` |
| 2 | A `N8N_ENCRYPTION_KEY` é imutável — nunca trocar sem plano de migração de credenciais |
| 3 | O arquivo `/home/node/.n8n/config` é o source of truth da chave — tem precedência sobre o histórico do `.env` |
| 4 | Em migrações (SQLite → PostgreSQL), o volume persiste — a chave no `config` sobrevive à troca de banco |
| 5 | Guardar a `encryptionKey` em local seguro logo no primeiro boot evita este problema |

---

## Referência

- [n8n Docs — Encryption Key](https://docs.n8n.io/hosting/environment-variables/configuration-methods/#encryption-key)
