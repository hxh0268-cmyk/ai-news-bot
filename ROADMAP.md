# 完成までの全手順ロードマップ（最新版）
## 毎日のAIニュース自動収集 → 高品質な画像/動画/音声生成 → SNS自動投稿 → 収益化（アフィリエイト・広告・note販売）

> Human Checkは実質1回（PRのMerge）＋note投稿のみ手動3分
> 所要時間の目安：初回セットアップ全体で4〜6時間（大半は「審査待ち」の待機時間）
> 月額費用の目安：**約2,600〜6,000円/月**

---

## フェーズ0：全体像を把握する

```
①GitHub Actionsが毎日決まった時刻に自動起動
②Claude APIが最新AIニュース7本を収集・重要度で並べ替え
③アフィリエイトリンクを自動挿入／PR表記を自動付与（該当日のみ）
④Nano Banana 2 Liteが5本の背景ビジュアルを生成
⑤5枚の画像カード（背景＋見出し・数値）を合成
⑥ElevenLabsがナレーション音声を生成、5枚の画像によるスライドショー動画に合成
⑦広告枠付きの記事サイト（GitHub Pages）を生成
⑧note販売用の記事ドラフトを生成
⑨Pull Requestを自動作成
⑩あなたが内容を確認し「Merge」　★Human Check（メイン）★
⑪Zapier→Bufferを経由してX・Threads・Instagramへ自動投稿
⑫あなたがnote-article.mdをnoteに貼り付け・価格設定・公開　★手動（3分）★
```

準備するアカウントは **Anthropic／Google AI Studio（Gemini）／ElevenLabs／GitHub／Buffer／Zapier** の6つです。上から順に作っていきます。

> 2026-09時点の更新：コスト最適化のため、Kling AI（動画クリップ生成）は廃止しました。動画は5枚のカード画像による静止画スライドショー＋ナレーションのみで構成されます（下記フェーズ4は廃止済みです）。

---

## フェーズ1：Instagram・Threadsをビジネスアカウント化する

**費用：無料／所要時間：5分**

1. Instagramアプリ →プロフィール→右上「三」→「設定とプライバシー」
2. 「アカウントの種類とツール」→「プロアカウントに切り替える」
3. カテゴリを選び、「クリエイター」または「ビジネス」を選択
4. 案内に沿って完了（Facebookページ連携が必要な場合は新規作成でOK）

Threadsは同じアカウントに連動するため、これで両方の準備が整います。

---

## フェーズ2：Anthropic（Claude）APIキーを取得する

**費用：従量課金、月500〜2,000円程度／所要時間：10分**

1. https://console.anthropic.com/ でアカウント作成
2. 「Billing」でカード登録、$5〜10程度チャージ
3. 「API Keys」→「Create Key」→キーをコピーして保存（`sk-ant-...`）

---

## フェーズ3：Nano Banana 2 Lite（Google Gemini API）のキーを取得する

**費用：従量課金、月100〜300円程度／所要時間：10分**

1. https://aistudio.google.com/ にGoogleアカウントでログイン
2. 「Get API key」→「Create API key」
3. 課金設定（Billing）を有効化
4. キーをコピーして保存

---

## フェーズ4：（廃止）

コスト最適化のため、Kling AIによる動画クリップ生成は廃止しました。このフェーズの作業は不要です。動画は5枚のカード画像による静止画スライドショー＋ナレーションのみで生成されます（フェーズ番号は既存のドキュメント参照との整合のため欠番のまま残しています）。

---

## フェーズ5：ElevenLabsのキーを取得する

**費用：無料枠あり、本格運用は月5ドル〜／所要時間：10分**

1. https://elevenlabs.io/ でアカウント作成
2. 「Profile」→「API Keys」からキーを発行
3. 「Voices」から使いたい声を選び、Voice IDを控える

---

## フェーズ6：GitHubリポジトリを作成し、ファイル一式をアップロードする

**費用：無料／所要時間：15分**

1. https://github.com/ でアカウント作成
2. 「New repository」→**Public**で作成（画像・動画を外部サービスが読み込むために必須）
3. お渡しした一式（`.github`／`scripts`／`config`／`docs`フォルダ、`package.json`、各種`.md`ファイル）をすべてアップロード
   - 隠しフォルダ`.github`がブラウザでアップロードしづらい場合は「GitHub Desktop」アプリの利用をおすすめします

