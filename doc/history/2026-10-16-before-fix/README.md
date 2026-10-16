# Pinball 開発資料

確認日: 2026-10-16 JST  
対象: TomTomYoung/Pinball / main  
確認基準: `24cbd761af273d1280720f61640a5afc2fa4a9a4`  
最終コード更新: 2025-03-01 22:48:42 UTC

## 現在地

Phaser 3.60.0とMatter物理を使う、単一HTMLのピンボール盤面エディター兼テストプレイ試作です。壁・バンパー・フリッパー・ボール開始位置の編集、プロパティ入力、localStorage保存・読込、テストプレイ、衝突加点、落下終了のコードがあります。

完成したゲームとは扱いません。派生クラスの値を設定する前に物理オブジェクトを作る初期化順の問題と、境界壁の識別が失われる問題を確認しました。ブラウザ操作と実際の物理挙動は今回未検証です。調査時点のブランチはmainのみ、open PR・open issueは各0件です。

別リポジトリ `TomTomYoung/pinball2` は今回の調査・変更対象に含めていません。

## 読む順番

1. [SPECIFICATION.md](./SPECIFICATION.md): 現行コードの構成、操作、物理、保存形式。
2. [STATUS.md](./STATUS.md): 実装範囲、再現した問題、静的確認の課題、検証範囲。
3. [HANDOFF.md](./HANDOFF.md): 次の作業順、修正箇所、受入条件、確認手順。

現在の実行入口は [index.html](../index.html) です。`backup` と `backup2` は入口から読み込まれない過去コードで、今回変更していません。

## 起動と確認

ビルド、npm依存、バックエンドはありません。`index.html` をブラウザで開きます。PhaserのCDNへ接続できることが必要です。localStorageを同じオリジンで安定して確認したい場合は、VS Codeの静的プレビュー等で同じURLを使ってください。HTTP配信の例は次です。

```sh
python3 -m http.server 4173
```

`http://localhost:4173/` を開きます。このサーバーは開発用の静的配信手段であり、ゲームのサーバーAPIではありません。既存のpackage.json・自動テスト・CIはありません。

今回、HTML内JavaScriptの構文確認と、Phaserの生成処理を置き換えた一時診断で初期化順・境界壁の保存内容を確認しました。詳細はSTATUSに記録しています。ゲームコードの修正は行っていません。
