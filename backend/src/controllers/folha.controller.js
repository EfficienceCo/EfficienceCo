import { gerarTemplateFolha } from "../services/folha.service.js";

export async function baixarTemplate(req, res) {
  console.log("[folha.controller] Gerando template de folha de pagamento");

  try {
    const buffer = await gerarTemplateFolha();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=modelo_folha_pagamento.xlsx",
    );

    return res.status(200).send(buffer);
  } catch (err) {
    console.error("[folha.controller] Erro ao gerar template:", err.message);
    return res.status(500).json({ erro: "Erro ao gerar template da folha" });
  }
}
