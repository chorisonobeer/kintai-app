# PowerShellコマンド生成ルール

## 基本原則

- スクリプトファイルは作成せず、直接実行可能なPowerShellコマンドのみを提供する
- 構文エラーを避けるため、以下のルールに従う

## 過去のエラーと改善点

### 1. URL引用符エラー

**問題**: URLに特殊文字が含まれる場合の引用符処理

```powershell
# ❌ 間違い
Invoke-WebRequest "https://script.google.com/macros/s/AKfycbwtest/exec?action=testAccess"

# ✅ 正しい
Invoke-WebRequest 'https://script.google.com/macros/s/AKfycbwtest/exec?action=testAccess'
```

**ルール**: URLパラメータを含む場合は単一引用符を使用する

### 2. パラメータ構文エラー

**問題**: 複数パラメータの結合方法

```powershell
# ❌ 間違い
Invoke-WebRequest "https://example.com?param1=value1&param2=value2"

# ✅ 正しい
Invoke-WebRequest 'https://example.com?param1=value1&param2=value2'
```

**ルール**: クエリパラメータは単一引用符で囲み、&記号をエスケープしない

### 3. 式解析エラー

**問題**: PowerShellの特殊文字の誤った処理

```powershell
# ❌ 間違い
Invoke-WebRequest "URL with $variable or `backticks`"

# ✅ 正しい
Invoke-WebRequest 'URL with literal text'
```

**ルール**: 変数展開や特殊文字を避けるため、リテラル文字列には単一引用符を使用

## PowerShellコマンド生成時のチェックリスト

1. **引用符の選択**

   - URLやパスには単一引用符 `'` を使用
   - 変数展開が必要な場合のみ二重引用符 `"` を使用

2. **特殊文字の処理**

   - `&`, `?`, `=` などのURL文字はエスケープ不要（単一引用符内）
   - `$`, `` ` ``, `"` などのPowerShell特殊文字に注意

3. **パラメータの構造**

   - `-Uri` パラメータを明示的に指定
   - 必要に応じて `-Method` パラメータを指定

4. **テスト用コマンド例**

```powershell
# 基本的なGETリクエスト
Invoke-WebRequest -Uri 'https://example.com/api?action=test'

# パラメータ付きリクエスト
Invoke-WebRequest -Uri 'https://example.com/api?action=getData&id=123'

# POSTリクエスト
Invoke-WebRequest -Uri 'https://example.com/api' -Method POST -Body '{"key":"value"}' -ContentType 'application/json'
```

## 禁止事項

- `.ps1` スクリプトファイルの作成は行わない
- 複雑な処理は単一のPowerShellコマンドで実行
- エラーが発生した場合は、このルールを参照して修正版を提供

## 更新履歴

- 2025-01-15: 初版作成（URL引用符エラー、パラメータ構文エラー対応）
