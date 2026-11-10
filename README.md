# Estoque Geral

Sistema web simples para organizar produtos do estoque e do almoxarifado, fornecedores e preços de compra.

## Funcionalidades

- Cadastro de produtos com código automático, quantidade, unidade, peso, preços, validade e fornecedor do lote.
- Cálculo da data de vencimento a partir da data de entrada e da validade em dias.
- Cadastro de mais de um fornecedor e preço por produto, para comparar opções de compra.
- Organização por departamento, seção e categoria, com opções separadas para Estoque e Almoxarifado.
- Cadastro de fornecedores com código automático no padrão `F001`.
- Busca e filtros para produtos e fornecedores, além de relatórios filtráveis.
- Exportação e importação de backups CSV. A importação acrescenta registros que ainda não existem e ignora duplicatas.
- Interface adaptada para celular. Os painéis de filtros podem ser recolhidos em **+ Filtros**.

## Publicar no GitHub Pages

1. Coloque `index.html` na raiz do repositório.
2. No GitHub, abra **Settings > Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Escolha a branch `main` e a pasta `/(root)`, depois clique em **Save**.
5. Aguarde a publicação. Para este repositório, o endereço é [https://paulovictrr.github.io/EstoqueGeral/](https://paulovictrr.github.io/EstoqueGeral/).

Quando atualizar o sistema, substitua o `index.html` pela versão nova e faça commit no GitHub. O Pages mantém o mesmo endereço.

## Backup e restauração

- Use **Backup CSV** para exportar os arquivos de produtos e fornecedores.
- Na aba **Fornecedores**, também é possível exportar somente os fornecedores.
- Use **Importar CSV** e selecione os arquivos de backup. Para restaurar um backup completo, selecione os CSVs de produtos e fornecedores juntos.
- A importação acrescenta os registros que não encontrar no sistema e evita duplicar produtos pelo código.

## Onde os dados ficam salvos

Os dados ficam no armazenamento local (`localStorage`) do navegador e aparelho usados. O GitHub Pages hospeda os arquivos do sistema, mas não sincroniza os cadastros entre aparelhos ou navegadores. Para levar os dados a outro aparelho, exporte os CSVs no aparelho atual e importe-os no outro.

Guarde os CSVs de backup em um local seguro. Limpar os dados do navegador pode apagar os cadastros armazenados naquele aparelho.
