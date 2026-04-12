// Shared interface for all auto-collect agents
// 모든 auto-collect 에이전트의 공통 인터페이스

export type SendFn = (event: string, data: any) => void;

export interface CollectorResult {
  /** Collected data sections — agent-specific */
  sections: Record<string, any>;
  /** Tools/sources that were successfully used */
  usedTools: string[];
  /** Resources that were queried */
  queriedResources: string[];
  /** Human-readable summary for "via" field */
  viaSummary: string;
}

export interface Collector {
  /** Collect data from multiple sources in parallel */
  collect(send: SendFn, accountId?: string, isEn?: boolean): Promise<CollectorResult>;
  /** Format collected data as context string for Bedrock */
  formatContext(data: CollectorResult): string;
  /** System prompt for Bedrock analysis */
  analysisPrompt: string;
  /** Display name shown in UI */
  displayName: string;
}
