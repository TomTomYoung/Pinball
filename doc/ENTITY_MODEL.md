# Entityによるオブジェクト拡張仕様

更新日: 2026-10-17 JST
採用: 共通の物体に形状・物理・運動・機能・状態・入力・反応ルールを組み合わせるモデル。
この文書を先に記録し、実装と試遊台の検証結果はSTATUSへ追記する。

## 1. 単位と構成

Entityは盤面に存在する個体。prototypeは再利用する設定、rolesはobject / projectile / flipperの役割、tagsは条件判定用の分類、ownerは所有者・発射者を表す。役割は重複できる。既存のWall / Bumper / Flipper / Ballは物理と描画のアダプターとして保持し、共通設定をentityに保存する。仕掛けを置くDeviceを追加する。

形状・接触・検知・表示を分離する。吸着器は衝突する中心と、外側の吸引範囲を持つ。接触可否と作用を受ける条件も分離し、球同士の反射と球同士のダメージを独立に設定する。親子追従とヒンジ等の物理接続も別の関係として扱う。

位置と寸法は盤面の論理座標、時間は秒、設計角度は度、設計速度は座標/秒。Matterの内部速度・力・角度へは接続層で変換する。物理更新と描画更新を分離し、描画フレーム数でチャージ量や効果量が変わらないようにする。

## 2. 定義と実行状態

entityにはversion、id、roles、tags、owner、links、physics、motion、components、state、rulesを記述する。定義と初期値だけを保存し、現在の速度・ダメージ・チャージ・捕獲中の球・発動回数・一時補正は実行時の状態に置く。

属性は基礎値と補正を分離する。補正には加算、乗算、上書き、上限下限を設ける。sourceで補正を識別し、そのsourceだけを解除できるようにする。重ね方は重複拒否、時間更新、独立重複を区別する。

状態はlifecycle、装填、チャージ、運動、耐久などの機能ごとに独立して持つ。状態遷移時に一度だけ発生するイベントと、成立中に継続する作用を分ける。

保存形式はschemaVersion=2を追加し、schemaVersion=1と旧形式の読込を維持する。拡張のない旧盤面はschemaVersion=1のまま往復できる。ID重複、未知設定、非有限値、不正な式、欠落したワープ先、過剰な生成数等は実行前に拒否する。読込・編集の失敗では元の盤面を保持する。

## 3. 運動と形状

位置を決定する主な方式を一つ指定する。自由な物理運動、指定軌道、支点等の拘束、他物体への保持を区別する。力による追従と座標の直接指定を同時に競合させない。

軌道の形は直線、波形、円・楕円、折れ線、式で定義する経路を扱う。進行は等速、往復、ループ、停止を指定する。回転や振動を基準位置の周りに追加できる。軌道上の位置を直接与える方式と、目標位置へ力で追従する方式を区別する。

力の基本式はm dv/dt=ΣF、位置はdp/dt=v。角運動はI dω/dt=Στ。動く面に対する反射は、接触点の面速度を引いた相対速度で計算する。物理エンジンの反発とルールによる反射を同じ接触で二重適用しない。

伸縮では支点・形状・質量・慣性・駆動を一緒に更新する。画像は同比率拡縮または部品合成で表示し、非対応比率では図形へ戻す。任意の画像を縦横別々に引き伸ばさない。

## 4. 機能

- 耐久と攻撃: 最大耐久、防御、攻撃力、破壊条件、破壊時得点・生成・信号。球にも同じ仕組みを適用する。
- 加速・方向転換: 領域にいる間の加速度、接触時の衝撃、速度の加減、指定方向への旋回。
- 吸引・反発・渦: 範囲と強さを持つ力場。吸引と接触後の保持を別にする。
- 捕獲・発射台: 定員、保持位置、保持時間、解放条件、解放速度、照準を持つ。保持中も生存球として数える。
- 吸収: 球を消費してチャージ等の資源へ変換する。捕獲した同一球の再発射とは区別する。
- ワープ: IDで出口を参照し、位置・角度・速度を変換する。出口直後の再転送と壁への埋まりを防ぐ。
- 分裂・発射: 子の個数、拡散角、速度、属性継承、親の消費有無、世代上限、寿命を持つ。
- 複数球: 全球が衝突・得点・力場・破壊の対象。球同士は物理的に反射する。同一ラウンドの球がすべて失われたときだけ残球を減らす。
- チャージ: 時間、保持入力、連打、吸収を充填源とし、速度・弾数・駆動などへ変換する。
- フリッパー: 通常駆動、保持して解放するチャージスウィング、支点を保つ伸長、接触時の散弾を組み合わせる。スウィングIDによって一振り内の重複を制限する。