---

## フェーズ7：GitHub Secretsに全キーを登録する

**費用：無料／所要時間：10分**

リポジトリの `Settings → Secrets and variables → Actions` から、以下をすべて登録します。

| Name | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | フェーズ2で取得 |
| `GEMINI_API_KEY` | フェーズ3で取得 |
| `ELEVENLABS_API_KEY` | フェーズ5で取得 |
| `ELEVENLABS_VOICE_ID` | フェーズ5で確認したVoice ID |
| `GA_MEASUREMENT_ID` | Google Analytics 4の測定ID（任意・効果測定用） |
| `SLACK_WEBHOOK_URL` | 障害通知先のSlack Webhook URL（任意） |
| `ZAPIER_WEBHOOKS_JSON` | 話題ごとのWebhook URLをまとめたJSON。例: `{"ai-news": "https://hooks.zapier.com/..."}` |
| `ADSENSE_CLIENT_ID` | 今は空欄でOK（フェーズ11で追加） |

---

## フェーズ7.5：安全機構を確認する（killスイッチ・重複防止）

**費用：無料／所要時間：3分**

1. `Settings → Secrets and variables → Actions → Variables` タブを開く
2. 何もしなければ通常運用（`KILL_SWITCH`を作成しない、または`false`のままでOK）
3. 緊急停止したくなったら、ここで`KILL_SWITCH`を`true`に設定するだけで、生成・投稿の両方が即座に止まります
4. `ledger/ai-news.json` には投稿済みの日付が自動記録されます。手動で編集する必要は基本的にありません

---

## フェーズ8：GitHub Pagesを有効化する（広告表示用サイト）

**費用：無料／所要時間：3分**

1. `Settings → Pages`
2. Source: `Deploy from a branch` / Branch: `main` / フォルダ: `/docs` → Save
3. `https://（アカウント名）.github.io/（リポジトリ名）/` で公開されます

---

## フェーズ9：Bufferをセットアップし、3媒体を接続する

**費用：月2,000〜2,700円程度（3チャンネル分）／所要時間：20分**

1. https://buffer.com/ でアカウント作成
2. 「Connect a channel」でX・Instagram（ビジネス/クリエイターアカウント）・Threadsをそれぞれ接続

---

## フェーズ10：Zapierをセットアップする

**費用：無料プランで開始可能／所要時間：20分**

1. https://zapier.com/ でアカウント作成
2. 「Create Zap」→トリガー「Webhooks by Zapier」→「Catch Hook」
3. 表示されたWebhook URLをコピー →フェーズ7の`ZAPIER_WEBHOOKS_JSON`に `{"ai-news": "コピーしたURL"}` の形式で登録
4. アクション「Buffer」→「Create a Post」を追加、Bufferと連携
5. `carouselCaptionX`／`carouselCaptionThreads`／`carouselCaptionInstagram`と`images`をマッピング
6. 媒体ごとに投稿内容を分けたい場合は、アクションを3つに分けてそれぞれ設定
7. Zapを「オン」に

---

## フェーズ11：アフィリエイトリンク登録・AdSense申請（並行作業）

**費用：無料（審査に日数がかかる場合あり）**

### アフィリエイトリンク
1. HeyGen・Pictory・Runway・Vrew・ElevenLabs・Klingなど扱いたいツールの公式サイトで「Affiliate Program」に登録
2. 発行されたリンクを、GitHubリポジトリ上の `config/affiliate-links.json` の該当箇所に貼り付け

### Google AdSense
1. https://www.google.com/adsense/ で、フェーズ8のサイトURLを申請
2. 承認後、発行された `ca-pub-XXXXXXXXXX` を `ADSENSE_CLIENT_ID` に登録

---

## フェーズ12：動作確認する

**費用：無料（各APIの通常利用分のみ）／所要時間：10分＋生成待機**

1. 「Actions」タブ →「Daily Content - Generate & Request Check」→「Run workflow」
2. 完了後、「Pull requests」タブでPRを開く
3. 以下を確認：
   - `output/ai-news/<日付>/cards/1〜5.png`（画像）
   - `output/ai-news/<日付>/slideshow.mp4`（動画・5枚のカード画像によるスライドショー＋ナレーション）
   - `output/ai-news/<日付>/note-article.md`（note記事案）
   - `output/ai-news/<日付>/monetization-report.md`（アフィリエイト・PR表記の確認）
