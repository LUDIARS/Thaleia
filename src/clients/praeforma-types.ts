// Praeforma (人間の仕様) 側の中立モデル。 どの上流実装にも依存しない型定義。
// 旧突合モジュールの型定義から、 突合撤去後も残る利用者 (trace / unified) 向けに切り出したもの。

/** Praeforma 側のドメイン (人間が定義した役割/領域)。 */
export interface PfDomain {
  id: string;
  name: string;
  description?: string | null;
}

/** Praeforma 側のシーン (= layout。 spec §4 で layout = scene)。 */
export interface PfLayout {
  id: string;
  name: string;
  description?: string | null;
}
