# 📋 ai-news-bot 引き継ぎメモ(2026-09-18 更新版)

## プロジェクト概要
- GitHub Actions → Claude/Gemini/ElevenLabsで生成 → PR確認・Merge → Zapier → Buffer → X/Instagram/Threads投稿
- リポジトリ: hxh0268-cmyk/ai-news-bot
- 公開サイト: https://hxh0268-cmyk.github.io/ai-news-bot/ai-news/
- 開発環境: Cursor上のClaude Code。指示文はClaude(このチャット)が用意し、ユーザーがCursorに貼り付けて実行する運用

## 現在の運用状態
- 毎日の日次自動生成(cron: 22:17 UTC)は安定稼働中
- 日次ルーティン: Slack確認 → PR内容確認(カテゴリ多様性・見出し文体・背景画像の疑似テキストをチェック) → マージ → オープンPR0件を確認
- SNS投稿(X/Instagram/Threads)はZapier(Copy版, v5)→Buffer経由で正常稼働中。Bufferプラン: ESSENTIALS($18/月)

## 9/13〜9/18に対応した主要な不具合・作業

### サイト表示関連
- サムネイル画像を縦長カード(1080×1350)から横長カード(1200×675)に変更(PR #64)
- render-cards.mjsのWebフォント読み込みレースコンディションを修正、フッター文字化けを解消(PR #65)
- **.thumbAPIキーなしでも疎通確認できる**モックプロバイダ(MOCK_MODE)**を導入(PR #74)。npm testの不具合(壊れたglob指定で実は1件も走っていなかった)も合わせて修正
- 新規トピック拡張の方向性は「②AIマネタイズ副業」を最有力候補として検討したが、**最終決定はまだ**

## 課金整理の結果(2026-09-16調査)

| 項目 | 状態 | 対応 |
|---|---|---|
| Anthropic API(console.anthropic.com) | 必須・稼働中 | 記事生成の中核。継続 |
| ElevenLabs | 必須・稼働中 | 音声ナレーション生成。継続 |
| Buffer($18/月) | 必須・稼働中 | SNS投稿管理。継続 |
| Cursor IDE / Cursor Usage | 必須・稼働中 | Claude Code(Agent)実行基盤。継続 |
| Claude Pro(claude.ai) | 必須 | 対話用サブスク(Cursor上のClaude Code含む)。継続 |
| fal.ai | 解約済み | 過去のAI-SNS-Automation側での使用が原因と判明。Auto top-up OFF確認、孤立していたFAL_KEY(GitHub Secrets)も削除済み |
| X Developer Platform | 判断待ち(9/22頃に再確認) | AI-SNS-Automationの「X Daily Post」ワークフローが原因と判明。9/16に同リポジトリの全ワークフローを無効化。9/16〜9/18の3日間、新規リクエスト0件を確認済み。1週間0件が続けば解約検討 |
| OpenAI API / ChatGPTサブスク | 本プロジェクトと無関係と確定 | 個人のChatGPT利用分。対応不要 |

## 【重要】AI-SNS-Automationプロジェクトについて
- 過去に運用していた別プロジェクト(hxh0268-cmyk/AI-SNS-Automation)。X APIへの直接投稿等、ai-news-botとは別方式で毎日自動実行され続けていた
- ai-news-botには不要と判断し、**2026-09-16に全5ワークフロー(X Daily Post, Nightly Apply Workflow, Performance Trend Analysis/Experimental, Quality Pipeline CI)を無効化**
- リポジトリ自体の削除・アーカイブはまだ実施していない(情報保持のため保留中)
- 教訓: 「触っていない」プロジェクトでもGitHub Actionsのcronは動き続ける。今後、使わなくなったプロジェクトは早めにワークフロー無効化を徹底すること

## 保留・待機中の項目

| 項目 | 条件 |
|---|---|
| AdSense申請 | archiveの記事数が15〜20件になるまで待つ(9/18時点で14件。あと数日で到達見込み)。お問い合わせページは整備済み |
| note特商法表記 | note販売開始・売上規模が見えてから判断 |
| 収益化エンジン・AIマネタイズ記事の本番接続 | mainにマージ済みだが、Shadow Mode等の有効化はまだ判断していない。数日〜1週間様子を見てから改めて相談 |
| X Developer Platformの最終解約判断 | 9/16〜の使用状況を1週間観察(9/22頃に再確認予定) |
| AI-SNS-Automationリポジトリの削除・アーカイブ | ワークフロー無効化のみ実施。削除は後日判断 |
| 新規トピック拡張の最終決定 | ②AIマネタイズ副業が有力候補。ASP登録は未着手 |

## まだ効果検証が完了していない項目
- AIマネタイズ記事生成の「ツール呼び出し構造の破損」(実API検証で3件中2件発生、リトライで最終的に解消)は、原因(Claude側の出力乱れ)が未解消のまま。本番投入する場合はリトライ頻度を要観察

## 次にやること
- 毎日の運用確認を継続(Slack確認・オープンPR確認・SNS投稿の実反映確認)
- 9/22頃、X Developer Platformの使用状況を再確認し、解約可否を最終判断
- archiveが15〜20件に達したらAdSense申請を実施
- 収益化エンジン・AIマネタイズ記事の本番接続タイミングを検討
