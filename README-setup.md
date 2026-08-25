# 毎日のAIニュース → 画像5枚＋動画 → X/Threads/Instagram自動投稿（Human Check 1回）

## 全体の流れ

```
①GitHub Actions（毎日決まった時刻に自動起動）
  → Claude APIが最新AIニュース7本を収集
  → 重要度上位5本を選定
  → 5枚の画像カード（SNS投稿用）を生成
  → 5枚をつなげたスライドショー動画を生成
  → Pull Requestを自動作成
         ↓
②あなたがPRの中身（画像5枚・動画・キャプション）を確認
  → 問題なければ「Merge」ボタンを押す　★これが唯一のHuman Check★
         ↓
③Mergeをきっかけに別のワークフローが自動起動
  → Zapierのwebhookに、画像URL・動画URL・SNSごとのキャプションを送信
         ↓
④Zapier → Buffer に投稿データを渡す
         ↓
⑤Buffer が X・Threads・Instagram へ実際に投稿
```

必要なセットアップは4つの箱（GitHub / Claude API / Buffer / Zapier）です。それぞれ順番に説明します。

---

## 事前準備：Instagram・Threadsのアカウント確認

Instagram・Threadsを自動投稿するには、**個人アカウントではなく「ビジネスアカウント」または「クリエイターアカウント」**である必要があります。

1. Instagramアプリを開く → プロフィール画面 → 右上のメニュー
2. 「アカウントの種類とツール」→ 現在の種類を確認
3. 「個人用アカウント」になっていた場合は「プロアカウントに切り替える」から「ビジネス」または「クリエイター」を選択（無料・数分で完了します）
4. ThreadsはInstagramアカウントと連動しているため、これで両方の準備が整います

---

## STEP1：Anthropic APIキーを取得する

1. https://console.anthropic.com/ でアカウント作成・ログイン
2. 「API Keys」から新しいキーを発行（`sk-ant-...`）
3. 少額のクレジットカード登録が必要です（従量課金・月あたり数百円〜想定）

---

## STEP2：GitHubリポジトリを用意する

1. GitHubで新しいリポジトリを作成します。**必ず「Public」で作成してください**
   （画像・動画をZapier/Bufferが取得できるようにするため。Privateのままだと外部から画像が見えず投稿できません）
2. このフォルダ一式をリポジトリにアップロード
3. `Settings → Secrets and variables → Actions` で以下を登録：
   - `ANTHROPIC_API_KEY`：STEP1で取得したキー
   - `ZAPIER_WEBHOOKS_JSON`：話題ごとのWebhook URLをまとめたJSON（例: `{"ai-news": "https://hooks.zapier.com/..."}`。STEP4で取得、一旦仮の値でも可）

> ※Publicリポジトリにすると、Merge前の画像・記事案も一時的に誰でも閲覧可能な状態になります。個人利用の範囲であれば通常問題ありませんが、この点は認識しておいてください。

---

## STEP3：Bufferをセットアップする

1. https://buffer.com/ でアカウント作成（無料トライアルあり、本格運用は有料プラン。3媒体で月1,500〜2,000円程度が目安）
2. 「Connect a channel」からX、Threads、Instagramの3つを接続
   - Instagram/Threadsは、先ほど設定したビジネス/クリエイターアカウントでログインして連携します
3. 接続が完了したら、Bufferでの作業は一旦終わりです（実際の投稿操作はZapier経由で自動的に行われます）

---

## STEP4：Zapierをセットアップする

