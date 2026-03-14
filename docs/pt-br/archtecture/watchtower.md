# Arquitetura: Watchtower

**Versão:** Watchtower latest
**Imagem Docker:** `containrrr/watchtower`
**Data de implantação:** 2026-03-13

---

## Visão Geral

O Watchtower monitora os containers em execução e atualiza automaticamente suas imagens quando uma nova versão é publicada no registry. Remove imagens antigas após a atualização.

```
Watchtower
      │
      ├── /var/run/docker.sock  ←── monitora containers
      │
      ├── verifica registry a cada 300s (5 min)
      │
      └── se nova imagem → pull → recriar container → remover imagem antiga
```

---

## Configuração

| Parâmetro | Valor | Descrição |
|---|---|---|
| `--cleanup` | flag | Remove imagens antigas após atualizar |
| `--interval 300` | 300 segundos | Frequência de verificação |
| `DOCKER_API_VERSION` | `1.44` | Versão da API Docker usada |

---

## Comportamento

1. A cada 5 minutos, verifica se há nova versão das imagens dos containers em execução
2. Se houver, faz `docker pull` da nova imagem
3. Recria o container com a nova imagem (mesmo comando/configuração)
4. Remove a imagem antiga (`--cleanup`)

---

## Considerações em produção

> O Watchtower atualiza imagens automaticamente sem aviso. Uma nova versão pode introduzir breaking changes.

Estratégias para mitigar:
- Usar tags fixas de versão nas imagens críticas (ex: `postgres:16` em vez de `postgres:latest`) — o Watchtower só atualiza se a tag mudar
- Configurar notificações (Slack, email) para ser avisado das atualizações realizadas
- Excluir containers específicos com a label `com.centurylinklabs.watchtower.enable=false`

---

## Excluir um container do Watchtower

```yaml
# No docker-compose.yml do serviço
labels:
  - "com.centurylinklabs.watchtower.enable=false"
```

---

## Referências

- [Watchtower Documentation](https://containrrr.dev/watchtower/)
- [Runbook: Watchtower](../runbooks/watchtower.md)
