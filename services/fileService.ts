import * as pdfjsLib from 'pdfjs-dist';

// Robustly retrieve the PDF.js library object.
// Some environments/bundlers attach the exports to a 'default' property.
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Configure PDF.js worker.
// We must set the workerSrc to the matching version.
if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
} else {
    console.warn("PDF.js GlobalWorkerOptions is not available. PDF parsing may fail.");
}

/**
 * Parses a script file and returns the extracted text content.
 * Supports .txt, .fdx (Final Draft XML), and .pdf.
 */
export const parseFile = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'txt':
      return await file.text();
    case 'fdx':
      return await parseFDX(file);
    case 'pdf':
      return await parsePDF(file);
    default:
      throw new Error(`Unsupported file extension: .${extension}. Please upload .txt, .pdf, or .fdx files.`);
  }
};

const parseFDX = async (file: File): Promise<string> => {
  const text = await file.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  
  // Final Draft XML usually stores script content in Paragraph elements
  const paragraphs = Array.from(xmlDoc.getElementsByTagName("Paragraph"));
  
  let scriptText = "";

  paragraphs.forEach(p => {
    const type = p.getAttribute("Type");
    const textNodes = Array.from(p.getElementsByTagName("Text"));
    const content = textNodes.map(t => t.textContent).join("");
    
    // Simple formatting preservation to help the LLM identify scene components
    if (type === "Scene Heading") {
      scriptText += `\n\n${content.toUpperCase()}\n`;
    } else if (type === "Character") {
      scriptText += `\n${content.toUpperCase()}\n`;
    } else if (type === "Parenthetical") {
      scriptText += `(${content})\n`;
    } else {
      scriptText += `${content}\n`;
    }
  });

  return scriptText.trim();
};

const parsePDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Use the robust 'pdfjs' object reference we created above
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = "";
  
  // Iterate through all pages
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Join text items with space to approximate reading order
    // @ts-ignore
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n\n";
  }
  
  return fullText.trim();
};
