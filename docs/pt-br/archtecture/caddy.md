# Arquitetura: Caddy como Reverse Proxy

**Versão:** Caddy latest
**Imagem Docker:** `caddy:latest`
**Data de implantação:** 2026-03-13

---

## Visão Geral

O Caddy atua como reverse proxy e termina TLS para todos os serviços expostos publicamente. Gerencia certificados SSL automaticamente via Let's Encrypt (ACME), sem necessidade de configuração manual.

```
Internet (80/443)
      │
      ▼
  ┌───────────────────────────────────────┐
  │  Caddy                                │
  │  ├── <seu-dominio>       → n8n:5678   │
  │  ├── metabase.<dominio>  → metabase:3000 │
  │  └── ...                              │
  └───────────────────────────────────────┘
      │
      ▼
  app_network (Docker interno)
```

---

## Componentes

| Arquivo/Volume | Caminho no host | Função |
|---|---|---|
| `Caddyfile` | `/opt/caddy/Caddyfile` | Configuração de rotas e proxies |
| `caddy_caddy_data` | volume externo | Certificados TLS armazenados |
| `caddy_caddy_config` | volume externo | Configuração gerada automaticamente |

---

## Portas

| Porta | Função |
|---|---|
| `80` | HTTP — redirecionamento para HTTPS + desafio ACME |
| `443` | HTTPS — tráfego TLS |

> A porta **80 deve estar acessível publicamente** no servidor para que o Let's Encrypt possa validar os domínios via desafio HTTP-01.

---

## TLS Automático

O Caddy obtém e renova certificados automaticamente:

1. Primeira requisição ao domínio → Caddy solicita certificado ao Let's Encrypt
2. Let's Encrypt faz requisição HTTP ao `/.well-known/acme-challenge/` na porta 80
3. Caddy responde → certificado emitido
4. Renovação automática antes do vencimento (60 dias antes)

Não há configuração adicional necessária. Os certificados ficam no volume `caddy_caddy_data`.

---

## Estrutura do Caddyfile

```caddyfile
<seu-dominio> {
    reverse_proxy n8n:5678
}

metabase.<seu-dominio> {
    reverse_proxy metabase:3000
}
```

O Caddy referencia os serviços pelo nome do container na rede Docker (`n8n`, `metabase`, etc.).

---

## Recarregar configuração sem downtime

```bash
# Validar antes de aplicar
docker exec caddy caddy validate --config /etc/caddy/Caddyfile

# Recarregar sem derrubar o container
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Sinais de problema

| Sintoma | Causa provável |
|---|---|
| Certificado não emitido | Porta 80 bloqueada no firewall |
| Erro 502 Bad Gateway | Container de destino down ou porta errada |
| `Caddyfile` inválido | Erro de sintaxe — sempre validar antes de recarregar |

---

## Referências

- [Caddy Documentation](https://caddyserver.com/docs/)
- [Runbook: Caddy](../runbooks/caddy.md)
