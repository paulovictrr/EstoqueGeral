# Meu Estoque

Site estático para controle pessoal de estoque, preparado para GitHub Pages.

## Publicar no GitHub Pages

1. Crie um repositório **público** no GitHub.
2. Envie para a raiz do repositório os arquivos desta pasta (`index.html` e `.nojekyll`).
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**, selecione `main` e a pasta `/ (root)`, e salve.
5. Aguarde o GitHub informar o endereço do site na seção Pages.

Os dados dos produtos ficam no `localStorage` do navegador, neste aparelho e neste endereço do site. Eles não são enviados ao GitHub nem sincronizados entre aparelhos. Use a exportação CSV para backup.
