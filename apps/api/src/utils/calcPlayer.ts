import { round2 } from './round2';

/** Calcula rb_value_brl e resultado_brl de um jogador a partir de winnings, rake e rbRate */
export function calcPlayerResultado(winnings: number, rake: number, rbRate: number) {
  const rbValue = round2((rake * rbRate) / 100);
  const resultado = round2(winnings + rbValue);
  return { rbValue, resultado };
}