散弾は、親球を分裂させる、追加弾を発射する、範囲内の既存球に異なる衝撃を与える、の三構成をモデル上区別する。

## 5. ルール・入力・式

ルールはon（イベント）、if（条件）、effects（作用）、priority、cooldown、limit、scope、exclusiveGroupを持つ。イベントは生成、tick、領域の侵入/滞在/退出、接触開始、入力押下/保持/解除/取消、連打・コマンド成立、破壊、信号など。

式の文脈はself、other、event、input、world。数値・真偽値・文字列・ベクトルと、許可した比較・算術・論理・三角関数・参照を扱う。任意のJavaScriptをevalしない。参照は安全な読み取り専用の値に限定する。条件が成立し続ける場合と閾値をまたぐ場合を区別する。

作用は加速度、衝撃、速度、旋回、反射、位置移送、捕獲・解放、ダメージ・回復、資源変更、属性補正、分裂・生成・破壊、状態変更、信号を基本操作とする。対象とworld / self / projectileの座標系を指定する。

入力は物理キー等からleft / right / actionへ変換する。押下・保持・解除・ダブルタップ・順序コマンドを共通の入力解釈で生成する。フォーカス喪失やpointercancelは解除による発射と区別し、充填を取り消す。再挑戦や次球で押下状態・コマンド履歴を残さない。

## 6. 更新順序と制限

入力解釈→継続する力・軌道・駆動→接触検知と衝突可否→物理計算→反応要求→競合解決と生成/破棄/移送→描画の順で扱う。物理エンジンの反復中に物体一覧を増減させない。

力は加算し、捕獲先・ワープ先は一つだけ選ぶ。終端処理は一度だけ。発射と資源消費は同時に成立させる。クールダウンの範囲は物体、相手との組、接触、一振り、ラウンド、ゲームを区別する。ID等で順序を安定化し、乱数はseedを持つ。

生成数、同時球数、分裂世代、式の深さ、ルール数、連鎖イベント数を有限に制限する。長時間操作しなくても捕獲球の自動解放や寿命によって試遊台が進行するようにする。

## 7. エディターと試遊

仕掛けプリセットから配置し、既存4型にも機能設定を付けられる。基本プロパティと拡張設定を同じ保存データに収める。設定の検証失敗時は編集中のオブジェクトを失わない。組合せは検証付きJSONでも編集できる。

既存10台を保持し、新しい試遊台を10台追加する。各台は単一HTMLに内包し、選択画面、3球進行、台別BEST、再挑戦、次の台、編集復帰に対応する。

11. アクセル・サーキット: 加速、減速、方向転換。
12. ミラー・ダンス: 指定反射、回転、左右移動、波形運動。
13. マグネット・ハーバー: 吸引、反発、捕獲と自動解放。
14. ワープ・リンク: 対になった転送と出口方向。
15. ブレイク・ガーデン: オブジェクト耐久、破壊、得点、弾の破壊領域。
16. プリズム・スプリット: 分裂、複数球、球同士の反射、寿命。
17. リサイクル・リアクター: 弾吸収、資源への変換、散弾の再発射。
18. チャージ・ランチャー: 捕獲、保持チャージ、連打、発射台。
19. チャージ・スウィング: 押して溜め、離して振る左右フリッパー。
20. エクステンド・バースト: フリッパー伸長、散弾打ち返し、入力コマンド。

## 8. 検証の基準

既存47件を維持する。追加で、拡張設定の保存往復と不正入力拒否、実Matterでの各作用、複数球時の残球判定、捕獲/破壊/分裂/ワープの競合、チャージと入力取消、20台の遷移と資源解放、390px幅の操作を確認する。実装済み範囲、具体的な記法・制限、未実装の拡張候補は作業完了時に本書とSTATUSへ明記する。

## 9. 実装済みの記法

