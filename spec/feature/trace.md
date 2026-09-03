# feature — 関数粒度トレース (`/api/trace`)

「ドメイン X は実装あり」を**関数粒度**へ掘り下げる。対象ドメインの実装関数を列挙し、
各関数に Anatomia の spec-links (コード↔リポ spec 節リンク) を結びつける。Thaleia は解析を
二重実装せず、Anatomia の 3 つのビューを合成するだけ。

## なぜ残置しているか

Thaleia を施策設計ツールへ再定義したとき、 突合そのものは Anatomia へ寄せて撤去した
(Castra `spec/plan/2026-09-03-thaleia-initiative-design-tool.md` §1)。 ただし
**関数 → spec 節の結び表示は Anatomia 側に同等物が無い**ため、 この機能だけは残している
(設計 §8-5、 neco 決定 2026-09-03)。 施策評価の AI 実装可否軸も、 spec-link 密度という形で
同じ素材を足場に使う。

## 処理 (`trace/build.ts` 純粋 + `trace/engine.ts` I/O)

Anatomia の 3 ビューを並列取得 (`engine`):
- `GET /api/projects/:id/domain-view` → ドメイン → 実装 anchor id 群
- `GET /api/graph` → anchor id → 関数名/パス
- `GET /api/projects/:id/spec-links` → `from`(anchor id もしくはファイルパス) → spec 節

`buildTrace()` (純粋):
1. 対象ドメイン名を正規化名で照合 → 実装 anchor id 群 (無ければ `matched:false`)。
2. graph で id→{name,path} を解決 (graph に無い古い id はスキップ)。
3. spec-links を `from` でグループ化し、各関数に **from===関数id または from===関数ファイルパス**
   の両対応で join (重複は clauseHeading|clauseFile で排除、confidence 降順)。
4. リンクあり関数を先頭に、名前順で安定ソート、`MAX_TRACE_FUNCTIONS`(200) で切り詰め。

> 実測 (adventurecube): spec-links は全て**ファイル単位** (`from`=パス) だったため、join は
> ファイルパス経由で効く。将来 Anatomia が関数単位リンクを出せば id 直当ても拾う。

## 無言フォールバック禁止

- Anatomia 未設定 → `503`、上流エラー → `502`。
- 対象ドメインが検出ドメインに無い → `matched:false` + 空 (ダミー関数を捏造しない)。
- 上限切り詰めは `summary.truncated` + `totalImplementors` で明示 (黙って削らない)。

## spec 単位トレース (`/api/trace/spec`)

ドメイン単位のドリルダウンに加え、**Pf spec を起点**に target ドメインの実装関数を直結する
(`buildSpecTrace()` 純粋 + `runSpecTrace()` I/O)。

`runSpecTrace()` (engine):
1. `pf.listSpecs` で spec code → spec を引く (無ければ `null` → route 404)。
2. `pf.getSpecTargets` + `pf.listDomains` で target の `kind==="domain"` を id→name 解決。
3. Anatomia の 3 ビュー (domain-view / graph / spec-links) を並列取得。

`buildSpecTrace()` (純粋):
- target ドメインの重複を正規化名で畳み、各 target に `buildTrace()` を適用して束ねる
  (ドメイン単位の join ロジックをそのまま再利用 = 挙動一致)。
- `summary` は target 全体の `domainCount / matchedDomains / functionCount / linkedFunctions`。
- 未検出 target は `matched:false` の TraceResult 要素として残す (黙って捨てない)。

## 次フェーズ

- spec 単位トレースから関数 → repo spec 節の重み付き経路 (confidence) を強調表示。
