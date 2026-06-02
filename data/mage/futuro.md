# Futuro (Mage)

## Melhorias futuras priorizadas

1. Implementar carga incremental no pipeline `omie_movimentacoes_financeiras_mage`.
- Objetivo: evitar varredura completa da API em todas as execuções.
- Situação atual: execução full-load com upsert (sem duplicação), porém custo/tempo altos.
- Resultado esperado: buscar apenas alterações novas/atualizadas desde a última execução (watermark), reduzindo tempo de processamento.

2. Definir estratégia de watermark para movimentações financeiras.
- Opções candidatas: data de alteração, data de pagamento/baixa, ou combinação com janela de segurança para reprocessamento.

3. Definir política de reconciliação.
- Garantir consistência para registros alterados retroativamente (late updates).

4. Planejar rollout incremental para demais endpoints Omie, quando necessário.
- Aplicar padrão incremental apenas onde houver ganho real de performance/custo.
