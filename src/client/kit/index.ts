// The shared game UI kit. Import from here: `import { Timer, Vote } from '../../client/kit'`.
// Props are documented in docs/DESIGN.md (Kit). Styles load once with the shell.
export { Avatar, inkOn, initialOf, type AvatarProps } from './Avatar';
export { DrawingCanvas, DEFAULT_COLORS, DEFAULT_WIDTHS, type DrawingCanvasProps } from './DrawingCanvas';
export { StrokeView, type StrokeViewProps } from './StrokeView';
export { Timer, type TimerProps } from './Timer';
export { Vote, type VoteOption, type VoteProps } from './Vote';
export { PromptCard, type PromptCardProps } from './PromptCard';
export { RevealStage, type RevealStageProps } from './RevealStage';
export { QR, type QRProps } from './QR';
export { PlayerChip, playerOf, type PlayerChipProps } from './PlayerChip';
export { useServerClock, useServerNow, useAssets, useAsset, useEphemeral } from './hooks';
export type { ServerClock } from '../net/clock';
export * from '../../shared/strokes';
