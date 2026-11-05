#!/usr/bin/env bash
# Falha (exit 1) se o secret PROJECT_TOKEN (env PROJECT_TOKEN) estiver vazio. Nunca imprime o valor.
set -euo pipefail
if [ -z "${PROJECT_TOKEN:-}" ]; then
  echo "::error::Secret PROJECT_TOKEN ausente ou vazio. Crie um PAT (classic: project + repo; fine-grained: Resource owner = a ORGANIZAÇÃO, repo Metadata/Pull requests/Issues read + org Projects read/write). Em org com SAML SSO, autorize o PAT para a org (Configure SSO > Authorize). Salve como secret do repositório."
  exit 1
fi
echo "PROJECT_TOKEN presente"
