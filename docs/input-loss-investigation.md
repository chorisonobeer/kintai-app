# 日次入力中のデータ消失（初期値へのリセット）調査報告

## 概要
- 事象: 日次入力画面で入力途中の値が保持されず、初期値に戻ってしまう事象が頻発。
- 影響: 入力体験の大幅な低下、保存漏れの誘発、ユーザー不信。
- 結論: 以下の複合要因により「フォーム初期化処理」が過剰に実行される設計になっており、入力途中の値がリセットされる。
  - A) フォームの`useEffect`依存関係が不安定で頻繁に再実行され、かつ「編集中でない場合に初期化」するロジックが存在。
  - B) Service Workerによる新バージョン検知時の「自動リロード」設計。
  - C) 開発環境の`React.StrictMode`による`useEffect`の二重実行。

## 症状の詳細
- 入力中（まだ保存していない状態）に、フィールド値（出勤/休憩/退勤/勤務場所）が初期値に戻る。
- タイミングは一定せず、「別要素に操作した直後」「数秒後」「最前面切り替え直後」など様々。
- スクロールや表示高さ調整に伴う再レンダリング後に起きることもある。

## 調査方法
- 対象ファイルの構造と副作用を確認。
  - `src/components/KintaiForm.tsx`（フォームの状態・副作用）
  - `src/contexts/KintaiContext.tsx`（月次データと補助関数の提供）
  - `public/sw.js` / `src/App.tsx` / `src/main.tsx`（バージョン更新・自動リロード）
- コード参照・依存関係分析・実行タイミングの推定を実施。

## 確認できた主原因（確定）

### A. フォーム`useEffect`の依存過多 × 非編集時初期化ロジック
- 該当箇所: `src/components/KintaiForm.tsx`
  - 「日付変更時のデータロード」`useEffect`が以下に依存。
    ```ts
    // 依存リスト（抜粋）
    [
      deferredDate,
      monthlyData,
      currentYear,
      currentMonth,
      compareLogics,
      getKintaiDataByDate,
      isDateEntered,
      isDateEnteredNew,
    ]
    ```
  - 効果の先頭で「編集中でない場合のみ初期化」しており、入力途中（多くの場合`isEditing`がfalse）に初期化が走る設計。
    ```ts
    // KintaiForm.tsx: 292-334 付近
    startTransition(() => {
      setIsDataLoading(true);
      setErrors({});
      if (!formState.isEditing) {
        setStartTime("");
        setBreakTime("");
        setEndTime("");
        setLocation("");
        setWorkingTime("");
        dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
      }
    });
    ```
- 問題点:
  - 依存関数（`compareLogics`/`getKintaiDataByDate`/`isDateEntered`/`isDateEnteredNew`）は`KintaiContext`内で毎レンダリングごとに新しい関数インスタンスとして生成（メモ化なし）。
  - そのため、コンテキストが更新されるたびにフォームの`useEffect`が再実行され、非編集時初期化が多発。
- 追加要素:
  - `monthlyData`などのデータ更新、`currentYear/currentMonth`の変化でも同効果が発火。
  - 「長押しで編集モードに入る」設計のため、新規入力中は`isEditing=false`のままになりがちで、リセット対象となる。

### B. Service Workerによる新バージョン検知時の自動リロード
- 該当箇所: `public/sw.js` / `src/App.tsx`
  - Service Workerが`/version.json`をドキュメントフェッチのたびに確認し、更新検知時に`NEW_VERSION_AVAILABLE`をクライアントへ送信。
    ```js
    // sw.js: checkForUpdates()
    if (!storedVersion || versionData.buildTime !== storedVersionData.buildTime) {
      // ... キャッシュクリア
      clients.forEach(client => client.postMessage({ type: 'NEW_VERSION_AVAILABLE' }));
    }
    ```
  - アプリ側で受信後、強制`window.location.reload()`を実行。
    ```ts
    // App.tsx: 100-122 付近
    case 'NEW_VERSION_AVAILABLE':
      setVersionUpdateProgress(100);
      setTimeout(() => { window.location.reload(); }, 500);
      break;
    ```
