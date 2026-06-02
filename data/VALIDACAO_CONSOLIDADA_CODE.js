/**
 * NÓ CODE: Validação Consolidada
 * Substitui os 28 nós IF anteriores
 *
 * Input: Item do loop com dados do RunRun
 * Output: Mesmo item com objeto 'validacao_resultado' adicionado
 *
 * @returns {Object} item com validacao_resultado
 */

// ===== VALIDAÇÃO CONSOLIDADA DE CAMPOS =====
const errors = [];

// 1. Validar campos obrigatórios vazios
const requiredFields = {
  'data_pagamento': 'Data de Pagamento',
  'data_previsao_pagamento': 'Data Previsão Pagamento',
  'data_entrega_desejada': 'Data Entrega Desejada'
};

for (const [field, label] of Object.entries(requiredFields)) {
  const value = $json[field];
  if (!value || value.toString().trim() === '') {
    errors.push(`PENDENCIAS INTEGRAÇÃO: Falta ${label}`);
  }
}

// 2. Validar forma de pagamento
if ($json.forma_pagamento && $json.forma_pagamento !== 'avista') {
  errors.push('forma de pagamento incompatível');
}

// 3. Validar presença de mensagens de erro nas tags
const tagsToCheck = [
  'PENDENCIAS INTEGRAÇÃO: Falta de TAG PAGO',
  'forma de pagamento incompatível',
  'PENDENCIAS INTEGRAÇÃO: Falta Data de Pagamento',
  'PENDENCIAS INTEGRAÇÃO: Falta Data Previsao Pgto.',
  'PENDENCIAS INTEGRAÇÃO: Conta Corrente não encontrada no Omie',
  'PENDENCIAS INTEGRAÇÃO: Falta OS',
  'PENDENCIAS INTEGRAÇÃO: OS possui #',
  'PENDENCIAS INTEGRAÇÃO: Campo Valor Total em branco',
  'PENDENCIAS INTEGRAÇÃO: Projeto não localizado no Omie',
  'PENDENCIAS INTEGRAÇÃO: Forma de pagamento não localizada no Omie',
  'PENDENCIAS INTEGRAÇÃO: Falta Data de Entrega Desejada'
];

const tags = $json.tags || '';
for (const errorTag of tagsToCheck) {
  if (tags.includes(errorTag)) {
    // Só adicionar se ainda não estiver
    if (!errors.includes(errorTag)) {
      errors.push(errorTag);
    }
  }
}

// 4. Retornar com resultado da validação
return {
  ...item,
  validacao_resultado: {
    tem_erros: errors.length > 0,
    erros: errors,
    quantidade_erros: errors.length,
    status: errors.length === 0 ? 'OK' : 'ERRO'
  }
};

/**
 * EXEMPLOS DE OUTPUT:
 *
 * Caso 1 - Sem erros (todos os campos OK):
 * {
 *   "validacao_resultado": {
 *     "tem_erros": false,
 *     "erros": [],
 *     "quantidade_erros": 0,
 *     "status": "OK"
 *   }
 * }
 *
 * Caso 2 - Com erros (campo vazio + tag de erro):
 * {
 *   "validacao_resultado": {
 *     "tem_erros": true,
 *     "erros": [
 *       "PENDENCIAS INTEGRAÇÃO: Falta Data de Pagamento",
 *       "PENDENCIAS INTEGRAÇÃO: Forma de pagamento não localizada no Omie"
 *     ],
 *     "quantidade_erros": 2,
 *     "status": "ERRO"
 *   }
 * }
 *
 * O IF node seguinte verifica:
 * if (validacao_resultado.tem_erros == false) → PROSSEGUIR
 * else → PARAR E RETORNAR ERROS
 */
