# Arquitetura: Portainer

**Versão:** Portainer CE latest
**Imagem Docker:** `portainer/portainer-ce:latest`
**Data de implantação:** 2026-03-13

---

## Visão Geral

O Portainer é a interface web de gestão de containers Docker. Permite visualizar, iniciar, parar e inspecionar containers, volumes, redes e imagens sem precisar usar o terminal.

```
Usuário (browser)
      │
      ▼
  Portainer:9000 (HTTP) / :9443 (HTTPS)
      │
      ▼
  /var/run/docker.sock  ←── acesso direto ao Docker daemon
```

---

## Acesso ao Docker

O Portainer monta o socket do Docker para gerenciar o host local:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - portainer_data:/data
```

> Montar `/var/run/docker.sock` concede ao Portainer controle total sobre o Docker do host. Proteja o acesso à interface com senha forte.

---

## Portas

| Porta | Protocolo | Função |
|---|---|---|
| `9000` | HTTP | Interface web |
| `9443` | HTTPS | Interface web (TLS gerenciado pelo Portainer) |

---

## Persistência

| Volume | Conteúdo |
|---|---|
| `portainer_data` | Configurações, usuários, endpoints cadastrados |

---

## Uso típico

- Visualizar logs de containers sem abrir terminal
- Recriar containers com novo `.env` ou imagem
- Gerenciar volumes e redes
- Inspecionar variáveis de ambiente de containers em execução

---

## Referências

- [Portainer Documentation](https://docs.portainer.io/)
- [Runbook: Portainer](../runbooks/portainer.md)
