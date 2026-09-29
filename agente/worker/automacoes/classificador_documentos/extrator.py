from pathlib import Path #receber o caminho e o sufixo
import pdfplumber # leitor de pdf
import openpyxl #leitor de excel
from docx import Document #para extrair o docx

def extrair_texto(caminho: str) -> str:
    ext = Path(caminho).suffix.lower()

    if ext == ".pdf":
        return extrair_pdf(caminho)
    elif ext ==".docx":
        return extrair_docx(caminho)
    elif ext in (".xlsx", ".xls"):
        return extrair_excel(caminho)
    else:
        raise ValueError(f"Tipo de arquivo não suportado: {caminho}")
    
        

    # ext vai receber o sufixo do documento em minúsculo

#print(detectar_tipo_arquivo("documentos/nota123.pdf"))     # "pdf"
#print(detectar_tipo_arquivo("contratos/aluguel.docx"))       # "docx"
#print(detectar_tipo_arquivo("digitalizados/rg_cliente.jpg")) # "imagem"

def extrair_pdf(caminho: str) ->str:
    with pdfplumber.open(caminho) as pdf:
        paginas_texto = []
        for p in pdf.pages:
            texto = p.extract_text()
            paginas_texto.append(texto or "") # texto pode vir vazio
    return "\n".join(paginas_texto)

#texto = extrair_pdf("C:/Users/USUARIO/Desktop/Meus Arquivos no geral/curriculo.pdf")
#print(texto[:500])

def extrair_excel(caminho: str) ->str:
    workbook = openpyxl.load_workbook(caminho, data_only= True)

    linhas_texto = []
    for n in workbook.sheetnames:
        sheet = workbook[n]
        for linha in sheet.iter_rows(values_only=True):
            #linha é uma tupla com o valor de cada célula naquela linha#
            celulas_texto = [str(v) for v in linha if v is not None]
            if celulas_texto:
                linhas_texto.append(" ".join(celulas_texto))
    return "\n".join(linhas_texto)

#texto = extrair_excel("caminho/para/sua_planilha.xlsx")
#print(texto[:500])

def extrair_docx( caminho: str) -> str:
    doc = Document(caminho)
    paragrafos = [p.text for p in doc.paragraphs]
    return "\n".join(paragrafos)