1. https://zapier.com/ でアカウント作成（無料プランで開始可能）
2. 「Create Zap」→ トリガーに **「Webhooks by Zapier」→「Catch Hook」** を選択
3. 表示されたWebhook URLをコピーし、GitHubのSecrets（`ZAPIER_WEBHOOKS_JSON`）に `{"ai-news": "コピーしたURL"}` の形式で登録（話題を追加したら、このJSONにキーを追加していきます）
4. アクション側に **「Buffer」→「Create a Post」** を追加し、Bufferアカウントを連携
5. 送られてくるデータ（`carouselCaptionInstagram`、`images`（配列）、`video` など）を、Bufferの投稿内容欄にマッピングします
   - X向け投稿：`carouselCaptionX` ＋ 画像1〜5枚（またはvideoのみ）
   - Threads向け投稿：`carouselCaptionThreads` ＋ 画像またはvideo
   - Instagram向け投稿：`carouselCaptionInstagram` ＋ 画像5枚（カルーセル）
   - 媒体ごとに投稿内容を変えたい場合は、Zap内でアクションを3つ（X用・Threads用・Instagram用）に分けて、それぞれ対応するキャプションと投稿先チャンネルを指定してください
6. Zapをオンにする

> Zapierの画面・項目名は今後変更される可能性があります。上記は大枠の流れとして参考にし、実際の設定時は画面の案内に従ってください。

---

## STEP5：動作確認

1. GitHubの「Actions」タブ →「Daily AI News - Generate & Request Check」→「Run workflow」で手動実行
2. 数分後、「Pull requests」タブに本日分のPRが作成されます
3. `output/ai-news/<日付>/cards/` の画像5枚、`slideshow.mp4`、`top5.json` の内容を確認
4. 問題なければPRを **Merge**
5. Mergeをきっかけに「Publish After Approval」ワークフローが自動起動し、Zapier→Bufferへ送信されます
6. Bufferの管理画面、または実際のX/Threads/Instagramで投稿を確認してください

---

## 日々の運用

- 毎日決まった時刻に自動でPRが作られます
- あなたは内容を見て **Mergeを押すだけ**（＝GO判定）
- Mergeしなければ、その日は投稿されません（Closeすればスキップ扱い）

## カスタマイズ

- **ニュースの選定基準・重要度の付け方** → `scripts/generate.mjs` の `SYSTEM_PROMPT`
- **画像のデザイン** → `scripts/render-cards.mjs` の `cardHtml()` 関数
- **動画の長さ・切り替え効果** → `scripts/build-video.sh`
- **実行時刻** → `.github/workflows/generate.yml` の `cron` の値（UTC基準）
- **媒体ごとの投稿内容の出し分け** → `scripts/publish.mjs` のペイロード内容、およびZapier側のマッピング

---

## マネタイズ機能について

このパイプラインには3つの収益化施策が組み込まれています。

### ① アフィリエイトリンクの自動挿入
`config/affiliate-links.json` に登録したキーワードが記事本文に出てきた場合、自動でリンク化されます。**URLは実際にASP（A8.netや各社公式アフィリエイトプログラム）に登録して取得したものに書き換えてください。** 1記事・1キーワードにつき初回出現の1箇所だけをリンク化する設計で、過剰リンクを防いでいます。

### ② ディスプレイ広告
`docs/<話題スラッグ>/index.html`（例: `docs/ai-news/index.html`。GitHub Pagesで公開する記事全文サイト）に広告枠を用意しています。Google AdSenseの審査に通ったら、発行された `ca-pub-XXXXXXXXXX` を GitHub Secrets の `ADSENSE_CLIENT_ID` に登録してください。未設定の間は広告枠の位置がプレースホルダー表示されます。

> AdSense審査には、独自ドメイン推奨・一定量のコンテンツ・プライバシーポリシーの設置などの条件があります。GitHub Pagesの `github.io` ドメインでも審査自体は可能ですが、独自ドメインの方が有利とされています。

**GitHub Pagesの有効化手順**：
1. リポジトリの `Settings → Pages`
2. Source: `Deploy from a branch`
3. Branch: `main` / フォルダ: `/docs`
4. 保存すると、`https://（あなたのアカウント名）.github.io/（リポジトリ名）/` で公開されます