第1～8節は設計方針です。この節以降は今回の実装が読み取る具体的な契約です。形状と基本編集値は既存オブジェクトのトップレベルに置き、追加機能だけを`entity`へ置きます。`prototype`はプリセットの来歴であり、読込時に外部定義を継承しません。展開済み設定が保存されます。`roles`も分類で、`roles: ["projectile"]`だけで壁をBallへ変える指定ではありません。

以下は耐久30で左右に動き、球との接触時に条件付きで加点する、保存可能な1レコードです。

```json
{
  "type": "device", "name": "Moving target",
  "x": 400, "y": 350, "shape": "rectangle",
  "width": 120, "height": 24, "angle": 0,
  "sensor": false, "color": "#f3a476", "restitution": 0.8,
  "entity": {
    "version": 1, "id": "moving-target", "roles": ["object"],
    "tags": ["target"],
    "motion": {"kind": "wave", "range": [80, 0], "period": 3},
    "components": {"health": {"max": 30, "armor": 0, "score": 200}},
    "rules": [{
      "id": "fast-hit", "on": "contact", "cooldown": 0.2,
      "if": {"op": "gt", "args": [{"ref": "other.speed"}, 450]},
      "effects": [{"op": "score", "target": "self", "value": 30}]
    }]
  }
}
```

編集パネルの「挙動設定JSON」には、この例の`entity`の中身だけを入力します。IDは英数字・`_`・`-`で80文字以内。`links: {"gate": "gate-id"}`、`owner`、ワープ先、装着先、移送先は、同じ盤面にあるentityのIDを参照します。ID重複、自己参照、欠落参照、装着の循環は拒否します。後から設定した側だけでIDを変えると参照検証が失敗するため、関連する設定を合わせて管理してください。

### 機能設定

- `physics`: `body`（static / dynamic、Device・壁の自由落下に使用）、`mass`（0.01～1000）、`gravityScale`（−5～5）、`frictionAir`（0～1）、`ballCollision`。球同士の衝突除外は壁・フリッパー・敵との接触を残します。
- `components.health`: `max`、`armor`、`score`。接触相手の`attack.damage`からarmorを差し引き、耐久0で一度だけ破壊・加点します。攻撃設定のない通常球は10ダメージです。
- `components.attack`: `damage`。`components.lifetime`: `seconds`。
- `components.charge`: `maximum`、`rate`（保持中の毎秒充填量）、`initial`。`chargeFull`は満量に到達した瞬間だけ発生します。
- `components.field`: `kind`はaccelerate / brake / redirect / attract / repel / vortex。`radius`、`strength`、`direction`、`maxSpeed`、`turnRate`を持ちます。対象は範囲内の生存球で、捕獲球を除きます。`state.enabled=false`で停止します。
- `components.capture`: `capacity`、`hold`、`speed`、`direction`、`manual`、`chargeBoost`。解放速度はspeed＋chargeBoost×充填率。保持時間を超えると自動解放します。解放位置が塞がれている間は再試行し、17秒を超えて出せない球は破棄して進行を止めません。
- `components.warp`: `target`、`direction`、`offset`、`cooldown`、`preserveSpeed`。出口の角度を加えた方向へ出し、速度維持時も240～1200に制限します。出口に空きがなければ転送しません。
- `components.split`: `count`、`spread`、`speed`、`generations`、`cooldown`、`consumeParent`。speed=0は親速度を基準にします。子球が1球も生成できなければ親球を残します。
- `components.absorber`: `gain`、`cost`、`count`、`spread`、`speed`、`direction`、`delay`。chargeと組み合わせ、親球を消費して資源化し、残高が足りれば遅延発射します。子世代は再吸収しません。
- `components.flipper`: `charge`、`chargeTime`、`boost`、`extend`、`extendTime`、`scatter`、`spread`、`cooldown`、`command`。flipper型だけに付けられます。散弾は打ち返した球を保持して追加球を出し、子世代からはさらに散弾を出しません。

capture / warp / split / absorberは1個体に同居させません。条件分岐はルール側で表現します。`capture`作用だけでも保持できますが、自動解放の設定はcaptureコンポーネントに置くか、明示的なreleaseルールを設けてください。

### 軌道・装着・領域

