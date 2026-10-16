# Pinball 進捗と既知の課題

確認日: 2026-10-16 JST  
基準: main / `24cbd761af273d1280720f61640a5afc2fa4a9a4`

## 1. 実装段階

単一HTMLで編集UI・物体クラス・Matter接続・保存・テストプレイまで記述された試作です。ソース分割、package.json、テストランナー、CIはありません。既存のdocもなかったため、今回README・SPECIFICATION・STATUS・HANDOFFを追加しました。ゲームコード・backup・backup2は変更していません。

静的に確認した機能は、4種類の追加、一覧選択と中心距離によるドラッグ、数値・色編集、削除、localStorage一枠、編集／プレイ切替、フリッパーキー、衝突加点、落下終了です。実ブラウザでの操作成功を確認した一覧ではありません。

## 2. 一時診断で確認した問題

### P-01 / 最優先: 派生属性の初期化前に描画・物理を生成する

`GameObject`のconstructorが `this.createGameObject()` を呼びます。JavaScriptの動的ディスパッチで派生クラスのメソッドが実行されますが、Wall／Bumper／Flipper／Ballは必要な値をsuper呼出し後に設定しています。

Phaser生成処理を記録用関数に置き換え、実際のクラスconstructorを呼ぶ診断を行いました。生成時点でWall.isStatic、Bumper.radius、Flipper.isLeft／currentAngle、Ball.radius／friction／isBallPositionMarkerは未初期化です。派生既定の色・反発もまだ共通値 `#888888`／0.7です。マーカーはconstructor終了後にはtrueになりますが、生成時はundefinedでした。

未初期化値が実Phaserで最終的にどの形状・値になるか、起動時にどのエラーが出るかは今回未検証です。生成時点の欠落自体は確認済みなので、最初に修正します。

### P-02 / 高: 境界壁の識別が失われる

`createBoundaryWalls`とGameSceneの境界生成は `options.type = 'boundary'` を渡しますが、Wallが `this.type = 'wall'` に固定します。実constructorとserializeの診断でもtypeはwall、EditorScene.getLayoutDataにも境界が含まれました。

このため、境界壁を一覧・選択・削除・保存から除外する全分岐が成立せず、GameSceneが新規生成する3壁とレイアウトから復元する壁が重複します。単にtypeをboundaryへ変えるとdeserializeのswitchが対応しないため、種類と役割を分ける必要があります。

## 3. コード上で確認した課題・要実機確認

### P-03 / 高: 再起動時の状態初期化とライフサイクル

score・objects・ballの初期化はGameSceneのconstructorだけで、init／createにはありません。開始座標ballStartX／Yもリセットしません。同じsceneを再利用した際に前回得点・古いオブジェクト参照・以前の開始位置を引き継ぐリスクがあります。collisionstartの登録をcreateで行う一方、対応する解除処理は明記されていません。

`PinballGame.restartGame`は `this.game.scene.restart('GameScene', ...)` を呼びます。この呼出し先のAPI適合性をPhaser 3.60.0で実機確認し、GameSceneのScenePluginを通る再開手順と合わせて検証してください。また、ファイル末尾でPhaser.Game生成直後にEditorSceneを取得して参照設定しており、scene生成完了前アクセスの可能性も確認対象です。今回これらのブラウザ再現はしていません。

### P-04 / 高: 終了が一回の確定状態になっていない

gameOverは表示と速度0だけで、world・update・入力を止めず、終了済みガードもありません。落下条件を満たす間はupdateから繰り返し呼び得ます。終了後の加点・ボール運動・キー操作の遮断が必要です。

### P-05 / 高: 編集値と物理形状・保存値の不一致

Wall／Bumper／FlipperはupdatePropertiesで表示寸法を設定し、さらにボディへ比率scaleを適用します。同じ値の反復適用で形状が変化しないか、描画と衝突形状が合うかを実物理で確認する必要があります。ドラッグでもupdatePropertiesを呼ぶのでサイズ編集だけの問題ではありません。

Ballには寸法・radiusを同期するupdateProperties overrideがなく、パネルの幅・高さを変えても半径・保存radiusと整合しません。FlipperはrestAngle変更をcurrentAngleへ即時反映しません。色更新はsetTintがある場合だけの処理で、Shapeのfill更新との整合も確認が必要です。物理ヒンジもありません。

### P-06 / 中: 読込が失敗すると既存の編集内容を失い得る

JSON.parse後、objects配列の検証前に現在の物体を削除します。`{}`など構造不正のデータや復元中の例外で旧状態へ戻りません。有限数、寸法、型、物体数、schemaVersionの検証はありません。保存容量等のsetItem失敗も未捕捉です。

### P-07 / 中: リサイズ・選択・値の扱い

canvasをresizeしても境界壁、盤面、ゲーム終了閾値の参照元を揃える処理はありません。保存データに盤面寸法もありません。選択は中心50px以内で、長い壁や回転形状の実形状と一致しません。数値にNaN・負の寸法等を渡せます。Bumper.scoreとFlipper.flipAngleの `||` 既定値処理では0を保持できません。

## 4. 今回の検証

1. mainの全ファイル一覧、現行index.html全文、ブランチ・open PR・open issueを確認しました。ブランチはmainのみ、open PR・open issueは各0件です。
2. HTMLのインラインJavaScriptを抽出してNode.js v24.19.0の `node --check` を実行し、構文エラー0でした。
3. 一時診断で、実クラスconstructorの生成時属性と境界壁のserialize・getLayoutDataを確認しました。Phaserの描画・物理生成はスタブへ置き換えています。テスト基盤をリポジトリへ追加したわけではありません。
4. CDN取得、画面描画、実ボディ形状・衝突、キーボード、保存と読込のブラウザ往復、再起動・リサイズは未検証です。

構文チェック成功は起動成功や物理の正常性を保証しません。今回の目的は現状把握と引き継ぎであり、P-01〜P-07は未修正です。
