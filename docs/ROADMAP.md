# Roadmap — KOS

Levantamento feito em 08/09/2026, a partir de uma revisão do código e dos bugs
encontrados em uso real nas versões 1.0.0 a 1.4.1.

Ordem por **risco para o usuário**, não por esforço.

---

## P0 — Essenciais

### 1. Backup e restauração da biblioteca
**Status:** feito (v1.5.0)

Toda a biblioteca (arquivos, progresso, marcadores, anotações) vive apenas no
IndexedDB do app. Desinstalar o app, usar "limpar dados" no Android ou trocar de
celular apaga tudo, sem recuperação. Não existe exportar/importar.

O risco já foi tocado na prática: a migração para o APK assinado (v1.0.0) exigiu
desinstalar a versão anterior.

- [x] Exportar biblioteca para um `.zip` (metadados + arquivos + anotações)
- [x] Compartilhar o arquivo pelo Android (Drive, e-mail, etc.) — um backup que
      só existe no aparelho não protege contra perder o aparelho
- [x] Importar/restaurar, sem apagar o que já existe (merge por id de livro,
      mantendo a cópia lida mais recentemente)
- [ ] *Futuro:* exportação em streaming — hoje o zip inteiro passa pela memória,
      o que limita bibliotecas muito grandes

### 2. Voltar exatamente onde parou
**Status:** pendente

`updateBookProgress` grava apenas um número. Para EPUB esse número é um índice
aproximado (~1000 caracteres por ponto), então reabrir o livro leva para *perto*
da posição, não para ela. No modo Transcrito a subpágina não é salva — a leitura
sempre recomeça no topo do capítulo.

- [ ] Salvar o CFI do EPUB (coordenada exata) além do índice
- [ ] Persistir a subpágina atual no modo Transcrito
- [ ] Restaurar a posição exata ao reabrir

### 3. Testes e publicação automatizada
**Status:** parcial (v1.5.0)

Não há teste nenhum nem CI. Quase toda correção da 1.0.0 até aqui veio de bug
encontrado em produção, no celular. Além disso nada garante que o `versionName`
do `build.gradle` bate com a tag do Git — se divergirem, a autoatualização ou não
dispara nunca, ou fica pedindo update para sempre.

- [x] Vitest configurado (`npm test`), 26 testes cobrindo comparação de versão,
      parsing de link do Drive e o ciclo completo de backup/restauração
- [x] GitHub Action rodando lint + testes + build em cada push e PR
- [x] Verificação no CI de que `versionName` == tag
- [ ] Testes da paginação de reflow (precisa de ambiente com layout real —
      jsdom não calcula altura de linha, então exigiria Playwright)
- [ ] Build e publicação do APK assinado pelo próprio CI (hoje é local; exige
      colocar a keystore nos secrets do repositório)

---

## P1 — Ganhos rápidos

### 4. PDFs são salvos em duplicado
**Status:** feito (v1.5.0)

`saveBook` gravava o mesmo arquivo em `kos_file_<id>` **e** `kos_pdf_<id>`,
dobrando o espaço ocupado por cada PDF. A leitura mantém o fallback para
`kos_pdf_` por causa dos livros já salvos assim.

### 5. Marcadores e anotações apontam para números instáveis
**Status:** pendente

São indexados por número de página (`kos_annot_<id>_<pagina>`). Em EPUB esse
número é derivado do índice de localizações, que é recalculado a cada abertura —
um marcador pode silenciosamente passar a apontar para outro trecho. Em PDF
(páginas reais) não há problema.

- [ ] Ancorar marcadores/anotações de EPUB em CFI, não em número de página

### 6. Erros invisíveis no celular
**Status:** pendente

Falhas usam `alert()` (dialog nativo agressivo) ou apenas `console.error`, que
ninguém vê em um celular sem devtools. Foi o que dificultou diagnosticar as
falhas do Google Drive.

- [ ] Trocar `alert()` por toast com a mensagem real do erro
- [ ] Tornar visíveis as falhas hoje engolidas (checagem de update, TOC, etc.)

### 7. Escrita concorrente pode perder dados
**Status:** pendente

`updateBookProgress` e `toggleBookmark` fazem ler-modificar-gravar no mesmo
registro (`kos_books_metadata`) sem trava, e o progresso é gravado a cada virada
de página. Duas escritas simultâneas podem se sobrescrever — dá para perder um
marcador criado no momento errado. Além disso, cada atualização de progresso
reescreve o array inteiro de livros.

- [ ] Serializar as escritas (fila) ou separar progresso do metadado do livro

---

## P2 — Estrutural

### 8. `ReaderView.tsx` com 1256 linhas
**Status:** pendente

O `CLAUDE.md` do projeto pede arquivos abaixo de 500 linhas. Esse arquivo acumula
render de PDF, render de EPUB, paginação por colunas, gestos, barra superior e
modais.

Não é preciosismo: o bug da paginação (v1.4.1) passou batido em duas releases
porque o efeito que media a altura estava a ~400 linhas do JSX que ele media.

- [ ] Extrair a paginação de reflow para um hook (`useReflowPagination`)
- [ ] Extrair o ciclo de vida do EPUB (`useEpubBook`)
- [ ] Separar a barra/chrome do leitor em componente próprio

### 9. Importação por pasta do Drive é tempo emprestado
**Status:** consciente, sem ação

`fetchPublicFolderFiles` funciona raspando o HTML da página do Drive com regex.
Já quebrou duas vezes (proxies descontinuados, redirecionamento para a versão
mobile). Vai quebrar de novo sem aviso.

O caminho durável é a aba "Minha Conta Google" (OAuth), que usa a API oficial.

- [ ] Tornar a via OAuth a principal e a raspagem apenas um atalho opcional

### 10. Bundle sem divisão de código
**Status:** baixa prioridade

~1 MB de JS + ~1 MB do worker do PDF, sem code splitting. Impacto pequeno num app
nativo (os arquivos são locais), mas afeta o tempo de inicialização.

### 11. Checagem de atualização sem cache
**Status:** baixa prioridade

Consulta a API do GitHub a cada abertura do app, e uma falha é silenciosa
(`console.warn`). O limite sem autenticação é 60 requisições/hora por IP —
suficiente para uso pessoal, mas convém guardar em cache e mostrar a falha.