`motion.kind`はnone / linear / wave / orbit / path / formula。`range: [x, y]`は初期位置からの変位、periodは秒、phaseは度、angularSpeedは度/秒です。linearは三角波による等速往復、waveは正弦波往復、orbitは初期位置を出発する円／楕円、pathは相対座標の`points`（2～32点）を等時間区間で補間します。pathのloop=falseは終点で停止します。loop=trueは終点から始点へ戻るため、連続させる場合は閉じた点列にします。

formulaの`x`・`y`は初期位置からの変位を返す式、`angle`は絶対角度を返す式です。式内のsin / cos / atan2だけはラジアンです。`mode: "direct"`は位置・角度を直接進め、`mode: "force"`は`stiffness × 位置誤差 − damping × 速度`の加速度で目標位置へ追従します。forceモードでは指定角への回転制御は行いません。フリッパーのdirect軌道は禁止し、ヒンジ駆動を使用します。

`attachment: {"target":"parent-id","offset":[0,80],"angle":0,"onParentDestroyed":"destroy"}`で親の位置と回転へ追従します。親の破壊時はdestroyまたはdetachを選択します。detachは追従を停止し、既存のボディ種別を保持します。attachmentとmotionは同居しません。任意のバネ／鎖／関節を追加する機能ではありません。

`regions`は最大8個の円または回転矩形。各要素にid、shape、offsetとradiusまたはwidth / height、angleを指定します。球との重なりを検知し、enter / stay / exitの`event.region`へIDを渡します。物理ボディは追加しません。矩形の検知は球半径だけ軸方向へ広げた近似で、角部分は厳密な円対矩形判定ではありません。球の破棄時は退出イベントを発生させず、領域記録を除去します。

### ルール・式・作用

イベント名は`spawn`、`tick`、`contact`、`enter`、`stay`、`exit`、`destroy`、`capture`、`release`、`chargeFull`、`input.down`、`input.hold`、`input.up`、`input.cancel`、`input.double`、`input.command`、`signal`です。接触イベントは接触開始時です。保持接触・接触終了イベントは今回追加していません。

入力ルールは`input: "left" | "right" | "action"`で絞ります。signalは`signal: "open"`等で信号名を絞ります。条件`if`の省略はtrueです。式はリテラル、`[x,y]`、`{"ref":"self.charge"}`、`{"op":"mul","args":[2,{"ref":"self.charge"}]}`の形を使います。JavaScript文字列を実行しません。

参照できる主な値はself / otherのid・type・roles・tags・owner・position・x・y・velocity・speed・angle・mass・health・charge・heldCount・active・generation・state・age、inputのleft / right / action、worldのtime・dt・balls・score・round・randomです。eventは接触のnormal / point / velocity / relativeSpeed、入力のaction、信号のname / valueなどイベントごとに異なります。欠落参照や不正な数値結果はnullとなり、数値作用は既定値または無作用として扱います。

演算はadd / sub / mul / div / mod / pow / min / max / clamp / abs / sqrt / sin / cos / atan2、eq / ne / gt / gte / lt / lte / and / or / not、vec / length / normalize / dot / distance / has。ベクトルの動的構築にはvecを使います。静的型推論は行わず、評価時にも数値・ベクトルを検査します。

作用の`target`はself / other / owner / nearby / link:名前。nearbyは自分のfield.radius、なければ150以内の生存球です。`value`、`vector`、`angle`、`count`、`spread`、`speed`、`cost`は式を受け取ります。

- accelerateはvectorの加速度、impulseはvectorの力積、velocityはvectorへの速度置換です。vectorのspaceはworld / self / projectile。selfは発動元の回転、projectileは対象球の進行方向を基準にします。
- redirectはangle方向へspeedで向けます。reflectはangle指定なら指定方向、なければ接触法線と面の移動・回転速度を使う反射です。valueは後者の反発係数です。angleのself座標系にも対応します。
- teleportはdestinationまたはlinks.exitへ移し、angle方向で空きを探します。速度は変更しません。速度方向も変える場合は続けてredirectを指定します。コンポーネントwarpは出口方向への速度変換もまとめて行います。
- capture / release、damage / heal、charge / score、split / fire / destroyを使用できます。splitはcount・speed・spread・consume、fireはcount・speed・angle・spread・cost・resourceを使います。resource省略はcharge、それ以外はstate内の数値です。
- stateはkeyの値をvalueへ更新。signalはnameとvalueを対象へ送り、次の物理更新で評価します。
- modifyはkey（speed / attack / drive / gravity）、value、duration、source、operation、stack。speedは速度上限、driveはフリッパー駆動、gravityは重力倍率です。適用順はadd→multiply→set→min→maxで、minは下限保証、maxは上限制限です。同じsourceとkeyの補正はrefreshで置換、rejectで拒否、independentで別々に保持します。期限で解除し、任意のsourceだけを即時解除する専用作用は未実装です。