- 問題点:
  - 入力中でも問答無用でページがリロードされ、入力内容が消失。
  - 開発環境では`/version.json`の取得やキャッシュ状態が不安定になりがちで、意図しない更新検知が起こりやすい。

### C. 開発環境の`React.StrictMode`による`useEffect`二重実行
- 該当箇所: `src/main.tsx`
  ```tsx
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  ```
- 問題点:
  - 開発時、`useEffect`が初回マウントで二重に呼ばれる仕様。Aの初期化ロジックを増幅。

## 付随的要因（可能性あり／副次的）
- 動的ビューポート対応の計測・スケール（`measureAndFit`）がレンダー回数を増やす（`useLayoutEffect`が毎レンダーで発火）。
- バックグラウンド同期や可視性変更時の`/version.json`チェック（`src/main.tsx`）がネットワーク変動で誤作動する場合がある。
- 認証整合性チェックで強制ログアウト（`App.tsx`）により画面遷移、入力が失われる可能性。

## 再現性評価
- A単独でも発生しうる（`KintaiContext`再レンダリングによる依存関数の識別子変更）。
- Bが発生すると確実に発生（強制リロード）。
- Cは開発環境で発生頻度を上げる。
- 複合的に発生し、ユーザー体験として「頻発」に見える状況を作る。

## 最終改善プラン（簡素化版）

### 1. フォーム保護: 「dirtyフラグ」と自動編集開始
- 目的: 入力開始後は初期化を絶対に走らせない。
- 対応案:
  - 変更ハンドラ（`handleStartTimeChange`等）で`setIsDirty(true)`／未保存時は`isEditing=true`に自動遷移。
  - リセットは「日付が実際に変わった時」かつ「dirty=false」の場合のみ許可。
- 実装ポイント:
  ```ts
  const [isDirty, setIsDirty] = useState(false);
  // 変更時にdirty化
  const handleStartTimeChange = (t: string) => { setStartTime(t); setIsDirty(true); };
  // useEffect内ガード
  const prevDateRef = useRef(deferredDate);
  useEffect(() => {
    const dateChanged = prevDateRef.current !== deferredDate;
    if (dateChanged && !formState.isEditing && !isDirty) {
      // 初期化（必要時のみ）
    }
    prevDateRef.current = deferredDate;
  }, [deferredDate, /* minimal deps */]);
  ```

### 2. `useEffect`依存リストの最小化（`deferredDate`のみ）
- 目的: 過剰な再実行を根本的に抑止。
- 方針:
  - 「日付変更によるロード効果」の依存は`deferredDate`のみとする。
  - `monthlyData`の同日差分は「編集中は無視」。編集未開始（`dirty=false`）時のみ読み込み。

### 3. `KintaiContext`の関数メモ化
- 目的: 依存関数の識別子が毎回変わらないようにする。
- 対応案:
  ```ts
  // KintaiContext.tsx
  const isDateEntered = useCallback((date: Date) => { /* ... */ }, [monthlyData]);
  const isDateEnteredNew = useCallback((date: Date) => { /* ... */ }, [monthlyData]);
  const getKintaiDataByDate = useCallback((dateString: string) => { /* ... */ }, [monthlyData]);
  const compareLogics = useCallback((date: Date) => { /* ... */ }, [isDateEntered, isDateEnteredNew]);
  ```
- 効果: フォーム側の`useEffect`が「関数識別子変更」によって再発火しにくくなる。

