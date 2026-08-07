-- Adiciona a coluna 'prioridade' do tipo inteiro
ALTER TABLE regras 
ADD COLUMN versao INTEGER DEFAULT 1;