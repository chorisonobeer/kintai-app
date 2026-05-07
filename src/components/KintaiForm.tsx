/**
 * /src/components/KintaiForm.tsx
 * 日次入力フォーム（スマホ縦持ち専用）
 * - 100dvh完全収納、スクロール原則禁止（タスクリストのみ局所スクロール許容）
 * - 寸法は全てclamp(min, dvh, max)、px/pt生指定なし
 * - 長押し編集モード維持＋アフォーダンス強化（短押しトースト）
 */
import React, {
  useState,
  useEffect,
  useReducer,
  useTransition,
  useDeferredValue,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import styled, { keyframes, css } from "styled-components";
import MobileDatePicker from "./MobileDatePicker";
import DrumTimePicker from "./drumtimepicker";
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
import { AlertIcon, CheckIcon, CloseIcon, PlusIcon } from "./Icons";

/* ──────────────── 初期状態・reducer ──────────────── */

const initialState: KintaiFormState = {
  date: getCurrentDate(),
  startTime: "",
  breakTime: "",
  endTime: "",
  location: "",
  isSaved: false,
  isEditing: false,
  touchStartTime: 0,
};

const editReducer = (
  state: KintaiFormState,
  action: { type: EditActionType; payload?: any },
): KintaiFormState => {
  switch (action.type) {
    case EditActionType.TOUCH_START:
      return { ...state, touchStartTime: Date.now() };
    case EditActionType.TOUCH_END: {
      const touchDuration = Date.now() - state.touchStartTime;
      if (touchDuration >= 1000 && !state.isEditing) {
        return { ...state, isEditing: true, touchStartTime: 0 };
      }
      return { ...state, touchStartTime: 0 };
    }
    case EditActionType.CANCEL_EDIT:
      return { ...state, isEditing: false };
    case EditActionType.SAVE_COMPLETE:
      return { ...state, isSaved: true, isEditing: false };
    case EditActionType.DATE_CHANGE:
      return { ...state, date: action.payload, isSaved: false };
    case EditActionType.CHECK_SAVED:
      return { ...state, isSaved: action.payload };
    case EditActionType.START_EDITING:
      return { ...state, isEditing: true };
    default:
      return state;
  }
};

/* ──────────────── 計算ヘルパー ──────────────── */

const parseTime = (s: string): { hours: number; minutes: number } | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || "");
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { hours: h, minutes: min };
};

const calculateWorkingTime = (
  startTime: string,
  endTime: string,
  breakTime: string,
): string => {
  if (!startTime || !endTime) return "";
  const s = parseTime(startTime);
  const e = parseTime(endTime);
  if (!s || !e) return "";
  const sm = s.hours * 60 + s.minutes;
  let em = e.hours * 60 + e.minutes;
  if (em < sm) em += 24 * 60;
  let bm = 0;
  if (breakTime) {
    const b = parseTime(breakTime);
    if (b) bm = b.hours * 60 + b.minutes;
  }
  const wm = em - sm - bm;
  if (wm < 0) return "0:00";
  const h = Math.floor(wm / 60);
  const m = wm % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};

const getWorkingMinutes = (st: string, et: string, bt: string): number => {
  if (!st || !et) return 0;
  const wt = calculateWorkingTime(st, et, bt);
  if (!wt) return 0;
  const [h, m] = wt.split(":").map(Number);
  return h * 60 + (m || 0);
};

const roundTo5min = (minutes: number): number => Math.round(minutes / 5) * 5;
const minutesToHours = (minutes: number): number => roundTo5min(minutes) / 60;

const hoursToHHmm = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h.toString().padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const hhmmToHours = (hhmm: string): number => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
};