### ③ SNS案件・PR獲得
`PR_PLAYBOOK.md` に、メディアキットの作り方・登録できるマッチングプラットフォーム・法的に必須のPR表記ルールをまとめています。実際にタイアップが決まったら `config/sponsor-today.json` を配置してから手動実行してください（詳細はPR_PLAYBOOK.md参照）。

---

## 効果測定・収支管理について

### GA4・UTMトラッキング（自動）
GitHub Secretsに `GA_MEASUREMENT_ID`（Google Analytics 4の測定ID）を登録すると、記事サイトに自動で埋め込まれます。またアフィリエイトリンク・サイト誘導リンクには自動でUTMパラメータが付与されるため、GA4上で「どのニュース・どの媒体経由の流入か」を確認できます。

### 週次レビュー（半自動）
毎週月曜、`Weekly Review`ワークフローが自動実行され、直近7日の投稿傾向分析＋収支サマリーのPRが作成されます。`metrics/<話題>/<週>.json`に、Buffer・GA4・noteの管理画面を見ながら実際の数値を入力し、必要なら再実行（Actions画面の「Run workflow」）してからMergeしてください。実際の収益・コストは`config/cost-estimates.json`で随時更新してください。

### プラットフォーム別画像
Instagram/Threads向け（縦長）とX向け（横長）を自動で分けて生成します。

### 障害通知
GitHub Secretsに `SLACK_WEBHOOK_URL` を登録すると、生成・投稿処理が失敗した際にSlackへ通知が届きます（未設定でも動作しますが通知は届きません）。

### 外部APIの障害耐性
Nano Banana Pro・Kling AI・ElevenLabsの呼び出しは自動でリトライされ、それでも失敗した場合は品質を落として自動的に投稿を継続します（動画→静止画スライドショー、ナレーション→無音）。

## 安全機構について

### killスイッチ（緊急停止）
リポジトリの `Settings → Secrets and variables → Actions → Variables` タブで、新しい変数 `KILL_SWITCH` を作成し、値を `true` にすると、コードを一切触らずに**生成・投稿の両方を即座に停止**できます。再開する場合は値を `false` にするか、変数自体を削除してください。

### 重複投稿防止（ledger）
`ledger/<話題>.json` に、投稿済みの日付が記録されます。何らかの理由でワークフローが同じ日に二重に実行されても、すでに投稿済みの日付であれば自動的にスキップされ、二重投稿を防ぎます。このファイルはPublish後に自動でmainブランチにコミットされます。

### 意思決定ログ
`DECISIONS.md` に、これまでの設計判断とその理由を記録しています。新しい判断をしたら、同じ形式で追記していくことをおすすめします。

## トラブルシューティング

- **PRに画像が出てこない** → Actionsのログで `render-cards.mjs` のエラーを確認（Puppeteerのインストール失敗が多いケースです）
- **動画が生成されない** → `ffmpeg` はubuntu-latestに標準搭載されていますが、念のためActionsログを確認してください
- **Merge後にSNS投稿されない** → GitHubの「Publish After Approval」ワークフローのログを確認。Zapier側のタスク履歴（Zap History）も合わせて確認してください
- **画像が表示されない（Zapier/Buffer側）** → リポジトリがPublicになっているか、`output/<話題>/<日付>/` のパスが正しいか確認してください

## 新しい話題を追加する方法

1. `config/topics/` に新しいJSONファイルを作成（`ai-news.json` をコピーして編集するのが簡単です）。`slug`をファイル名と一致させてください
2. 必要であれば `config/affiliate-links/<slug>.json` も作成（アフィリエイトリンクを使わないなら省略可）
3. GitHub Secretsの `ZAPIER_WEBHOOKS_JSON` に、その話題用のWebhook URLを追加登録
4. Zapier側にもその話題用のZapを新規作成（画像・キャプションの送信先チャンネルを話題ごとに分ける）
5. あとは何もしなくてOK。次回のスケジュール実行から自動的にその話題も対象になります（ワークフローYAMLの編集は不要です）