4. 問題なければ「Merge」　★これがメインのHuman Check★
5. 自動的に「Daily Content - Publish After Approval」が起動 →Zapier→Bufferへ送信→SNS投稿
6. 実際にX/Threads/Instagramで投稿を確認

---

## フェーズ13：note販売（唯一の追加手動ステップ）

**費用：無料／所要時間：1日3分**

1. `output/ai-news/<日付>/note-article.md` を開く（ファイル冒頭に手順あり）
2. `---PAYWALL---` より前を無料部分、以降を有料部分としてnoteエディタに貼り付け
3. ファイル末尾の「想定価格」「タグ案」を参考に設定
4. 公開

---

## フェーズ13.5：週次レビューを運用に組み込む

**費用：無料（AI分析はClaude APIの通常利用分のみ）／所要時間：毎週5分**

1. 毎週月曜に自動でPRが作成されます（`Weekly Review`ワークフロー）
2. `metrics/ai-news/<週>.json` を開き、Buffer・GA4・noteの管理画面を見ながら、分かる範囲の数字を入力
3. GitHub Actionsの「Run workflow」から`Weekly Review`を再実行すると、入力した数値を反映したレポートに更新されます
4. `output/ai-news/weekly-reviews/<週>.md` の改善提案を確認し、必要なら`config/topics/ai-news.json`のsystemPromptを調整
5. 問題なければPRをMerge

---

## フェーズ14：本運用へ

毎日、以下が自動で繰り返されます。

- 決まった時刻にPRが自動作成される
- あなたが内容を確認しMerge（GO）
- note記事の貼り付け・価格設定・公開（3分）
- それ以外はすべて自動

---

## 費用まとめ（月額目安）

| 項目 | 費用目安 |
|---|---|
| Claude API | 500〜2,000円 |
| Nano Banana 2 Lite（Gemini API） | 100〜300円 |
| ElevenLabs（ナレーション） | 0〜1,000円 |
| Buffer（3チャンネル） | 2,000〜2,700円 |
| Zapier | 0円（無料プラン） |
| GitHub／GitHub Pages／AdSense／ASP登録／note | 0円 |
| **合計目安** | **約2,600〜6,000円/月** |

**収益源**：X/Threads/Instagram経由のPR案件、記事サイトの広告収益・アフィリエイト報酬、note有料記事販売の3系統。

---

## つまずきやすいポイント

- **`.github`フォルダがアップロードできない** → GitHub Desktopアプリの利用を検討
- **Zapierのマッピングで迷う** → 一度Webhookをテスト送信すると、データ項目がドロップダウンに表示されて選びやすくなります
- **Instagram/Threads連携エラー** → ビジネス/クリエイターアカウントになっているか再確認
- **PRが作成されない** → Actionsタブのログを確認し、共有いただければ一緒に確認します

---

## フェーズ15：新しい話題を追加したくなったら

**費用：話題数に応じて増加（フェーズ2・3・5・9の費用が話題数倍になる）／所要時間：30分**

このプログラムは「話題ごとの設定ファイルを追加するだけ」で新しいテーマを並行運用できる構造になっています。

1. `config/topics/` フォルダに新しいJSONファイルを作成（`ai-news.json` をコピーして、`slug`・`displayName`・`systemPrompt`などを書き換えるのが簡単です）
2. 新しい話題用のアフィリエイトリンクを使うなら `config/affiliate-links/<slug>.json` も作成
3. 新しい話題用のSNSアカウント（X/Threads/Instagram）を用意し、Bufferに接続（フェーズ9と同じ手順）
4. Zapierで新しい話題専用のZapを作成し、Webhook URLを取得
5. GitHub Secretsの `ZAPIER_WEBHOOKS_JSON` に、その話題のキーを追加登録（例：`{"ai-news": "...", "finance-news": "新しいURL"}`）
6. 以上で完了。**ワークフローYAML自体の編集は不要**で、次回のスケジュール実行から自動的に新しい話題も一緒に処理されます（話題ごとに別々のPRが作成されます）

---

わからない箇所が出てきたら、その画面のスクリーンショットを共有いただければ、その場で一緒に解決していきます。