const formatBreakTime = (bt: number | string | undefined | null): string => {
  if (bt === undefined || bt === null) return "";
  if (bt === 0 || bt === "0" || bt === "0:00" || bt === "00:00") return "00:00";
  if (typeof bt === "string") {
    const m = bt.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      return `${h.toString().padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    const n = parseInt(bt, 10);
    if (!Number.isNaN(n)) {
      const h = Math.floor(n / 60);
      const min = n % 60;
      return `${h.toString().padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    return "";
  }
  if (typeof bt === "number") {
    if (bt < 0) return "";
    const h = Math.floor(bt / 60);
    const min = bt % 60;
    return `${h.toString().padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return "";
};

/* ──────────────── KintaiForm ──────────────── */

const KintaiForm: React.FC = () => {
  const navigate = useNavigate();
  const {
    monthlyData,
    isDataLoading: isContextLoading,
    currentYear,
    currentMonth,
    setCurrentYear,
    setCurrentMonth,
  } = useKintai();

  useEffect(() => {
    if (!isAuthenticated()) navigate("/login");
  }, [navigate]);

  const [, startTransition] = useTransition();

  const [formState, dispatch] = useReducer(editReducer, initialState);
  const deferredDate = useDeferredValue(formState.date);

  const [startTime, setStartTime] = useState(initialState.startTime);
  const [breakTime, setBreakTime] = useState(initialState.breakTime);
  const [endTime, setEndTime] = useState(initialState.endTime);
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [workingTime, setWorkingTime] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [jobOptions, setJobOptions] = useState<
    Array<{ job: string; wage: number | null }>
  >([]);

  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tooOldDateWarning, setTooOldDateWarning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [shortTapHint, setShortTapHint] = useState(false);
  const shortTapHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isDirtyRef = useRef(false);
  const prevDateRef = useRef<string>(initialState.date);

  // 勤務時間自動計算
  useEffect(() => {
    setWorkingTime(calculateWorkingTime(startTime, endTime, breakTime));
  }, [startTime, endTime, breakTime]);

  // 作業一覧（時給設定シート由来）— マウント時に即ロード。
  // 遅延ロードだとドロップダウンが空のまま開いてフォールバックが見えてしまうため、
  // 認証済みになった瞬間に取得してハードコードリストを表示させない。
  const jobOptionsLoadedRef = useRef(false);
  const [jobOptionsLoading, setJobOptionsLoading] = useState(false);
  const loadJobOptions = async () => {
    if (jobOptionsLoadedRef.current) return;
    jobOptionsLoadedRef.current = true;
    setJobOptionsLoading(true);
    try {
      const list = await getJobWageOptions();
      setJobOptions(list);
    } catch {
      jobOptionsLoadedRef.current = false;
    } finally {
      setJobOptionsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated()) return;
    loadJobOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 月同期
  useEffect(() => {
    if (!formState.date) return;
    const y = parseInt(formState.date.substring(0, 4), 10);
    const m = parseInt(formState.date.substring(5, 7), 10);
    if (Number.isNaN(y) || Number.isNaN(m)) return;
    if (y !== currentYear || m !== currentMonth) {
      setCurrentYear(y);
      setCurrentMonth(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.date]);

  // データ適用
  useEffect(() => {
    if (
      prevDateRef.current === deferredDate &&
      (formState.isEditing || isDirtyRef.current)
    ) {
      return;
    }

    const y = parseInt(deferredDate.substring(0, 4), 10);
    const m = parseInt(deferredDate.substring(5, 7), 10);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      if (y !== currentYear || m !== currentMonth) return;
    }

    if (isContextLoading) {
      startTransition(() => setIsDataLoading(true));
      return;
    }

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

    const data = getKintaiDataFromMonthlyData(deferredDate, monthlyData);
    if (data) {
      const hasStartTime = data.startTime && data.startTime.trim() !== "";
      const breakAsStr = formatBreakTime(data.breakTime);
      startTransition(() => {
        setStartTime(data.startTime || "");
        setBreakTime(breakAsStr);
        setEndTime(data.endTime || "");
        if (data.tasks && data.tasks.length > 0) setTasks(data.tasks);
        else if (data.location) setTasks([{ job: data.location, hours: 0 }]);
        else setTasks([]);
        setWorkingTime(data.workingTime || "");
        dispatch({
          type: EditActionType.CHECK_SAVED,
          payload: !!hasStartTime,
        });
        setIsDataLoading(false);
      });
    } else {
      startTransition(() => setIsDataLoading(false));
    }

    setTooOldDateWarning(isDateTooOld(deferredDate));
    isDirtyRef.current = false;
    prevDateRef.current = deferredDate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredDate, monthlyData, currentYear, currentMonth, isContextLoading]);

  /* ──────── 入力ハンドラ ──────── */

  const handleDateChange = (date: string) => {
    dispatch({ type: EditActionType.DATE_CHANGE, payload: date });
  };

  const autoAdjustTasks = (totalMinutes: number) => {
    if (totalMinutes <= 0) return;
    setTasks((prev) => {
      if (prev.length === 0) return prev;
      if (prev.length === 1) {
        return [{ ...prev[0], hours: minutesToHours(totalMinutes) }];
      }
      const usedByOthers = prev
        .slice(0, -1)
        .reduce((s, t) => s + (t.hours || 0) * 60, 0);
      const lastMin = Math.max(0, totalMinutes - usedByOthers);
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        hours: minutesToHours(lastMin),
      };
      return updated;
    });
  };

  const clearStaleErrors = () => {
    setErrors((prev) => (Object.keys(prev).length > 0 ? {} : prev));
  };

  const beginEditingIfNeeded = () => {
    if (!formState.isEditing) {
      dispatch({ type: EditActionType.START_EDITING });
    }
  };

  const handleStartTimeChange = (t: string) => {
    setStartTime(t);
    isDirtyRef.current = true;
    beginEditingIfNeeded();
    autoAdjustTasks(getWorkingMinutes(t, endTime, breakTime));
    clearStaleErrors();
  };

  const handleBreakTimeChange = (t: string) => {
    setBreakTime(t);
    isDirtyRef.current = true;
    beginEditingIfNeeded();
    autoAdjustTasks(getWorkingMinutes(startTime, endTime, t));
    clearStaleErrors();
  };

  const handleEndTimeChange = (t: string) => {
    setEndTime(t);
    isDirtyRef.current = true;
    beginEditingIfNeeded();
    autoAdjustTasks(getWorkingMinutes(startTime, t, breakTime));
    clearStaleErrors();
  };

  const handleAddTask = () => {
    const totalMin = getWorkingMinutes(startTime, endTime, breakTime);
    const usedMin = tasks.reduce((s, t) => s + (t.hours || 0) * 60, 0);
    const remainMin = Math.max(0, totalMin - usedMin);
    setTasks((prev) => [
      ...prev,
      { job: "", hours: minutesToHours(remainMin) },
    ]);
    isDirtyRef.current = true;
    beginEditingIfNeeded();
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
    beginEditingIfNeeded();
    clearStaleErrors();
  };

  const handleTaskHoursChange = (index: number, hours: number) => {
    setTasks((prev) => {
      const updated = prev.map((t, i) => (i === index ? { ...t, hours } : t));
      const totalMin = getWorkingMinutes(startTime, endTime, breakTime);
      if (totalMin > 0 && index !== prev.length - 1 && prev.length > 1) {
        const usedByOthers = updated
          .slice(0, -1)
          .reduce((s, t) => s + (t.hours || 0) * 60, 0);
        const lastMin = Math.max(0, totalMin - usedByOthers);
        updated[prev.length - 1] = {
          ...updated[prev.length - 1],
          hours: minutesToHours(lastMin),
        };
      }
      return updated;
    });
    isDirtyRef.current = true;
    beginEditingIfNeeded();
    clearStaleErrors();
  };

  /* ──────── バリデーション・送信 ──────── */

  const validateForm = (data: KintaiData): boolean => {
    const newErrors: ValidationErrors = {};
    if (!data.tasks || data.tasks.length === 0) {
      newErrors.tasks = "作業を追加してください";
    } else if (data.tasks.some((t) => !t.job)) {
      newErrors.tasks = "作業内容を選択してください";
    } else if (data.tasks.some((t) => !t.hours || t.hours <= 0)) {
      newErrors.tasks = "作業時間を入力してください";
    }
    if (!isTimeBeforeOrEqual(data.startTime, data.endTime)) {
      newErrors.endTime = "退勤は出勤より後にしてください";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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
      const result = enqueueSave(formData);
      if (result.success) {
        isDirtyRef.current = false;
        dispatch({ type: EditActionType.SAVE_COMPLETE });
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
        setErrors({ general: result.error || "エラーが発生しました" });
      }
    }
    setIsSubmitting(false);
  };

  const handleCancelEdit = () => {
    dispatch({ type: EditActionType.CANCEL_EDIT });
  };

  const handleDeleteClick = () => setShowDeleteModal(true);
  const handleDeleteCancel = () => setShowDeleteModal(false);

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
      setErrors({ general: result.error || "削除に失敗しました" });
      setIsSubmitting(false);
      return;
    }
    setStartTime("");
    setBreakTime("");
    setEndTime("");
    setTasks([]);
    setWorkingTime("");
    dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
    dispatch({ type: EditActionType.CANCEL_EDIT });
    setIsSubmitting(false);
  };

  /* ──────── 長押し（保存済みボタン上で1秒で編集モード移行） ──────── */

  const [longPressProgress, setLongPressProgress] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const longPressStartRef = useRef(0);

  const handleLongPressStart = () => {
    longPressStartRef.current = Date.now();
    dispatch({ type: EditActionType.TOUCH_START });
    setIsLongPressing(true);
    setLongPressProgress(0);
    const startedAt = Date.now();
    const duration = 1000;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setLongPressProgress(progress);
      if (progress < 100) {
        longPressIntervalRef.current = setTimeout(tick, 16);
      }
    };
    tick();
  };

  const handleLongPressEnd = () => {
    const elapsed = Date.now() - longPressStartRef.current;
    dispatch({ type: EditActionType.TOUCH_END });
    setIsLongPressing(false);
    setLongPressProgress(0);
    if (longPressIntervalRef.current) {
      clearTimeout(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    // 短押し（編集モードに入らなかった）→ ヒントトースト
    if (
      formState.isSaved &&
      !formState.isEditing &&
      !isVeryOldDate() &&
      elapsed > 0 &&
      elapsed < 900
    ) {
      setShortTapHint(true);
      if (shortTapHintTimerRef.current) {
        clearTimeout(shortTapHintTimerRef.current);
      }
      shortTapHintTimerRef.current = setTimeout(
        () => setShortTapHint(false),
        1800,
      );
    }
  };

  useEffect(
    () => () => {
      if (longPressIntervalRef.current) {
        clearTimeout(longPressIntervalRef.current);
      }
      if (shortTapHintTimerRef.current) {
        clearTimeout(shortTapHintTimerRef.current);
      }
    },
    [],
  );

  /* ──────── 派生状態 ──────── */

  const isVeryOldDate = (): boolean => isDateTooOld(formState.date);
  const fieldsDisabled =
    isDataLoading ||
    (formState.isSaved && !formState.isEditing) ||
    isVeryOldDate();
  const tasksTotalMinutes = tasks.reduce((s, t) => s + (t.hours || 0) * 60, 0);
  const wtMinutes = (() => {
    if (!workingTime) return 0;
    const [h, m] = workingTime.split(":").map(Number);
    return h * 60 + (m || 0);
  })();
  const tasksOver = wtMinutes > 0 && tasksTotalMinutes > wtMinutes;
  const totalH = Math.floor(tasksTotalMinutes / 60);
  const totalM = Math.round(tasksTotalMinutes % 60);

  /* ──────── レンダー ──────── */

  return (
    <Shell>
      <DateRow>
        <MobileDatePicker
          value={formState.date}
          onChange={handleDateChange}
          isEditing={formState.isEditing}
        />
      </DateRow>

      {tooOldDateWarning && (
        <WarnBanner role="alert">
          <WarnIconWrap>
            <AlertIcon />
          </WarnIconWrap>
          <span>{EDITABLE_DAYS}日以上前の日付は編集できません</span>
        </WarnBanner>
      )}

      <FieldRow>
        <DrumTimePicker
          label="出勤"
          value={startTime}
          onChange={handleStartTimeChange}
          disabled={fieldsDisabled}
        />
      </FieldRow>

      <FieldRow>
        <MobileBreakPicker
          value={breakTime}
          onChange={handleBreakTimeChange}
          disabled={fieldsDisabled}
        />
      </FieldRow>

      <FieldRow>
        <DrumTimePicker
          label="退勤"
          value={endTime}
          onChange={handleEndTimeChange}
          disabled={fieldsDisabled}
        />
        {errors.endTime && <FieldError>{errors.endTime}</FieldError>}
      </FieldRow>

      <WorkingRow>
        <WorkingLabel>勤務時間</WorkingLabel>
        <WorkingValue $empty={!workingTime}>
          {workingTime || "--:--"}
        </WorkingValue>
      </WorkingRow>

      <TasksSection>
        <TasksHeader>
          <TasksTitle>作業内容</TasksTitle>
          {tasks.length > 0 && (
            <TasksSummary $over={tasksOver}>
              <span>
                合計 {totalH}:{String(totalM).padStart(2, "0")}
                {workingTime ? ` / 勤務 ${workingTime}` : ""}
              </span>
              {!tasksOver &&
                wtMinutes > 0 &&
                tasksTotalMinutes === wtMinutes && (
                  <SummaryCheckIcon>
                    <CheckIcon strokeWidth={2.6} />
                  </SummaryCheckIcon>
                )}
            </TasksSummary>
          )}
        </TasksHeader>
        <TasksList>
          {tasks.map((task, index) => (
            <TaskCard key={index}>
              <TaskJobSelect
                value={task.job}
                onChange={(e) => handleTaskJobChange(index, e.target.value)}
                onFocus={loadJobOptions}
                onMouseDown={loadJobOptions}
                disabled={fieldsDisabled}
                $empty={!task.job}
                aria-label="作業内容"
              >
                <option value="">
                  {jobOptionsLoading && jobOptions.length === 0
                    ? "読込中..."
                    : "作業を選択"}
                </option>
                {jobOptions.map((opt) => (
                  <option key={opt.job} value={opt.job}>
                    {opt.job}
                    {opt.wage !== null ? ` / ¥${opt.wage}` : ""}
                  </option>
                ))}
                {/* 既存値が現マスタに存在しない場合の互換表示（自動消去防止） */}
                {task.job &&
                  !jobOptions.some((o) => o.job === task.job) && (
                    <option value={task.job}>{task.job}</option>
                  )}
              </TaskJobSelect>
              <TaskHoursWrap>
                <DrumTimePicker
                  label="時間"
                  value={hoursToHHmm(task.hours)}
                  onChange={(v) => handleTaskHoursChange(index, hhmmToHours(v))}
                  disabled={fieldsDisabled}
                />
              </TaskHoursWrap>
              {tasks.length > 1 && (
                <TaskRemoveBtn
                  type="button"
                  onClick={() => handleRemoveTask(index)}
                  disabled={fieldsDisabled}
                  aria-label="この作業を削除"
                >
                  <CloseIcon />
                </TaskRemoveBtn>
              )}
            </TaskCard>
          ))}
          {!fieldsDisabled && (
            <TaskAddBtn
              type="button"
              onClick={handleAddTask}
              onMouseEnter={loadJobOptions}
              onTouchStart={loadJobOptions}
            >
              <PlusIcon strokeWidth={2.4} />
              <span>作業を追加</span>
            </TaskAddBtn>
          )}
        </TasksList>
        {errors.tasks && <FieldError>{errors.tasks}</FieldError>}
      </TasksSection>

      <ActionRow>
        {formState.isEditing ? (
          <>
            <PrimaryBtn
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                Object.keys(errors).length > 0 ||
                isVeryOldDate()
              }
            >
              保存
            </PrimaryBtn>
            <ActionSubRow>
              <DangerBtn
                onClick={handleDeleteClick}
                disabled={isSubmitting}
                type="button"
              >
                削除
              </DangerBtn>
              <CancelBtn
                onClick={handleCancelEdit}
                disabled={isSubmitting}
                type="button"
              >
                キャンセル
              </CancelBtn>
            </ActionSubRow>
          </>
        ) : formState.isSaved ? (
          <>
            <SavedBtn
              $progress={longPressProgress}
              $pressing={isLongPressing}
              $disabled={isVeryOldDate()}
              onTouchStart={isVeryOldDate() ? undefined : handleLongPressStart}
              onTouchEnd={isVeryOldDate() ? undefined : handleLongPressEnd}
              onMouseDown={isVeryOldDate() ? undefined : handleLongPressStart}
              onMouseUp={isVeryOldDate() ? undefined : handleLongPressEnd}
              onMouseLeave={isVeryOldDate() ? undefined : handleLongPressEnd}
              disabled={isSubmitting || isVeryOldDate()}
              type="button"
              aria-label={
                isVeryOldDate() ? "編集不可" : "長押しで編集モードに入る"
              }
            >
              <SavedProgressBar
                style={{ width: `${longPressProgress}%` }}
                aria-hidden="true"
              />
              <SavedContent>
                <SavedCheck>
                  <CheckIcon strokeWidth={2.6} />
                </SavedCheck>
                <SavedTextMain>
                  {isVeryOldDate()
                    ? `編集不可（${EDITABLE_DAYS}日以上前）`
                    : "入力済み"}
                </SavedTextMain>
                {!isVeryOldDate() && <SavedHint>長押しで編集</SavedHint>}
              </SavedContent>
            </SavedBtn>
            <ActionSubRow style={{ visibility: "hidden" }} aria-hidden="true">
              {/* 高さ予約のための placeholder */}
              <CancelBtn type="button" tabIndex={-1}>
                .
              </CancelBtn>
            </ActionSubRow>
          </>
        ) : (
          <>
            <PrimaryBtn
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                Object.keys(errors).length > 0 ||
                isVeryOldDate()
              }
            >
              保存
            </PrimaryBtn>
            <ActionSubRow style={{ visibility: "hidden" }} aria-hidden="true">
              <CancelBtn type="button" tabIndex={-1}>
                .
              </CancelBtn>
            </ActionSubRow>
          </>
        )}
      </ActionRow>

      {errors.general && <FieldError>{errors.general}</FieldError>}

      {/* 短押しヒントトースト */}
      {shortTapHint && (
        <Hint role="status" aria-live="polite">
          長押しで編集できます
        </Hint>
      )}

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <ModalOverlay onClick={handleDeleteCancel}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>データを削除しますか？</ModalTitle>
            <ModalBody>
              出勤・休憩・退勤・作業内容のデータが削除されます。
            </ModalBody>
            <ModalActions>
              <CancelBtn onClick={handleDeleteCancel} type="button">
                キャンセル
              </CancelBtn>
              <DangerBtn onClick={handleDeleteConfirm} type="button">
                削除
              </DangerBtn>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}

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
    </Shell>
  );
};

export default KintaiForm;

/* ──────────────── styled-components ──────────────── */

/* カラーパレット（落ち着いた deeper indigo / 1px ライン基調） */
const C = {
  primary: "#3730a3",
  primaryDeep: "#312e81",
  saved: "#047857",
  savedDark: "#065f46",
  edit: "#b45309",
  danger: "#b91c1c",
  dangerLight: "#fecaca",
  text: "#0f172a",
  textMid: "#334155",
  textMute: "#64748b",
  textFaint: "#94a3b8",
  bg: "#f8fafc",
  card: "#ffffff",
  cardLocked: "#f1f5f9",
  line: "#e2e8f0",
  emptyBorder: "#fb7185",
  emptyBg: "#fff1f2",
  emptyText: "#9f1239",
} as const;

const Shell = styled.div`
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr 1.2fr 1.2fr 1.2fr 1fr 2.5fr 1.5fr;
  gap: clamp(4px, 0.7dvh, 8px);
  width: 100%;
  padding: clamp(6px, 1.2dvh, 12px) clamp(8px, 2.4dvw, 14px)
    calc(clamp(6px, 1.2dvh, 12px) + env(safe-area-inset-bottom));
  background: ${C.bg};
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
    "Yu Gothic UI", sans-serif;
  letter-spacing: -0.005em;
`;

const DateRow = styled.div`
  min-height: 0;
  display: flex;
`;

const FieldRow = styled.div`
  position: relative;
  min-height: 0;
  display: flex;
  align-items: stretch;
  background: ${C.card};
  padding: 0 clamp(8px, 1.6dvh, 14px);
  border-radius: clamp(10px, 1.8dvh, 14px);
  border: 1px solid ${C.line};
`;

const WorkingRow = styled.div`
  position: relative;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(12px, 2dvh, 18px);
  background: ${C.card};
  border: 1px solid ${C.primary};
  border-radius: clamp(10px, 1.8dvh, 14px);

  /* 左端の細いアクセントバーで強調 */
  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: clamp(8px, 1.4dvh, 12px);
    bottom: clamp(8px, 1.4dvh, 12px);
    width: 3px;
    background: ${C.primary};
    border-radius: 0 2px 2px 0;
  }
`;

const WorkingLabel = styled.span`
  font-size: clamp(11px, 1.7dvh, 13px);
  font-weight: 600;
  color: ${C.primaryDeep};
  letter-spacing: 0;
`;

const WorkingValue = styled.span<{ $empty: boolean }>`
  font-size: clamp(20px, 3.4dvh, 28px);
  font-weight: 700;
  color: ${(p) => (p.$empty ? C.textFaint : C.primaryDeep)};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
`;

/* タスクセクション */
const TasksSection = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 0.7dvh, 6px);
  background: ${C.card};
  border: 1px solid ${C.line};
  border-radius: clamp(10px, 1.8dvh, 14px);
  padding: clamp(8px, 1.4dvh, 12px) clamp(10px, 1.8dvh, 14px);
`;

const TasksHeader = styled.div`
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: clamp(8px, 1.4dvh, 12px);
`;

const TasksTitle = styled.h3`
  margin: 0;
  font-size: clamp(12px, 1.8dvh, 14px);
  font-weight: 600;
  color: ${C.textMid};
  letter-spacing: 0;
`;

const TasksSummary = styled.span<{ $over: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: clamp(3px, 0.5dvh, 5px);
  font-size: clamp(10px, 1.5dvh, 12px);
  font-weight: 600;
  color: ${(p) => (p.$over ? C.danger : C.textMute)};
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.005em;
`;

const SummaryCheckIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${C.saved};
  width: clamp(12px, 1.8dvh, 14px);
  height: clamp(12px, 1.8dvh, 14px);

  & svg {
    width: 100%;
    height: 100%;
  }
`;

const TasksList = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: clamp(4px, 0.7dvh, 6px);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 3px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${C.line};
    border-radius: 2px;
  }
`;

const TaskCard = styled.div`
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1.6fr 1.2fr auto;
  align-items: center;
  gap: clamp(4px, 0.8dvh, 8px);
  padding: clamp(4px, 0.6dvh, 6px) 0;
`;

const TaskJobSelect = styled.select<{ $empty: boolean }>`
  height: clamp(40px, 6dvh, 52px);
  padding: 0 clamp(8px, 1.4dvh, 12px);
  font-family: inherit;
  font-size: clamp(13px, 2dvh, 15px);
  color: ${C.text};
  background: ${C.bg}
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='1 1 5 5 9 1'/></svg>")
    no-repeat right clamp(8px, 1.4dvh, 12px) center;
  background-size: clamp(8px, 1.2dvh, 10px) clamp(5px, 0.8dvh, 6px);
  border: 1px solid ${C.line};
  border-radius: clamp(8px, 1.4dvh, 10px);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  min-width: 0;
  text-overflow: ellipsis;
  padding-right: clamp(20px, 3dvh, 28px);
  letter-spacing: -0.005em;

  &:disabled {
    background-color: ${C.cardLocked};
    color: ${C.textFaint};
    cursor: not-allowed;
    opacity: 0.7;
  }

  ${(p) =>
    p.$empty &&
    css`
      border-color: ${C.emptyBorder};
      background-color: ${C.emptyBg};
      color: ${C.emptyText};
    `}
`;

const TaskHoursWrap = styled.div`
  min-width: 0;
  & .drum-time-picker-label {
    display: none;
  }
  & .drum-time-picker-button {
    height: clamp(40px, 6dvh, 52px);
    padding: 0 clamp(8px, 1.2dvh, 10px);
    font-size: clamp(13px, 2dvh, 15px);
  }
  & .drum-time-picker-value {
    font-size: clamp(14px, 2.2dvh, 17px);
  }
`;

const TaskRemoveBtn = styled.button`
  width: clamp(36px, 5.6dvh, 44px);
  height: clamp(36px, 5.6dvh, 44px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: ${C.textFaint};
  border: 1px solid ${C.line};
  border-radius: 50%;
  font-family: inherit;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  flex: 0 0 auto;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;

  & svg {
    width: clamp(14px, 2.2dvh, 18px);
    height: clamp(14px, 2.2dvh, 18px);
  }

  &:hover:not(:disabled) {
    background: #fef2f2;
    color: ${C.danger};
    border-color: ${C.dangerLight};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const TaskAddBtn = styled.button`
  flex: 0 0 auto;
  height: clamp(40px, 5.5dvh, 48px);
  background: ${C.card};
  color: ${C.primary};
  border: 1px dashed #c7d2fe;
  border-radius: clamp(8px, 1.4dvh, 10px);
  font-family: inherit;
  font-size: clamp(12px, 1.9dvh, 14px);
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: clamp(4px, 0.8dvh, 6px);
  transition:
    background 0.15s,
    border-color 0.15s;

  & svg {
    width: clamp(13px, 2dvh, 16px);
    height: clamp(13px, 2dvh, 16px);
  }

  &:hover {
    background: #eef2ff;
    border-color: ${C.primary};
    border-style: solid;
  }
`;

/* アクションエリア（高さ予約: 編集中の2段構造に常に揃える） */
const ActionRow = styled.div`
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: clamp(4px, 0.8dvh, 8px);
`;

const ActionSubRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(6px, 1.2dvh, 10px);
  min-height: 0;
`;

const baseBtn = css`
  width: 100%;
  height: 100%;
  min-height: clamp(40px, 6dvh, 56px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: clamp(14px, 2.2dvh, 17px);
  font-weight: 600;
  letter-spacing: 0;
  border: none;
  border-radius: clamp(10px, 1.6dvh, 14px);
  cursor: pointer;
  transition:
    transform 0.08s,
    background 0.15s,
    border-color 0.15s,
    opacity 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
`;

const PrimaryBtn = styled.button`
  ${baseBtn}
  background: ${C.primary};
  color: #ffffff;
  border: 1px solid ${C.primary};

  &:hover:not(:disabled) {
    background: ${C.primaryDeep};
    border-color: ${C.primaryDeep};
  }
`;

const DangerBtn = styled.button`
  ${baseBtn}
  background: ${C.card};
  color: ${C.danger};
  border: 1px solid ${C.dangerLight};
  font-size: clamp(13px, 2dvh, 15px);
  &:hover:not(:disabled) {
    background: #fef2f2;
    border-color: #f87171;
  }
`;

const CancelBtn = styled.button`
  ${baseBtn}
  background: ${C.card};
  color: ${C.textMid};
  border: 1px solid ${C.line};
  font-size: clamp(13px, 2dvh, 15px);
  &:hover:not(:disabled) {
    background: ${C.bg};
    border-color: #cbd5e1;
  }
`;

/* 保存済みボタン（長押しで編集モード）— solid green / 影なし */
const SavedBtn = styled.button<{
  $progress: number;
  $pressing: boolean;
  $disabled: boolean;
}>`
  ${baseBtn}
  position: relative;
  overflow: hidden;
  background: ${(p) => (p.$disabled ? "#cbd5e1" : C.saved)};
  color: ${(p) => (p.$disabled ? C.textMute : "#ffffff")};
  border: 1px solid ${(p) => (p.$disabled ? "#cbd5e1" : C.saved)};
  transition:
    background 0.15s,
    border-color 0.15s;

  &:hover:not(:disabled) {
    background: ${(p) => (p.$disabled ? "#cbd5e1" : C.savedDark)};
    border-color: ${(p) => (p.$disabled ? "#cbd5e1" : C.savedDark)};
  }
  &:disabled {
    opacity: 0.85;
    cursor: not-allowed;
  }
`;

const SavedProgressBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.18);
  transition: none;
  pointer-events: none;
  z-index: 1;
`;

const SavedContent = styled.span`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(6px, 1.2dvh, 10px);
  flex-wrap: nowrap;
`;

const SavedCheck = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(20px, 3dvh, 26px);
  height: clamp(20px, 3dvh, 26px);
  background: rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  color: #ffffff;

  & svg {
    width: clamp(13px, 2dvh, 16px);
    height: clamp(13px, 2dvh, 16px);
  }
`;

const SavedTextMain = styled.span`
  font-size: clamp(14px, 2.2dvh, 17px);
  font-weight: 600;
  letter-spacing: 0;
`;

const SavedHint = styled.span`
  font-size: clamp(10px, 1.5dvh, 12px);
  font-weight: 500;
  opacity: 0.85;
  letter-spacing: 0;
`;

/* バナー・エラー */
const WarnBanner = styled.div`
  display: inline-flex;
  align-items: center;
  gap: clamp(4px, 0.8dvh, 6px);
  font-size: clamp(11px, 1.7dvh, 13px);
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: clamp(6px, 1dvh, 10px);
  padding: clamp(6px, 1dvh, 10px) clamp(10px, 1.6dvh, 14px);
  letter-spacing: 0;
`;

const WarnIconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${C.edit};
  width: clamp(13px, 2dvh, 16px);
  height: clamp(13px, 2dvh, 16px);

  & svg {
    width: 100%;
    height: 100%;
  }
`;

const FieldError = styled.div`
  position: absolute;
  bottom: clamp(2px, 0.4dvh, 4px);
  left: clamp(10px, 1.8dvh, 16px);
  font-size: clamp(10px, 1.5dvh, 12px);
  color: ${C.danger};
  font-weight: 500;
  letter-spacing: 0;
`;

/* ヒントトースト */
const fadeIn = keyframes`
  from { opacity: 0; transform: translate(-50%, 8px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
`;

const Hint = styled.div`
  position: fixed;
  left: 50%;
  bottom: clamp(80px, 14dvh, 130px);
  transform: translateX(-50%);
  background: ${C.text};
  color: #ffffff;
  font-size: clamp(12px, 1.9dvh, 14px);
  font-weight: 500;
  padding: clamp(8px, 1.4dvh, 12px) clamp(14px, 2.4dvh, 20px);
  border-radius: 999px;
  border: 1px solid ${C.text};
  z-index: 1500;
  pointer-events: none;
  animation: ${fadeIn} 0.18s ease-out;
  white-space: nowrap;
  letter-spacing: 0;
`;

/* 削除確認モーダル */
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: clamp(16px, 3dvh, 24px);
`;

const ModalCard = styled.div`
  background: ${C.card};
  border-radius: clamp(12px, 2dvh, 16px);
  border: 1px solid ${C.line};
  box-shadow: 0 clamp(8px, 1.6dvh, 16px) clamp(20px, 4dvh, 36px)
    rgba(15, 23, 42, 0.18);
  padding: clamp(18px, 3dvh, 28px);
  max-width: clamp(280px, 86dvw, 420px);
  width: 100%;
`;

const ModalTitle = styled.h3`
  margin: 0 0 clamp(8px, 1.4dvh, 12px) 0;
  font-size: clamp(15px, 2.4dvh, 18px);
  font-weight: 600;
  color: ${C.text};
  letter-spacing: -0.01em;
`;

const ModalBody = styled.p`
  margin: 0 0 clamp(16px, 2.6dvh, 22px) 0;
  font-size: clamp(12px, 1.9dvh, 14px);
  color: ${C.textMid};
  line-height: 1.55;
  letter-spacing: 0;
`;

const ModalActions = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(8px, 1.4dvh, 12px);
`;
