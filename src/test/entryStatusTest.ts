/**
 * /src/test/entryStatusTest.ts
 * 2025-01-XX
 * 変更概要: 新規追加 - 入力判定ロジック基盤整備 Phase 1 検証テスト
 */

import { EntryStatusManager } from "../utils/entryStatusManager";
import { determineEntryStatusUnified } from "../utils/entryStatusUtils";
import { KintaiData } from "../types";

/**
 * 基本入力判定ロジックのテスト
 */
export function testBasicInputLogic(): void {
  console.log("=== 基本入力判定ロジックテスト ===");

  const testCases: Array<{
    data: KintaiData;
    expected: boolean;
    description: string;
  }> = [
    {
      data: {
        date: "2025-01-01",
        startTime: "09:00",
        breakTime: "1:00",
        endTime: "18:00",
        location: "オフィス",
      },
      expected: true,
      description: "完全入力データ",
    },
    {
      data: {
        date: "2025-01-02",
        startTime: "",
        breakTime: "",
        endTime: "",
        location: "",
      },
      expected: false,
      description: "未入力データ",
    },
    {
      data: {
        date: "2025-01-03",
        startTime: "09:00",
        breakTime: "",
        endTime: "",
        location: "",
      },
      expected: true,
      description: "部分入力データ（開始時間のみ）",
    },
  ];

  testCases.forEach(({ data, expected, description }) => {
    const result = determineEntryStatusUnified(data);
    const status = result === expected ? "✓" : "✗";
    console.log(
      `${status} ${description}: ${result ? "入力済み" : "未入力"} (期待値: ${expected ? "入力済み" : "未入力"})`,
    );
  });
}

/**
 * EntryStatusManagerの基本機能テスト
 */
export async function testEntryStatusManager(): Promise<void> {
  console.log("\n=== EntryStatusManager基本機能テスト ===");

  const entryStatusManager = new EntryStatusManager({ debugMode: true });

  // 2025年1月のテストデータで初期化
  const testData: KintaiData[] = [
    {
      date: "2025-01-01",
      startTime: "09:00",
      breakTime: "1:00",
      endTime: "18:00",
      location: "オフィス",
    },
    {
      date: "2025-01-02",
      startTime: "",
      breakTime: "",
      endTime: "",
      location: "",
    },
  ];

  // 月間データ初期化
  await entryStatusManager.initializeMonth("2025-01", testData);

  // 判定テスト
  const result1 = entryStatusManager.isDateEntered("2025-01-01");
  const result2 = entryStatusManager.isDateEntered("2025-01-02");
  const result3 = entryStatusManager.isDateEntered("2025-01-03");

  console.log(
    `2025-01-01: ${result1.hasEntry ? "入力済み" : "未入力"} (source: ${result1.source})`,
  );
  console.log(
    `2025-01-02: ${result2.hasEntry ? "入力済み" : "未入力"} (source: ${result2.source})`,
  );
  console.log(
    `2025-01-03: ${result3.hasEntry ? "入力済み" : "未入力"} (source: ${result3.source})`,
  );

  // キャッシュ情報表示
  const cacheInfo = entryStatusManager.getCacheInfo();
  console.log("キャッシュ情報:", cacheInfo);
}

/**
 * 既存ロジックとの比較テスト（模擬）
 */
export function testLogicComparison(): void {
  console.log("\n=== 既存ロジックとの比較テスト ===");

  const testData: KintaiData[] = [
    {
      date: "2025-01-13",
      startTime: "09:00",
      breakTime: "1:00",
      endTime: "18:00",
      location: "オフィス",
    },
    {
      date: "2025-01-14",
      startTime: "",
      breakTime: "0:00",
      endTime: "",
      location: "",
    },
    {
      date: "2025-01-15",
      startTime: "",
      breakTime: "0:00",
      endTime: "",
      location: "",
    },
  ];

  // 既存ロジック（模擬）
  const legacyLogic = (data: KintaiData): boolean => {
    const hasStartTime = data.startTime && data.startTime.trim() !== "";
    const hasBreakTime =
      data.breakTime &&
      data.breakTime.trim() !== "" &&
      data.breakTime !== "0:00";
    const hasEndTime = data.endTime && data.endTime.trim() !== "";
    return !!(hasStartTime || hasBreakTime || hasEndTime);
  };

  const comparison = compareLogics(testData, legacyLogic);

  console.log("比較結果:");
  comparison.forEach((result) => {
    const status = result.match ? "✓" : "✗";
    console.log(
      `${status} ${result.date}: 新=${result.newLogic ? "入力済み" : "未入力"}, 旧=${result.oldLogic ? "入力済み" : "未入力"}`,
    );
  });
}

/**
 * ロジック比較ヘルパー関数
 */
function compareLogics(
  testData: KintaiData[],
  legacyLogic: (data: KintaiData) => boolean,
): Array<{
  date: string;
  newLogic: boolean;
  oldLogic: boolean;
  match: boolean;
}> {
  return testData.map((data) => {
    const newResult = determineEntryStatusUnified(data);
    const oldResult = legacyLogic(data);
    return {
      date: data.date,
      newLogic: newResult,
      oldLogic: oldResult,
      match: newResult === oldResult,
    };
  });
}

/**
 * 全テストを実行
 */
export async function runAllTests(): Promise<void> {
  console.log("=== 入力判定ロジック基盤整備 Phase 1 検証テスト ===");

  try {
    testBasicInputLogic();
    await testEntryStatusManager();
    testLogicComparison();

    console.log("\n=== 全テスト完了 ===");
  } catch (error) {
    console.error("テスト実行中にエラーが発生しました:", error);
  }
}

// ブラウザコンソールからの実行用
(window as any).entryStatusTest = {
  testBasicInputLogic,
  testEntryStatusManager,
  testLogicComparison,
  runAllTests,
};