### 4. 起動時バージョンチェックモーダル＋アップデート即時適用
- 目的: 起動時に更新確認を明示しつつ、通常入力開始前にアップデートを完了させる。
- 対応案:
  - アプリ起動時に「新バージョンがあるかを確認中です。」モーダルを表示。
  - 更新ありの場合は「アップデートを実行します。」に文言を切り替え、更新適用が完了するまでUIをブロック。
  - 更新なしの場合はモーダルを自動的に閉じ、即座に通常入力状態へ。
 - 実装ポイント:
  - `public/sw.js`: バージョン検知後に`postMessage({ type: 'VERSION_CHECK_RESULT', hasUpdate })`を送信。`hasUpdate=true`受信時は`skipWaiting`→`clients.claim`→`postMessage({ type: 'UPDATE_APPLIED' })`の流れを実装。起動時以外の強制リロード/通知は行わない。
  - `src/App.tsx`または`src/components/DeployInfoModal.tsx`: 起動時にモーダルを表示し、`VERSION_CHECK_RESULT`を受信して分岐。`UPDATE_APPLIED`受信で安全に`window.location.reload()`（起動直後のみ、入力開始前）を実施し、更新後はモーダルなしで通常入力へ移行。
  - `src/main.tsx`: SW登録完了後に起動時チェックをトリガー。実行中セッションではアップデートしない方針を維持。
 - 効果: 起動直後にのみアップデートを適用し、入力途中のセッションを決して中断しない。ヘッダーバッジ等の常時表示は行わない。

### 5. 開発環境の`StrictMode`に対する防御
- 目的: 二重実行の影響低減。
- 対応案:
  - 初期化系`useEffect`で「一度だけ実行」ガード（`useRef`フラグ）を挿入（開発時のみ）。
  - または「初期化は日付変更時のみ」の明確な条件分岐に整理。

### （参考）ビューポート計測の再レンダー抑制（後回し）
- 目的: レンダリング回数の削減（必須ではないためPhase 2以降）。
- 対応案:
  - `resize`/`orientationchange`/初期マウント時に限定し、デバウンスで十分。

## 実施計画（段階的）
- Phase 1（即日対応／最小構成）
  - ① フォームの`dirty`導入＋変更時に自動で`isEditing=true`。
  - ② 日付変更効果の依存を`deferredDate`のみへ縮小（ガード付き）。
  - ③ `KintaiContext`の補助関数を`useCallback`でメモ化（他画面の安定化にも寄与）。
  - ④ 起動時バージョンチェックモーダル＋起動直後のみアップデート即時適用。
- Phase 2（必要時のみ）
  - ⑤ StrictMode影響に対する初期化一度だけガードを追加（開発時のみ）。
  - ⑥ ビューポート計測のデバウンス（UXに問題がある場合のみ）。

## 検証・テスト
- ユニットテスト（必須）
  - フォーム初期化ガード（`dateChanged`＋`isDirty`）が動作し、編集中に初期化されない。
  - `KintaiContext`補助関数のメモ化により参照が安定する。
- 結合/E2E（要点のみ）
  - 起動→モーダル表示→更新なしで自動クローズ。更新ありは「アップデートを実行します」→適用後に再起動→通常入力可能。
  - 入力開始後に`monthlyData`が変化しても値が保持される。

## 参考コード位置
- `src/components/KintaiForm.tsx`
  - 初期化ロジック: 292-334 付近
  - 依存リスト: 380-391 付近
  - スケール計測: 404-427 付近
- `src/contexts/KintaiContext.tsx`
  - 非メモ化関数群: 130-190 付近
- `public/sw.js`
  - バージョン検知/適用フロー: 1-120 付近（`checkForUpdates`→`skipWaiting`→`clients.claim`→`UPDATE_APPLIED`）
- `src/App.tsx`
  - 起動時のみ安全な再起動: 100-122 付近（強制リロードは削除/条件付き再起動へ）
- `src/main.tsx`
  - `React.StrictMode`: 63-73 付近
- `src/components/DeployInfoModal.tsx`
  - 起動時モーダル表示/クローズの制御

---

以上の通り、入力値消失の主因は「日付データロード効果の過剰発火と非編集時初期化」「SW自動リロード」「StrictModeの二重実行」の複合です。上記の優先順で対策すれば、入力途中の値消失は確実に解消できます。***