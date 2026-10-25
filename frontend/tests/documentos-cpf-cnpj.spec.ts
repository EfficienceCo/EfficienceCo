import { expect, test } from '@playwright/test';

import { validarCnpj, validarCpf } from '../src/lib/esocial-tabelas.js';

// Mesma bateria de backend/tests/comum.util.test.js e do agente (#658): os três têm que concordar.
test.describe('Validador de CPF/CNPJ pelo dígito verificador (#658)', () => {
  const cpfs: [string, boolean][] = [
    ['52998224725', true],
    ['529.982.247-25', true],
    ['123.456.789-09', true],
    ['52998224724', false],
    ['52998224735', false],
    ['123.456.789-00', false],
    ['11111111111', false],
    ['1234567890', false],
  ];
  const cnpjs: [string, boolean][] = [
    ['12345678000195', true],
    ['11222333000181', true],
    ['12345678000190', false],
    ['12345678000185', false],
    ['11111111111111', false],
    ['1234567800019', false],
  ];

  for (const [valor, esperado] of cpfs) {
    test(`CPF ${valor} → ${esperado}`, () => {
      expect(validarCpf(valor)).toBe(esperado);
    });
  }

  for (const [valor, esperado] of cnpjs) {
    test(`CNPJ ${valor} → ${esperado}`, () => {
      expect(validarCnpj(valor)).toBe(esperado);
    });
  }
});
