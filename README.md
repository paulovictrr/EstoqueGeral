# Estoque Geral

Sistema web simples para organizar estoque, almoxarifado, fornecedores e movimentações.

## Funcionalidades

- Produtos e lotes com fornecedor, quantidade, preço, validade e classificação.
- Lotes com saldo podem ser mesclados quando produto, classificação, unidade, peso, fornecedor, preço e vencimento coincidirem. O saldo é somado ao lote escolhido, e o lote de origem é arquivado com o histórico preservado.
- Lotes sem saldo podem ser arquivados e restaurados. Os filtros de Estoque e Almoxarifado permitem visualizar ativos, arquivados ou todos.
- Entradas somam a quantidade do lote quando fornecedor, preço e vencimento coincidem; diferenças criam outro lote. Saídas para produção descontam do lote escolhido e atualizam o saldo.
- Filtros por área, fornecedor, departamento, seção e categoria.
- Relatórios exportáveis em Excel (`.xlsx`) e PDF.
- Backup e restauração de produtos, fornecedores e movimentações em CSV; o backup de produtos também preserva o status de arquivamento.
- Interface adaptada para celular, com abas principais e menu **Mais**. A aba **Sobre** reúne aviso de direitos autorais, termos de uso e política de privacidade.

## Backups e relatórios

- **Backup CSV** baixa arquivos de produtos, fornecedores e movimentações, com UTF-8 e separador adequado ao Excel em português. Selecione esses CSVs juntos em **Importar CSV** para restaurar.
- Na aba **Relatórios**, filtre por área, departamento, seção, categoria e fornecedor, e escolha **Excel (.xlsx)** ou **PDF**. Na aba **Fornecedores**, gere relatórios PDF/Excel com os filtros de fornecedores aplicados.
- O PDF abre a tela de impressão do navegador; escolha **Salvar como PDF**.
- A exportação Excel carrega a biblioteca xlsx-js-style da internet para aplicar a formatação visual. Os demais recursos continuam disponíveis mesmo se essa biblioteca não carregar.

## Onde ficam os dados

Os dados ficam no armazenamento local do navegador e aparelho usados. O GitHub Pages hospeda o sistema, mas não sincroniza os cadastros entre aparelhos. Para transferir dados, exporte os CSVs no aparelho atual e importe-os no outro. Limpar os dados do navegador pode apagar os cadastros locais.

