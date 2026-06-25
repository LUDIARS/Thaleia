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
- **仕様カバレッジ**: 各仕様が実装されているか (target ドメインに実装コードがあるか)。
- **両方向ギャップ**: 実装の無い仕様 (未実装) / 仕様の無い実装ドメイン (仕様欠落)。

結果は `data/<label>.json` に保存し、`GET /reconcile?project=<label>` で引ける。
`GET /` に最小ビューア。

## 構成

```
src/
├── index.ts            Hono server entry (port 8890)
├── config.ts           env (PRAEFORMA_BASE_URL/TOKEN, ANATOMIA_BASE_URL)
├── clients/            上流クライアント (praeforma / anatomia)
├── reconcile/          突合: types / match(純粋) / engine(I/O)
├── routes/             /reconcile + 最小ビューア
└── store/              data/*.json スナップショット
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
