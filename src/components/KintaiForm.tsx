/**
 * /src/components/KintaiForm.tsx
 * 2025-01-27T10:00+09:00
 * 変更概要: 勤務時間の自動計算機能を追加 - 出勤時間、退勤時間、休憩時間から勤務時間を計算してリアルタイム表示
 */
import React, { useState, useEffect, useReducer, useTransition, useDeferredValue } from "react";
import { useNavigate } from "react-router-dom";
import MobileDatePicker from "./MobileDatePicker";
import MobileTimePicker from "./MobileTimePicker";
import MobileBreakPicker from "./MobileBreakPicker";
import {
  KintaiFormState,
  EditActionType,
  ValidationErrors,
  KintaiData,
} from "../types";
import {
  getCurrentDate,
  isDateTooOld,
  isTimeBeforeOrEqual,
  getSelectableDates,
} from "../utils/dateUtils";
import { saveKintaiToServer, isAuthenticated } from "../utils/apiService";
import { useKintai } from "../contexts/KintaiContext";

// 初期状態
const initialState: KintaiFormState = {
  date: getCurrentDate(),
  startTime: "",
  breakTime: "", // データがない場合は空文字（空表示）
  endTime: "",
  location: "",
  isSaved: false,
  isEditing: false,
  touchStartTime: 0,
};

// 編集アクション処理用reducer
const editReducer = (
  state: KintaiFormState,
  action: { type: EditActionType; payload?: any },
): KintaiFormState => {
  switch (action.type) {
    case EditActionType.TOUCH_START:
      return {
        ...state,
        touchStartTime: Date.now(),
      };
    case EditActionType.TOUCH_END:
      const touchDuration = Date.now() - state.touchStartTime;
      // 1秒以上の長押しで編集モードに
      if (touchDuration >= 1000 && !state.isEditing) {
        return {
          ...state,
          isEditing: true,
          touchStartTime: 0,
        };
      }
      return {
        ...state,
        touchStartTime: 0,
      };
    case EditActionType.CANCEL_EDIT:
      return {
        ...state,
        isEditing: false,
      };
    case EditActionType.SAVE_COMPLETE:
      return {
        ...state,
        isSaved: true,
        isEditing: false,
      };
    case EditActionType.DATE_CHANGE:
      return {
        ...state,
        date: action.payload,
        isSaved: false,
      };
    case EditActionType.CHECK_SAVED:
      return {
        ...state,
        isSaved: action.payload,
      };
    default:
      return state;
  }
};

// 勤務時間を計算する関数
const calculateWorkingTime = (
  startTime: string,
  endTime: string,
  breakTime: string,
): string => {
  // 入力値が不完全な場合は空文字を返す
  if (!startTime || !endTime) {
    return "";
  }

  try {
    // 時間文字列をパース
    const parseTime = (
      timeStr: string,
    ): { hours: number; minutes: number } | null => {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
      return { hours, minutes };
    };

    const start = parseTime(startTime);
    const end = parseTime(endTime);

    if (!start || !end) {
      return "";
    }

    // 分単位に変換
    const startMinutes = start.hours * 60 + start.minutes;
    let endMinutes = end.hours * 60 + end.minutes;

    // 日をまたぐ場合の処理（退勤時間が出勤時間より早い場合）
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60; // 翌日として計算
    }

    // 休憩時間を分単位に変換
    let breakMinutes = 0;
    if (breakTime) {
      const breakParsed = parseTime(breakTime);
      if (breakParsed) {
        breakMinutes = breakParsed.hours * 60 + breakParsed.minutes;
      }
    }

    // 勤務時間を計算（総時間 - 休憩時間）
    const workingMinutes = endMinutes - startMinutes - breakMinutes;

    // 負の値の場合は0:00を返す
    if (workingMinutes < 0) {
      return "0:00";
    }

    // 時:分形式に変換
    const hours = Math.floor(workingMinutes / 60);
    const minutes = workingMinutes % 60;

    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  } catch (error) {
    return "";
  }
};

// formatTimeToHHMM ヘルパー関数は apiService 側で処理するため削除

