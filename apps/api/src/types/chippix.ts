// ══════════════════════════════════════════════════════════════════════
//  ChipPix Extrato — Types
// ══════════════════════════════════════════════════════════════════════

/** Linha parseada do XLSX ChipPix (1:1 com cada row do arquivo) */
export interface ChipPixExtratoRow {
  data: string;            // "Data" column (YYYY-MM-DD)
  tipo: string;            // "Entrada" | "Saída"
  finalidade: string;
  entradaBruta: number;    // "Entrada bruta"
  saidaBruta: number;      // "Saida bruta"
  entradaLiquida: number;  // "Entrada liquida"
  saidaLiquida: number;    // "Saida liquida"
  integrante: string;      // "Integrante" (nome do jogador)
  taxaOperacao: number;    // "Taxa da operação"
  idJogador: string;       // "Id Jogador" (= players.external_id)
  idOperacao: string;      // "Id da operação" (para dedup)
  idPagamento: string;     // "Id do pagamento"
}

/** Jogador não encontrado na tabela players */
export interface NaoVinculado {
  chippix_id: string;
  nome: string;
}

/** Retorno do endpoint POST /api/chippix/import-extrato */
export interface ChipPixImportResult {
  total: number;
  vinculados: number;
  nao_vinculados: NaoVinculado[];
  duplicados: number;
  inseridos: number;
  semana: string;
}
