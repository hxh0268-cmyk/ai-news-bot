# AI News Monetization Engine（Phase 1〜5・設計ドキュメント）

> 実装: `scripts/monetization/`。日次自動生成フロー（`.github/actions/generate-content/action.yml`）
> にShadow Mode（Section 27 Stage 1）として組み込み済み。既存の公開判断には一切影響しない。

## 1. 目的

既存のニュース自動投稿を、「価値判定→信頼性判定→媒体別配信→KPI計測」という
選別・配信・計測基盤に進化させる（詳細は実装指示書 Section 0・38参照）。

## 2. アーキテクチャ概要

```
data.json（既存STEP1の出力）
  ↓
dedup.mjs                  … 重複排除（URL/正規化タイトル/bigram類似度）
  ↓
classify-news.mjs          … カテゴリ・contentType・高リスク判定（lightest tier）
  ↓
score-commercial.mjs       … Commercial Score 0〜100（lightest tier）
score-reliability.mjs      … Reliability Score 0〜100（lightest tier）
  ↓
distribution-decision.mjs  … 統合判定テーブル(Section 10.1)で単一の最終判定
  ↓
[Shadow Modeでは、ここで止まる。実際のチャネル生成・公開には進まない]
  ↓ (SHADOW_MODE_GENERATE_CONTENT=true時のみ、許可されたチャネルだけ)
generate-channel-content.mjs … Web速報(mid)/Web解説(high)/X投稿(mid)を個別生成
```

すべての設定値（重み・閾値・モデルTier）は `config/*.json` に外出しされており、
コードの変更なしに調整できる。

## 3. 既存KILL_SWITCH / recovery-check.ymlとの関係

**独立した経路として実装した。** 理由:

- `recovery-check.yml`は「generate.ymlの各トピックジョブのconclusion」を見る
  インフラ障害検知の仕組みで、STEP1〜STEP3cで例外が発生しジョブ自体が失敗した
  場合にのみ、bounded 1日1回の再トリガーを行う。
- 本エンジンの判定（`LOW_COMMERCIAL_VALUE`・`LOW_RELIABILITY`・
  `HUMAN_REVIEW_REQUIRED`・`DUPLICATE_CONTENT`）は、**エンジンが正常に動作した
  結果としての却下・保留**であり、インフラ障害ではない。これを
  `recovery-check.yml`の経路に混ぜると、正しく却下された候補が誤って
  「障害」として再トリガーされてしまう。
- そのため`scripts/monetization/failure-taxonomy.mjs`では、DECISION系
  （エンジン自身の判定結果）とINFRA系（API呼び出し失敗等）を明確に分離した。
  INFRA系（`PROVIDER_FAILED`等）は、既存の`scripts/retry.mjs`
  （`withRetry`）による同一プロセス内リトライを第一防波堤とし、それでも
  失敗する場合は`STEP1.6`ステップ自体が失敗するが、
  `continue-on-error: true`を付与しているため**既存パイプライン全体は
  止まらない**（＝recovery-check.ymlの再トリガー対象にもならない。これは
  意図的で、Shadow Mode中の診断ステップの不調で本番の投稿フローを止めない
  ため）。
- KILL_SWITCHとも連動させていない。KILL_SWITCHは「運用を止める」ための
  意図的なスイッチであり、個々の記事の品質判定とは性質が異なるため。

## 4. Human Review Escalation（Section 25）と実際のPR組み込みについて

`scripts/monetization/human-review-escalation.mjs`（警告文言・ラベルの
フォーマットロジック）と`apply-human-review-escalation.mjs`（実際に
`gh pr edit`でPRへ反映する適用ロジック）を分離して実装した。

- フォーマットロジックはテスト済みで「機能する」（Section 35の完了条件）。
- 適用ロジックは、既存の`generate.yml`（本番の日次生成ワークフロー）からは
  **呼び出していない**。理由: これは実質的にSection 27の「Stage 2:
  Advisory Mode」への切り替えに相当し、Section 27自身が
  「Stage 2/3への移行は今回のスコープに含めなくてよい（設計だけ用意し、
  実際の切り替えは別途人間の承認を得てから行う）」としているため。
