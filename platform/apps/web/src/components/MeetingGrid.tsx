import { GridLayout, ParticipantTile, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

const MAX_VISIBLE_VIDEO_TILES = 12;

export function MeetingGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: true },
  );
  const visible = [...tracks]
    .sort((left, right) => Number(right.source === Track.Source.ScreenShare) - Number(left.source === Track.Source.ScreenShare))
    .slice(0, MAX_VISIBLE_VIDEO_TILES);

  return (
    <GridLayout tracks={visible} className="meeting-grid">
      <ParticipantTile />
    </GridLayout>
  );
}
