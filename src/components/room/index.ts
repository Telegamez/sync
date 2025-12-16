/**
 * Room Components Index
 *
 * Central export for all room-related components.
 */

export { RoomLobby } from "./RoomLobby";
export type { RoomLobbyProps } from "./RoomLobby";

export { RoomCard } from "./RoomCard";
export type { RoomCardProps } from "./RoomCard";

export { CreateRoomForm } from "./CreateRoomForm";
export type { CreateRoomFormProps } from "./CreateRoomForm";

export { ParticipantList } from "./ParticipantList";
export type {
  ParticipantListProps,
  ParticipantInfo,
  ParticipantListLayout,
} from "./ParticipantList";

export { ParticipantAvatar } from "./ParticipantAvatar";
export type { ParticipantAvatarProps, AvatarSize } from "./ParticipantAvatar";

export { RoomControls } from "./RoomControls";
export type { RoomControlsProps } from "./RoomControls";

export { SpeakingIndicator } from "./SpeakingIndicator";
export type {
  SpeakingIndicatorProps,
  SpeakerInfo,
  SpeakingIndicatorMode,
} from "./SpeakingIndicator";

export { PTTButton, InlinePTTButton, MainPTTButton } from "./PTTButton";
export type {
  PTTButtonProps,
  PTTButtonSize,
  PTTButtonVariant,
  InlinePTTButtonProps,
  MainPTTButtonProps,
} from "./PTTButton";

export {
  AIStateIndicator,
  AIStateBadge,
  AIStateDot,
  AIStateDisplay,
} from "./AIStateIndicator";
export type {
  AIStateIndicatorProps,
  AIStateIndicatorSize,
  AIStateIndicatorMode,
  AIStateBadgeProps,
  AIStateDotProps,
  AIStateDisplayProps,
} from "./AIStateIndicator";

export {
  VoiceModeSettings,
  VoiceModeSettingsCompact,
  VoiceModeSettingsFull,
} from "./VoiceModeSettings";
export type {
  VoiceModeSettingsProps,
  VoiceModeSettingsSize,
  VoiceModeSettingsCompactProps,
  VoiceModeSettingsFullProps,
} from "./VoiceModeSettings";

export { SwensyncOverlayRoom } from "./SwensyncOverlayRoom";
export type {
  SwensyncOverlayRoomProps,
  RoomParticipant,
  RoomAISession,
  RoomOverlayConnectionState,
} from "./SwensyncOverlayRoom";

export { UsernameModal } from "./UsernameModal";
export type { UsernameModalProps } from "./UsernameModal";

export { ParticipantModal } from "./ParticipantModal";
export type { ParticipantModalProps } from "./ParticipantModal";

export {
  AudioWaveform,
  AIWaveform,
  ParticipantWaveform,
} from "./AudioWaveform";
export type {
  AudioWaveformProps,
  WaveformSize,
  WaveformColor,
} from "./AudioWaveform";

export {
  InwardWaveform,
  AIInwardWaveform,
  ParticipantInwardWaveform,
} from "./InwardWaveform";
export type {
  InwardWaveformProps,
  InwardWaveformColor,
} from "./InwardWaveform";

export { TranscriptPanel } from "./TranscriptPanel";
export type { TranscriptPanelProps } from "./TranscriptPanel";

export { TranscriptEntry } from "./TranscriptEntry";
export type { TranscriptEntryProps } from "./TranscriptEntry";

export {
  SummaryCard,
  SummaryCardCompact,
  SummaryCardSkeleton,
} from "./SummaryCard";
export type { SummaryCardProps } from "./SummaryCard";

export { TranscriptDownloadModal } from "./TranscriptDownloadModal";
export type {
  TranscriptDownloadModalProps,
  DownloadOptions,
} from "./TranscriptDownloadModal";

export { SearchPanel } from "./SearchPanel";
export type { SearchPanelProps } from "./SearchPanel";
