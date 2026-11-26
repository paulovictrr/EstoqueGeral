# Estoque Geral — GitHub Pages

Arquivos do site com acesso por conta e sincronização Supabase:

- `index.html`
- `access-cloud.js`
- `icone-estoque.png`
- `.nojekyll`

Envie todos esses arquivos para a raiz do repositório `EstoqueGeral` no GitHub. O `access-cloud.js` precisa ficar ao lado do `index.html`.

## Antes do primeiro acesso

Antes de enviar esta versão, execute os arquivos SQL separados no **SQL Editor** do mesmo projeto Supabase, nesta ordem: `supabase-acesso-empresa.sql` (se ainda não executou) e `supabase-administracao-empresa.sql`. Eles habilitam o acesso por senha e a administração de empresas. Não envie os arquivos SQL ao GitHub.

No Supabase, em **Authentication → URL Configuration**, use:

- Site URL: `https://paulovictrr.github.io/EstoqueGeral/`
- Redirect URL: `https://paulovictrr.github.io/EstoqueGeral/**`

Na primeira abertura, crie uma conta com primeiro nome, segundo nome, e-mail e senha; confirme o e-mail e entre. A primeira conta pode criar a empresa **Shalon**. Se houver dados no navegador onde a conta foi criada, o sistema pergunta se deseja importá-los. Pessoas da equipe criam e confirmam suas próprias contas e podem escolher uma empresa existente na tela seguinte. A tela de login também inclui recuperação de senha por e-mail.

Administradores podem editar o nome da empresa, desativá-la, reativá-la ou excluí-la. Antes de excluir, o sistema oferece baixar um backup completo em JSON ou continuar sem backup; a exclusão pede confirmação digitada e apaga permanentemente os dados daquela empresa. Os arquivos CSV são exportações de tabelas (produtos, fornecedores e movimentações) para consulta e planilhas; não são backups completos e a importação CSV apenas acrescenta registros, ignorando duplicados. Use o arquivo **backup completo `.json`** para recuperação integral: em Administração, baixe o JSON e use “Restaurar backup completo” na mesma empresa. A restauração substitui os dados atuais e exige confirmar digitando o nome da empresa; usuários, membros e senha de acesso são mantidos. Se a empresa foi excluída, crie-a novamente a partir do JSON, defina uma nova senha e adicione os membros outra vez. Guarde o JSON com cuidado porque pode conter dados pessoais e comerciais. O administrador define a senha de acesso da empresa no botão com o nome dela. Uma nova pessoa entra com seu próprio e-mail e senha, escolhe **Entrar em outra empresa** e informa o nome e a senha compartilhada recebida do administrador. Também é possível adicioná-la diretamente por e-mail, sem usar a senha compartilhada.

A aba **Notificações** reúne novos produtos cadastrados e entradas, saídas e ajustes de estoque, em ordem do mais recente para o mais antigo. Na saída, escolha um destino sugerido ou selecione **Outro** para informar um destino diferente.

As alterações são sincronizadas para a empresa. Se alguém atualizar os dados ao mesmo tempo, o sistema avisa e permite carregar a versão mais recente.
