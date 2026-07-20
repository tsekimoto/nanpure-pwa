# 毎日ナンプレ PWA

ブラウザで動作するナンプレ（数独）PWAです。

## 公開方法

ブラウザから利用できるように、GitHub Pages 向けの自動デプロイ設定を同梱しています。

1. GitHub のリポジトリ設定で **Settings > Pages > Source** を **GitHub Actions** にします。
2. `main` または `master` ブランチへ push すると、`.github/workflows/deploy-pages.yml` が静的ファイル一式を GitHub Pages に公開します。
3. Actions の `Deploy PWA to GitHub Pages` 実行結果に表示される URL をブラウザで開いて利用してください。

手動で公開する場合は、このフォルダの中身をそのまま Cloudflare Pages / Netlify などの静的ホスティングにアップロードしてください。

PWAとしてインストール可能にするには、原則として HTTPS 配信が必要です。localhost はテスト用途として例外的に利用できます。

## ローカル確認

ファイルを直接開くのではなく、簡易サーバーで確認してください。

```bash
cd nanpure-pwa
python -m http.server 8000
```

その後、ブラウザで以下を開きます。

```text
http://localhost:8000/
```

## ファイル構成

```text
nanpure-pwa/
├── index.html
├── manifest.json
├── sw.js
├── privacy.html
├── README.md
├── css/
│   └── style.css
├── js/
│   └── app.js
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## 機能一覧

| 機能 | 説明 |
|---|---|
| 問題一覧 | 難易度別（初級/中級/上級）に10問ずつ |
| デイリー | カレンダーから日付を選び、難易度別に出題 |
| メモモード | セルに候補数字を小さく記入 |
| ヒント | 1問につき3回まで。正解を自動入力 |
| リセット | 問題を初期状態に戻す |
| 進捗保存 | localStorage に自動保存 |
| PWA | manifest / Service Worker / アイコン対応 |

## リリース向け修正内容

- `manifest.json` にPWAアイコンを追加
- `sw.js` を追加し、主要ファイルをキャッシュ
- 外部CDN依存を削除
- ローカル日付基準でデイリー日付を生成
- ナンプレ問題の一意解チェックを追加
- `privacy.html` を追加

## 注意事項

初期リリース時点では広告・アクセス解析は未導入です。広告を導入する場合は、プライバシーポリシーの更新が必要です。

## データ保存形式（localStorage キー）

| キー | 内容 |
|---|---|
| `np:lp:{diff}:{i}` | 問題一覧の問題データ |
| `np:lpg:{diff}:{i}` | 問題一覧の進捗 |
| `np:dp:{date}:{diff}` | デイリー問題データ |
| `np:dpg:{date}:{diff}` | デイリー進捗 |
| `np:solveCount` | クリア回数 |