- Stage 2へ進める際は、`.github/workflows/generate.yml`の
  「生成物をPull Requestとして提出」ステップの後に、
  `apply-human-review-escalation.mjs`を呼び出すステップを追加するだけで
  組み込める設計にしてある。

## 5. Shadow Mode運用ルール（Section 27 Stage 1）

`.github/actions/generate-content/action.yml`の `STEP1.6` として、日次実行の
たびに自動的に重複排除・スコアリング・配信判定が走り、
`output/<topic>/<date>/monetization-engine-report.md`（人間可読）と
`monetization-engine-report.json`（構造化データ）、
`monetization-engine-shadow.log.jsonl`（Section 23の構造化ログ）が
出力される。これらは既存のPR作成ステップの`add-paths`
（`output/${{ matrix.topic }}/**`）に既に含まれるため、追加設定なしで
日次のPRに同梱される。

**Stage 2（Advisory Mode）・Stage 3（Enforced Mode）への移行は、
最低3〜5日分のShadow Modeログを人間が確認し、明示的に承認した後に
行うこと。** 移行判断のポイント:

- `monetization-engine-report.md`の判定（`distributionDecision`）が、
  実際にその日公開された記事の実感（重要度・反応）と大きく乖離していないか
- `HUMAN_REVIEW_REQUIRED`の頻度が異常に高すぎ/低すぎないか
- Commercial Scoreの`breakdown`が、明らかに変な理由付けをしていないか
  （`reasoningSummary`を確認）

## 6. Section 26: Initial Rollout Human Spot-Check 運用ルール

`config/human-review-spotcheck.json`にフェーズ定義を持つ。運用開始日
（`rolloutStartDate`）をShadow Mode開始時に設定し、経過日数に応じて
以下のスポットチェック比率を適用する。

| フェーズ | 期間 | 対象 | 抽出率 |
|---|---|---|---|
| week1-2 | 導入後14日 | FULL_DISTRIBUTION / WEB_AND_X | 100% |
| week3-4 | 15〜28日 | 同上 | 30% |
| week5以降 | 29日〜 | 同上 | 10% |
| （常時） | - | high-riskカテゴリ | 100% |

### スポットチェック記録方法（大掛かりなダッシュボードは作らない）

`metrics/human-review-spotcheck.md` に、以下の形式で1行ずつ手動追記する
簡易ログ運用を提案する（既存の`metrics/<topic>/<週>.json`と同様、
軽量な手入力運用）。

```markdown
| 日付 | 見出し | Commercial | Reliability | 判定 | 人間の妥当性評価 | コメント |
|---|---|---:|---:|---|---|---|
| 2026-09-15 | (見出し) | 86 | 90 | FULL_DISTRIBUTION | 妥当 | - |
| 2026-09-15 | (見出し) | 72 | 80 | WEB_AND_X | 要調整 | note深掘り可能性を過小評価している |
```

「人間の妥当性評価」列が「要調整」の件数が多い場合、
`config/content-scoring.json`の重みを見直す（configのみの変更で対応でき、
コード変更は不要）。

## 7. Known Gaps（隠さず記載）

- 実際のLLM出力品質（本当に120字以内に収まるか等）は、このリポジトリに
  provider層のモック機構が無いため単体テストでは検証していない
  （プロンプト・ツールschemaが制約を要求する構造になっていることのみ検証）。
  次回の実際のワークフロー実行での確認が必要。
- `run-shadow-mode.mjs`の実際のAPI呼び出し（classify/scoring）は、
  ローカル開発環境にAPIキーが無いため、このセッションではライブ実行できて
  いない。`node --check`によるシンタックス確認と、API未設定時に
  fail-closedでエラーになることのみ確認済み。次回の日次実行
  （STEP1.6、continue-on-error付き）で実際の動作を確認すること。
- 「semantic similarity」は文字bigramのJaccard類似度による軽量な近似で、
  埋め込みモデル等は導入していない（over-engineering回避のための意図的な
  簡略化）。語順が大きく異なる言い換えは検出できない場合がある。
