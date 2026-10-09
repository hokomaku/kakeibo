# ふたりの家計簿（スターター）

GitHub Pages + React + TypeScript + Vite + Supabase の家計簿アプリ土台です。
既存プロジェクトと分離して、新しいGitHubリポジトリと新しいSupabaseプロジェクトで利用してください。

## 含まれるもの

- メールアドレス・パスワードログイン
- 月次カレンダー、日別収入・支出集計
- 取引の登録・修正・削除（削除履歴は保存しない）
- 取引検索：日付、カテゴリ、収支区分、支払者、クレジット、金額、メモ
- 月次収支、カテゴリ別支出
- 月次予算の入力・実績差額
- 月ごとのクレジット利用額照合
- Supabase RLSスキーマ

## 1. 新規Supabaseプロジェクト

1. Supabaseで家計簿専用プロジェクトを新規作成します。
2. SQL Editorで `supabase/schema.sql` を実行します。
3. Authenticationで夫婦2人のアカウントを招待/作成します。公開サインアップは無効のままにします。
4. AuthenticationのUsersから2人のUser UIDをコピーします。
5. README内SQLのbootstrap部分をコピーし、2つのUIDに置換してSQL Editorで実行します。1世帯を作成し、2人をメンバー登録します。
6. 作成されたhousehold UUIDを使い、初期カテゴリseed SQLを実行します。
7. Project URLと公開用キー（Publishable key、または旧形式のanon key）を控えます。`service_role` / secret keyは使いません。

> RLSポリシーは世帯メンバーのアクセスを制限します。`household_members`への登録はSupabase管理画面/SQL Editorで行い、クライアントからメンバーを追加できるポリシーは設けていません。

## 2. ローカルで実行

Node.js 20+を用意してから:

```bash
npm install
cp .env.example .env.local
```

`.env.local` を編集:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

続いて:

```bash
npm run dev
```

## 3. GitHub Pagesへ公開

1. このフォルダを新しいGitHubリポジトリにpushし、デフォルトブランチを `main` にします。
2. GitHubリポジトリの Settings → Secrets and variables → Actions → Variables に次の変数を登録:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. `vite.config.ts` の `REPOSITORY_NAME` を実際のリポジトリ名に変更します。例: リポジトリ名が `kakeibo` なら `'/kakeibo/'`。
4. GitHubリポジトリの Settings → Pages → Build and deployment で **GitHub Actions** を選びます。
5. `main` にpushするとActionsがビルド・公開します。

GitHub PagesはHTTPSで公開されるため、公開用Supabaseキーはブラウザから見える前提です。安全性はキーを隠すことではなく、RLS・認証・メンバー制御で確保します。

## 4. Supabase Authの設定

- 公開サインアップを無効にし、夫婦のアカウントだけを管理者が作成/招待します。
- Authentication → URL ConfigurationでSite URLとRedirect URLsに、実際のGitHub Pages URLを登録します。
- パスワードリセット等のメールリンクもGitHub Pages URLに戻るように設定します。
- 夫婦2アカウントでそれぞれログインし、双方が同じデータを見られることを確認します。
- 別のテストアカウントでログインした場合、取引・予算にアクセスできないことを確認します。

## 注意事項 / 今後の改善

- このスターターは最大5,000件の取引をクライアント側で読み込む実装です。データが増えたらページネーションとDB側集計に変更してください。
- カテゴリ追加UIはまだ最小版に含まれていません。初期カテゴリをSQLで投入できます。今後「設定」画面を追加してカテゴリの追加・無効化を行います。
- 予算画面では全体予算とカテゴリ予算を管理します。予算の一意制約にはPostgreSQLの `UNIQUE NULLS NOT DISTINCT`（PostgreSQL 15+）を使用しています。
- GitHub Pagesは静的サイトです。秘密鍵、service_roleキー、DBパスワードをフロントエンドやGitHub Variablesへ入れないでください。
- クレジット差額は同じ利用期間同士で比較してください。請求月と利用日ベースの月は一致しない場合があります。
- 本番公開前に、RLSテスト、スマートフォン表示、データ復元方法を確認してください。
