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
  TaskEntry,
} from "../types";
import {
  getCurrentDate,
  isDateTooOld,
  isTimeBeforeOrEqual,
  getSelectableDates,
  EDITABLE_DAYS,
} from "../utils/dateUtils";
import {
  enqueueSave,
  isAuthenticated,
  getJobWageOptions,
  getKintaiDataFromMonthlyData,
} from "../utils/apiService";
import { useKintai } from "../contexts/KintaiContext";
import LoadingModal from "./LoadingModal";
import DrumTimePicker from "./drumtimepicker";

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

// 勤務時間を分単位で返す（引数で新しい値を直接渡せる）
const getWorkingMinutes = (st: string, et: string, bt: string): number => {
  if (!st || !et) return 0;
  const wt = calculateWorkingTime(st, et, bt);
  if (!wt) return 0;
  const [h, m] = wt.split(":").map(Number);
  return h * 60 + (m || 0);
};

const roundTo5min = (minutes: number): number => Math.round(minutes / 5) * 5;
const minutesToHours = (minutes: number): number => roundTo5min(minutes) / 60;

// hours(小数) ↔ "H:mm" 変換
const hoursToHHmm = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${String(m).padStart(2, "0")}`;
};
const hhmmToHours = (hhmm: string): number => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
};

// formatTimeToHHMM ヘルパー関数は apiService 側で処理するため削除

const KintaiForm: React.FC = () => {
  const navigate = useNavigate();
  // Phase C-1: Context を単一の真実の源にする
  // - monthlyData から直接参照（getKintaiDataByDateApi は廃止、API重複を排除）
  // - 日付変更時に Context の年月を同期（月またぎ対応）
  const {
    monthlyData,
    isDataLoading: isContextLoading,
    currentYear,
    currentMonth,
    setCurrentYear,
    setCurrentMonth,
  } = useKintai();

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
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
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

  // Phase C-2: 仕事内容ドロップダウンは遅延取得
  // 起動時ではなく、ユーザーが作業内容欄を初めて操作したタイミングで CSV を取得する
  // sessionStorage キャッシュ（30分TTL）があるので2回目以降は即時
  const jobOptionsLoadedRef = useRef(false);
  const loadJobOptions = async () => {
    if (jobOptionsLoadedRef.current) return;
    jobOptionsLoadedRef.current = true;
    try {
      const list = await getJobWageOptions();
      setJobOptions(list);
    } catch {
      // 失敗時はフラグを戻して再試行可能にする
      jobOptionsLoadedRef.current = false;
    }
  };

  // ─── Phase C-1: データ同期を2つの useEffect に分離 ───

  // (A) 月同期 useEffect: 日付の年月が変わったら Context の currentYear/currentMonth を追従
  // 編集中でも走る（Context は常に正しい月を指す必要がある）
  // 依存配列は formState.date のみ（currentYear/currentMonth を入れると過剰発火）
  useEffect(() => {
    if (!formState.date) return;
    const y = parseInt(formState.date.substring(0, 4), 10);
    const m = parseInt(formState.date.substring(5, 7), 10);
    if (Number.isNaN(y) || Number.isNaN(m)) return;

    if (y !== currentYear || m !== currentMonth) {
      // React 18 自動バッチングで1回のrenderで両方更新される
      setCurrentYear(y);
      setCurrentMonth(m);
      // → KintaiContext の useEffect([currentYear, currentMonth]) が発火 →
      //   fetchMonthlyData → monthlyData が新月に切り替わる
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.date]);

  // (B) データ適用 useEffect: monthlyData が現在月と一致した時のみフォーム値を更新
  useEffect(() => {
    // 同一日・編集中またはdirtyの場合はロード処理を抑止（編集中データを保護）
    if (
      prevDateRef.current === deferredDate &&
      (formState.isEditing || isDirtyRef.current)
    ) {
      return;
    }

    // 日付変更直後で Context の年月がまだ古い場合は待機
    const y = parseInt(deferredDate.substring(0, 4), 10);
    const m = parseInt(deferredDate.substring(5, 7), 10);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      if (y !== currentYear || m !== currentMonth) {
        // 月同期 useEffect (A) が走って Context が新月に切り替わるのを待つ
        return;
      }
    }

    // Context が該当月のデータを読み込み中なら待機
    if (isContextLoading) {
      // ローディング表示は Context 側で制御
      startTransition(() => setIsDataLoading(true));
      return;
    }

    // 編集中でなければフォーム値をリセットしてから新データ適用
    startTransition(() => {
      setErrors({});
      if (!formState.isEditing) {
        setStartTime(initialState.startTime);
        setBreakTime(initialState.breakTime);
        setEndTime(initialState.endTime);
        setTasks([]);
        setWorkingTime("");
        dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
      }
    });

    // monthlyData から該当日を参照（空配列でも正しく「データなし」と判定される）
    const data = getKintaiDataFromMonthlyData(deferredDate, monthlyData);

    if (data) {
      const hasStartTime = data.startTime && data.startTime.trim() !== "";
      const breakTimeAsString = formatBreakTime(data.breakTime);

      startTransition(() => {
        setStartTime(data.startTime || initialState.startTime);
        setBreakTime(breakTimeAsString);
        setEndTime(data.endTime || initialState.endTime);
        if (data.tasks && data.tasks.length > 0) {
          setTasks(data.tasks);
        } else if (data.location) {
          setTasks([{ job: data.location, hours: 0 }]);
        } else {
          setTasks([]);
        }
        setWorkingTime(data.workingTime || "");
        dispatch({
          type: EditActionType.CHECK_SAVED,
          payload: !!hasStartTime,
        });
        setIsDataLoading(false);
      });
    } else {
      // データなし：初期状態のまま
      startTransition(() => setIsDataLoading(false));
    }

    setTooOldDateWarning(isDateTooOld(deferredDate));

    // 日付変更時はdirty解除し、前回日付を更新
    isDirtyRef.current = false;
    prevDateRef.current = deferredDate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredDate, monthlyData, currentYear, currentMonth, isContextLoading]);

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

  // 出退勤/休憩変更時にtasksの最後の作業を自動調整
  const autoAdjustTasks = (totalMinutes: number) => {
    if (totalMinutes <= 0) return;
    setTasks((prev) => {
      if (prev.length === 0) return prev;
      if (prev.length === 1) {
        return [{ ...prev[0], hours: minutesToHours(totalMinutes) }];
      }
      const usedByOthers = prev
        .slice(0, -1)
        .reduce((sum, t) => sum + (t.hours || 0) * 60, 0);
      const lastMinutes = Math.max(0, totalMinutes - usedByOthers);
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        hours: minutesToHours(lastMinutes),
      };
      return updated;
    });
  };

  // ユーザー入力中はエラーをクリア（古い検証結果が残って save ボタンが固まるのを防ぐ）
  const clearStaleErrors = () => {
    setErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev));
  };

  const handleStartTimeChange = (time: string) => {
    setStartTime(time);
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
    autoAdjustTasks(getWorkingMinutes(time, endTime, breakTime));
    clearStaleErrors();
    // 検証は handleSubmit 時に validateForm が再走するのでここでは行わない
  };

  const handleBreakTimeChange = (timeString: string) => {
    setBreakTime(timeString);
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
    autoAdjustTasks(getWorkingMinutes(startTime, endTime, timeString));
    clearStaleErrors();
  };

  const handleEndTimeChange = (time: string) => {
    setEndTime(time);
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
    autoAdjustTasks(getWorkingMinutes(startTime, time, breakTime));
    clearStaleErrors();
  };

  // 作業操作ハンドラ
  const handleAddTask = () => {
    const totalMinutes = getWorkingMinutes(startTime, endTime, breakTime);
    const usedMinutes = tasks.reduce((sum, t) => sum + (t.hours || 0) * 60, 0);
    const remainMinutes = Math.max(0, totalMinutes - usedMinutes);
    setTasks((prev) => [
      ...prev,
      { job: "", hours: minutesToHours(remainMinutes) },
    ]);
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
    clearStaleErrors();
  };

  const handleRemoveTask = (index: number) => {
    if (tasks.length <= 1) return;
    setTasks((prev) => prev.filter((_, i) => i !== index));
    isDirtyRef.current = true;
    clearStaleErrors();
  };

  const handleTaskJobChange = (index: number, job: string) => {
    setTasks((prev) => prev.map((t, i) => (i === index ? { ...t, job } : t)));
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
    clearStaleErrors();
  };

  const handleTaskHoursChange = (index: number, hours: number) => {
    setTasks((prev) => {
      const updated = prev.map((t, i) => (i === index ? { ...t, hours } : t));
      const totalMinutes = getWorkingMinutes(startTime, endTime, breakTime);
      if (totalMinutes > 0 && index !== prev.length - 1 && prev.length > 1) {
        const usedByOthers = updated
          .slice(0, -1)
          .reduce((sum, t) => sum + (t.hours || 0) * 60, 0);
        const lastMinutes = Math.max(0, totalMinutes - usedByOthers);
        updated[prev.length - 1] = {
          ...updated[prev.length - 1],
          hours: minutesToHours(lastMinutes),
        };
      }
      return updated;
    });
    isDirtyRef.current = true;
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
    clearStaleErrors();
  };

  // フォーム検証
  const validateForm = (data: KintaiData): boolean => {
    const newErrors: ValidationErrors = {};

    // 作業内容の必須チェック
    if (!data.tasks || data.tasks.length === 0) {
      newErrors.tasks = "作業を追加してください / Please add a task";
    } else if (data.tasks.some((t) => !t.job)) {
      newErrors.tasks = "作業内容を選択してください / Please select task type";
    } else if (data.tasks.some((t) => !t.hours || t.hours <= 0)) {
      newErrors.tasks = "作業時間を入力してください / Please enter hours";
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
      tasks,
      location: tasks.map((t) => t.job).join(", "),
    };

    const isValid = validateForm(formData);

    if (isValid) {
      // v12 楽観的更新: 即時 UI 反映、裏で送信
      const result = enqueueSave(formData);

      if (result.success) {
        isDirtyRef.current = false;
        dispatch({ type: EditActionType.SAVE_COMPLETE });
        // 楽観値で UI を即更新（API 完了を待たない）
        startTransition(() => {
          setStartTime(formData.startTime);
          setBreakTime(formatBreakTime(formData.breakTime));
          setEndTime(formData.endTime);
          setTasks(formData.tasks || []);
          setWorkingTime(
            calculateWorkingTime(
              formData.startTime,
              formData.endTime,
              formData.breakTime,
            ),
          );
          dispatch({
            type: EditActionType.CHECK_SAVED,
            payload: !!(formData.startTime || formData.endTime),
          });
        });
      } else {
        setErrors({
          general:
            (result.error || "エラーが発生しました") + " / An error occurred",
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

  // データ削除処理（v12: 楽観的更新で即時反映）
  const handleDeleteConfirm = () => {
    setIsSubmitting(true);
    setShowDeleteModal(false);

    const result = enqueueSave({
      date: formState.date,
      startTime: "",
      breakTime: "",
      endTime: "",
      tasks: [],
      location: "",
    });

    if (!result.success) {
      setErrors({
        general: (result.error || "削除に失敗しました") + " / Failed to delete",
      });
      setIsSubmitting(false);
      return;
    }

    // 楽観的にフォーム値クリア
    setStartTime("");
    setBreakTime("");
    setEndTime("");
    setTasks([]);
    setWorkingTime("");
    dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
    dispatch({ type: EditActionType.CANCEL_EDIT });

    setIsSubmitting(false);
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

        {/* 作業内容 */}
        <div className="form-group task-section">
          <label>作業内容 / Work Tasks</label>
          {tasks.map((task, index) => (
            <div key={index} className="task-row">
              <select
                value={task.job}
                onChange={(e) => handleTaskJobChange(index, e.target.value)}
                onFocus={loadJobOptions}
                onMouseDown={loadJobOptions}
                disabled={
                  isDataLoading ||
                  (formState.isSaved && !formState.isEditing) ||
                  isVeryOldDate()
                }
                className={`task-job-select ${!task.job ? "input-empty" : ""}`}
              >
                <option value="">未選択</option>
                {jobOptions && jobOptions.length > 0 ? (
                  jobOptions.map((opt) => (
                    <option key={opt.job} value={opt.job}>
                      {opt.job}
                      {opt.wage !== null ? ` / ¥${opt.wage}` : ""}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="田んぼ">田んぼ</option>
                    <option value="柿農園">柿農園</option>
                    <option value="事務所">事務所</option>
                    <option value="その他">その他</option>
                  </>
                )}
              </select>
              <div className="task-hours-picker-wrapper">
                <DrumTimePicker
                  label="作業時間"
                  value={hoursToHHmm(task.hours)}
                  onChange={(val) =>
                    handleTaskHoursChange(index, hhmmToHours(val))
                  }
                  disabled={
                    isDataLoading ||
                    (formState.isSaved && !formState.isEditing) ||
                    isVeryOldDate()
                  }
                />
              </div>
              {tasks.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveTask(index)}
                  disabled={
                    isDataLoading ||
                    (formState.isSaved && !formState.isEditing) ||
                    isVeryOldDate()
                  }
                  className="task-remove-btn"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!(
            isDataLoading ||
            (formState.isSaved && !formState.isEditing) ||
            isVeryOldDate()
          ) && (
            <button
              type="button"
              onClick={handleAddTask}
              onMouseEnter={loadJobOptions}
              onTouchStart={loadJobOptions}
              className="task-add-btn"
            >
              + 作業を追加 / Add Task
            </button>
          )}
          {tasks.length > 0 &&
            (() => {
              const tasksTotalMinutes = tasks.reduce(
                (sum, t) => sum + (t.hours || 0) * 60,
                0,
              );
              const wtMinutes = (() => {
                if (!workingTime) return 0;
                const [h, m] = workingTime.split(":").map(Number);
                return h * 60 + (m || 0);
              })();
              const isOver = wtMinutes > 0 && tasksTotalMinutes > wtMinutes;
              const totalH = Math.floor(tasksTotalMinutes / 60);
              const totalM = Math.round(tasksTotalMinutes % 60);
              return (
                <div className={`task-summary ${isOver ? "over-hours" : ""}`}>
                  作業合計: {totalH}:{String(totalM).padStart(2, "0")}
                  {workingTime ? ` / 勤務時間: ${workingTime}` : ""}
                </div>
              );
            })()}
        </div>
        {errors.tasks && <div className="error-message">{errors.tasks}</div>}

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
              出勤時間、休憩時間、退勤時間、作業内容のデータが削除されます。 /
              Clock‑in, break, clock‑out, and task data will be deleted.
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