同じイベントのルールはpriorityの大きい順、同値はID順です。exclusiveGroupはその発動元・そのイベント内で最初に成立した1ルールだけを許可します。scopeはentity / pair / contact / swing / round / gameで、cooldownとlimitの識別単位を変えます。limit=0は回数無制限です。entityとgameは現状どちらもその個体のゲーム中の寿命を範囲とします。ルールの条件はイベント発生時のスナップショット、作用はキュー処理時に順番に適用します。

## 10. 実行順序・上限・試遊操作

物理更新前に入力・信号・軌道・継続力・捕獲時間・tickを処理します。Matterの接触開始では作用要求を積み、カスタム反射等が成立する接触だけ通常反発を抑止します。物理更新後に作用を適用し、破壊イベントの作用後に物体を除去します。コンポーネントによる捕獲／転送等は1球につき同一更新で最初に処理したものが確保します。複数ルールによる別々の終端作用はキュー順で処理され、すでに破棄済みの対象への通常作用は無効です。連鎖した信号は次の更新へ送ります。

上限は同時24球、1回の生成8球、分裂3世代、生成球の寿命12秒、1個体32ルール・1ルール12作用・8領域・32補正、式深さ12・演算引数8、作用キュー256・1flush512・信号待ち64です。発動回数の記録は個体ごとに直近256キーを保持します。数百種類の相手との長期履歴を完全に保持する設計ではありません。球速度の標準上限は1320座標/秒です。Matterの離散計算なので、小さな物体と高速球の全条件で連続衝突を保証するものではありません。

分裂の子球は親の半径・色・反発・摩擦・physics・tags・attack・health・projectileと時限強化の残時間を継ぎ、generationを増やします。rulesやmotionは再帰複製しません。通常のfireは標準球を生成します。生成できた場合だけ親消費やfireの資源支払いを確定します。吸収は先に球を資源化して予約する別操作で、予約後に発射元が破壊された場合や全出口が塞がった場合は再発射されません。

新機能の試遊台ではE／特殊がactionです。0.18秒未満のタップは+10、0.35秒以内の二度押しは追加+25。0.18秒以上保持して離すと捕獲済み発射台を発射します。左→右→actionの1.4秒以内の順序が固定コマンドで、対応フリッパーの散弾を6秒強化します。取消・非表示・フォーカス喪失・次球・再挑戦では入力と充填を解除し、取消を発射に変換しません。

## 11. 今回の範囲と残る拡張

既存4型＋Device、37プリセット、検証付きJSON編集、schemaVersion=1/2の保存、計30台、共通作用・式・軌道・複数球・入力を実装しました。試遊と編集画面は同じモデルを通ります。

多角形・複合ボディ、任意の関節定義、一般的な形状変形、任意キーや任意コマンド列の編集、任意prototypeの子球生成、完全な反応ルールGUI、source指定での補正即時解除、完全な決定論的リプレイは未実装です。チャージフリッパーの攻撃強化は現在その球のラウンド中に保持されます。全機能の任意組合せと長時間の打感・難易度調整まで完了したという意味ではありません。


## 12. アクション拡張

[ACTION_MODEL.md](./ACTION_MODEL.md)で敵・弾種・巨大化・機械仕掛けの具体的な記法を定義します。componentsにprojectile / upgrade / enemy / spawner / piston / spring / breachZone、作用にresize / projectile / spawn / fxを追加しました。任意の子球prototype生成とは別に、spawnは許可した11種類の敵・障害物プリセットだけを生成します。未知の型と生成装置の再帰生成を拒否します。

敵・ピストン・ばねはそれぞれ位置を制御するため同居させず、motion / attachment / physics.body=dynamicとの併用も拒否します。ActionRuntimeは攻撃の撃破条件を統一して判定し、攻撃・除去の確定後に出現と侵入敗北を判定します。弾の巨大化は実行時の半径を変更し、保存定義を上書きしません。
