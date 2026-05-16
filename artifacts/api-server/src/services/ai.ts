/**
 * AI service — re-exported from the internal AI Brain.
 * No external API. All intelligence is self-learned.
 */
export {
  generateAssetAnalysis as analyzeAsset,
  generateMarketSummary as getMarketSummary,
  generateChatResponse as chatWithAI,
  type ChatMessage,
  type AssetAnalysisInput as AnalysisRequest,
} from "./ai-brain.js";
