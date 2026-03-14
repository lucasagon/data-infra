# Arquitetura: Uptime Kuma

**Versão:** Uptime Kuma latest
**Imagem Docker:** `louislam/uptime-kuma:latest`
**Data de implantação:** 2026-03-13

---

## Visão Geral

O Uptime Kuma é o sistema de monitoramento de disponibilidade da stack. Verifica periodicamente se os serviços estão respondendo e exibe um status público acessível via browser.

```
Uptime Kuma:3001
      │
      ├── monitora → n8n:5678
      ├── monitora → metabase:3000
      ├── monitora → cloudbeaver:8978
      ├── monitora → pgbouncer:6432 (TCP)
      ├── monitora → postgres:5432 (TCP)
      └── expõe → página de status pública
```

---

## Acesso ao Docker

O Uptime Kuma monta o socket do Docker para monitorar containers diretamente:

```yaml
volumes:
  - uptime_kuma_data:/app/data
  - /var/run/docker.sock:/var/run/docker.sock
```

Isso permite criar monitores do tipo **Docker Container**, que verificam o status do container além do endpoint HTTP.

---

## Porta

| Porta | Função |
|---|---|
| `3001` | Interface web + página de status pública |

---

## Persistência

| Volume | Conteúdo |
|---|---|
| `uptime_kuma_data` | Monitores configurados, histórico de uptime, alertas |

---

## Tipos de monitoramento suportados

| Tipo | Exemplo de uso |
|---|---|
| HTTP/HTTPS | Verificar endpoint de saúde (`/api/health`) |
| TCP Port | Verificar porta do PgBouncer ou PostgreSQL |
| Docker Container | Verificar se container está `running` |
| Ping | Verificar conectividade de host |

---

## Referências

- [Uptime Kuma GitHub](https://github.com/louislam/uptime-kuma)
- [Runbook: Uptime Kuma](../runbooks/uptime-kuma.md)
