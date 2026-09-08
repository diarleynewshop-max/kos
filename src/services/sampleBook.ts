/**
 * Generates a clean, valid PDF 1.4 document containing the KOS User Guide.
 * Allows the user to immediately test the Kindle reader experience without needing to upload a file first.
 */
export function createSamplePdf(): ArrayBuffer {
  const pagesContent = [
    {
      title: "Bem-vindo ao KOS",
      subtitle: "Kindle Open Source para Celular",
      paragraphs: [
        "Parabens por experimentar o KOS (Kindle Open Source)!",
        "Este aplicativo foi criado especialmente para quem ama a simplicidade, o foco e a elegancia dos e-readers Kindle, mas precisa ler arquivos PDF no celular sem dor de cabeca.",
        "Diferente de outros leitores que exibem propagandas invasivas ou forcam assinaturas caras, o KOS e 100% livre de anuncios, de codigo aberto e funciona completamente offline no seu smartphone.",
        "Seus livros nunca saem do seu aparelho. A privacidade e total e o carregamento e instantaneo."
      ]
    },
    {
      title: "O Segredo do KOS: Modo Reflow",
      subtitle: "Fontes ajustaveis em qualquer PDF",
      paragraphs: [
        "Arquivos PDF tradicionais tem layout fixo, o que quase sempre torna o texto minusculo e desconfortavel em telas de smartphone.",
        "No KOS, voce tem dois modos de leitura complementares no topo:",
        "1. Modo Reflow (Kindle Fluido): Extrai o texto e quebra as linhas de acordo com o tamanho da sua tela. Voce pode aumentar ou diminuir o tamanho da letra, trocar a fonte para Bookerly ou Amazon Ember e ler com conforto maximo!",
        "2. Modo Original com Auto-Crop: Renderiza a pagina original com corte inteligente das bordas brancas, ampliando automaticamente diagramas, tabelas e figuras."
      ]
    },
    {
      title: "Zonas de Toque do Kindle",
      subtitle: "Navegacao natural e sem distracoes",
      paragraphs: [
        "A tela foi dividida exatamente como no Kindle Paperwhite:",
        "- Toque na lateral direita: Avanca para a proxima pagina.",
        "- Toque na lateral esquerda: Volta para a pagina anterior.",
        "- Toque no centro da tela: Revela as barras de ferramentas superior e inferior.",
        "- Toque no icone de Marcador no canto superior direito: Salva a pagina atual nos seus favoritos.",
        "Quando as barras se escondem, voce tem foco total na leitura."
      ]
    },
    {
      title: "Menu Aa e Temas de Leitura",
      subtitle: "Personalizacao completa ao seu gosto",
      paragraphs: [
        "Toque no centro da tela e depois no botao 'Aa' para abrir o painel de aparencia:",
        "- Tema Papel Claro: Fundo suave de livro impresso com alto contraste.",
        "- Tema Sepia Quente: Reduz a luz azul e o cansaco visual em ambientes noturnos.",
        "- Tema Escuro (Dark Mode): Fundo preto puro para economia de bateria e leitura no escuro.",
        "- Tema E-Ink: Simulacao de tela de tinta eletronica com tons neutros.",
        "Experimente alternar os temas e encontrar o seu preferido!"
      ]
    },
    {
      title: "Como Adicionar Seus Livros",
      subtitle: "Pronto para sua biblioteca pessoal",
      paragraphs: [
        "Para adicionar seus proprios PDFs a qualquer momento:",
        "1. Volte para a tela inicial clicando na seta voltar no topo.",
        "2. Toque no botao circular '+' (Adicionar PDF).",
        "3. Selecione qualquer arquivo PDF do armazenamento do seu celular.",
        "O KOS salvara o livro diretamente na memoria permanente do seu navegador ou aplicativo, gerando a capa automaticamente.",
        "Boa leitura com o KOS!"
      ]
    }
  ];

  // Placeholder indices for pages
  const pageObjNums: number[] = [];
  const contentObjNums: number[] = [];

  let nextObj = 5;
  for (let i = 0; i < pagesContent.length; i++) {
    pageObjNums.push(nextObj++);
    contentObjNums.push(nextObj++);
  }

  // Build stream content for each page
  const pageStreams: string[] = [];
  for (let i = 0; i < pagesContent.length; i++) {
    const page = pagesContent[i];
    let stream = "BT\n";
    // Header tag
    stream += "/F1 9 Tf\n";
    stream += "50 780 Td\n";
    stream += "(KOS - GUIA DO LEITOR) Tj\n";
    
    // Page Title
    stream += "/F2 20 Tf\n";
    stream += "0 -40 Td\n";
    stream += `(${escapePdf(page.title)}) Tj\n`;

    // Subtitle
    stream += "/F1 12 Tf\n";
    stream += "0 -22 Td\n";
    stream += `(${escapePdf(page.subtitle)}) Tj\n`;

    // Separator line
    stream += "ET\n";
    stream += "q 0.5 w 50 705 m 545 705 l S Q\n";
    stream += "BT\n";

    // Body paragraphs
    stream += "/F1 12 Tf\n";
    stream += `50 670 Td\n`;

    for (const p of page.paragraphs) {
      // Split into wrapped lines approx 68 chars
      const lines = wrapText(p, 65);
      for (const line of lines) {
        stream += `(${escapePdf(line)}) Tj\n`;
        stream += "0 -18 Td\n";
      }
      stream += "0 -10 Td\n"; // paragraph gap
    }

    // Page number at bottom
    stream += `ET\nBT\n/F1 10 Tf\n280 50 Td\n(- ${i + 1} -) Tj\nET\n`;
    pageStreams.push(stream);
  }

  // Construct PDF strings
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj";
  const kidsStr = pageObjNums.map(num => `${num} 0 R`).join(" ");
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pagesContent.length} >>\nendobj`;
  const obj3 = "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj";
  const obj4 = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj";

  const allObjs = [obj1, obj2, obj3, obj4];

  for (let i = 0; i < pagesContent.length; i++) {
    const pageNum = pageObjNums[i];
    const contentNum = contentObjNums[i];
    const stream = pageStreams[i];
    const streamLen = stream.length;

    const pageObj = `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj`;
    const contentObj = `${contentNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}endstream\nendobj`;

    allObjs.push(pageObj);
    allObjs.push(contentObj);
  }

  // Assemble the file with xref table
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const obj of allObjs) {
    offsets.push(pdf.length);
    pdf += obj + "\n";
  }

  const xrefOffset = pdf.length;
  pdf += "xref\n";
  pdf += `0 ${allObjs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (const offset of offsets) {
    pdf += offset.toString().padStart(10, '0') + " 00000 n \n";
  }

  pdf += "trailer\n";
  pdf += `<< /Size ${allObjs.length + 1} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefOffset}\n`;
  pdf += "%%EOF";

  // Convert to ArrayBuffer
  const buffer = new ArrayBuffer(pdf.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < pdf.length; i++) {
    view[i] = pdf.charCodeAt(i) & 0xff;
  }

  return buffer;
}

function escapePdf(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';

  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxChars) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
