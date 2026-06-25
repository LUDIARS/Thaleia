# Thaleia

MUSA「9 人の女神」の **タレイア** — 企画↔実装トレーサビリティ。
**Praeforma(人間の仕様概念)** と **Anatomia(コード解析 / LLM データキャッシュ)** の
**両方と会話してデータを統合する単独サービス**。略称: `Th`(予定)。

> フレーミング: Anatomia は機械向けの解析情報、Praeforma は人間が理解する仕様概念。
> Thaleia はその間に立ち、**ドメインと仕様書を突合**してトレーサビリティを出す。

## v1: ドメイン↔仕様書の突合

`POST /reconcile` で Praeforma の (ドメイン定義 + 仕様書) と Anatomia の (検出ドメイン) を
取得し、次を出す:

- **ドメイン突合**: 仕様(人間) ↔ 実装(機械) の対応。表記ゆれ(`Player`↔`player`)も名寄せ。
- **シーン(layout)突合**: Praeforma の layout(=scene) ↔ Anatomia の検出スクリーンを同じ名寄せで対応。
- **仕様カバレッジ**: 各仕様が実装されているか (target ドメイン/シーンに実装コードがあるか)。
- **両方向ギャップ**: 実装の無い仕様 (未実装) / 仕様の無い実装ドメイン・スクリーン (仕様欠落)。

結果は `data/<label>.json` に保存し、`GET /reconcile?project=<label>` で引ける。
保存時に直前の最新は `data/history/<slug>/` へ退避し、`POST /reconcile` 応答と
`GET /api/snapshots/:label` に**前回比 (`diff`)** を付ける (実装が付いた/退行した仕様・
ドメイン/シーンの出入り・状態変化を一目で出す。初回は `hasPrevious:false`)。

## MUSA リレー (`POST /relay/anatomia`)

Praeforma の要件定義モード (studio) が「対象 (ドメイン/シーン) に関連する処理グラフ」を
Anatomia から引く受け口。**Praeforma → Thaleia → Anatomia の一方向**で、Anatomia の
コードグラフ (`/api/graph`) を対象ドメインの実装 + 検索語で絞り込み、Praeforma の
code-graph スキーマ (`nodes{key,label,type,anatomia_ref}` / `edges{from,to,relation}`) へ
正規化して返す。Thaleia は解析を二重実装しない。詳細 → [spec/feature/relay.md](spec/feature/relay.md)。

## 突合ビューア (`GET /`)

Thaleia の UI は「突合差分」そのものが中身で、仕様編集も解析も持たない (= 役割の二重実装を
しない)。スナップショット一覧 → 突合マトリクス / 仕様カバレッジ / ギャップ・ワークリストを
表示し、各行から各サービスへ**ディープリンク**で送り出す:

- **実装欠落 (spec-only)** → Praeforma で仕様を開く
- **仕様欠落 (code-only)** → Anatomia で実装を見る
- **表記ゆれ / 一致** → 両側へ

リンク先は `PRAEFORMA_WEB_URL` / `ANATOMIA_WEB_URL`。未設定なら誤ったホストへ飛ばさず
無効表示にする。SPA はビルド不要で `routes/api.ts` の `/api/*` (config / snapshots /
snapshots/:label) を読む。

## 構成

```
src/
├── index.ts            Hono server entry (port 8890)
├── config.ts           env (PRAEFORMA_/ANATOMIA_ BASE_URL/TOKEN/WEB_URL)
├── clients/            上流クライアント (praeforma / anatomia)
├── reconcile/          突合: types / match(純粋) / engine(I/O)
├── relay/              MUSA リレー: types / select(純粋) / engine(I/O)
├── links/              deeplink(純粋): 行→各サービスへの URL 生成
├── routes/             /reconcile + /relay/anatomia + /api/* + 突合ビューア
└── store/              data/*.json スナップショット (save/load/list)
```

## 起動

```sh
npm install
PRAEFORMA_BASE_URL=http://localhost:8889 PRAEFORMA_TOKEN=<service token> \
ANATOMIA_BASE_URL=http://localhost:4200 \
  npm start            # tsx src/index.ts (port 8890)
```

事前に Praeforma(8889) と `anatomia web --port 4200` を起動し、解析対象を
Anatomia に `project add <id> <repo>` 登録しておく。

## 開発

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

すべての変更は feat ブランチ → PR → squash merge。main 直 push 禁止。

## 関係

- **Praeforma** (`Pf`) — 人間の仕様/ドメイン/要件。`/api/projects/:pid/domains`, `/specs`
- **Anatomia** (`An`) — コード解析の検出ドメイン。`/api/domains?project=`
- **MUSA** — 9 女神計画。Thaleia はその最初の実装サービス。
