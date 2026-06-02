// Live ingestion: the end-to-end path from connectors to a gated brief.
export { dedupeNewsItems } from './dedupe'
export { runLiveIngestion } from './pipeline'
export type {
  FigureConnector,
  NewsConnector,
  CountryProfileConnector,
  ConnectorFailure,
  RejectedFigure,
  LiveIngestionDiagnostics,
  LiveIngestionInput,
  LiveIngestionResult,
} from './pipeline'
export {
  fxConnector,
  brentConnector,
  gdeltConnector,
  rssConnector,
  defaultLiveConnectors,
} from './liveConnectors'
