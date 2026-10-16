# Pinball 開発資料

更新日: 2026-10-16 JST  
対象: TomTomYoung/Pinball / main  
修正開始時のコミット: `482d8613a2c2494c68c27b9618805509a9b076c8`

## 現在地

Phaser 3.60.0とMatterを使う、単一HTMLのピンボール盤面エディター兼テストプレイです。壁・バンパー・左右フリッパー・ボール開始位置を配置し、保存・読込・プレイ・再プレイ・編集復帰を行えます。

2026-10-16の精査で判明した初期化順、累積するボディ拡縮、外周壁の混入、再プレイ時の古い参照、読込失敗による盤面消失を修正しました。フリッパーは固定支点のヒンジと角速度で駆動します。実ブラウザでの再プレイ4回と保存往復を含む回帰テストを追加しました。残機・発射装置・ステージクリアなどを持つ完成ゲームではなく、編集と試遊の土台を整えた段階です。

## 読む順番

1. [SPECIFICATION.md](./SPECIFICATION.md): 現行の操作、物理、保存形式、旧データの移行。
2. [STATUS.md](./STATUS.md): 修正した問題、検証結果、残る課題。
3. [HANDOFF.md](./HANDOFF.md): 開発時の注意、確認手順、次の作業。
4. [素材README](../assets/README.md): 作成済み49点の画像・部品・UI・音声と組込み条件。[素材確認ページ](../assets/index.html)は取得後に直接開けます。

修正前の文書は[history/2026-10-16-before-fix](./history/2026-10-16-before-fix/README.md)に原文のまま保存しています。過去の不具合・未検証の記載は当時の記録です。現在の仕様判断には上記3文書を使用してください。

## 起動

[index.html](../index.html)をブラウザで開きます。利用者によるnpmの導入やローカルサーバーの起動は不要です。PhaserをCDNから取得するため、ネット接続は必要です。localStorageの保存先はブラウザ・オリジンに依存するため、同じブラウザ・同じ場所から開いてください。

新規盤面は800×1000です。ウィンドウを変更した場合は盤面の表示を縦横同比率で拡縮し、保存座標や物理形状は変えません。小さい画面では編集パネルを下側へ配置します。

## 開発者向けテスト

package.jsonの依存はテスト専用で、HTMLの実行には不要です。

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

`npm test`は実際のPhaser図形とMatterを使用する14件の回帰テスト、`npm run test:browser`はChromiumの実画面で操作する8件です。ブラウザテストはテスト中だけ自動で静的サーバーを起動・終了し、CDNへのリクエストは同じバージョンのローカルPhaserへ差し替えます。別のChromium実行ファイルを使う環境は`PINBALL_BROWSER_EXECUTABLE`を指定できます。

`backup`、`backup2`、別リポジトリ`TomTomYoung/pinball2`は対象外です。
