/**
 * /src/components/KintaiForm.tsx
 * 2025-11-07T10:30+09:00
 * 変更概要: 月跨ぎ判定順序の是正（API直接取得へ簡素化）、SW登録一元化準備
 */
import React, {
  useState,
  useEffect,
  useReducer,
  useTransition,
  useDeferredValue,
  useRef,
  useLayoutEffect,
} from "react";
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
  EDITABLE_DAYS,
} from "../utils/dateUtils";
import {
  saveKintaiToServer,
  isAuthenticated,
  getJobWageOptionsFromCsv,
  getKintaiDataByDate as getKintaiDataByDateApi,
} from "../utils/apiService";
import { useKintai } from "../contexts/KintaiContext";
import LoadingModal from "./LoadingModal";

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
    case EditActionType.START_EDITING:
      return {
        ...state,
        isEditing: true,
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
  const { refreshData } = useKintai();

  // ユーザー認証チェック
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/login");
    }
  }, [navigate]);

  // React 18の並行機能を使用
  const [, startTransition] = useTransition();

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
  const [jobOptions, setJobOptions] = useState<
    Array<{ job: string; wage: number | null }>
  >([]);

  // ローディング状態を管理
  const [isDataLoading, setIsDataLoading] = useState(false);
  // 入力変更検知用のdirtyフラグ（レンダリング最小化のためref管理）
  const isDirtyRef = useRef(false);
  const prevDateRef = useRef<string>(initialState.date);

  // 削除確認モーダルの状態
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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

  // 仕事内容・時給の選択肢をCSVから取得（フロント直取得）
  useEffect(() => {
    (async () => {
      try {
        const list = await getJobWageOptionsFromCsv();
        setJobOptions(list);
      } catch {}
    })();
  }, []);

  // 日付に入力済みフラグチェック

  // 日付変更時（React 18の並行機能を使用）
  useEffect(() => {
    // 同一日・編集中またはdirtyの場合はロード処理を抑止
    if (
      prevDateRef.current === deferredDate &&
      (formState.isEditing || isDirtyRef.current)
    ) {
      return;
    }
    const loadDateInfo = async () => {
      // UIの応答性を保つため、重い処理をstartTransitionで包む
      startTransition(() => {
        setIsDataLoading(true);
        setErrors({}); // 日付変更時にエラーをリセット

        // 初期化条件を緩和: 編集中でない場合は必ず状態をリセット
        if (!formState.isEditing) {
          setStartTime(initialState.startTime);
          setBreakTime(initialState.breakTime);
          setEndTime(initialState.endTime);
          setLocation(initialState.location);
          setWorkingTime("");
          dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
        }
      });

      try {
        // 月跨ぎ判定を排し、対象日付のデータ存在をAPIで直接確認
        const data = await getKintaiDataByDateApi(deferredDate);

        if (data) {
          const hasStartTime = data.startTime && data.startTime.trim() !== "";
          const breakTimeAsString = formatBreakTime(data.breakTime);

          startTransition(() => {
            setStartTime(
              data.startTime !== undefined
                ? data.startTime
                : initialState.startTime,
            );
            setBreakTime(breakTimeAsString);
            setEndTime(
              data.endTime !== undefined ? data.endTime : initialState.endTime,
            );
            setLocation(
              data.location !== undefined
                ? data.location
                : initialState.location,
            );
            setWorkingTime(data.workingTime || "");
            dispatch({
              type: EditActionType.CHECK_SAVED,
              payload: hasStartTime,
            });
            setIsDataLoading(false);
          });
        } else {
          // データなし：初期状態のままロード完了
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
    // 日付変更時はdirty解除し、前回日付を更新
    isDirtyRef.current = false;
    prevDateRef.current = deferredDate;
  }, [deferredDate]);

  // スライドアニメーション用の状態
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<
    "left" | "right"
  >("right");
  const [_previousDate, setPreviousDate] = useState(formState.date);

  // 画面高に収めるためのスケール制御
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  const measureAndFit = () => {
    try {
      if (!contentRef.current) return;
      const rectTop = contentRef.current.getBoundingClientRect().top;
      const viewportH =
        window.visualViewport?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight;
      const available = Math.max(0, viewportH - rectTop);
      setAvailableHeight(available);

      // 実際のコンテンツ総高さ（スケール前）を取得
      const contentHeight = contentRef.current.scrollHeight;
      if (contentHeight <= 0 || available <= 0) {
        setFitScale(1);
        return;
      }
      const scale = Math.min(1, available / contentHeight);
      // 極端な縮小を避けるための下限（必要なら調整可能）
      const clamped = Math.max(0.8, scale);
      setFitScale(clamped);
    } catch {}
  };

  useLayoutEffect(() => {
    measureAndFit();
  });

  useEffect(() => {
    const onResize = () => measureAndFit();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize as any);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize as any);
    };
  }, []);
  const handleDateChange = (date: string) => {
    // 日付の変更方向を判定
    const currentDateObj = new Date(formState.date);
    const newDateObj = new Date(date);
    const direction = newDateObj > currentDateObj ? "right" : "left";

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
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
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
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
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
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
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
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
    validateForm({
      date: formState.date,
      startTime,
      breakTime,
      endTime,
      location: e.target.value,
    });
  };

  // フォーム検証
  const validateForm = (data: KintaiData): boolean => {
    const newErrors: ValidationErrors = {};

    // 勤務場所の必須チェック
    if (!data.location || data.location.trim() === "") {
      newErrors.location =
        "勤務場所を選択してください / Please select a work location";
    }

    // 出勤時間が退勤時間より前かチェック
    if (!isTimeBeforeOrEqual(data.startTime, data.endTime)) {
      newErrors.endTime =
        "退勤時間は出勤時間より後にしてください / End time must be after start time";
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
          // 保存成功時にdirtyを明示的にクリア
          isDirtyRef.current = false;
          dispatch({ type: EditActionType.SAVE_COMPLETE });
          // データ保存後にKintaiContextの月次データを更新
          await refreshData();
        } else {
          setErrors({
            general:
              (result.error || "エラーが発生しました") + " / An error occurred",
          });
        }
      } catch (error) {
        setErrors({
          general:
            "保存中にエラーが発生しました / An error occurred while saving",
        });
      }
    }

    setIsSubmitting(false);
  };

  // 編集キャンセル
  const handleCancelEdit = () => {
    dispatch({ type: EditActionType.CANCEL_EDIT });
  };

  // 削除確認モーダルを表示
  const handleDeleteClick = () => {
    setShowDeleteModal(true);
  };

  // 削除確認モーダルをキャンセル
  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
  };

  // データ削除処理
  const handleDeleteConfirm = async () => {
    try {
      setIsSubmitting(true);
      // ユーザ操作のフィードバックを優先して、削除開始時点でモーダルを閉じる
      setShowDeleteModal(false);

      // サーバーに空データを送信して該当日の値をクリア（A案）
      const result = await saveKintaiToServer({
        date: formState.date,
        startTime: "",
        breakTime: "",
        endTime: "",
        location: "",
      });

      if (!result.success) {
        setErrors({
          general:
            (result.error || "削除に失敗しました") + " / Failed to delete",
        });
        return; // 失敗時もモーダルは閉じたまま
      }

      // ローカルフォーム値もクリア
      setStartTime("");
      setBreakTime("");
      setEndTime("");
      setLocation("");
      setWorkingTime("");

      // 編集終了
      dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
      dispatch({ type: EditActionType.CANCEL_EDIT });

      // 月次データを再取得してUIへ反映
      await refreshData();
    } catch (error) {
      setErrors({
        general:
          "削除処理でエラーが発生しました / Error occurred during deletion",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 長押し処理
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleLongPressStart = () => {
    dispatch({ type: EditActionType.TOUCH_START });
    setIsLongPressing(true);
    setLongPressProgress(0);

    // プログレスバーのアニメーション
    const startTime = Date.now();
    const duration = 1000; // 1秒

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setLongPressProgress(progress);

      if (progress < 100) {
        longPressIntervalRef.current = setTimeout(updateProgress, 16); // 60fps
      }
    };

    updateProgress();
  };

  const handleLongPressEnd = () => {
    dispatch({ type: EditActionType.TOUCH_END });
    setIsLongPressing(false);
    setLongPressProgress(0);

    if (longPressIntervalRef.current) {
      clearTimeout(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  };

  // コンポーネントのクリーンアップ
  useEffect(() => {
    return () => {
      if (longPressIntervalRef.current) {
        clearTimeout(longPressIntervalRef.current);
      }
    };
  }, []);

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
      return `編集不可（${EDITABLE_DAYS}日以上前） / Not editable (older than ${EDITABLE_DAYS} days)`;
    }
    return "入力済み（長押しで編集） / Entered (long‑press to edit)";
  };

  return (
    <div className="kintai-form">
      {/* 日付選択 - ヘッダー部分（固定） */}
      <div className="kintai-form-header">
        <MobileDatePicker
          value={formState.date}
          onChange={handleDateChange}
          selectableDates={selectableDates}
          isEditing={formState.isEditing}
        />
      </div>

      {/* コンテンツ部分（スライドアニメーション対象） */}
      <div
        ref={contentRef}
        className={`kintai-form-content ${isAnimating ? `animating slide-out-${animationDirection}` : ""}`}
        style={{
          height: availableHeight ?? undefined,
          overflow: "hidden",
          transform: fitScale < 1 ? `scale(${fitScale})` : undefined,
          transformOrigin: "top center",
          willChange: fitScale < 1 ? "transform" : undefined,
        }}
      >
        {/* データ読み込み中の表示 */}
        {isDataLoading && (
          // 既存のインライン通知をモーダルへ置換
          <></>
        )}

        {isSubmitting && (
          // 既存のインライン通知をモーダルへ置換
          <></>
        )}

        {/* 書き込み中の表示（保存・削除などGASへの書き込み処理中） */}
        {isSubmitting && (
          <div
            className="writing-message"
            style={{
              padding: "8px 16px",
              backgroundColor: "#fff8e1",
              border: "1px solid #ffe082",
              borderRadius: "4px",
              margin: "8px 0",
              fontSize: "14px",
              color: "#8d6e63",
            }}
          >
            📝 書き込み中です... / Writing...
          </div>
        )}

        {/* 古い日付の警告 */}
        {tooOldDateWarning && (
          <div className="warning-message">
            ⚠️ {EDITABLE_DAYS}日以上前の日付は編集できません / Dates older than{" "}
            {EDITABLE_DAYS} days cannot be edited
          </div>
        )}

        {/* 出勤時間 */}
        <MobileTimePicker
          label="出勤時間 / Clock‑in Time"
          value={startTime}
          onChange={handleStartTimeChange}
          disabled={
            isDataLoading ||
            (formState.isSaved && !formState.isEditing) ||
            isVeryOldDate()
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
            isDataLoading ||
            (formState.isSaved && !formState.isEditing) ||
            isVeryOldDate()
          }
        />
        {errors.breakTime && (
          <div className="error-message">{errors.breakTime}</div>
        )}

        {/* 退勤時間 */}
        <MobileTimePicker
          label="退勤時間 / Clock‑out Time"
          value={endTime}
          onChange={handleEndTimeChange}
          disabled={
            isDataLoading ||
            (formState.isSaved && !formState.isEditing) ||
            isVeryOldDate()
          }
        />
        {errors.endTime && (
          <div className="error-message">{errors.endTime}</div>
        )}

        {/* 勤務時間 */}
        <div className="form-group">
          <label>勤務時間 / Working Time</label>
          <div className="time-display working-time-display">
            {workingTime ||
              (formState.isSaved && !formState.isEditing ? "-" : "0:00")}
          </div>
        </div>

        {/* 勤務場所 */}
        <div className="form-group">
          <label>勤務場所 / Work Task</label>
          <select
            value={location}
            onChange={handleLocationChange}
            disabled={
              isDataLoading ||
              (formState.isSaved && !formState.isEditing) ||
              isVeryOldDate()
            }
            className={`location-select ${!(isDataLoading || (formState.isSaved && !formState.isEditing) || isVeryOldDate()) ? "location-input-enabled" : ""} ${!location || location === "" ? "input-empty" : ""}`}
          >
            <option value="">未選択 / Not selected</option>
            {jobOptions && jobOptions.length > 0 ? (
              jobOptions.map((opt) => (
                <option key={opt.job} value={opt.job}>
                  {opt.job}
                  {opt.wage !== null ? ` / ¥${opt.wage}` : ""}
                </option>
              ))
            ) : (
              <>
                <option value="田んぼ">田んぼ / Rice field</option>
                <option value="柿農園">柿農園 / Persimmon farm</option>
                <option value="事務所">事務所 / Office</option>
                <option value="その他">その他 / Other</option>
              </>
            )}
          </select>
        </div>
        {errors.location && (
          <div className="error-message">{errors.location}</div>
        )}

        {/* エラーメッセージ */}
        {errors.general && (
          <div className="error-message">{errors.general}</div>
        )}

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
                保存する / Save
              </button>
              <div
                className="button-row"
                style={{ display: "flex", gap: "8px", marginTop: "8px" }}
              >
                <button
                  className="btn"
                  onClick={handleDeleteClick}
                  style={{
                    flex: 1,
                    backgroundColor: "#f44336",
                    color: "white",
                  }}
                  disabled={isSubmitting}
                >
                  削除 / Delete
                </button>
                <button
                  className="btn"
                  onClick={handleCancelEdit}
                  style={{ flex: 1, backgroundColor: "#9e9e9e" }}
                  disabled={isSubmitting}
                >
                  キャンセル / Cancel
                </button>
              </div>
            </>
          ) : formState.isSaved ? (
            <button
              className={`${getButtonClassName()} ${isLongPressing ? "long-pressing" : ""}`}
              onTouchStart={isVeryOldDate() ? undefined : handleLongPressStart}
              onTouchEnd={isVeryOldDate() ? undefined : handleLongPressEnd}
              onMouseDown={isVeryOldDate() ? undefined : handleLongPressStart}
              onMouseUp={isVeryOldDate() ? undefined : handleLongPressEnd}
              onMouseLeave={isVeryOldDate() ? undefined : handleLongPressEnd}
              disabled={isSubmitting || isVeryOldDate()}
              style={{
                position: "relative",
                overflow: "hidden",
                backgroundColor: isLongPressing
                  ? `rgba(76, 175, 80, ${0.7 + (longPressProgress / 100) * 0.3})`
                  : undefined,
              }}
            >
              {/* プログレスバー */}
              {isLongPressing && (
                <div
                  className="long-press-progress"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    height: "100%",
                    width: `${longPressProgress}%`,
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.5) 100%)",
                    transition: "none",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />
              )}
              <span style={{ position: "relative", zIndex: 2 }}>
                {getSaveButtonText()}
              </span>
            </button>
          ) : (
            <button
              className="btn btn-edit"
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                Object.keys(errors).length > 0 ||
                isVeryOldDate()
              }
            >
              保存する / Save
            </button>
          )}
        </div>
      </div>

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="modal-content"
            style={{
              backgroundColor: "white",
              padding: "24px",
              borderRadius: "8px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            }}
          >
            <h3
              style={{
                margin: "0 0 16px 0",
                fontSize: "18px",
                fontWeight: "600",
              }}
            >
              データを削除しますか？ / Delete this data?
            </h3>
            <p
              style={{ margin: "0 0 24px 0", color: "#666", lineHeight: "1.5" }}
            >
              出勤時間、休憩時間、退勤時間、勤務場所のデータが削除されます。 /
              Clock‑in, break, clock‑out, and location data will be deleted.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="btn"
                onClick={handleDeleteCancel}
                style={{
                  backgroundColor: "#9e9e9e",
                  color: "white",
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                キャンセル / Cancel
              </button>
              <button
                className="btn"
                onClick={handleDeleteConfirm}
                style={{
                  backgroundColor: "#f44336",
                  color: "white",
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                削除する / Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 読み込み/書き込みモーダル */}
      <LoadingModal
        isOpen={isDataLoading}
        isLoading={true}
        message="データを読み込み中..."
        showHeader={false}
        showFooter={false}
      />
      <LoadingModal
        isOpen={isSubmitting}
        isLoading={false}
        message="書き込み中..."
        showHeader={false}
        showFooter={false}
      />
    </div>
  );
};

export default KintaiForm;