const KintaiForm: React.FC = () => {
  const navigate = useNavigate();
  const { 
    getKintaiDataByDate, 
    refreshData, 
    compareLogics, 
    monthlyData, 
    currentYear, 
    currentMonth, 
    isDateEntered, 
    isDateEnteredNew 
  } = useKintai();

  // ユーザー認証チェック
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
    }
  }, [navigate]);

  // React 18の並行機能を使用
  const [isPending, startTransition] = useTransition();
  
  // フォーム状態管理
  const [formState, dispatch] = useReducer(editReducer, initialState);
  const deferredDate = useDeferredValue(formState.date);

  // フォーム値とバリデーション
  const [startTime, setStartTime] = useState(initialState.startTime);
  const [breakTime, setBreakTime] = useState<string>(initialState.breakTime);
  const [endTime, setEndTime] = useState(initialState.endTime);
  const [location, setLocation] = useState(initialState.location);
  const [workingTime, setWorkingTime] = useState(""); // 勤務時間の状態を追加
  const [errors, setErrors] = useState<ValidationErrors>({});
  
  // ローディング状態を管理
  const [isDataLoading, setIsDataLoading] = useState(false);

  /**
   * 休憩時間の表示フォーマット
   * 数値（分）、文字列（HH:mm）、undefined/null に対応
   */
  const formatBreakTime = (
    breakTime: number | string | undefined | null,
  ): string => {
    // undefinedやnullの場合は空文字を返す（未入力状態）
    if (breakTime === undefined || breakTime === null) return "";

    // 0の場合は「00:00」を表示
    if (
      breakTime === 0 ||
      breakTime === "0" ||
      breakTime === "0:00" ||
      breakTime === "00:00"
    )
      return "00:00";

    // 既に文字列でHH:mm形式の場合は00:00形式に統一
    if (typeof breakTime === "string") {
      const timeMatch = breakTime.match(/^(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      }

      // 文字列だが数値として解釈できる場合は分数として処理
      const numericValue = parseInt(breakTime, 10);
      if (!Number.isNaN(numericValue)) {
        const hours = Math.floor(numericValue / 60);
        const mins = numericValue % 60;
        return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
      }

      // その他の文字列形式は空文字を返す
      return "";
    }

    // 数値の場合は分数から00:00形式に変換
    if (typeof breakTime === "number") {
      if (breakTime < 0) return "";
      const hours = Math.floor(breakTime / 60);
      const mins = breakTime % 60;
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
    }

    // その他の型の場合は空文字を返す
    return "";
  };
  const [isSubmitting, setIsSubmitting] = useState(false); // ← これを有効化
  const [] = useState(false); // handleSave で使用 (isSubmittingと役割が近い場合は統一を検討)
  const [tooOldDateWarning, setTooOldDateWarning] = useState(false);

  // 選択可能な日付の取得
  const selectableDates = getSelectableDates();

  // 勤務時間の自動計算
  useEffect(() => {
    const calculatedWorkingTime = calculateWorkingTime(
      startTime,
      endTime,
      breakTime,
    );
    setWorkingTime(calculatedWorkingTime);
  }, [startTime, endTime, breakTime]);

  // 日付に入力済みフラグチェック

  // 日付変更時（React 18の並行機能を使用）
  useEffect(() => {
    const loadDateInfo = async () => {
      // UIの応答性を保つため、重い処理をstartTransitionで包む
      startTransition(() => {
        setIsDataLoading(true);
        setErrors({}); // 日付変更時にエラーをリセット
        
        // 先に未入力状態にリセットして「ゆらぎ」を防ぐ
        setStartTime(initialState.startTime);
        setBreakTime(initialState.breakTime);
        setEndTime(initialState.endTime);
        setLocation(initialState.location);
        setWorkingTime("");
        dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
      });
      
      try {
        // 瞬時判定: 既存のmonthlyDataから直接判定を実行
        console.log("⚡ 瞬時入力判定を実行中...");
        const comparison = compareLogics(new Date(deferredDate));
        const entered = comparison.legacy; // 現在は既存ロジックを使用
        console.log("✅ 瞬時判定完了:", { entered, date: deferredDate });
        
        // 判定テーブル更新は非同期でバックグラウンド実行（UIをブロックしない）
        setTimeout(async () => {
          try {
            console.log("🔄 バックグラウンドで判定テーブルを更新中...");
            await refreshData();
            console.log("✅ バックグラウンド更新完了");
            
            // 更新後のエビデンスを表示
            console.log("📊 更新後の判定テーブル状況:");
            console.log(`対象年月: ${currentYear}年${currentMonth}月`);
            console.log(`総データ件数: ${monthlyData.length}件`);
          } catch (bgError) {
            console.warn("バックグラウンド更新エラー:", bgError);
          }
        }, 0);

        // 開発環境でのみ比較結果をログ出力
        if (process.env.NODE_ENV === "development" && !comparison.match) {
          console.log("入力判定ロジック比較結果:", {
            date: formState.date,
            legacy: comparison.legacy,
            new: comparison.new,
            match: comparison.match,
          });
        }

        // デバッグログ: 今月の勤怠データを出力
        console.log("=== 今月の勤怠データ ===");
        console.log(`対象年月: ${currentYear}年${currentMonth}月`);
        console.table(monthlyData.map(record => ({
          日付: record.date,
          出勤時間: record.startTime || "未入力",
          休憩時間: record.breakTime || "未入力",
          退勤時間: record.endTime || "未入力",
          勤務時間: record.workingTime || "未計算",
          勤務場所: record.location || "未選択"
        })));

        // デバッグログ: データ入力判定テーブルを出力
        console.log("=== データ入力判定テーブル ===");
        const entryStatusTable = monthlyData.map(record => {
          const recordDate = new Date(record.date);
          const legacyStatus = isDateEntered(recordDate);
          const newStatus = isDateEnteredNew(recordDate);
          return {
            日付: record.date,
            既存ロジック: legacyStatus ? "入力済み" : "未入力",
            新ロジック: newStatus ? "入力済み" : "未入力",
            判定一致: legacyStatus === newStatus ? "一致" : "不一致",
            出勤時間有無: record.startTime ? "有" : "無",
            退勤時間有無: record.endTime ? "有" : "無",
            休憩時間有無: record.breakTime ? "有" : "無"
          };
        });
        console.table(entryStatusTable);

        // 不一致がある場合は警告を出力
        const mismatches = entryStatusTable.filter(item => item.判定一致 === "不一致");
        if (mismatches.length > 0) {
          console.warn(`⚠️ 入力判定ロジックに不一致が${mismatches.length}件あります:`);
          console.table(mismatches);
        } else {
          console.log("✅ 全ての日付で入力判定ロジックが一致しています");
        }

        if (entered) {
          const data = getKintaiDataByDate(deferredDate);

          if (data) {
            // 出勤時間が入力されている場合のみ保存済みとして扱う
            const hasStartTime = data.startTime && data.startTime.trim() !== "";
            
            // 状態を一括で更新してレンダリング回数を最小化
            const breakTimeAsString = formatBreakTime(data.breakTime);
            
            // React 18のバッチング機能を活用して状態更新を一括処理
            startTransition(() => {
              setStartTime(data.startTime !== undefined ? data.startTime : initialState.startTime);
              setBreakTime(breakTimeAsString);
              setEndTime(data.endTime !== undefined ? data.endTime : initialState.endTime);
              setLocation(data.location !== undefined ? data.location : initialState.location);
              setWorkingTime(data.workingTime || "");
              dispatch({ type: EditActionType.CHECK_SAVED, payload: hasStartTime });
              setIsDataLoading(false);
            });
          } else {
            startTransition(() => {
              setIsDataLoading(false);
            });
          }
        } else {
          startTransition(() => {
            setIsDataLoading(false);
          });
        }
      } catch (error) {
        startTransition(() => {
          setErrors({ general: "データの読み込みに失敗しました。" });
          setIsDataLoading(false);
        });
      }

      const isOldDate = isDateTooOld(deferredDate);
      setTooOldDateWarning(isOldDate);
    };

    if (deferredDate) {
      loadDateInfo();
    }
  }, [deferredDate, monthlyData, currentYear, currentMonth, compareLogics, getKintaiDataByDate, isDateEntered, isDateEnteredNew]);

  // スライドアニメーション用の状態
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right'>('right');
  const [previousDate, setPreviousDate] = useState(formState.date);

  // 入力値変更ハンドラー
  const handleDateChange = (date: string) => {
    // 日付の変更方向を判定
    const currentDateObj = new Date(formState.date);
    const newDateObj = new Date(date);
    const direction = newDateObj > currentDateObj ? 'right' : 'left';
    
    setAnimationDirection(direction);
    setPreviousDate(formState.date);
    setIsAnimating(true);
    
    // アニメーション開始後に日付を更新
    setTimeout(() => {
      dispatch({ type: EditActionType.DATE_CHANGE, payload: date });
      
      // アニメーション終了
      setTimeout(() => {
        setIsAnimating(false);
      }, 150);
    }, 75);
  };

  const handleStartTimeChange = (time: string) => {
    setStartTime(time);
    validateForm({
      date: formState.date,
      startTime: time,
      breakTime,
      endTime,
      location,
    });
  };

  const handleBreakTimeChange = (timeString: string) => {
    setBreakTime(timeString);
    validateForm({
      date: formState.date,
      startTime,
      breakTime: timeString,
      endTime,
      location,
    });
  };

  const handleEndTimeChange = (time: string) => {
    setEndTime(time);
    validateForm({
      date: formState.date,
      startTime,
      breakTime,
      endTime: time,
      location,
    });
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocation(e.target.value);
  };

  // フォーム検証
  const validateForm = (data: KintaiData): boolean => {
    const newErrors: ValidationErrors = {};

    // 出勤時間が退勤時間より前かチェック
    if (!isTimeBeforeOrEqual(data.startTime, data.endTime)) {
      newErrors.endTime = "退勤時間は出勤時間より後にしてください";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 送信ハンドラー
  const handleSubmit = async () => {
    setIsSubmitting(true);

    const formData: KintaiData = {
      date: formState.date,
      startTime,
      breakTime,
      endTime,
      location,
    };

    const isValid = validateForm(formData);

    if (isValid) {
      try {
        const result = await saveKintaiToServer(formData);

        if (result.success) {
          dispatch({ type: EditActionType.SAVE_COMPLETE });
          // データ保存後にKintaiContextの月次データを更新
          await refreshData();
        } else {
          setErrors({ general: result.error || "エラーが発生しました" });
        }
      } catch (error) {
        setErrors({ general: "保存中にエラーが発生しました" });
      }
    }

    setIsSubmitting(false);
  };

  // 編集キャンセル
  const handleCancelEdit = () => {
    dispatch({ type: EditActionType.CANCEL_EDIT });
  };

  // 長押し処理
  const handleLongPressStart = () => {
    dispatch({ type: EditActionType.TOUCH_START });
  };

  const handleLongPressEnd = () => {
    dispatch({ type: EditActionType.TOUCH_END });
  };

  // 古い日付かどうかの判定
  const isVeryOldDate = (): boolean => isDateTooOld(formState.date);

  // ボタンのクラス名を取得
  const getButtonClassName = (): string => {
    if (isVeryOldDate()) {
      return "btn btn-disabled";
    }
    return "btn btn-saved";
  };

  // ボタンのテキストを取得
  const getSaveButtonText = (): string => {
    if (isVeryOldDate()) {
      return "編集不可（3日以上前）";
    }
    return "入力済み 長押しで編集";
  };

  return (
    <div className="kintai-form">
      {/* 日付選択 - ヘッダー部分（固定） */}
      <div className="kintai-form-header">
        <MobileDatePicker
          value={formState.date}
          onChange={handleDateChange}
          selectableDates={selectableDates}
        />
      </div>

      {/* コンテンツ部分（スライドアニメーション対象） */}
      <div className={`kintai-form-content ${
        isAnimating ? `animating slide-out-${animationDirection}` : ''
      }`}>

        {/* データ読み込み中の表示 */}
        {isDataLoading && (
          <div className="loading-message" style={{ 
            padding: '8px 16px', 
            backgroundColor: '#f0f8ff', 
            border: '1px solid #e0e0e0', 
            borderRadius: '4px', 
            margin: '8px 0',
            fontSize: '14px',
            color: '#666'
          }}>
            📅 データを読み込み中...
          </div>
        )}

        {/* 古い日付の警告 */}
        {tooOldDateWarning && (
          <div className="warning-message">
            ⚠️ 3日以上前の日付は編集できません
        </div>
      )}

      {/* 出勤時間 */}
      <MobileTimePicker
        label="出勤時間"
        value={startTime}
        onChange={handleStartTimeChange}
        disabled={
          isDataLoading || (formState.isSaved && !formState.isEditing) || isVeryOldDate()
        }
      />
      {errors.startTime && (
        <div className="error-message">{errors.startTime}</div>
      )}

      {/* 休憩時間 */}
      <MobileBreakPicker
        value={breakTime}
        onChange={handleBreakTimeChange}
        disabled={
          isDataLoading || (formState.isSaved && !formState.isEditing) || isVeryOldDate()
        }
      />
      {errors.breakTime && (
        <div className="error-message">{errors.breakTime}</div>
      )}

      {/* 退勤時間 */}
      <MobileTimePicker
        label="退勤時間"
        value={endTime}
        onChange={handleEndTimeChange}
        disabled={
          isDataLoading || (formState.isSaved && !formState.isEditing) || isVeryOldDate()
        }
      />
      {errors.endTime && <div className="error-message">{errors.endTime}</div>}

      {/* 勤務時間 */}
      <div className="form-group">
        <label>勤務時間</label>
        <div className="time-display working-time-display">
          {workingTime ||
            (formState.isSaved && !formState.isEditing ? "-" : "0:00")}
        </div>
      </div>

      {/* 勤務場所 */}
      <div className="form-group">
        <label>勤務場所</label>
        <select
          value={location}
          onChange={handleLocationChange}
          disabled={
            isDataLoading || (formState.isSaved && !formState.isEditing) || isVeryOldDate()
          }
          className={`location-select ${!(isDataLoading || (formState.isSaved && !formState.isEditing) || isVeryOldDate()) ? "location-input-enabled" : ""}`}
        >
          <option value="">未選択</option>
          <option value="田んぼ">田んぼ</option>
          <option value="柿農園">柿農園</option>
          <option value="事務所">事務所</option>
          <option value="その他">その他</option>
        </select>
      </div>

      {/* エラーメッセージ */}
      {errors.general && <div className="error-message">{errors.general}</div>}

      {/* 保存/編集ボタン */}
      <div className="button-container">
        {formState.isEditing ? (
          <>
            <button
              className="btn btn-edit"
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                Object.keys(errors).length > 0 ||
                isVeryOldDate()
              }
            >
              保存する
            </button>
            <button
              className="btn"
              onClick={handleCancelEdit}
              style={{ marginTop: "8px", backgroundColor: "#9e9e9e" }}
              disabled={isSubmitting}
            >
              キャンセル
            </button>
          </>
        ) : formState.isSaved ? (
          <button
            className={getButtonClassName()}
            onTouchStart={isVeryOldDate() ? undefined : handleLongPressStart}
            onTouchEnd={isVeryOldDate() ? undefined : handleLongPressEnd}
            onMouseDown={isVeryOldDate() ? undefined : handleLongPressStart}
            onMouseUp={isVeryOldDate() ? undefined : handleLongPressEnd}
            onMouseLeave={isVeryOldDate() ? undefined : handleLongPressEnd}
            disabled={isSubmitting || isVeryOldDate()}
          >
            {getSaveButtonText()}
          </button>
        ) : (
          <button
            className="btn btn-edit"
            onClick={handleSubmit}
            disabled={
              isSubmitting || Object.keys(errors).length > 0 || isVeryOldDate()
            }
          >
            保存する
          </button>
        )}
      </div>
      </div>
    </div>
  );
};

export default KintaiForm;
